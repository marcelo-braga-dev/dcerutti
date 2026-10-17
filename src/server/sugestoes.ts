import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { catalogo } from './catalogo';
import { lerConfig } from './config';
import { criarPedido, ErroPedido } from './pedidos';
import { registrarAcao } from './equipe';
import { interesseDoCliente } from './consultas/navegacao';
import type { Usuario } from './permissoes';
import { chaveDoModelo } from '@/lib/cores';
import { celularValido, formatarCep, somenteDigitos } from '@/lib/telefone';
import { buscarCupom } from './cupons';
import { aberta, DIAS_PADRAO, DIAS_VALIDADE, MAX_ITENS, precisaDeAtencao, precoQueVale, situacaoDe, type Escolha, type Situacao } from '@/lib/sugestoes';
import type { ProdutoCatalogo } from '@/lib/catalogo';
import { notificar, responsaveis } from './notificacoes';

/**
 * Sugestões para você (D-27, docs/23): o vendedor monta, a cliente responde pelo link assinado (/s/…), sem login.
 * A sugestão não reserva estoque; vira pedido (ou condicional) quando a cliente devolve as escolhas.
 */

export class ErroSugestao extends Error {}

type Tx = Prisma.TransactionClient;
async function proximoCodigo(tx: Tx) {
  const c = await tx.contador.upsert({ where: { nome: 'SUG' }, create: { nome: 'SUG', valor: 1 }, update: { valor: { increment: 1 } } });
  return `SUG-${String(c.valor).padStart(6, '0')}`;
}

export type ItemNovo = { produtoId: number; varianteId?: number | null; precoOferta?: number | null; nota?: string | null };

/**
 * Cria a sugestão. Confere a cliente (a que a pessoa atende, com WhatsApp), as peças (ativas, tamanho do mesmo
 * produto) e o limite de desconto do vendedor (o mesmo do caixa, D-23); o gestor não tem limite.
 */
export async function criarSugestao(u: Usuario, d: { clienteId: string; titulo: string; mensagem?: string | null; dias?: number; itens: ItemNovo[]; cupom?: string | null; enviar?: boolean }) {
  const cliente = await db.cliente.findUnique({ where: { id: d.clienteId }, select: { id: true, nome: true, telefone: true, vendedorId: true } });
  if (!cliente || (u.papel === 'vendedor' && cliente.vendedorId !== u.id)) throw new ErroSugestao('Escolha a cliente.');
  if (!celularValido(cliente.telefone)) throw new ErroSugestao('O WhatsApp desta cliente está incompleto no cadastro.');
  const titulo = d.titulo.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (titulo.length < 3) throw new ErroSugestao('Dê um título para a sugestão, ex.: "Novidades no seu tamanho".');
  if (!d.itens.length) throw new ErroSugestao('Adicione pelo menos uma peça.');
  if (d.itens.length > MAX_ITENS) throw new ErroSugestao(`Até ${MAX_ITENS} peças por sugestão.`);
  const dias = (DIAS_VALIDADE as readonly number[]).includes(Number(d.dias)) ? Number(d.dias) : DIAS_PADRAO;

  const lista = await catalogo();
  const porId = new Map(lista.map(p => [p.id, p]));
  const limite = (await lerConfig()).caixa.descontoMaxVendedor;
  const itens = d.itens.map((it, ordem) => {
    const p = porId.get(Number(it.produtoId));
    if (!p) throw new ErroSugestao('Uma das peças não está mais no catálogo.');
    const v = it.varianteId ? p.variantes.find(x => x.id === Number(it.varianteId)) : null;
    if (it.varianteId && !v) throw new ErroSugestao(`Tamanho inválido em ${p.nome}.`);
    const oferta = it.precoOferta != null && it.precoOferta > 0 ? Math.round(it.precoOferta * 100) / 100 : null;
    if (oferta != null && oferta >= p.preco) throw new ErroSugestao(`O preço especial de ${p.nome} precisa ser menor que o do catálogo.`);
    // O limite vale sobre o preço arredondado ao centavo (10% de R$ 79,99 = R$ 71,99, que é 10,001%).
    if (oferta != null && u.papel !== 'gestor' && oferta < Math.round(p.preco * (100 - limite)) / 100)
      throw new ErroSugestao(`Desconto acima de ${limite}% em ${p.nome}: só o gestor dá esse desconto.`);
    return { produtoId: p.id, varianteId: v?.id ?? null, precoOferta: oferta, nota: it.nota?.trim().slice(0, 200) || null, ordem };
  });

  const cupomCodigo = d.cupom ? await conferirCupom(u, d.cupom) : null;
  const validaAte = new Date(Date.now() + dias * 86_400_000);
  const s = await db.$transaction(async tx => tx.sugestao.create({
    data: {
      codigo: await proximoCodigo(tx), vendedorId: u.papel === 'vendedor' ? u.id : cliente.vendedorId, clienteId: cliente.id,
      titulo, mensagem: d.mensagem?.trim().slice(0, 1000) || null, validaAte, itens: { create: itens }, cupomCodigo,
      // "Criar e enviar": enviada agora. "Só criar": fica Para enviar até o vendedor tocar em Enviar.
      enviadaEm: d.enviar === false ? null : new Date(),
    },
  }));
  const pecas = itens.length;
  if (d.enviar !== false) await registrarAcao(u.id, 'oferta_enviada', { clienteId: cliente.id, descricao: `${cliente.nome} · ${s.codigo} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'} sugeridas` });
  return { ...s, cliente, pecas, temOferta: itens.some(i => i.precoOferta != null) };
}

