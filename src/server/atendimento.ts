import 'server-only';
import type { CanalAtendimento, Prisma } from '@prisma/client';
import { db } from './db';
import { lerConfig } from './config';
import { ErroNegocio } from './erros';
import { criarPedido, ErroPedido } from './pedidos';
import { podeAtender, type Usuario } from './permissoes';
import { retornoPadrao, type Etapa } from '@/lib/atendimento';
import { ofertaVale } from '@/lib/vitrines';
import { celularValido, formatarTelefone, somenteDigitos } from '@/lib/telefone';

/**
 * Atendimento online (docs/26). Regra da carteira (D-30): cliente com ficha é atendida pela própria vendedora, e quem
 * registrou vê só o nome dela, nunca a ficha. Sem ficha, fica com quem registrou (D-32). Sem WhatsApp não há ficha.
 */
type Tx = Prisma.TransactionClient;

const variantesDoTelefone = (t: string) => [formatarTelefone(t), somenteDigitos(t)];
const primeiroNome = (n: string) => n.split(' ')[0];

/**
 * AT-000123. É a primeira escrita da transação: a linha do contador fica travada até o commit, então duas criações ao
 * mesmo tempo acontecem uma depois da outra e a segunda já enxerga a ficha que a primeira criou.
 */
async function proximoCodigo(tx: Tx) {
  await tx.$executeRaw`INSERT INTO contador (nome, valor) VALUES ('AT', 1) ON DUPLICATE KEY UPDATE valor = valor + 1`;
  const c = await tx.contador.findUniqueOrThrow({ where: { nome: 'AT' } });
  return `AT-${String(c.valor).padStart(6, '0')}`;
}

async function fichaPorContato(tx: Tx, telefone: string | null, instagram: string | null) {
  const ou: Prisma.ClienteWhereInput[] = [];
  if (telefone) ou.push({ telefone: { in: variantesDoTelefone(telefone) } });
  if (instagram) ou.push({ instagram });
  if (!ou.length) return null;
  return tx.cliente.findFirst({
    where: { OR: ou, NOT: { telefone: '' } }, orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, telefone: true, instagram: true, vendedorId: true, vendedor: { select: { name: true, ativo: true } } },
  });
}

const numeroPrincipal = async (tx: Tx, usuarioId: string | null) =>
  usuarioId ? ((await tx.user.findUnique({ where: { id: usuarioId }, select: { numeroPrincipal: { select: { id: true, status: true } } } }))?.numeroPrincipal ?? null) : null;

const numeroEmUsoDe = async (tx: Tx, usuarioId: string | null) => { const n = await numeroPrincipal(tx, usuarioId); return n?.status === 'ativo' ? n.id : null; };

/** Vendedora ativa para um contato sem dona: quem registrou; se foi o gestor, a escolhida ou a padrão; senão, a fila do gestor. */
async function responsavelSemFicha(tx: Tx, u: Usuario, escolhido?: string | null) {
  if (u.papel === 'vendedor') return u.id;
  const ativa = async (id?: string | null) => (id ? (await tx.user.findFirst({ where: { id, papel: 'vendedor', ativo: true }, select: { id: true } }))?.id ?? null : null);
  return (await ativa(escolhido)) ?? (await ativa((await lerConfig()).vendedorPadraoId));
}

export type ResultadoCriacao =
  | { tipo: 'criado'; id: string; codigo: string; responsavelId: string | null; fichaCriada: boolean; clienteId: string | null }
  | { tipo: 'existente'; id: string; codigo: string }
  | { tipo: 'encaminhado'; id: string; codigo: string; para: string; responsavelId: string };

