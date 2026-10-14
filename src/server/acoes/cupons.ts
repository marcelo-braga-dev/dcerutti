'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { ErroNegocio, gravar } from '../erros';
import { exigirPapel } from '../permissoes';
import { salvarConfig } from '../config';
import { CODIGO_MODELO_PROXIMA } from '../campanhas';
import { codigoValido, normalizarCodigo } from '@/lib/cupom';
import { fimDoDia, inicioDoDia } from '@/lib/datas';
import { lerValor } from '@/lib/dinheiro';
import { errosDoZod, falha, type EstadoForm } from '@/lib/formulario';

/** Só o gestor cria, edita, liga, desliga e apaga cupons (docs/20-cupons.md, P-13). */

const dinheiro = (rotulo: string) =>
  z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = lerValor(v);
    if (!(n >= 0)) { ctx.addIssue({ code: 'custom', message: `${rotulo}: valor inválido.` }); return z.NEVER; }
    return n;
  });
const inteiro = (rotulo: string) =>
  z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) { ctx.addIssue({ code: 'custom', message: `${rotulo}: use um número inteiro a partir de 1, ou deixe em branco.` }); return z.NEVER; }
    return n;
  });
const dia = z.string().optional().transform(v => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

const esquema = z
  .object({
    id: z.coerce.number().int().optional(),
    codigo: z.string().transform(normalizarCodigo).refine(codigoValido, 'De 3 a 30 letras, números ou hífen, começando por letra ou número.'),
    descricao: z.string().trim().max(200).optional().transform(v => v || null),
    tipo: z.enum(['percentual', 'valor', 'freteGratis'], 'Escolha o tipo.'),
    valor: dinheiro('Valor'),
    tetoDesconto: dinheiro('Teto'),
    minimoCompra: dinheiro('Mínimo'),
    inicio: dia,
    fim: dia,
    limiteTotal: inteiro('Limite total'),
    limitePorCliente: inteiro('Limite por cliente'),
    quemAplica: z.enum(['cliente', 'equipe', 'ambos']),
    referencias: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === 'percentual' && !(d.valor != null && d.valor > 0 && d.valor <= 100)) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Informe o percentual, de 0,01 a 100.' });
    if (d.tipo === 'valor' && !(d.valor != null && d.valor > 0)) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Informe o valor do desconto em reais.' });
    if (d.inicio && d.fim && d.fim < d.inicio) ctx.addIssue({ code: 'custom', path: ['fim'], message: 'O fim precisa ser no mesmo dia do início ou depois.' });
  });

const ids = (fd: FormData, nome: string) => [...new Set(fd.getAll(nome).map(String).filter(Boolean))];