/** Cupom da sugestão (fase 2): cupons ligados, a pessoa pode aplicar, o cupom existe e está ativo. */
async function conferirCupom(u: Usuario, codigo: string) {
  const cfg = await lerConfig();
  if (!cfg.cupons.ligados) throw new ErroSugestao('Os cupons estão desligados em Configurações.');
  if (u.papel === 'vendedor' && !cfg.cupons.vendedorAplica) throw new ErroSugestao('A loja não liberou vendedores para aplicar cupons.');
  const c = await buscarCupom(db, codigo);
  if (!c || !c.ativo) throw new ErroSugestao(`O cupom ${codigo.toUpperCase()} não existe ou está desligado.`);
  return c.codigo;
}

/** Peças do modelo (todas as cores) para a cliente trocar a cor: cada cor com os tamanhos e o que há em estoque. */
function coresDoModelo(lista: ProdutoCatalogo[], p: ProdutoCatalogo) {
  const chave = p.modelo ?? chaveDoModelo(p);
  return lista.filter(x => (x.modelo ?? chaveDoModelo(x)) === chave).map(x => ({
    produtoId: x.id, cor: x.corNome ?? x.cor ?? null, imagem: x.imagens[0] ?? null, preco: x.preco, precoCheio: x.precoCheio,
    variantes: x.variantes.map(v => ({ id: v.id, tamanho: v.tamanho, disponivel: v.disponivel })),
  }));
}

/**
 * Sugestão para a página da cliente: peças com as cores do modelo, o preço que vale e as escolhas salvas. Só o
 * primeiro nome da cliente e do vendedor; nada de telefone, endereço ou histórico.
 */
export async function sugestaoPublica(codigo: string, agora = new Date()) {
  const s = await db.sugestao.findUnique({
    where: { codigo },
    include: { itens: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] }, cliente: { select: { nome: true, cep: true } }, vendedor: { select: { name: true, telefone: true, ativo: true } } },
  });
  if (!s) return null;
  const situacao = situacaoDe(s, agora);
  const vencida = situacao === 'vencida';
  const lista = await catalogo();
  const porId = new Map(lista.map(p => [p.id, p]));
  const cfg = await lerConfig();
  const itens = s.itens.flatMap(i => {
    const p = porId.get(i.produtoId);
    if (!p) return []; // peça saiu do catálogo
    const cores = coresDoModelo(lista, p);
    const escolhida = i.varianteEscolhidaId ?? i.varianteId;
    const corEscolhida = cores.find(c => c.variantes.some(v => v.id === escolhida)) ?? cores.find(c => c.produtoId === p.id)!;
    return [{
      id: i.id, produtoId: p.id, nome: p.nome, marca: p.marca, nota: i.nota, cores,
      corInicial: corEscolhida.produtoId, varianteInicial: escolhida ?? null, escolha: i.escolha as Escolha, quantidade: i.quantidade,
      precoCatalogo: p.preco, precoCheio: p.precoCheio, oferta: i.precoOferta == null ? null : Number(i.precoOferta),
      preco: precoQueVale(p.preco, i.precoOferta == null ? null : Number(i.precoOferta), vencida),
    }];
  });
  return {
    id: s.id, codigo: s.codigo, titulo: s.titulo, mensagem: s.mensagem, situacao, validaAte: s.validaAte, pedidoId: s.pedidoId,
    nomeCliente: s.cliente.nome.split(' ')[0], nomeVendedor: s.vendedor.name.split(' ')[0],
    // Para "Falar com…": o WhatsApp de quem atende, ou o da loja (RN-03).
    telefoneContato: s.vendedor.ativo && celularValido(s.vendedor.telefone) ? s.vendedor.telefone! : cfg.whatsappLoja,
    condicionalNoCep: !!s.cliente.cep && cfg.cepsCondicional.includes(s.cliente.cep), cidadeCondicional: cfg.cidadeCondicional,
    cupom: s.cupomCodigo && cfg.cupons.ligados ? s.cupomCodigo : null,
    itens,
    maisParaVoce: aberta(situacao) ? await maisParaVoce(s.itens.map(i => i.produtoId), lista) : [],
  };
}
export type SugestaoPublica = NonNullable<Awaited<ReturnType<typeof sugestaoPublica>>>;