export async function criarAtendimento(u: Usuario, d: { nome: string; telefone: string | null; instagram: string | null; canal: CanalAtendimento; nota?: string | null; responsavelId?: string | null }): Promise<ResultadoCriacao> {
  if (!d.telefone && !d.instagram) throw new ErroNegocio('Informe o WhatsApp ou o @ do Instagram.');
  return db.$transaction(async tx => {
    const codigo = await proximoCodigo(tx);
    const ficha = await fichaPorContato(tx, d.telefone, d.instagram);
    const nota = d.nota?.trim() || null;

    // Já há conversa aberta com esta pessoa: junta a nota lá e não abre outra.
    const ou: Prisma.AtendimentoWhereInput[] = [];
    if (ficha) ou.push({ clienteId: ficha.id });
    if (d.telefone) ou.push({ contatoTelefone: { in: variantesDoTelefone(d.telefone) } });
    if (d.instagram) ou.push({ contatoInstagram: d.instagram });
    const aberto = await tx.atendimento.findFirst({ where: { fechadoEm: null, OR: ou }, select: { id: true, codigo: true, responsavelId: true, responsavel: { select: { name: true } } } });
    if (aberto) {
      if (nota) await tx.atendimentoRegistro.create({ data: { atendimentoId: aberto.id, tipo: 'nota', texto: nota, usuarioId: u.id } });
      // Estava sem responsável: quem chegou primeiro assume.
      if (!aberto.responsavelId && u.papel === 'vendedor') await tx.atendimento.update({ where: { id: aberto.id }, data: { responsavelId: u.id } });
      if (aberto.responsavelId && !podeAtender(u, aberto)) return { tipo: 'encaminhado', id: aberto.id, codigo: aberto.codigo, para: primeiroNome(aberto.responsavel!.name), responsavelId: aberto.responsavelId };
      return { tipo: 'existente', id: aberto.id, codigo: aberto.codigo };
    }

    const dona = ficha?.vendedor.ativo ? ficha.vendedorId : null;
    const responsavelId = dona ?? (await responsavelSemFicha(tx, u, d.responsavelId));
    let clienteId = ficha?.id ?? null;
    let fichaCriada = false;
    if (!clienteId && d.telefone && responsavelId) {
      clienteId = (await tx.cliente.create({ data: { nome: d.nome, telefone: formatarTelefone(d.telefone), instagram: d.instagram, origem: d.canal, vendedorId: responsavelId } })).id;
      fichaCriada = true;
    }
    if (ficha && d.instagram && !ficha.instagram) await tx.cliente.update({ where: { id: ficha.id }, data: { instagram: d.instagram } });

    const a = await tx.atendimento.create({
      data: {
        codigo, clienteId, responsavelId, canal: d.canal, numeroId: await numeroEmUsoDe(tx, responsavelId),
        // Com ficha, os dados vêm dela. Sem ficha, ficam aqui até haver WhatsApp e uma vendedora.
        contatoNome: clienteId ? null : d.nome, contatoTelefone: clienteId ? null : d.telefone && formatarTelefone(d.telefone), contatoInstagram: clienteId ? null : d.instagram,
        registros: { create: nota ? [{ tipo: 'nota', texto: nota, usuarioId: u.id }] : [] },
      },
    });
    if (dona && dona !== u.id && u.papel !== 'gestor') return { tipo: 'encaminhado', id: a.id, codigo, para: primeiroNome(ficha!.vendedor.name), responsavelId: dona };
    return { tipo: 'criado', id: a.id, codigo, responsavelId, fichaCriada, clienteId };
  });
}

/**
 * Formulário público (docs/26): nunca cria ficha, pedido ou reserva, nunca altera ficha e não diz se o telefone já é
 * conhecido. Com ficha, vai para a vendedora dela; sem ficha, para quem enviou o link ou a responsável pela vitrine.
 * O nome digitado fica só na nota.
 */
