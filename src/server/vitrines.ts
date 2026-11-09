import 'server-only';
import type { Prisma, TipoVitrine } from '@prisma/client';
import { db } from './db';
import { lerConfig } from './config';
import { ErroNegocio } from './erros';
import { podeAtender, type Usuario } from './permissoes';
import { gerarSlug, proximosStatus, type StatusVitrine } from '@/lib/vitrines';

/**
 * Vitrines (docs/26): toda vendedora cria e cuida das dela; o gestor, de todas. O público nunca escreve aqui,
 * além do contador de visitas. O endereço (`slug`) só é gerado ao criar: depois de publicado, o link já circulou.
 */
type Tx = Prisma.TransactionClient;
type Dados = { tipo: TipoVitrine; titulo: string; descricao: string | null; urlInstagram: string | null; legenda: string | null; inicioPrevisto: Date | null; ofertaAte: Date | null; responsavelId?: string | null };

async function doEscopo(tx: Tx, u: Usuario, id: string) {
  const v = await tx.vitrine.findUnique({ where: { id } });
  if (!v || !podeAtender(u, { responsavelId: v.responsavelId })) throw new ErroNegocio('Vitrine não encontrada.');
  return v;
}

async function slugLivre(tx: Tx, titulo: string) {
  const base = gerarSlug(titulo);
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await tx.vitrine.findUnique({ where: { slug: s }, select: { id: true } }))) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function responsavelValido(tx: Tx, u: Usuario, escolhido?: string | null) {
  if (u.papel !== 'gestor') return u.id;
  if (escolhido && (await tx.user.findFirst({ where: { id: escolhido, papel: 'vendedor', ativo: true }, select: { id: true } }))) return escolhido;
  throw new ErroNegocio('Escolha a pessoa responsável.');
}

export async function criarVitrine(u: Usuario, d: Dados) {
  return db.$transaction(async tx => {
    const responsavelId = await responsavelValido(tx, u, d.responsavelId);
    return tx.vitrine.create({ data: { ...d, responsavelId, slug: await slugLivre(tx, d.titulo) } });
  });
}

export async function atualizarVitrine(u: Usuario, id: string, d: Dados) {
  await db.$transaction(async tx => {
    const v = await doEscopo(tx, u, id);
    const responsavelId = u.papel === 'gestor' && d.responsavelId && d.responsavelId !== v.responsavelId ? await responsavelValido(tx, u, d.responsavelId) : v.responsavelId;
    await tx.vitrine.update({ where: { id }, data: { ...d, responsavelId } });
  });
}

export async function adicionarPecaNaVitrine(u: Usuario, id: string, produtoId: number) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    if (!(await tx.produto.findFirst({ where: { id: produtoId, ativo: true }, select: { id: true } }))) throw new ErroNegocio('Peça não encontrada.');
    if (await tx.vitrinePeca.findUnique({ where: { vitrineId_produtoId: { vitrineId: id, produtoId } }, select: { id: true } })) throw new ErroNegocio('Esta peça já está na vitrine.');
    const { _max } = await tx.vitrinePeca.aggregate({ where: { vitrineId: id }, _max: { ordem: true } });
    await tx.vitrinePeca.create({ data: { vitrineId: id, produtoId, ordem: (_max.ordem ?? -1) + 1 } });
  });
}

export async function removerPecaDaVitrine(u: Usuario, id: string, pecaId: number) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    await tx.vitrinePeca.deleteMany({ where: { id: pecaId, vitrineId: id } });
  });
}

export async function moverPecaNaVitrine(u: Usuario, id: string, pecaId: number, direcao: -1 | 1) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    const lista = await tx.vitrinePeca.findMany({ where: { vitrineId: id }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { id: true } });
    const i = lista.findIndex(p => p.id === pecaId);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    for (const [ordem, p] of lista.entries()) await tx.vitrinePeca.update({ where: { id: p.id }, data: { ordem } });
  });
}