/** A cliente abriu o link (a prévia do WhatsApp e a equipe não contam: quem chama decide). */
export async function registrarVista(codigo: string, agora = new Date()) {
  const s = await db.sugestao.findUnique({ where: { codigo }, select: { id: true, status: true, vistaEm: true, enviadaEm: true, vendedorId: true, cliente: { select: { nome: true } } } });
  if (!s) return;
  // D-28: a primeira abertura avisa quem enviou.
  if (!s.vistaEm)
    await notificar(await responsaveis(s.vendedorId), {
      tipo: 'carrinho_visto', titulo: `${s.cliente.nome} abriu a sugestão ${codigo}`, texto: 'Bom momento para chamar no WhatsApp.',
      link: `/painel/sugestoes/${s.id}`, chave: `visto:${codigo}`,
    });
  await db.sugestao.update({
    where: { id: s.id },
    data: { vezesVista: { increment: 1 }, ...(s.vistaEm ? {} : { vistaEm: agora }), ...(s.status === 'enviada' ? { status: 'vista' } : {}), ...(s.enviadaEm ? {} : { enviadaEm: agora }) },
  });
}

export type EscolhaItem = { id: number; escolha: Escolha; varianteId: number | null; quantidade: number };

/** Confere as escolhas contra a sugestão: o tamanho tem de ser de uma cor do mesmo modelo, quantidade de 1 a 10. */
async function conferirEscolhas(s: { itens: { id: number; produtoId: number }[] }, escolhas: EscolhaItem[]) {
  const lista = await catalogo();
  const porId = new Map(lista.map(p => [p.id, p]));
  const doItem = new Map(s.itens.map(i => [i.id, i]));
  return escolhas.flatMap(e => {
    const item = doItem.get(e.id);
    const p = item && porId.get(item.produtoId);
    if (!item || !p) return [];
    const permitidas = new Set(coresDoModelo(lista, p).flatMap(c => c.variantes.map(v => v.id)));
    const varianteId = e.varianteId && permitidas.has(e.varianteId) ? e.varianteId : null;
    const escolha: Escolha = ['quero', 'talvez', 'nao', 'pendente'].includes(e.escolha) ? e.escolha : 'pendente';
    return [{ id: item.id, escolha, varianteId, quantidade: Math.min(10, Math.max(1, Math.round(e.quantidade) || 1)) }];
  });
}

/** Guarda as marcações enquanto a cliente escolhe (dá para fechar e voltar depois). */
export async function salvarEscolhas(codigo: string, escolhas: EscolhaItem[]) {
  const s = await db.sugestao.findUnique({ where: { codigo }, include: { itens: { select: { id: true, produtoId: true } } } });
  if (!s || !aberta(situacaoDe(s))) return false;
  const ok = await conferirEscolhas(s, escolhas);
  await db.$transaction(ok.map(e => db.sugestaoItem.update({ where: { id: e.id }, data: { escolha: e.escolha, varianteEscolhidaId: e.varianteId, quantidade: e.quantidade } })));
  return true;
}

/**
 * A cliente devolve as escolhas. "pensando" só marca como respondida. "compra" e "condicional" criam o pedido com as
 * peças marcadas como Quero, nos preços especiais que ainda valem, e a sugestão vira pedido.
 */
