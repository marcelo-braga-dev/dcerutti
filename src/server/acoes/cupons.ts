'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { ErroNegocio, gravar } from '../erros';
import { exigirPapel } from '../permissoes';
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