export async function registrarInteressePublico(d: { nome: string; telefone: string; itens: { varianteId: number; produtoId: number; descricao: string }[]; origemId: string; canal: CanalAtendimento; vitrineId?: string | null; ofertas?: boolean }, agora = new Date()) {
  const lista = d.itens.map(i => i.descricao).join('; ');
  const texto = `Pediu ${d.vitrineId ? 'pela vitrine' : 'pelo link da peça'}: ${lista}. Nome informado: ${d.nome}.${d.ofertas ? ' Marcou que aceita receber ofertas: confira com ela antes de marcar na ficha.' : ''}`;
  return db.$transaction(async tx => {
    const codigo = await proximoCodigo(tx);
    const ficha = await fichaPorContato(tx, d.telefone, null);
    const ou: Prisma.AtendimentoWhereInput[] = [{ contatoTelefone: { in: variantesDoTelefone(d.telefone) } }];
    if (ficha) ou.push({ clienteId: ficha.id });
    const aberto = await tx.atendimento.findFirst({ where: { fechadoEm: null, pedidoId: null, OR: ou }, select: { id: true, codigo: true, responsavelId: true, vitrineId: true } });
    if (aberto) {
      for (const i of d.itens) await tx.atendimentoItem.upsert({ where: { atendimentoId_varianteId: { atendimentoId: aberto.id, varianteId: i.varianteId } }, create: { atendimentoId: aberto.id, varianteId: i.varianteId, produtoId: i.produtoId }, update: {} });
      await tx.atendimentoRegistro.create({ data: { atendimentoId: aberto.id, tipo: 'nota', texto } });
      if (d.vitrineId && !aberto.vitrineId) await tx.atendimento.update({ where: { id: aberto.id }, data: { vitrineId: d.vitrineId } });
      return { id: aberto.id, codigo: aberto.codigo, responsavelId: aberto.responsavelId, novo: false };
    }
    const dona = ficha?.vendedor.ativo ? ficha.vendedorId : null;
    const origem = await tx.user.findFirst({ where: { id: d.origemId, papel: 'vendedor', ativo: true }, select: { id: true } });
    const padrao = (await lerConfig()).vendedorPadraoId;
    const responsavelId = dona ?? origem?.id ?? (padrao ? (await tx.user.findFirst({ where: { id: padrao, papel: 'vendedor', ativo: true }, select: { id: true } }))?.id ?? null : null);
    const a = await tx.atendimento.create({
      data: {
        codigo, clienteId: ficha?.id ?? null, responsavelId, canal: d.canal, vitrineId: d.vitrineId ?? null, numeroId: await numeroEmUsoDe(tx, responsavelId), aceitouContatoEm: agora, aceitouOfertasEm: d.ofertas ? agora : null,
        contatoNome: ficha ? null : d.nome, contatoTelefone: ficha ? null : formatarTelefone(d.telefone),
        itens: { create: d.itens.map(i => ({ varianteId: i.varianteId, produtoId: i.produtoId })) }, registros: { create: { tipo: 'nota', texto } },
      },
    });
    return { id: a.id, codigo, responsavelId, novo: true };
  });
}

/** A peça foi enviada à cliente deste atendimento: entra no histórico. */
export async function registrarEnvioDePeca(u: Usuario, id: string, descricao: string) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    await tx.atendimentoRegistro.create({ data: { atendimentoId: id, tipo: 'envio_peca', texto: descricao, usuarioId: u.id } });
  });
}

/** Atendimento com a permissão conferida. Sem permissão, a mesma resposta de quem não existe. */
async function doEscopo(tx: Tx, u: Usuario, id: string) {
  const a = await tx.atendimento.findUnique({ where: { id } });
  if (!a || !podeAtender(u, a)) throw new ErroNegocio('Atendimento não encontrado.');
  return a;
}

/** Etapas manuais. Toda conversa aberta precisa de um próximo contato; perder exige motivo. */
export async function mudarEtapa(u: Usuario, id: string, d: { etapa: Etapa; proximoContatoEm: Date | null; motivoPerda?: string | null }, agora = new Date()) {
  return db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.etapa === 'ganho') throw new ErroNegocio('Este atendimento já virou venda. Para mudar, desfaça a venda no pedido.');
    if (a.pedidoId) throw new ErroNegocio('Há um pedido em aberto neste atendimento. Confirme ou cancele o pedido primeiro.');
    if (d.etapa === 'perdido') {
      if (!d.motivoPerda) throw new ErroNegocio('Escolha o motivo.');
      await tx.atendimento.update({ where: { id }, data: { etapa: 'perdido', motivoPerda: d.motivoPerda, fechadoEm: agora, proximoContatoEm: null, registros: { create: { tipo: 'etapa', texto: `Perdido: ${d.motivoPerda}`, usuarioId: u.id } } } });
      return { fechou: true, a };
    }
    if (d.etapa !== 'em_conversa' && d.etapa !== 'proposta') throw new ErroNegocio('Esta etapa vem do pedido.');
    if (!d.proximoContatoEm) throw new ErroNegocio('Marque a data do próximo contato.');
    await tx.atendimento.update({ where: { id }, data: { etapa: d.etapa, motivoPerda: null, fechadoEm: null, proximoContatoEm: d.proximoContatoEm, registros: { create: { tipo: 'etapa', texto: `Etapa: ${d.etapa === 'proposta' ? 'Proposta' : 'Em conversa'}`, usuarioId: u.id } } } });
    return { fechou: false, a };
  });
}

