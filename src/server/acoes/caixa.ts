'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { catalogo } from '../catalogo';
import { lerConfig } from '../config';
import { buscarCupom, contextoDoCupom, pecasDoCupom } from '../cupons';
import { nomesDosAlvos, regraDe } from '../consultas/cupons';
import { db } from '../db';
import { ErroNegocio, mensagemDoBanco } from '../erros';
import { cancelarPedido, confirmarPedido, criarPedido } from '../pedidos';
import { EQUIPE, exigirPapel, podeAcessar, type Usuario } from '../permissoes';
import { calcularVenda, conferirPagamentos, dentroDoLimite, mensagemComprovante } from '@/lib/caixa';
import { avaliarCupom, regraEmPalavras } from '@/lib/cupom';
import { formatarCpf, lerCpf } from '@/lib/cpf';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { celularValido, formatarTelefone, somenteDigitos } from '@/lib/telefone';
import { registrarAcao } from '../equipe';

/**
 * Caixa da loja física (D-23, docs/22-caixa.md). Tudo o que a tela calcula é conferido de novo aqui: preços do banco,
 * limite de desconto do vendedor, cupom, parcelas e a soma dos pagamentos. A venda entra confirmada (baixa o estoque,
 * grava o custo e conta na meta), com origem `balcao`.
 */

const CONSUMIDOR_EMAIL = 'consumidor-final@dcerutti.local';

/** Ficha "Consumidor final" para vendas sem identificar a cliente. Telefone vazio: fica fora das listas de clientes. */
async function consumidorFinal() {
  const ja = await db.cliente.findFirst({ where: { email: CONSUMIDOR_EMAIL, userId: null }, select: { id: true, nome: true } });
  if (ja) return ja;
  const vendedor = await db.user.findFirst({ where: { papel: 'vendedor', ativo: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!vendedor) throw new ErroNegocio('Cadastre um vendedor antes de usar o caixa.');
  return db.cliente.create({ data: { nome: 'Consumidor final', telefone: '', email: CONSUMIDOR_EMAIL, vendedorId: vendedor.id }, select: { id: true, nome: true } });
}

export type ClienteCaixa = { id: string; nome: string; telefone: string; vendedor: string };

/** Busca da cliente no caixa: nome ou final do WhatsApp. O vendedor vê as clientes dele; o gestor, todas. */
export async function buscarClientesCaixa(termo: string): Promise<ClienteCaixa[]> {
  const u = await exigirPapel(EQUIPE);
  const q = String(termo ?? '').trim().slice(0, 60);
  if (q.length < 2) return [];
  const digitos = somenteDigitos(q);
  const r = await db.cliente.findMany({
    where: {
      ...(u.papel === 'gestor' ? {} : { vendedorId: u.id }),
      NOT: { telefone: '' },
      OR: [{ nome: { contains: q } }, ...(digitos.length >= 4 ? [{ telefone: { contains: digitos.slice(-4) } }] : []), ...(digitos.length === 11 ? [{ cpf: formatarCpf(digitos) }] : [])],
    },
    select: { id: true, nome: true, telefone: true, cpf: true, vendedor: { select: { name: true } } },
    orderBy: { nome: 'asc' }, take: 8,
  });
  return r.filter(c => digitos.length < 4 || somenteDigitos(c.telefone).includes(digitos) || somenteDigitos(c.cpf) === digitos || c.nome.toLowerCase().includes(q.toLowerCase()))
    .map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, vendedor: c.vendedor.name }));
}

