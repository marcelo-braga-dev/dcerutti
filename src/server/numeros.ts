import 'server-only';
import type { Prisma, StatusNumero } from '@prisma/client';
import { db } from './db';
import { ErroNegocio } from './erros';

/**
 * Números de WhatsApp da loja (D-31, docs/26). Cada alteração roda em transação com a linha do número travada: dois
 * cliques não duplicam o vínculo. O histórico (`vinculo_numero`) só cresce: encerrar grava `fimEm`, nada é apagado.
 */
type Tx = Prisma.TransactionClient;

const travar = (tx: Tx, numeroId: number) => tx.$queryRaw`SELECT id FROM numero_whatsapp WHERE id = ${numeroId} FOR UPDATE`;

async function numeroOuErro(tx: Tx, id: number) {
  await travar(tx, id);
  const n = await tx.numeroWhatsApp.findUnique({ where: { id } });
  if (!n) throw new ErroNegocio('Número não encontrado. Atualize a página.');
  return n;
}

/** Outro número aberto da pessoa, para assumir como principal; só número ativo atende. */
async function outroPrincipal(tx: Tx, usuarioId: string, excetoNumero: number) {
  const v = await tx.vinculoNumero.findFirst({
    where: { usuarioId, fimEm: null, numeroId: { not: excetoNumero }, numero: { status: 'ativo' } },
    orderBy: { inicioEm: 'asc' }, select: { numeroId: true },
  });
  return v?.numeroId ?? null;
}

/** Encerra o vínculo. Quem nunca conectou o aparelho não deixa pendência de desconexão. */
async function encerrar(tx: Tx, v: { id: number; conexao: string }, porId: string, motivo: string | null, agora: Date) {
  await tx.vinculoNumero.update({
    where: { id: v.id },
    data: { fimEm: agora, encerradoPorId: porId, motivoFim: motivo?.slice(0, 200) || null, desconectadoEm: v.conexao === 'conectado' ? null : agora },
  });
}

async function abrir(tx: Tx, numeroId: number, usuarioId: string, porId: string) {
  const pessoa = await tx.user.findFirst({ where: { id: usuarioId, ativo: true, papel: { in: ['vendedor', 'gestor'] } }, select: { papel: true, numeroPrincipal: { select: { status: true } } } });
  if (!pessoa) throw new ErroNegocio('Pessoa não encontrada ou inativa.');
  if (await tx.vinculoNumero.findFirst({ where: { numeroId, usuarioId, fimEm: null }, select: { id: true } })) throw new ErroNegocio('Esta pessoa já está neste número.');
  const v = await tx.vinculoNumero.create({ data: { numeroId, usuarioId, vinculadoPorId: porId } });
  return { vinculo: v, pessoa };
}

export async function vincular(numeroId: number, usuarioId: string, porId: string) {
  return db.$transaction(async tx => {
    const n = await numeroOuErro(tx, numeroId);
    if (n.status === 'desativado') throw new ErroNegocio('Este número está desativado. Reative antes de ligar alguém.');
    const { pessoa } = await abrir(tx, numeroId, usuarioId, porId);
    // Vendedora sem número em uso: este passa a ser o principal. A gestora tem acesso, mas não carteira (Q-08).
    if (pessoa.papel === 'vendedor' && n.status === 'ativo' && pessoa.numeroPrincipal?.status !== 'ativo') await tx.user.update({ where: { id: usuarioId }, data: { numeroPrincipalId: numeroId } });
    return n;
  });
}

/** Tira a pessoa do número e, se a gestora escolheu, transfere as clientes e os pedidos em aberto. */
export async function desvincular(p: { numeroId: number; usuarioId: string; porId: string; motivo?: string | null; transferirPara?: string | null }, agora = new Date()) {
  return db.$transaction(async tx => {
    const n = await numeroOuErro(tx, p.numeroId);
    const v = await tx.vinculoNumero.findFirst({ where: { numeroId: p.numeroId, usuarioId: p.usuarioId, fimEm: null } });
    if (!v) throw new ErroNegocio('Esta pessoa já saiu deste número. Atualize a página.');
    await encerrar(tx, v, p.porId, p.motivo ?? null, agora);
    const u = await tx.user.findUniqueOrThrow({ where: { id: p.usuarioId }, select: { numeroPrincipalId: true } });
    if (u.numeroPrincipalId === p.numeroId) await tx.user.update({ where: { id: p.usuarioId }, data: { numeroPrincipalId: await outroPrincipal(tx, p.usuarioId, p.numeroId) } });
    if (p.transferirPara) await transferirCarteira(tx, p.usuarioId, p.transferirPara);
    return { numero: n, pendenteDesconectar: v.conexao === 'conectado' };
  });
}

