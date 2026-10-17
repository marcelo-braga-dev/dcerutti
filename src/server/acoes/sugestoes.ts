'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { catalogo } from '../catalogo';
import { lerConfig } from '../config';
import { avisarEquipe } from '../avisos';
import { bloqueio, registrarFalha, ATIVIDADE_POR_CLIENTE } from '../limite';
import { codigoDaChaveSugestao, linkDaSugestao, linkPublicoDoPedido } from '../link-pedido';
import { marcaAtual } from '../marca';
import { EQUIPE, exigirPapel, usuarioAtual } from '../permissoes';
import { urlDoSite } from '../site';
import { cancelarSugestao, criarSugestao, ErroSugestao, responderSugestao, salvarEscolhas, tamanhosDaCliente, historicoParaSugestao, renovarSugestao, sugestaoAutomatica, marcarEnviada, lembrarSugestao, adicionarNaSugestao, sugestaoParaEquipe, type EscolhaItem, type HistoricoSugestao, type ItemNovo } from '../sugestoes';
import { clienteDoFiltro } from '../consultas/clientes';
import { casaBusca, emEstoque, termosDeBusca } from '@/lib/catalogo';
import { montarMensagemPedido } from '@/lib/mensagem-pedido';
import { mensagemDaSugestao } from '@/lib/sugestoes';
import { celularValido } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';

export type PecaSugestao = {
  id: number; nome: string; marca: string; cor: string | null; categoria: string; preco: number; precoCheio: number; imagem: string | null;
  variantes: { id: number; tamanho: string; disponivel: number }[];
};

/** Busca do montador de sugestões: até 24 peças com estoque; sem termo, promoções primeiro. */
export async function buscarParaSugestao(termo: string): Promise<PecaSugestao[]> {
  await exigirPapel(EQUIPE);
  const termos = termosDeBusca(String(termo).slice(0, 80));
  const lista = (await catalogo()).filter(p => emEstoque(p) && (termos.length ? casaBusca(p, termos) : p.imagens.length > 0));
  const ordenada = termos.length ? lista : [...lista].sort((a, b) => Number(b.precoCheio > b.preco) - Number(a.precoCheio > a.preco));
  return ordenada.slice(0, 24).map(p => ({
    id: p.id, nome: p.nome, marca: p.marca, cor: p.corNome ?? p.cor, categoria: p.categoria, preco: p.preco, precoCheio: p.precoCheio,
    imagem: p.imagens[0] ?? null, variantes: p.variantes.filter(v => v.disponivel > 0).map(v => ({ id: v.id, tamanho: v.tamanho, disponivel: v.disponivel })),
  }));
}

export type ResultadoCriar = { ok: true; id: string; codigo: string; url: string; link: string } | { ok: false; erro: string };

/** Cria a sugestão e devolve o WhatsApp da cliente com a mensagem e o link. */
export async function criarSugestaoAcao(d: { clienteId: string; titulo: string; mensagem?: string; dias?: number; itens: ItemNovo[]; cupom?: string; enviar?: boolean }): Promise<ResultadoCriar> {
  const u = await exigirPapel(EQUIPE);
  try {
    const s = await criarSugestao(u, { ...d, cupom: d.cupom?.trim() || null, enviar: d.enviar !== false });
    const link = linkDaSugestao(await urlDoSite(), s.codigo);
    const texto = mensagemDaSugestao({
      nomeCliente: s.cliente.nome, nomeVendedor: u.name, loja: (await marcaAtual()).nome, titulo: s.titulo, mensagem: s.mensagem,
      link, pecas: s.pecas, validaAte: s.validaAte, temOferta: s.temOferta, cupom: s.cupomCodigo,
    });
    revalidatePath('/painel/sugestoes');
    return { ok: true, id: s.id, codigo: s.codigo, link, url: linkWhatsApp(s.cliente.telefone, texto) };
  } catch (e) {
    if (e instanceof ErroSugestao) return { ok: false, erro: e.message };
    throw e;
  }
}

export async function cancelarSugestaoAcao(id: string): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await cancelarSugestao(u, String(id));
  } catch (e) {
    if (e instanceof ErroSugestao) return { ok: false, erro: e.message };
    throw e;
  }
  revalidatePath('/painel/sugestoes', 'layout');
  return { ok: true };
}