export async function responderSugestao(codigo: string, modo: 'pensando' | 'compra' | 'condicional', escolhas: EscolhaItem[], extra: { cep?: string | null; usuarioId?: string | null }) {
  const s = await db.sugestao.findUnique({
    where: { codigo },
    include: { itens: true, cliente: { select: { id: true, nome: true, telefone: true, cep: true } }, vendedor: { select: { id: true, name: true, telefone: true, ativo: true } } },
  });
  if (!s) throw new ErroSugestao('Sugestão não encontrada.');
  const situacao = situacaoDe(s);
  if (situacao === 'convertida') throw new ErroSugestao('Você já respondeu esta sugestão: o pedido foi enviado.');
  if (!aberta(situacao)) throw new ErroSugestao(situacao === 'vencida' ? 'Esta sugestão venceu. Fale com quem te atende para receber outra.' : 'Esta sugestão foi cancelada.');
  await salvarEscolhas(codigo, escolhas);
  const agora = new Date();
  if (modo === 'pensando') {
    await db.sugestao.update({ where: { id: s.id }, data: { status: 'respondida', respondidaEm: agora } });
    const marcadas = await db.sugestaoItem.count({ where: { sugestaoId: s.id, escolha: { in: ['quero', 'talvez'] } } });
    await notificar(await responsaveis(s.vendedorId), {
      tipo: 'carrinho_respondido', titulo: `${s.cliente.nome} respondeu a sugestão ${codigo}`, texto: `Marcou ${marcadas} ${marcadas === 1 ? 'peça' : 'peças'} e ainda está pensando.`,
      link: `/painel/sugestoes/${s.id}`,
    });
    return { pedido: null, s };
  }

  const itens = await db.sugestaoItem.findMany({ where: { sugestaoId: s.id, escolha: 'quero' } });
  if (!itens.length) throw new ErroSugestao('Marque "Quero" nas peças que você quer.');
  const semTamanho = itens.filter(i => !(i.varianteEscolhidaId ?? i.varianteId));
  if (semTamanho.length) throw new ErroSugestao('Escolha o tamanho das peças marcadas como "Quero".');

  const cfg = await lerConfig();
  let cep: string | null = null;
  if (modo === 'condicional') {
    cep = formatarCep(extra.cep || s.cliente.cep || '');
    if (somenteDigitos(cep).length !== 8) throw new ErroSugestao('Informe o CEP para o condicional.');
    if (!cfg.cepsCondicional.includes(cep)) throw new ErroSugestao(`O condicional atende só ${cfg.cidadeCondicional}. Escolha "Quero comprar".`);
  }
  const lista = new Map((await catalogo()).map(p => [p.id, p]));
  // Preço especial: vale para a cor sugerida (produto do item) e para outra cor do mesmo modelo, com o mesmo preço de catálogo.
  const precos = new Map<number, number>();
  const variantes = await db.variante.findMany({ where: { id: { in: itens.map(i => (i.varianteEscolhidaId ?? i.varianteId)!) } }, select: { id: true, produtoId: true } });
  const produtoDa = new Map(variantes.map(v => [v.id, v.produtoId]));
  for (const i of itens) {
    const vid = (i.varianteEscolhidaId ?? i.varianteId)!;
    const sugerido = lista.get(i.produtoId), escolhido = lista.get(produtoDa.get(vid) ?? -1);
    if (i.precoOferta != null && sugerido && escolhido && escolhido.preco === sugerido.preco) precos.set(vid, Number(i.precoOferta));
  }

  try {
    const dados = {
      tipo: modo, origem: 'vendedor' as const, clienteId: s.cliente.id, vendedorId: s.vendedorId,
      nomeCliente: s.cliente.nome, telefoneCliente: s.cliente.telefone, cep,
      linhas: itens.map(i => ({ varianteId: (i.varianteEscolhidaId ?? i.varianteId)!, quantidade: i.quantidade })),
      regraFrete: modo === 'compra' ? cfg.frete : null, usuarioId: extra.usuarioId ?? null, precos,
    };
    // Cupom da sugestão (fase 2): se não servir mais (venceu, limite, peças), o pedido sai sem ele em vez de travar.
    const p = s.cupomCodigo && cfg.cupons.ligados
      ? await criarPedido({ ...dados, cupom: { codigo: s.cupomCodigo, quem: 'equipe' } }).catch(e => (e instanceof ErroPedido ? criarPedido(dados) : Promise.reject(e)))
      : await criarPedido(dados);
    await db.sugestao.update({ where: { id: s.id }, data: { status: 'convertida', respondidaEm: agora, pedidoId: p.id } });
    if (cep && !s.cliente.cep) await db.cliente.update({ where: { id: s.cliente.id }, data: { cep } });
    return { pedido: p, s };
  } catch (e) {
    if (e instanceof ErroPedido) throw new ErroSugestao(e.message);
    throw e;
  }
}

// ---------- Painel ----------

const escopo = (u: Usuario): Prisma.SugestaoWhereInput => (u.papel === 'vendedor' ? { vendedorId: u.id } : {});

export type FiltroSugestoes = { vendedor?: string | null; cliente?: string | null; situacao?: Situacao | 'atencao' | null; q?: string | null; pagina: number };

/**
 * Lista das sugestões com filtros (situação, cliente, vendedor), a contagem por situação e os que precisam de atenção
 * agora (para enviar, sem abrir, viu e não respondeu, pensando, vencendo). A situação depende da hora (vencida), por
 * isso o filtro é feito aqui; são poucas centenas por vendedor.
 */