/** Só adia o retorno, sem mudar a etapa (Novo vira Em conversa: alguém já olhou). */
export async function reagendar(u: Usuario, id: string, quando: Date) {
  await db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.fechadoEm) throw new ErroNegocio('Este atendimento está encerrado.');
    await tx.atendimento.update({ where: { id }, data: { proximoContatoEm: quando, ...(a.etapa === 'novo' ? { etapa: 'em_conversa' as const } : {}) } });
  });
}

export async function adicionarNota(u: Usuario, id: string, texto: string) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    await tx.atendimentoRegistro.create({ data: { atendimentoId: id, tipo: 'nota', texto, usuarioId: u.id } });
  });
}

/** Clique em WhatsApp ou Direct: conta como contato. Sem API, mede o clique, não a resposta da cliente. */
export async function registrarContato(u: Usuario, id: string, canal: 'whatsapp' | 'instagram', agora = new Date()) {
  return db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    const numeroId = canal === 'whatsapp' ? await numeroEmUsoDe(tx, u.id) : null;
    await tx.atendimento.update({
      where: { id },
      data: {
        ultimoContatoEm: agora, primeiroContatoEm: a.primeiroContatoEm ?? agora,
        ...(a.etapa === 'novo' ? { etapa: 'em_conversa' as const } : {}),
        ...(numeroId ? { numeroId } : {}),
        ...(!a.fechadoEm && !a.pedidoId && (!a.proximoContatoEm || a.proximoContatoEm <= agora) ? { proximoContatoEm: retornoPadrao(agora) } : {}),
        registros: { create: { tipo: canal === 'whatsapp' ? 'contato_whatsapp' : 'contato_direct', usuarioId: u.id } },
      },
    });
    return { numeroId, codigo: a.codigo };
  });
}

/**
 * Chegou o WhatsApp ou o @ depois. WhatsApp de ficha existente: vincula e, se a ficha for de outra vendedora, o
 * atendimento vai para ela (D-30). Sem ficha, cria uma com o que foi digitado.
 */
export async function informarContato(u: Usuario, id: string, d: { telefone: string | null; instagram: string | null }) {
  return db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.clienteId) {
      if (d.instagram) await tx.cliente.update({ where: { id: a.clienteId }, data: { instagram: d.instagram } });
      if (d.telefone) throw new ErroNegocio('Este atendimento já tem ficha. Corrija o WhatsApp na ficha da cliente.');
      return { encaminhadoPara: null, responsavelId: a.responsavelId };
    }
    if (!d.telefone) {
      await tx.atendimento.update({ where: { id }, data: { contatoInstagram: d.instagram } });
      return { encaminhadoPara: null, responsavelId: a.responsavelId };
    }
    const instagram = d.instagram ?? a.contatoInstagram;
    const ficha = await fichaPorContato(tx, d.telefone, null);
    if (ficha) {
      const dona = ficha.vendedor.ativo ? ficha.vendedorId : a.responsavelId;
      if (instagram && !ficha.instagram) await tx.cliente.update({ where: { id: ficha.id }, data: { instagram } });
      await tx.atendimento.update({
        where: { id },
        data: {
          clienteId: ficha.id, responsavelId: dona, contatoNome: null, contatoTelefone: null, contatoInstagram: null, numeroId: await numeroEmUsoDe(tx, dona),
          registros: { create: dona !== a.responsavelId ? [{ tipo: 'transferencia', texto: 'Este WhatsApp já tem ficha: o atendimento foi para a vendedora dela.', usuarioId: u.id }] : [] },
        },
      });
      return { encaminhadoPara: dona !== a.responsavelId && dona !== u.id ? primeiroNome(ficha.vendedor.name) : null, responsavelId: dona };
    }
    if (!a.responsavelId) {
      await tx.atendimento.update({ where: { id }, data: { contatoTelefone: formatarTelefone(d.telefone), contatoInstagram: instagram } });
      return { encaminhadoPara: null, responsavelId: null };
    }
    const nova = await tx.cliente.create({ data: { nome: a.contatoNome ?? 'Cliente', telefone: formatarTelefone(d.telefone), instagram, origem: a.canal, vendedorId: a.responsavelId, aceitaOfertasEm: a.aceitouOfertasEm } });
    await tx.atendimento.update({ where: { id }, data: { clienteId: nova.id, contatoNome: null, contatoTelefone: null, contatoInstagram: null } });
    return { encaminhadoPara: null, responsavelId: a.responsavelId };
  });
}