/** Mensagem pronta para reenviar o link (o painel mostra o botão do WhatsApp). */
export async function linkParaReenviar(codigo: string) {
  await exigirPapel(EQUIPE);
  return linkDaSugestao(await urlDoSite(), codigo);
}

// ---------- Página da cliente (/s/…): sem login, a chave assinada é a autorização ----------

function codigoValido(chave: string) {
  const codigo = codigoDaChaveSugestao(String(chave ?? ''));
  if (!codigo) return null;
  // Limite por sugestão: o link pode ter sido encaminhado; ninguém precisa de mais que isso para escolher.
  const k = `sugestao:${codigo}`;
  if (bloqueio(k, ATIVIDADE_POR_CLIENTE)) return null;
  registrarFalha(k, ATIVIDADE_POR_CLIENTE);
  return codigo;
}

/** Guarda as marcações enquanto a cliente escolhe. */
export async function salvarEscolhasAcao(chave: string, escolhas: EscolhaItem[]): Promise<{ ok: boolean }> {
  const codigo = codigoValido(chave);
  if (!codigo || !Array.isArray(escolhas) || escolhas.length > 60) return { ok: false };
  return { ok: await salvarEscolhas(codigo, escolhas) };
}

export type ResultadoResposta = { ok: true; url: string | null; codigo: string | null; destinatario: string } | { ok: false; erro: string };

/**
 * A cliente devolve as escolhas. "Quero comprar" ou "Quero provar em casa" criam o pedido e devolvem o WhatsApp de quem
 * atende com a mensagem do pedido (D-19); "Ainda estou pensando" só guarda e marca como respondida.
 */
export async function responderSugestaoAcao(chave: string, modo: 'pensando' | 'compra' | 'condicional', escolhas: EscolhaItem[], cep?: string): Promise<ResultadoResposta> {
  const codigo = codigoValido(chave);
  if (!codigo) return { ok: false, erro: 'Link inválido ou muitas tentativas. Espere um minuto e tente de novo.' };
  if (!['pensando', 'compra', 'condicional'].includes(modo)) return { ok: false, erro: 'Escolha uma opção.' };
  const u = await usuarioAtual();
  try {
    const { pedido, s } = await responderSugestao(codigo, modo, Array.isArray(escolhas) ? escolhas.slice(0, 60) : [], { cep, usuarioId: u?.papel === 'cliente' ? u.id : null });
    const cfg = await lerConfig();
    const vendedorOk = s.vendedor.ativo && celularValido(s.vendedor.telefone);
    const telefone = vendedorOk ? s.vendedor.telefone! : cfg.whatsappLoja;
    const destinatario = vendedorOk ? s.vendedor.name.split(' ')[0] : 'a loja';
    if (!pedido) {
      const texto = `Oi, ${destinatario}! Vi as sugestões (${s.codigo}) e marquei o que gostei. Ainda estou pensando, depois te falo. 😊`;
      return { ok: true, url: linkWhatsApp(telefone, texto), codigo: null, destinatario };
    }
    const site = await urlDoSite();
    const { texto } = montarMensagemPedido({
      tipo: modo === 'condicional' ? 'condicional' : 'compra', codigo: pedido.codigo, itens: pedido.itens, nomeCliente: s.cliente.nome,
      nomeVendedor: vendedorOk ? s.vendedor.name : null, cep: modo === 'condicional' ? s.cliente.cep : null, cidadeCondicional: cfg.cidadeCondicional,
      frete: modo === 'compra' ? pedido.frete : null, site, cupom: pedido.cupom, linkPedido: `${site}/painel/pedidos/${pedido.id}`,
      linkPublico: linkPublicoDoPedido(site, pedido.codigo),
    });
    after(() => avisarEquipe(pedido.id, 'novo', site).catch(e => console.error('Falha ao avisar a equipe do pedido da sugestão', pedido.codigo, e)));
    revalidatePath('/painel', 'layout');
    return { ok: true, url: linkWhatsApp(telefone, texto), codigo: pedido.codigo, destinatario };
  } catch (e) {
    if (e instanceof ErroSugestao) return { ok: false, erro: e.message };
    throw e;
  }
}