export async function listarSugestoes(u: Usuario, f: FiltroSugestoes) {
  const q = f.q?.trim();
  const where: Prisma.SugestaoWhereInput = {
    ...escopo(u), ...(u.papel === 'gestor' && f.vendedor ? { vendedorId: f.vendedor } : {}), ...(f.cliente ? { clienteId: f.cliente } : {}),
    ...(q ? { OR: [{ codigo: { contains: q } }, { titulo: { contains: q } }, { cliente: { nome: { contains: q } } }] } : {}),
  };
  const todas = await db.sugestao.findMany({
    where, orderBy: { criadaEm: 'desc' }, take: 1000,
    include: { cliente: { select: { id: true, nome: true, telefone: true } }, vendedor: { select: { name: true } }, itens: { select: { escolha: true, quantidade: true } } },
  });
  const agora = new Date();
  const comSituacao = todas.map(s => { const situacao = situacaoDe(s, agora); return { ...s, situacao, atencao: precisaDeAtencao({ ...s, situacao }, agora) }; });
  const contagem = new Map<string, number>();
  for (const s of comSituacao) contagem.set(s.situacao, (contagem.get(s.situacao) ?? 0) + 1);
  const atencao = comSituacao.filter(s => s.atencao);
  const filtradas = f.situacao === 'atencao' ? atencao : f.situacao ? comSituacao.filter(s => s.situacao === f.situacao) : comSituacao;
  return { lista: filtradas.slice(0, 40 * f.pagina), total: filtradas.length, contagem, atencao: atencao.slice(0, 8), totalAtencao: atencao.length };
}

/** "Enviar" de uma sugestão Para enviar (ou de novo): marca o envio e conta no acompanhamento da equipe. */
export async function marcarEnviada(u: Usuario, id: string) {
  const s = await db.sugestao.findUnique({ where: { id }, select: { vendedorId: true, enviadaEm: true, codigo: true, clienteId: true, cliente: { select: { nome: true } } } });
  if (!s || (u.papel === 'vendedor' && s.vendedorId !== u.id)) throw new ErroSugestao('Sugestão não encontrada.');
  if (s.enviadaEm) return;
  await db.sugestao.update({ where: { id }, data: { enviadaEm: new Date() } });
  await registrarAcao(u.id, 'oferta_enviada', { clienteId: s.clienteId, descricao: `${s.cliente.nome} · ${s.codigo} · sugestão enviada` });
}

/** Lembrete pelo WhatsApp ("viu as peças?"): guarda quando e quantas vezes, para não insistir demais. */
export async function lembrarSugestao(u: Usuario, id: string) {
  const s = await db.sugestao.findUnique({ where: { id }, select: { vendedorId: true, codigo: true, clienteId: true, cliente: { select: { nome: true } } } });
  if (!s || (u.papel === 'vendedor' && s.vendedorId !== u.id)) throw new ErroSugestao('Sugestão não encontrada.');
  await db.sugestao.update({ where: { id }, data: { lembradoEm: new Date(), lembretes: { increment: 1 } } });
  await registrarAcao(u.id, 'whatsapp', { clienteId: s.clienteId, descricao: `Lembrete da sugestão ${s.codigo} · ${s.cliente.nome}` });
}

/** As sugestões de uma cliente (ficha), mais recentes primeiro. */
export async function sugestoesDaFicha(u: Usuario, clienteId: string) {
  const lista = await db.sugestao.findMany({
    where: { ...escopo(u), clienteId }, orderBy: { criadaEm: 'desc' }, take: 6,
    include: { itens: { select: { escolha: true } } },
  });
  const agora = new Date();
  return lista.map(s => ({ ...s, situacao: situacaoDe(s, agora) }));
}

export async function sugestaoParaEquipe(u: Usuario, id: string) {
  const s = await db.sugestao.findUnique({
    where: { id },
    include: { itens: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] }, cliente: { select: { id: true, nome: true, telefone: true } }, vendedor: { select: { name: true } } },
  });
  if (!s || (u.papel === 'vendedor' && s.vendedorId !== u.id)) return null;
  const situacao = situacaoDe(s);
  const lista = await catalogo();
  const porId = new Map(lista.map(p => [p.id, p]));
  const variantes = new Map(lista.flatMap(p => p.variantes.map(v => [v.id, { ...v, produto: p }] as const)));
  return {
    ...s, situacao, atencao: precisaDeAtencao({ ...s, situacao }),
    itens: s.itens.map(i => {
      const p = porId.get(i.produtoId);
      const escolhida = variantes.get((i.varianteEscolhidaId ?? i.varianteId) ?? -1);
      return { ...i, produto: p ?? null, sugerida: i.varianteId ? variantes.get(i.varianteId) ?? null : null, escolhida: escolhida ?? null };
    }),
  };
}