/** Só o gestor (D-30). O responsável é sempre uma vendedora ativa. A carteira não muda: isso é na ficha. */
export async function transferirAtendimento(u: Usuario, id: string, para: string) {
  return db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    const destino = await tx.user.findFirst({ where: { id: para, papel: 'vendedor', ativo: true }, select: { id: true, name: true } });
    if (!destino) throw new ErroNegocio('Escolha uma vendedora ativa.');
    if (a.responsavelId === para) throw new ErroNegocio('Este atendimento já é dessa pessoa.');
    // Estava sem responsável, com WhatsApp: agora a ficha pode nascer.
    let clienteId = a.clienteId;
    if (!clienteId && a.contatoTelefone) {
      const ficha = await fichaPorContato(tx, a.contatoTelefone, null);
      clienteId = ficha?.id ?? (await tx.cliente.create({ data: { nome: a.contatoNome ?? 'Cliente', telefone: a.contatoTelefone, instagram: a.contatoInstagram, origem: a.canal, vendedorId: para, aceitaOfertasEm: a.aceitouOfertasEm } })).id;
    }
    await tx.atendimento.update({
      where: { id },
      data: {
        responsavelId: para, numeroId: await numeroEmUsoDe(tx, para), clienteId,
        ...(clienteId && !a.clienteId ? { contatoNome: null, contatoTelefone: null, contatoInstagram: null } : {}),
        registros: { create: { tipo: 'transferencia', texto: `Passado para ${destino.name}.`, usuarioId: u.id } },
      },
    });
    return destino;
  });
}

const MAX_PECAS = 40;

export async function adicionarPeca(u: Usuario, id: string, varianteId: number) {
  await db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.fechadoEm || a.pedidoId) throw new ErroNegocio('Este atendimento já tem pedido ou foi encerrado.');
    const v = await tx.variante.findUnique({ where: { id: varianteId }, select: { produtoId: true } });
    if (!v) throw new ErroNegocio('Peça não encontrada.');
    if ((await tx.atendimentoItem.count({ where: { atendimentoId: id } })) >= MAX_PECAS) throw new ErroNegocio('Peças demais neste atendimento.');
    await tx.atendimentoItem.upsert({ where: { atendimentoId_varianteId: { atendimentoId: id, varianteId } }, create: { atendimentoId: id, varianteId, produtoId: v.produtoId }, update: { quantidade: { increment: 1 } } });
  });
}

export async function removerPeca(u: Usuario, id: string, itemId: number) {
  await db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.fechadoEm || a.pedidoId) throw new ErroNegocio('Este atendimento já tem pedido ou foi encerrado.');
    await tx.atendimentoItem.deleteMany({ where: { id: itemId, atendimentoId: id } });
  });
}

/**
 * Converte em pedido, com as peças do atendimento e os preços de agora. A venda fica com a vendedora da carteira.
 * A gravação do `pedidoId` roda na transação do pedido: num segundo clique, nada é criado.
 */