/** Preço especial: abaixo do catálogo e, para a vendedora, dentro do limite de desconto da loja (o mesmo do caixa). */
export async function definirOferta(u: Usuario, id: string, pecaId: number, preco: number | null) {
  await db.$transaction(async tx => {
    await doEscopo(tx, u, id);
    const p = await tx.vitrinePeca.findFirst({ where: { id: pecaId, vitrineId: id }, select: { produto: { select: { preco: true } } } });
    if (!p) throw new ErroNegocio('Peça não encontrada.');
    if (preco != null) {
      const catalogo = Number(p.produto.preco);
      if (!(preco > 0) || preco >= catalogo) throw new ErroNegocio('O preço especial precisa ser menor que o do catálogo.');
      if (u.papel !== 'gestor') {
        const limite = (await lerConfig()).caixa.descontoMaxVendedor;
        const minimo = Math.round(catalogo * (100 - limite)) / 100;
        if (preco < minimo) throw new ErroNegocio(`O desconto máximo é de ${limite}%. Para mais, fale com a gestão.`);
      }
    }
    await tx.vitrinePeca.update({ where: { id: pecaId }, data: { precoOferta: preco } });
  });
}

export async function mudarStatusDaVitrine(u: Usuario, id: string, novo: StatusVitrine, agora = new Date()) {
  await db.$transaction(async tx => {
    const v = await doEscopo(tx, u, id);
    if (!proximosStatus(v.tipo, v.status).includes(novo)) throw new ErroNegocio('Esta mudança não é possível agora. Atualize a página.');
    if (novo === 'agendada' || novo === 'publicada' || novo === 'no_ar') {
      if (!(await tx.vitrinePeca.count({ where: { vitrineId: id } }))) throw new ErroNegocio('Adicione pelo menos uma peça.');
    }
    if (novo === 'agendada' && !v.inicioPrevisto) throw new ErroNegocio('Marque a data e a hora da live.');
    if (novo === 'no_ar') {
      // Só uma live no ar: /live leva para ela.
      const noAr = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM vitrine WHERE status = 'no_ar' AND id <> ${id} FOR UPDATE`;
      if (noAr.length) throw new ErroNegocio('Já há uma live no ar. Encerre a outra primeiro.');
    }
    await tx.vitrine.update({
      where: { id },
      data: {
        status: novo,
        ...(novo === 'no_ar' ? { inicioEm: agora } : {}),
        ...(novo === 'publicada' && !v.inicioEm ? { inicioEm: agora } : {}),
        ...(novo === 'encerrada' && !v.fimEm ? { fimEm: agora } : {}),
        ...(novo === 'publicada' ? { fimEm: null } : {}),
      },
    });
  });
}

/** Cópia em rascunho, com as peças e os preços. Datas e link ficam em branco: são de outro momento. */
export async function duplicarVitrine(u: Usuario, id: string) {
  return db.$transaction(async tx => {
    const v = await doEscopo(tx, u, id);
    const pecas = await tx.vitrinePeca.findMany({ where: { vitrineId: id }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] });
    const titulo = `${v.titulo} (cópia)`.slice(0, 120);
    return tx.vitrine.create({
      data: {
        tipo: v.tipo, titulo, descricao: v.descricao, legenda: v.legenda, responsavelId: u.papel === 'gestor' ? v.responsavelId : u.id, slug: await slugLivre(tx, titulo),
        pecas: { create: pecas.map(p => ({ produtoId: p.produtoId, ordem: p.ordem, precoOferta: p.precoOferta })) },
      },
    });
  });
}

/** Contagem sem IP. Falhar aqui não pode derrubar a página pública. */
export async function registrarVisita(id: string) {
  await db.vitrine.update({ where: { id }, data: { visitas: { increment: 1 } } }).catch(e => console.error('Falha ao contar a visita da vitrine', e));
}