export async function cancelarSugestao(u: Usuario, id: string) {
  const s = await db.sugestao.findUnique({ where: { id }, select: { vendedorId: true, status: true } });
  if (!s || (u.papel === 'vendedor' && s.vendedorId !== u.id)) throw new ErroSugestao('Sugestão não encontrada.');
  if (s.status === 'convertida') throw new ErroSugestao('Esta sugestão já virou pedido.');
  await db.sugestao.update({ where: { id }, data: { status: 'cancelada' } });
}

/** Minha conta: as sugestões da cliente logada, mais recentes primeiro. */
export async function sugestoesDaCliente(userId: string) {
  const c = await db.cliente.findUnique({ where: { userId }, select: { id: true } });
  if (!c) return [];
  return db.sugestao.findMany({
    where: { clienteId: c.id, NOT: { status: 'cancelada' } }, orderBy: { criadaEm: 'desc' }, take: 30,
    include: { vendedor: { select: { name: true } }, itens: { select: { id: true } } },
  });
}

/** Tamanhos que a cliente mais usa (compras e escolhas no site), para já sugerir o tamanho certo no painel. */
export async function tamanhosDaCliente(clienteId: string) {
  const [comprados, escolhidos] = await Promise.all([
    db.pedidoItem.groupBy({ by: ['tamanho'], where: { pedido: { clienteId, status: 'confirmado' } }, _sum: { quantidade: true } }),
    db.atividade.groupBy({ by: ['termo'], where: { clienteId, tipo: 'tamanho', termo: { not: null } }, _count: true }),
  ]);
  const peso = new Map<string, number>();
  for (const c of comprados) peso.set(c.tamanho.toUpperCase(), (peso.get(c.tamanho.toUpperCase()) ?? 0) + 3 * (c._sum.quantidade ?? 0));
  for (const e of escolhidos) if (e.termo) peso.set(e.termo.toUpperCase(), (peso.get(e.termo.toUpperCase()) ?? 0) + e._count);
  return [...peso.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
}

// ---------- Histórico da cliente no montador (registros para pôr na sugestão) ----------

const paraPeca = (p: ProdutoCatalogo) => ({
  id: p.id, nome: p.nome, marca: p.marca, cor: p.corNome ?? p.cor, categoria: p.categoria, preco: p.preco, precoCheio: p.precoCheio,
  imagem: p.imagens[0] ?? null, variantes: p.variantes.filter(v => v.disponivel > 0).map(v => ({ id: v.id, tamanho: v.tamanho, disponivel: v.disponivel })),
});
export type PecaHistorico = ReturnType<typeof paraPeca>;

/**
 * O que a cliente já mostrou de interesse, para o vendedor montar a sugestão: a sacola (e se está parada), as peças
 * que ela mais abriu, os favoritos, os pedidos que não fecharam e as compras. Cada peça com os tamanhos em estoque.
 */
export async function historicoParaSugestao(u: Usuario, clienteId: string) {
  const interesse = await interesseDoCliente(u, clienteId);
  if (!interesse) return null;
  const [lista, cfg, naoFechados, compras] = await Promise.all([
    catalogo(),
    lerConfig(),
    db.pedidoItem.findMany({
      where: { pedido: { clienteId, status: 'cancelado', confirmadoEm: null } }, orderBy: { id: 'desc' }, take: 30,
      select: { produtoId: true, varianteId: true, pedido: { select: { codigo: true, canceladoEm: true, motivoCancelamento: true } } },
    }),
    db.pedidoItem.findMany({
      where: { pedido: { clienteId, status: 'confirmado' }, situacao: { not: 'devolvido' } }, orderBy: { id: 'desc' }, take: 30,
      select: { produtoId: true, varianteId: true, pedido: { select: { codigo: true, confirmadoEm: true } } },
    }),
  ]);
  const porId = new Map(lista.map(p => [p.id, p]));
  const peca = (id: number) => { const p = porId.get(id); return p ? paraPeca(p) : null; };
  const unicos = <T extends { produtoId: number }>(l: T[]) => l.filter((x, i) => l.findIndex(y => y.produtoId === x.produtoId) === i);
  const sacola = interesse.sacola;
  const horasParada = sacola ? (Date.now() - sacola.atualizadoEm.getTime()) / 3_600_000 : 0;
  return {
    tamanhos: interesse.preferencias.tamanhos.map(t => t.valor),
    sacola: sacola && sacola.linhas.length ? {
      atualizadoEm: sacola.atualizadoEm, parada: horasParada >= cfg.historico.horasSacola, total: sacola.total,
      itens: sacola.linhas.flatMap(l => { const p = peca(l.produto.id); return p ? [{ peca: p, varianteId: l.varianteId, quantidade: l.quantidade, tamanho: l.tamanho }] : []; }),
    } : null,
    vistas: interesse.pecas.flatMap(x => { const p = peca(x.produto.id); return p ? [{ peca: p, vezes: x.vezes, ultimaVez: x.ultimaVez, tamanhos: x.tamanhos, situacao: x.situacao }] : []; }),
    favoritos: interesse.favoritos.flatMap(f => { const p = peca(f.produto.id); return p ? [{ peca: p, criadoEm: f.criadoEm }] : []; }),
    naoFechados: unicos(naoFechados).flatMap(i => { const p = peca(i.produtoId); return p ? [{ peca: p, varianteId: i.varianteId, codigo: i.pedido.codigo, quando: i.pedido.canceladoEm, motivo: i.pedido.motivoCancelamento }] : []; }),
    compras: unicos(compras).flatMap(i => { const p = peca(i.produtoId); return p ? [{ peca: p, varianteId: i.varianteId, codigo: i.pedido.codigo, quando: i.pedido.confirmadoEm }] : []; }),
  };
}
export type HistoricoSugestao = NonNullable<Awaited<ReturnType<typeof historicoParaSugestao>>>;

// ---------- Fase 2: renovar, sugestão automática e "Mais para você" ----------

/** Dá mais dias à sugestão (e aos preços especiais); serve também para reabrir um vencido. */
export async function renovarSugestao(u: Usuario, id: string, dias: number) {
  const s = await db.sugestao.findUnique({ where: { id }, select: { vendedorId: true, status: true } });
  if (!s || (u.papel === 'vendedor' && s.vendedorId !== u.id)) throw new ErroSugestao('Sugestão não encontrada.');
  if (s.status === 'convertida' || s.status === 'cancelada') throw new ErroSugestao('Esta sugestão já foi fechada.');
  const d = (DIAS_VALIDADE as readonly number[]).includes(dias) ? dias : DIAS_PADRAO;
  await db.sugestao.update({ where: { id }, data: { validaAte: new Date(Date.now() + d * 86_400_000) } });
}

/**
 * Sugestão automática (fase 2): até 8 peças com estoque no tamanho dela, nesta ordem: o que está na sacola, o que ela
 * mais abriu e não comprou, os favoritos e promoções nas categorias que ela mais olha. Cada peça já no tamanho dela.
 */
export async function sugestaoAutomatica(u: Usuario, clienteId: string, limite = 8) {
  const h = await historicoParaSugestao(u, clienteId);
  if (!h) return [];
  const tamanhos = [...new Set([...h.tamanhos, ...(await tamanhosDaCliente(clienteId))].map(t => t.toUpperCase()))];
  const escolhidas = new Map<number, number | null>();
  const vaiPara = (p: PecaHistorico, varianteId?: number | null) => {
    if (escolhidas.size >= limite || escolhidas.has(p.id) || !p.variantes.length) return;
    const v = (varianteId && p.variantes.find(x => x.id === varianteId)) || p.variantes.find(x => tamanhos.includes(x.tamanho.toUpperCase()));
    if (tamanhos.length && !v) return; // sem estoque no tamanho dela
    escolhidas.set(p.id, v?.id ?? null);
  };
  h.sacola?.itens.forEach(i => vaiPara(i.peca, i.varianteId));
  h.vistas.filter(x => x.situacao !== 'comprou').forEach(x => vaiPara(x.peca));
  h.favoritos.forEach(f => vaiPara(f.peca));
  const categorias = new Set([...h.vistas.map(x => x.peca.categoria), ...h.compras.map(x => x.peca.categoria)]);
  const promo = (await catalogo()).filter(p => (p.preco < p.precoCheio || p.imperdivel) && (!categorias.size || categorias.has(p.categoria)) && p.imagens.length);
  promo.forEach(p => vaiPara(paraPeca(p)));
  const porId = new Map((await catalogo()).map(p => [p.id, p]));
  return [...escolhidas.entries()].flatMap(([id, varianteId]) => { const p = porId.get(id); return p ? [{ peca: paraPeca(p), varianteId }] : []; });
}

/**
 * "Mais para você" (fase 2): até 6 peças com estoque, das mesmas categorias da sugestão, promoções primeiro, de modelos
 * que ainda não estão nele. A cliente toca e a peça entra na sugestão (marcada como Quero).
 */
async function maisParaVoce(produtoIds: number[], lista: ProdutoCatalogo[]) {
  const porId = new Map(lista.map(p => [p.id, p]));
  const daSugestao = produtoIds.flatMap(id => porId.get(id) ?? []);
  const modelos = new Set(daSugestao.map(p => p.modelo ?? chaveDoModelo(p)));
  const categorias = new Set(daSugestao.map(p => p.categoria));
  const generos = new Set(daSugestao.map(p => p.genero));
  return lista
    .filter(p => p.imagens.length && p.variantes.some(v => v.disponivel > 0) && !modelos.has(p.modelo ?? chaveDoModelo(p)) && categorias.has(p.categoria) && (generos.has(p.genero) || p.genero === 'unissex'))
    .sort((a, b) => Number(b.preco < b.precoCheio) - Number(a.preco < a.precoCheio))
    .filter((p, i, l) => l.findIndex(x => (x.modelo ?? chaveDoModelo(x)) === (p.modelo ?? chaveDoModelo(p))) === i)
    .slice(0, 6)
    .map(p => ({ produtoId: p.id, nome: p.nome, preco: p.preco, precoCheio: p.precoCheio, imagem: p.imagens[0] ?? null }));
}

/** A cliente põe uma peça de "Mais para você" na sugestão. Devolve o item já no formato da página. */
export async function adicionarNaSugestao(codigo: string, produtoId: number) {
  const s = await db.sugestao.findUnique({ where: { codigo }, include: { itens: { select: { produtoId: true } } } });
  if (!s || !aberta(situacaoDe(s))) throw new ErroSugestao('Esta sugestão não aceita mais peças.');
  if (s.itens.length >= MAX_ITENS + 10) throw new ErroSugestao('A sugestão já está cheia.');
  if (s.itens.some(i => i.produtoId === produtoId)) throw new ErroSugestao('Esta peça já está na sugestão.');
  const p = (await catalogo()).find(x => x.id === produtoId && x.variantes.some(v => v.disponivel > 0));
  if (!p) throw new ErroSugestao('Esta peça acabou.');
  await db.sugestaoItem.create({ data: { sugestaoId: s.id, produtoId: p.id, ordem: 999, escolha: 'quero', adicionadoPelaCliente: true } });
  const pub = await sugestaoPublica(codigo);
  return pub?.itens.find(i => i.produtoId === p.id) ?? null;
}

// ---------- Fase 2: conversão (Resultados e a lista de sugestões) ----------

/**
 * Funil das sugestões enviadas no período: enviados, vistos, respondidos, viraram pedido e o valor vendido (pedidos
 * confirmados). Por vendedor, para o gestor; o vendedor vê só os dele.
 */
export async function conversaoSugestoes(u: Usuario, intervalo: { gte: Date; lt?: Date } | null) {
  const where: Prisma.SugestaoWhereInput = { ...escopo(u), enviadaEm: { not: null, ...(intervalo ?? {}) } };
  const lista = await db.sugestao.findMany({
    where, select: { vendedorId: true, vistaEm: true, respondidaEm: true, status: true, pedidoId: true, vendedor: { select: { name: true } } },
  });
  const pedidos = new Map((await db.pedido.findMany({ where: { id: { in: lista.flatMap(s => s.pedidoId ?? []) } }, select: { id: true, status: true, total: true } })).map(p => [p.id, p]));
  type Linha = { enviados: number; vistos: number; respondidos: number; pedidos: number; vendido: number };
  const soma = (l: typeof lista): Linha => ({
    enviados: l.length,
    vistos: l.filter(s => s.vistaEm).length,
    respondidos: l.filter(s => s.respondidaEm).length,
    pedidos: l.filter(s => s.status === 'convertida').length,
    vendido: l.reduce((a, s) => { const p = s.pedidoId ? pedidos.get(s.pedidoId) : null; return a + (p?.status === 'confirmado' ? Number(p.total) : 0); }, 0),
  });
  const porVendedor = [...new Set(lista.map(s => s.vendedorId))].map(id => {
    const doVendedor = lista.filter(s => s.vendedorId === id);
    return { id, nome: doVendedor[0].vendedor.name, ...soma(doVendedor) };
  }).sort((a, b) => b.vendido - a.vendido || b.pedidos - a.pedidos);
  return { total: soma(lista), porVendedor };
}

/** Funil dos últimos `dias` dias (a lista de sugestões). */
export const conversaoRecente = (u: Usuario, dias = 30) => conversaoSugestoes(u, { gte: new Date(Date.now() - dias * 86_400_000) });