export async function converterEmPedido(u: Usuario, id: string, tipo: 'compra' | 'condicional') {
  const a = await db.atendimento.findUnique({
    where: { id },
    include: {
      itens: true, cliente: { select: { id: true, nome: true, telefone: true, cep: true, vendedorId: true, vendedor: { select: { name: true, ativo: true } } } },
      vitrine: { select: { status: true, ofertaAte: true, pecas: { select: { produtoId: true, precoOferta: true } } } },
    },
  });
  if (!a || !podeAtender(u, a)) throw new ErroNegocio('Atendimento não encontrado.');
  if (a.pedidoId) throw new ErroNegocio('Este atendimento já virou pedido.');
  if (a.fechadoEm) throw new ErroNegocio('Este atendimento está encerrado.');
  if (!a.cliente || !celularValido(a.cliente.telefone)) throw new ErroNegocio('Informe o WhatsApp da cliente antes de criar o pedido.');
  if (!a.itens.length) throw new ErroNegocio('Adicione pelo menos uma peça.');
  if (!a.cliente.vendedor.ativo) throw new ErroNegocio('A vendedora desta cliente está inativa. Transfira a cliente primeiro.');
  const cliente = a.cliente;
  // O preço especial da vitrine, se ainda valer; criarPedido só aceita preço abaixo do catálogo.
  const precos = new Map<number, number>();
  if (a.vitrine && ofertaVale(a.vitrine)) {
    const ofertas = new Map(a.vitrine.pecas.map(p => [p.produtoId, p.precoOferta]));
    for (const i of a.itens) { const o = ofertas.get(i.produtoId); if (o != null) precos.set(i.varianteId, Number(o)); }
  }
  const pedido = await criarPedido({
    precos, vitrineId: a.vitrineId,
    tipo, origem: 'vendedor', clienteId: cliente.id, vendedorId: cliente.vendedorId, nomeCliente: cliente.nome, telefoneCliente: cliente.telefone,
    cep: tipo === 'condicional' ? cliente.cep : null, linhas: a.itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })), usuarioId: u.id,
    aposCriar: async (tx, pedidoId) => {
      const { count } = await tx.atendimento.updateMany({ where: { id, pedidoId: null, fechadoEm: null }, data: { pedidoId, etapa: 'aguardando_pagamento', proximoContatoEm: retornoPadrao(new Date()) } });
      if (!count) throw new ErroPedido('Este atendimento já virou pedido.');
      await tx.atendimentoRegistro.create({ data: { atendimentoId: id, tipo: 'pedido', texto: 'Pedido criado a partir deste atendimento.', usuarioId: u.id } });
    },
  });
  return { pedido, cliente, nomeVendedor: cliente.vendedor.name };
}

/** LGPD: apaga o contato de quem não tem ficha, a pedido da pessoa. Só o gestor. */
export async function apagarContato(u: Usuario, id: string) {
  await db.$transaction(async tx => {
    const a = await doEscopo(tx, u, id);
    if (a.clienteId) throw new ErroNegocio('Este contato tem ficha: a exclusão é pela ficha da cliente.');
    await tx.atendimento.delete({ where: { id } });
  });
}

export async function salvarResposta(u: Usuario, d: { id?: number; titulo: string; texto: string; daLoja: boolean }) {
  if (d.daLoja && u.papel !== 'gestor') throw new ErroNegocio('Só o gestor edita as respostas da loja.');
  if (d.id) {
    const r = await db.respostaPronta.findUnique({ where: { id: d.id } });
    if (!r || (r.usuarioId ? r.usuarioId !== u.id : u.papel !== 'gestor')) throw new ErroNegocio('Resposta não encontrada.');
    return db.respostaPronta.update({ where: { id: d.id }, data: { titulo: d.titulo, texto: d.texto } });
  }
  return db.respostaPronta.create({ data: { titulo: d.titulo, texto: d.texto, usuarioId: d.daLoja ? null : u.id } });
}

export async function excluirResposta(u: Usuario, id: number) {
  const r = await db.respostaPronta.findUnique({ where: { id } });
  if (!r || (r.usuarioId ? r.usuarioId !== u.id : u.papel !== 'gestor')) throw new ErroNegocio('Resposta não encontrada.');
  await db.respostaPronta.delete({ where: { id } });
}