/** Tamanhos que a cliente mais usa, para destacar no montador. */
export async function tamanhosDaClienteAcao(clienteId: string): Promise<string[]> {
  const u = await exigirPapel(EQUIPE);
  const c = await clienteDoFiltro(u, String(clienteId));
  return c ? tamanhosDaCliente(c.id) : [];
}

/** Registros da cliente para o painel lateral do montador (sacola, vistas, favoritos, pedidos não fechados, compras). */
export async function historicoDaClienteAcao(clienteId: string): Promise<HistoricoSugestao | null> {
  const u = await exigirPapel(EQUIPE);
  return historicoParaSugestao(u, String(clienteId));
}

/** Fase 2: as peças que o sistema sugere para a cliente, já no tamanho dela. */
export async function sugestaoAutomaticaAcao(clienteId: string) {
  const u = await exigirPapel(EQUIPE);
  return sugestaoAutomatica(u, String(clienteId));
}

/** Fase 2: mais dias para a sugestão (e os preços especiais). */
export async function renovarSugestaoAcao(id: string, dias: number): Promise<{ ok: boolean; erro?: string }> {
  const u = await exigirPapel(EQUIPE);
  try {
    await renovarSugestao(u, String(id), Number(dias));
  } catch (e) {
    if (e instanceof ErroSugestao) return { ok: false, erro: e.message };
    throw e;
  }
  revalidatePath('/painel/sugestoes', 'layout');
  return { ok: true };
}

/** Fase 2: a cliente põe uma peça de "Mais para você" na sugestão. */
export async function adicionarNaSugestaoAcao(chave: string, produtoId: number) {
  const codigo = codigoValido(chave);
  if (!codigo) return { ok: false as const, erro: 'Link inválido.' };
  try {
    const item = await adicionarNaSugestao(codigo, Number(produtoId));
    return item ? { ok: true as const, item } : { ok: false as const, erro: 'Não foi possível pôr a peça.' };
  } catch (e) {
    if (e instanceof ErroSugestao) return { ok: false as const, erro: e.message };
    throw e;
  }
}

/** Duplicar (fase 2): as peças de uma sugestão para começar outra (para a mesma ou outra cliente). */
export async function pecasParaDuplicar(id: string) {
  const u = await exigirPapel(EQUIPE);
  const s = await sugestaoParaEquipe(u, String(id));
  if (!s) return null;
  const lista = new Map((await catalogo()).map(p => [p.id, p]));
  return {
    titulo: s.titulo, mensagem: s.mensagem, cupom: s.cupomCodigo,
    itens: s.itens.flatMap(i => {
      const p = lista.get(i.produtoId);
      if (!p || !p.variantes.some(v => v.disponivel > 0)) return [];
      const oferta = i.precoOferta == null ? null : Number(i.precoOferta);
      return [{
        peca: { id: p.id, nome: p.nome, marca: p.marca, cor: p.corNome ?? p.cor, categoria: p.categoria, preco: p.preco, precoCheio: p.precoCheio, imagem: p.imagens[0] ?? null, variantes: p.variantes.filter(v => v.disponivel > 0).map(v => ({ id: v.id, tamanho: v.tamanho, disponivel: v.disponivel })) },
        pct: oferta && oferta < p.preco ? String(Math.round((1 - oferta / p.preco) * 1000) / 10).replace('.', ',') : '', nota: i.nota ?? '',
      }];
    }),
  };
}

/** "Enviar" uma sugestão Para enviar (o WhatsApp já abriu no navegador). */
export async function marcarEnviadaAcao(id: string): Promise<{ ok: boolean }> {
  const u = await exigirPapel(EQUIPE);
  try { await marcarEnviada(u, String(id)); } catch (e) { if (e instanceof ErroSugestao) return { ok: false }; throw e; }
  revalidatePath('/painel/sugestoes', 'layout');
  return { ok: true };
}

/** Lembrete enviado pelo WhatsApp ("viu as peças?"). */
export async function lembrarSugestaoAcao(id: string): Promise<{ ok: boolean }> {
  const u = await exigirPapel(EQUIPE);
  try { await lembrarSugestao(u, String(id)); } catch (e) { if (e instanceof ErroSugestao) return { ok: false }; throw e; }
  revalidatePath('/painel/sugestoes', 'layout');
  return { ok: true };
}