/** Mover: encerra num número e abre no outro, de uma vez. Quem tinha o de origem como principal continua com principal. */
export async function mover(p: { origemId: number; destinoId: number; usuarioId: string; porId: string }, agora = new Date()) {
  if (p.origemId === p.destinoId) throw new ErroNegocio('Escolha outro número.');
  return db.$transaction(async tx => {
    // Sempre na mesma ordem: dois movimentos cruzados não travam um ao outro.
    const [a, b] = p.origemId < p.destinoId ? [p.origemId, p.destinoId] : [p.destinoId, p.origemId];
    await travar(tx, a);
    await travar(tx, b);
    const destino = await tx.numeroWhatsApp.findUnique({ where: { id: p.destinoId } });
    if (!destino || destino.status === 'desativado') throw new ErroNegocio('O número de destino está desativado.');
    const v = await tx.vinculoNumero.findFirst({ where: { numeroId: p.origemId, usuarioId: p.usuarioId, fimEm: null } });
    if (!v) throw new ErroNegocio('Esta pessoa já saiu deste número. Atualize a página.');
    const { pessoa } = await abrir(tx, p.destinoId, p.usuarioId, p.porId);
    await encerrar(tx, v, p.porId, `Mudou para ${destino.apelido}`, agora);
    const u = await tx.user.findUniqueOrThrow({ where: { id: p.usuarioId }, select: { numeroPrincipalId: true } });
    if (pessoa.papel === 'vendedor' && u.numeroPrincipalId === p.origemId)
      await tx.user.update({ where: { id: p.usuarioId }, data: { numeroPrincipalId: destino.status === 'ativo' ? p.destinoId : await outroPrincipal(tx, p.usuarioId, p.origemId) } });
    return { origem: p.origemId, destino, pendenteDesconectar: v.conexao === 'conectado' };
  });
}

export async function definirPrincipal(numeroId: number, usuarioId: string) {
  await db.$transaction(async tx => {
    const n = await numeroOuErro(tx, numeroId);
    if (n.status !== 'ativo') throw new ErroNegocio('Só um número ativo pode ser o principal.');
    const pessoa = await tx.user.findUnique({ where: { id: usuarioId }, select: { papel: true } });
    if (pessoa?.papel !== 'vendedor') throw new ErroNegocio('Só quem vende tem número principal: o gestor não fica com carteira.');
    if (!(await tx.vinculoNumero.findFirst({ where: { numeroId, usuarioId, fimEm: null }, select: { id: true } }))) throw new ErroNegocio('Ligue a pessoa a este número primeiro.');
    await tx.user.update({ where: { id: usuarioId }, data: { numeroPrincipalId: numeroId } });
  });
}

/** A gestora confirma que conectou o aparelho. */
export async function confirmarConexao(vinculoId: number, agora = new Date()) {
  const { count } = await db.vinculoNumero.updateMany({ where: { id: vinculoId, fimEm: null, conexao: 'aguardando' }, data: { conexao: 'conectado', conectadoEm: agora } });
  if (!count) throw new ErroNegocio('Este vínculo já foi atualizado. Atualize a página.');
}

/** A gestora confirma que desconectou o aparelho: a pendência sai da página. */
export async function confirmarDesconexao(vinculoId: number, agora = new Date()) {
  const { count } = await db.vinculoNumero.updateMany({ where: { id: vinculoId, fimEm: { not: null }, desconectadoEm: null }, data: { desconectadoEm: agora } });
  if (!count) throw new ErroNegocio('Esta pendência já foi resolvida. Atualize a página.');
}