/** Cadastro rápido no balcão: nome e WhatsApp. WhatsApp que já é de uma cliente devolve a ficha dela (se puder ver). */
export async function cadastrarClienteCaixa(entrada: { nome: string; telefone: string; cpf?: string; vendedorId?: string }): Promise<{ ok: true; cliente: ClienteCaixa; existente: boolean } | { ok: false; erro: string }> {
  const u = await exigirPapel(EQUIPE);
  const nome = String(entrada.nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (nome.length < 3) return { ok: false, erro: 'Informe o nome da cliente.' };
  if (!celularValido(entrada.telefone)) return { ok: false, erro: 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.' };
  const telefone = formatarTelefone(entrada.telefone);
  const cpf = lerCpf(entrada.cpf);
  if (!cpf.ok) return { ok: false, erro: 'CPF inválido. Confira os 11 números, ou deixe em branco.' };
  const existente = await db.cliente.findFirst({ where: { telefone: { in: [telefone, somenteDigitos(telefone)] } }, include: { vendedor: { select: { name: true } } } });
  if (existente) {
    if (!podeAcessar(u, existente)) return { ok: false, erro: `Este WhatsApp já é cliente de ${existente.vendedor.name}. Peça ao gestor, ou venda sem identificar.` };
    return { ok: true, existente: true, cliente: { id: existente.id, nome: existente.nome, telefone: existente.telefone, vendedor: existente.vendedor.name } };
  }
  if (cpf.cpf) {
    const dono = await db.cliente.findFirst({ where: { cpf: cpf.cpf }, include: { vendedor: { select: { name: true } } } });
    if (dono) return podeAcessar(u, dono)
      ? { ok: true, existente: true, cliente: { id: dono.id, nome: dono.nome, telefone: dono.telefone, vendedor: dono.vendedor.name } }
      : { ok: false, erro: `Este CPF já é cliente de ${dono.vendedor.name}. Peça ao gestor, ou venda sem identificar.` };
  }
  const vendedorId = u.papel === 'vendedor' ? u.id : await vendedorValido(entrada.vendedorId);
  if (!vendedorId) return { ok: false, erro: 'Escolha quem está vendendo antes de cadastrar a cliente.' };
  const c = await db.cliente.create({ data: { nome, telefone, cpf: cpf.cpf, vendedorId }, include: { vendedor: { select: { name: true } } } });
  await registrarAcao(u.id, 'cliente_cadastrado', { clienteId: c.id, descricao: `${c.nome} · no caixa` });
  revalidatePath('/painel/clientes');
  return { ok: true, existente: false, cliente: { id: c.id, nome: c.nome, telefone: c.telefone, vendedor: c.vendedor.name } };
}

async function vendedorValido(id?: string) {
  if (!id) return null;
  return (await db.user.findFirst({ where: { id, papel: 'vendedor', ativo: true }, select: { id: true } }))?.id ?? null;
}

const linhaSchema = z.object({ varianteId: z.number().int().positive(), quantidade: z.number().int().min(1).max(20), precoCombinado: z.number().min(0).nullable().optional() });
const descontoSchema = z.object({ tipo: z.enum(['percentual', 'valor']), valor: z.number().min(0).max(100_000) }).nullable().optional();

/** Preços do banco (catálogo) para as linhas, já com o desconto do vendedor; recusa o que saiu do catálogo. */
async function montarVenda(linhas: z.infer<typeof linhaSchema>[], geral: z.infer<typeof descontoSchema>) {
  const porVariante = new Map<number, { preco: number; produtoId: number; nome: string; tamanho: string; disponivel: number }>();
  for (const p of await catalogo()) for (const v of p.variantes) porVariante.set(v.id, { preco: p.preco, produtoId: p.id, nome: p.nome, tamanho: v.tamanho, disponivel: v.disponivel });
  const fora = linhas.filter(l => !porVariante.has(l.varianteId));
  if (fora.length) throw new ErroNegocio('Uma peça da venda saiu do catálogo. Tire da venda e tente de novo.');
  const calc = calcularVenda(linhas.map(l => ({ varianteId: l.varianteId, quantidade: l.quantidade, preco: porVariante.get(l.varianteId)!.preco, precoCombinado: l.precoCombinado ?? null })), geral ?? null);
  return { calc, porVariante };
}

async function regraDoCupomDaEquipe(u: Usuario) {
  const cfg = await lerConfig();
  if (!cfg.cupons.ligados) return 'Os cupons estão desligados em Configurações.';
  if (u.papel === 'vendedor' && !cfg.cupons.vendedorAplica) return 'A loja não liberou vendedores para aplicar cupons.';
  return null;
}

export type PreviaCupomCaixa = { ok: true; codigo: string; desconto: number; regra: string } | { ok: false; erro: string };

/** Prévia do cupom no caixa, sobre os preços já com o desconto do vendedor (o cupom vem depois, P-11). */
export async function previaCupomCaixa(entrada: { codigo: string; clienteId?: string | null; linhas: z.input<typeof linhaSchema>[]; descontoGeral?: z.input<typeof descontoSchema> }): Promise<PreviaCupomCaixa> {
  const u = await exigirPapel(EQUIPE);
  const bloqueio = await regraDoCupomDaEquipe(u);
  if (bloqueio) return { ok: false, erro: bloqueio };
  const linhas = z.array(linhaSchema).min(1).max(40).safeParse(entrada.linhas);
  if (!linhas.success) return { ok: false, erro: 'A venda está vazia.' };
  const cupom = await buscarCupom(db, String(entrada.codigo ?? ''));
  if (!cupom) return { ok: false, erro: 'Cupom não encontrado.' };
  try {
    const { calc, porVariante } = await montarVenda(linhas.data, descontoSchema.parse(entrada.descontoGeral ?? null));
    const clienteId = entrada.clienteId || (await consumidorFinal()).id;
    const pecas = await pecasDoCupom(db, linhas.data.map(l => ({ chave: l.varianteId, produtoId: porVariante.get(l.varianteId)!.produtoId, preco: calc.precos.get(l.varianteId)!, quantidade: l.quantidade })));
    const r = avaliarCupom(regraDe(cupom), pecas, { agora: new Date(), quem: 'equipe', clienteId, tipoPedido: 'balcao', ...(await contextoDoCupom(db, cupom.id, clienteId)) });
    if (!r.ok) return { ok: false, erro: r.mensagem };
    return { ok: true, codigo: cupom.codigo, desconto: r.desconto, regra: regraEmPalavras(regraDe(cupom), nomesDosAlvos(cupom)) };
  } catch (e) {
    return { ok: false, erro: e instanceof ErroNegocio ? e.message : 'Não deu para conferir o cupom agora.' };
  }
}

const vendaSchema = z.object({
  linhas: z.array(linhaSchema).min(1, 'A venda está vazia.').max(40),
  descontoGeral: descontoSchema,
  clienteId: z.string().max(40).nullable().optional(),
  cupom: z.string().max(30).optional(),
  pagamentos: z.array(z.object({
    forma: z.enum(['pix', 'debito', 'credito', 'dinheiro']),
    valor: z.number().positive().max(1_000_000),
    parcelas: z.number().int().min(1).max(24).nullable().optional(),
    recebido: z.number().min(0).max(1_000_000).nullable().optional(),
  })).min(1, 'Informe como a cliente pagou.').max(4),
  vendedorId: z.string().max(40).optional(),
  observacao: z.string().trim().max(200).optional(),
});

export type ResultadoCaixa =
  | { ok: true; pedidoId: string; codigo: string; total: number; troco: number; comprovante: string; telefone: string | null; nomeCliente: string | null }
  | { ok: false; erro: string; total?: number };

/** Registra a venda do balcão: cria o pedido com os preços combinados, aplica o cupom, confirma e grava os pagamentos. */
export async function registrarVendaCaixa(entrada: z.input<typeof vendaSchema>): Promise<ResultadoCaixa> {
  const u = await exigirPapel(EQUIPE);
  const r = vendaSchema.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0].message };
  const d = r.data;
  const cfg = await lerConfig();
  const gestor = u.papel === 'gestor';

  try {
    const { calc } = await montarVenda(d.linhas, d.descontoGeral);
    if (!dentroDoLimite(calc.descontoParte, cfg.caixa.descontoMaxVendedor, gestor))
      return { ok: false, erro: `Desconto acima de ${cfg.caixa.descontoMaxVendedor}%: só o gestor pode registrar.` };
    if (d.pagamentos.some(p => p.forma === 'credito' && (p.parcelas ?? 1) > cfg.caixa.parcelasMax))
      return { ok: false, erro: `O crédito vai até ${cfg.caixa.parcelasMax}x.` };
    if (d.cupom?.trim()) {
      const bloqueio = await regraDoCupomDaEquipe(u);
      if (bloqueio) return { ok: false, erro: bloqueio };
    }

    // Cliente identificada (que o usuário pode atender) ou "Consumidor final".
    let cliente: { id: string; nome: string; telefone: string; vendedorId: string } | null = null;
    if (d.clienteId) {
      const c = await db.cliente.findUnique({ where: { id: d.clienteId }, select: { id: true, nome: true, telefone: true, vendedorId: true } });
      if (!c || !c.telefone || !podeAcessar(u, c)) return { ok: false, erro: 'Cliente não encontrada. Busque de novo ou venda sem identificar.' };
      cliente = c;
    }
    const ficha = cliente ?? { ...(await consumidorFinal()), telefone: '', vendedorId: '' };
    const vendedorId = u.papel === 'vendedor' ? u.id : (await vendedorValido(d.vendedorId)) ?? (cliente?.vendedorId || null);
    if (!vendedorId) return { ok: false, erro: 'Escolha quem fez a venda (Vendido por).' };

    const p = await criarPedido({
      tipo: 'compra', origem: 'balcao', clienteId: ficha.id, vendedorId, nomeCliente: ficha.nome, telefoneCliente: ficha.telefone,
      linhas: d.linhas, usuarioId: u.id, precos: calc.precos, cupom: d.cupom?.trim() ? { codigo: d.cupom, quem: 'equipe' } : null,
    });
    const total = Math.round(p.total * 100) / 100;
    const conferido = conferirPagamentos(d.pagamentos, total);
    if (!conferido.ok) {
      await cancelarPedido(p.id, 'equipe', u.id, 'Caixa: pagamento não conferiu com o total').catch(() => {});
      return { ok: false, total, erro: `O total da venda é ${brl(total)} e os pagamentos somam ${brl(conferido.pago)}. Ajuste e cobre de novo.` };
    }
    try {
      await confirmarPedido(p.id, {}, u.id);
    } catch (e) {
      await cancelarPedido(p.id, 'equipe', u.id, 'Caixa: a confirmação falhou').catch(() => {});
      throw e;
    }
    await db.$transaction([
      db.pagamento.createMany({ data: d.pagamentos.map(x => ({ pedidoId: p.id, forma: x.forma, valor: x.valor, parcelas: x.forma === 'credito' ? x.parcelas ?? 1 : null, recebido: x.forma === 'dinheiro' ? x.recebido ?? null : null })) }),
      db.venda.updateMany({ where: { pedidoId: p.id }, data: { observacao: d.observacao || 'Caixa da loja' } }),
    ]);
    const vendedor = await db.user.findUnique({ where: { id: vendedorId }, select: { name: true } });
    const comprovante = mensagemComprovante({
      codigo: p.codigo, nomeCliente: cliente?.nome, nomeVendedor: vendedor?.name ?? u.name, quando: formatarDataHora(new Date()),
      itens: p.itens.map(i => ({ nome: i.nome, tamanho: i.tamanho, quantidade: i.quantidade, preco: i.preco })),
      subtotal: calc.subtotal, desconto: calc.desconto, cupom: p.cupom && !p.cupom.freteGratis ? { codigo: p.cupom.codigo, desconto: p.cupom.desconto } : null,
      total, pagamentos: d.pagamentos, troco: conferido.troco,
    }, brl);
    await registrarAcao(u.id, 'venda_caixa', {
      clienteId: cliente?.id, pedidoId: p.id, valor: total,
      descricao: [cliente?.nome ?? 'Consumidor final', p.codigo, d.pagamentos.map(x => x.forma).join(' + '), vendedorId !== u.id ? `vendida por ${vendedor?.name ?? ''}` : null].filter(Boolean).join(' · '),
    });
    revalidatePath('/caixa');
    revalidatePath('/painel', 'layout');
    return { ok: true, pedidoId: p.id, codigo: p.codigo, total, troco: conferido.troco, comprovante, telefone: cliente?.telefone ?? null, nomeCliente: cliente?.nome ?? null };
  } catch (e) {
    const msg = e instanceof ErroNegocio ? e.message : mensagemDoBanco(e);
    if (msg == null) throw e;
    return { ok: false, erro: msg };
  }
}