export async function salvarCupom(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  const categorias = ids(fd, 'categorias').map(Number), marcas = ids(fd, 'marcas').map(Number), clientes = ids(fd, 'clientes');

  // Produtos pela referência, separadas por vírgula, espaço ou linha.
  const refs = [...new Set((d.referencias ?? '').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  const produtos = refs.length ? await db.produto.findMany({ where: { referencia: { in: refs } }, select: { id: true, referencia: true } }) : [];
  const faltam = refs.filter(ref => !produtos.some(p => p.referencia.toUpperCase() === ref));
  if (faltam.length) return falha(fd, { referencias: `Referência não encontrada: ${faltam.join(', ')}.` });

  const dados = {
    codigo: d.codigo, descricao: d.descricao, tipo: d.tipo,
    valor: d.tipo === 'freteGratis' ? null : d.valor,
    tetoDesconto: d.tipo === 'percentual' ? d.tetoDesconto : null,
    minimoCompra: d.minimoCompra,
    inicioEm: d.inicio ? inicioDoDia(d.inicio) : new Date(),
    fimEm: d.fim ? fimDoDia(d.fim) : null,
    limiteTotal: d.limiteTotal, limitePorCliente: d.limitePorCliente,
    somentePrimeiraCompra: fd.get('somentePrimeiraCompra') === 'on',
    valePromocao: fd.get('valePromocao') === 'on',
    quemAplica: d.quemAplica,
    ativo: fd.get('ativo') === 'on',
  };
  const alvos = {
    categorias: { create: categorias.map(categoriaId => ({ categoriaId })) },
    marcas: { create: marcas.map(marcaId => ({ marcaId })) },
    produtos: { create: produtos.map(p => ({ produtoId: p.id })) },
    clientes: { create: clientes.map(clienteId => ({ clienteId })) },
  };

  const g = await gravar(async () => {
    if (await db.cupom.findFirst({ where: { codigo: d.codigo, ...(d.id ? { NOT: { id: d.id } } : {}) }, select: { id: true } }))
      throw new ErroNegocio(`Já existe um cupom com o código ${d.codigo}.`);
    if (!d.id) return (await db.cupom.create({ data: { ...dados, criadoPorId: u.id, ...alvos } })).id;

    const atual = await db.cupom.findUnique({ where: { id: d.id }, include: { categorias: true, marcas: true, produtos: true } });
    if (!atual) throw new ErroNegocio('Cupom não encontrado.');
    if (atual.origem !== 'manual' || atual.modelo) throw new ErroNegocio('Este é um cupom de campanha: edite em Cupons › Campanhas.');
    // Cupom já usado: o que muda o valor fica travado, para os pedidos antigos continuarem coerentes.
    if (await db.pedido.count({ where: { cupomId: d.id } })) {
      const mesmo = (a: number[], b: number[]) => a.length === b.length && a.every(x => b.includes(x));
      const mudou =
        atual.codigo !== dados.codigo || atual.tipo !== dados.tipo || Number(atual.valor ?? 0) !== Number(dados.valor ?? 0) ||
        Number(atual.tetoDesconto ?? -1) !== Number(dados.tetoDesconto ?? -1) || atual.valePromocao !== dados.valePromocao ||
        !mesmo(atual.categorias.map(x => x.categoriaId), categorias) || !mesmo(atual.marcas.map(x => x.marcaId), marcas) ||
        !mesmo(atual.produtos.map(x => x.produtoId), produtos.map(p => p.id));
      if (mudou) throw new ErroNegocio('Este cupom já foi usado: código, tipo, valor, teto, promoção e abrangência não podem mudar. Desative-o e crie outro.');
    }
    await db.$transaction([
      db.cupomCategoria.deleteMany({ where: { cupomId: d.id } }),
      db.cupomMarca.deleteMany({ where: { cupomId: d.id } }),
      db.cupomProduto.deleteMany({ where: { cupomId: d.id } }),
      db.cupomCliente.deleteMany({ where: { cupomId: d.id } }),
      db.cupom.update({ where: { id: d.id }, data: { ...dados, ...alvos } }),
    ]);
    return d.id;
  });
  if (!g.ok) return falha(fd, g.erro.includes('código') ? { codigo: g.erro } : {}, g.erro);
  revalidatePath('/painel/cupons', 'layout');
  if (!d.id) redirect(`/painel/cupons/${g.valor}?criado=1`);
  return { ok: true, mensagem: 'Cupom salvo.' };
}

export async function alternarCupom(id: number, ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
  await exigirPapel(['gestor']);
  const n = await db.cupom.updateMany({ where: { id: Number(id) }, data: { ativo: !!ativo } });
  if (!n.count) return { ok: false, erro: 'Cupom não encontrado.' };
  revalidatePath('/painel/cupons', 'layout');
  return { ok: true };
}

/** Só cupom nunca usado pode ser apagado; o usado é desativado (os pedidos guardam o vínculo). */
export async function apagarCupom(id: number): Promise<{ ok: boolean; erro?: string }> {
  await exigirPapel(['gestor']);
  if (await db.pedido.count({ where: { cupomId: Number(id) } })) return { ok: false, erro: 'Este cupom já foi usado em pedidos: desative em vez de apagar.' };
  const n = await db.cupom.deleteMany({ where: { id: Number(id) } });
  if (!n.count) return { ok: false, erro: 'Cupom não encontrado.' };
  revalidatePath('/painel/cupons', 'layout');
  redirect('/painel/cupons');
}

const esquemaCampanha = z
  .object({
    campanha: z.enum(['primeiraCompra', 'proximaCompra']),
    codigo: z.string().optional(),
    tipo: z.enum(['percentual', 'valor', 'freteGratis'], 'Escolha o tipo.'),
    valor: dinheiro('Valor'),
    tetoDesconto: dinheiro('Teto'),
    minimoCompra: dinheiro('Mínimo'),
    quemAplica: z.enum(['cliente', 'equipe', 'ambos']),
    diasAposCadastro: inteiro('Prazo'),
    minimoParaGerar: dinheiro('Valor mínimo da venda'),
    diasParaComecar: z.string().optional().transform((v, ctx) => {
      const n = v?.trim() ? Number(v) : 0;
      if (!Number.isInteger(n) || n < 0 || n > 365) { ctx.addIssue({ code: 'custom', message: 'De 0 a 365 dias.' }); return z.NEVER; }
      return n;
    }),
    diasValidade: inteiro('Validade'),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === 'percentual' && !(d.valor != null && d.valor > 0 && d.valor <= 100)) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Informe o percentual, de 0,01 a 100.' });
    if (d.tipo === 'valor' && !(d.valor != null && d.valor > 0)) ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Informe o valor do desconto em reais.' });
    if (d.campanha === 'primeiraCompra' && !codigoValido(normalizarCodigo(d.codigo ?? ''))) ctx.addIssue({ code: 'custom', path: ['codigo'], message: 'De 3 a 30 letras, números ou hífen.' });
    if (d.campanha === 'proximaCompra' && d.diasValidade == null) ctx.addIssue({ code: 'custom', path: ['diasValidade'], message: 'Informe por quantos dias o cupom vale.' });
  });

/**
 * Campanhas (fase 4, só gestor). Primeira compra: o cupom público de boas-vindas (com as travas de cupom usado).
 * Próxima compra: o modelo (desconto copiado para cada cupom gerado) e, em Configurações, quando gerar e o prazo.
 */
export async function salvarCampanha(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquemaCampanha.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));
  const d = r.data;
  const desconto = {
    tipo: d.tipo, valor: d.tipo === 'freteGratis' ? null : d.valor, tetoDesconto: d.tipo === 'percentual' ? d.tetoDesconto : null,
    minimoCompra: d.minimoCompra, valePromocao: fd.get('valePromocao') === 'on', quemAplica: d.quemAplica, ativo: fd.get('ativo') === 'on',
  };

  const g = await gravar(async () => {
    if (d.campanha === 'proximaCompra') {
      const modelo = await db.cupom.findFirst({ where: { origem: 'proximaCompra', modelo: true }, select: { id: true } });
      if (modelo) await db.cupom.update({ where: { id: modelo.id }, data: desconto });
      else await db.cupom.create({ data: { ...desconto, codigo: CODIGO_MODELO_PROXIMA, origem: 'proximaCompra', modelo: true, limitePorCliente: null, criadoPorId: u.id } });
      await salvarConfig({
        proximaCompra: {
          minimoParaGerar: d.minimoParaGerar ?? 0, diasParaComecar: d.diasParaComecar, diasValidade: d.diasValidade!,
          geraComCupom: fd.get('geraComCupom') === 'on', acumula: fd.get('acumula') === 'on',
        },
      });
      return;
    }
    const codigo = normalizarCodigo(d.codigo!);
    const atual = await db.cupom.findFirst({ where: { origem: 'primeiraCompra', modelo: false }, orderBy: { id: 'asc' } });
    if (await db.cupom.findFirst({ where: { codigo, ...(atual ? { NOT: { id: atual.id } } : {}) }, select: { id: true } }))
      throw new ErroNegocio(`Já existe um cupom com o código ${codigo}.`);
    const dados = { ...desconto, codigo, diasAposCadastro: d.diasAposCadastro, somentePrimeiraCompra: true, limitePorCliente: 1, descricao: 'Campanha de primeira compra' };
    if (!atual) return void (await db.cupom.create({ data: { ...dados, origem: 'primeiraCompra', criadoPorId: u.id } }));
    if (await db.pedido.count({ where: { cupomId: atual.id } })) {
      const mudou = atual.codigo !== codigo || atual.tipo !== dados.tipo || Number(atual.valor ?? 0) !== Number(dados.valor ?? 0) ||
        Number(atual.tetoDesconto ?? -1) !== Number(dados.tetoDesconto ?? -1) || atual.valePromocao !== dados.valePromocao;
      if (mudou) throw new ErroNegocio('O cupom de primeira compra já foi usado: código, tipo, valor, teto e promoção não podem mudar. Desligue a campanha, apague o código antigo em Cupons e crie de novo.');
    }
    await db.cupom.update({ where: { id: atual.id }, data: dados });
  });
  if (!g.ok) return falha(fd, g.erro.includes('código') ? { codigo: g.erro } : {}, g.erro);
  revalidatePath('/painel/cupons', 'layout');
  revalidatePath('/', 'layout');
  return { ok: true, mensagem: 'Campanha salva.' };
}