/** Passa as clientes e os pedidos em aberto de uma vendedora para outra (ativa). */
export async function transferirCarteira(tx: Tx, de: string, para: string) {
  if (de === para || !(await tx.user.findFirst({ where: { id: para, papel: 'vendedor', ativo: true }, select: { id: true } }))) throw new ErroNegocio('Escolha uma vendedora ativa para receber a carteira.');
  await tx.cliente.updateMany({ where: { vendedorId: de }, data: { vendedorId: para } });
  await tx.pedido.updateMany({ where: { vendedorId: de, status: 'pendente' }, data: { vendedorId: para } });
  await tx.atendimento.updateMany({ where: { responsavelId: de, fechadoEm: null }, data: { responsavelId: para } });
}

/** Desativar a vendedora: sai de todos os números e deixa as pendências de desconexão. */
export async function encerrarVinculosDoUsuario(tx: Tx, usuarioId: string, porId: string, motivo: string, agora = new Date()) {
  const abertos = await tx.vinculoNumero.findMany({ where: { usuarioId, fimEm: null }, select: { id: true, conexao: true } });
  for (const v of abertos) await encerrar(tx, v, porId, motivo, agora);
  await tx.user.update({ where: { id: usuarioId }, data: { numeroPrincipalId: null } });
  return abertos.length;
}

/** Pausar tira o número do atendimento e mantém as pessoas; desativar também encerra os vínculos. O padrão fica protegido. */
export async function mudarStatus(id: number, status: StatusNumero, porId: string, agora = new Date()) {
  await db.$transaction(async tx => {
    const n = await numeroOuErro(tx, id);
    if (status !== 'ativo' && n.padrao) throw new ErroNegocio('Este é o número padrão da loja. Defina outro como padrão antes.');
    await tx.numeroWhatsApp.update({ where: { id }, data: { status } });
    if (status === 'ativo') return;
    const abertos = await tx.vinculoNumero.findMany({ where: { numeroId: id, fimEm: null }, select: { id: true, conexao: true, usuarioId: true } });
    for (const v of abertos) {
      if (status === 'desativado') await encerrar(tx, v, porId, 'Número desativado', agora);
      const u = await tx.user.findUniqueOrThrow({ where: { id: v.usuarioId }, select: { numeroPrincipalId: true } });
      if (u.numeroPrincipalId === id) await tx.user.update({ where: { id: v.usuarioId }, data: { numeroPrincipalId: await outroPrincipal(tx, v.usuarioId, id) } });
    }
  });
}

/** Troca o número padrão e copia para `whatsappLoja`, que é o que a loja já lê: quem lê a configuração não muda. */
export async function definirPadrao(id: number) {
  await db.$transaction(async tx => {
    const n = await numeroOuErro(tx, id);
    if (n.status !== 'ativo') throw new ErroNegocio('Só um número ativo pode ser o padrão.');
    await tx.numeroWhatsApp.updateMany({ where: { padrao: true, NOT: { id } }, data: { padrao: false } });
    await tx.numeroWhatsApp.update({ where: { id }, data: { padrao: true } });
    await tx.configuracao.upsert({ where: { chave: 'whatsappLoja' }, create: { chave: 'whatsappLoja', valor: n.telefone }, update: { valor: n.telefone } });
  });
}

/** Cadastra ou edita. Número que já teve alguém ligado ou pedido não troca de telefone: o histórico é daquele telefone. */
export async function salvarNumeroDaLoja(d: { id?: number; telefone: string; apelido: string; observacao: string | null }, porId: string) {
  return db.$transaction(async tx => {
    if (!d.id) return tx.numeroWhatsApp.create({ data: { telefone: d.telefone, apelido: d.apelido, observacao: d.observacao, criadoPorId: porId } });
    const n = await numeroOuErro(tx, d.id);
    if (n.telefone !== d.telefone) {
      const usado = (await tx.vinculoNumero.count({ where: { numeroId: d.id } })) + (await tx.pedido.count({ where: { numeroId: d.id } }));
      if (usado) throw new ErroNegocio('Este número já tem histórico e não pode trocar de telefone. Cadastre o novo e desative este.');
      if (n.padrao) await tx.configuracao.upsert({ where: { chave: 'whatsappLoja' }, create: { chave: 'whatsappLoja', valor: d.telefone }, update: { valor: d.telefone } });
    }
    return tx.numeroWhatsApp.update({ where: { id: d.id }, data: { telefone: d.telefone, apelido: d.apelido, observacao: d.observacao } });
  });
}
