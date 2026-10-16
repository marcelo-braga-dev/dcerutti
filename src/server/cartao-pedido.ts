import 'server-only';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { caminhoDoArquivo, PREFIXO_URL } from './arquivos';
import type { PedidoPublico } from './consultas/pedido-publico';
import { brl } from '@/lib/dinheiro';
import { COR as COR_PADRAO } from '@/lib/marca';
import { marcaAtual } from './marca';

/**
 * Cartão do pedido (D-20): a imagem que o WhatsApp mostra na prévia do link da mensagem. 1200×630 (proporção de
 * prévia grande), JPEG abaixo de ~250 KB, que o WhatsApp aceita. Até 4 fotos das peças, tamanho e quantidade em cada
 * uma, e à direita o código, as peças e o total. Fica em cache de memória pela "versão" do pedido (peças e situação).
 */
const L = 1200, A = 630, M = 40;
const AREA = { x: M, y: M, w: 720, h: A - 2 * M };
const GAP = 16;
const FONTE = "Lato, 'DejaVu Sans', sans-serif";

const xml = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Foto do servidor (lê do disco) ou de outro endereço (até 4 s e 8 MB); qualquer falha vira "sem foto". */
async function carregarFoto(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith(`${PREFIXO_URL}/`)) {
      const alvo = caminhoDoArquivo(url.slice(PREFIXO_URL.length + 1).split('/'));
      return alvo ? await readFile(alvo) : null;
    }
    if (!/^https:\/\//.test(url)) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok || Number(r.headers.get('content-length') ?? 0) > 8 * 1024 * 1024) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

type Quadro = { x: number; y: number; w: number; h: number };

/** Onde vai cada foto: 1 grande; 2 lado a lado; 3 = uma alta e duas menores; 4 ou mais = grade 2×2. */
export function quadros(n: number): Quadro[] {
  const { x, y, w, h } = AREA;
  const meia = (w - GAP) / 2;
  if (n <= 1) { const lw = Math.round(h * 0.75); return [{ x: x + (w - lw) / 2, y, w: lw, h }]; }
  if (n === 2) { const lh = Math.round(meia / 0.75); return [0, 1].map(i => ({ x: x + i * (meia + GAP), y: y + (h - lh) / 2, w: meia, h: lh })); }
  const mh = (h - GAP) / 2;
  if (n === 3) return [{ x, y, w: meia, h }, { x: x + meia + GAP, y, w: meia, h: mh }, { x: x + meia + GAP, y: y + mh + GAP, w: meia, h: mh }];
  return [0, 1, 2, 3].map(i => ({ x: x + (i % 2) * (meia + GAP), y: y + Math.floor(i / 2) * (mh + GAP), w: meia, h: mh }));
}

type Paleta = { [K in keyof typeof COR_PADRAO]: string };

async function gerar(p: PedidoPublico, COR: Paleta, NOME: string): Promise<Buffer> {
  const mostrar = p.itens.slice(0, 4);
  const restantes = p.itens.length - mostrar.length;
  const qs = quadros(mostrar.length).map(q => ({ x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.w), h: Math.round(q.h) }));

  const fotos = await Promise.all(mostrar.map(async (item, i) => {
    const q = qs[i];
    const dados = await carregarFoto(item.imagem);
    const img = dados
      ? await sharp(dados).rotate().resize(q.w, q.h, { fit: 'cover', position: 'attention' }).jpeg().toBuffer().catch(() => null)
      : null;
    return img ? { input: img, left: q.x, top: q.y } : null;
  }));

  const condicional = p.tipo === 'condicional';
  const etiquetas = mostrar.map((item, i) => {
    const q = qs[i];
    const rotulo = xml(`Tam. ${item.tamanho}${item.quantidade > 1 ? `  ×${item.quantidade}` : ''}`);
    const semFoto = fotos[i] ? '' : `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${COR.bege}"/><text x="${q.x + q.w / 2}" y="${q.y + q.h / 2}" text-anchor="middle" font-family="${FONTE}" font-size="22" fill="${COR.suave}">${xml(item.nome.slice(0, 26))}</text>`;
    const mais = i === mostrar.length - 1 && restantes > 0
      ? `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${COR.marrom950}" fill-opacity="0.62"/><text x="${q.x + q.w / 2}" y="${q.y + q.h / 2 + 6}" text-anchor="middle" font-family="${FONTE}" font-weight="900" font-size="56" fill="#ffffff">+${restantes}</text><text x="${q.x + q.w / 2}" y="${q.y + q.h / 2 + 44}" text-anchor="middle" font-family="${FONTE}" font-weight="700" font-size="22" fill="#ffffff">${restantes === 1 ? 'peça' : 'peças'}</text>`
      : '';
    // No quadro do "+N", a etiqueta sai: ficaria apagada por baixo da cobertura.
    const etiqueta = mais ? '' : `<rect x="${q.x}" y="${q.y + q.h - 46}" width="${q.w}" height="46" fill="${COR.marrom950}" fill-opacity="0.78"/>` +
      `<text x="${q.x + 16}" y="${q.y + q.h - 15}" font-family="${FONTE}" font-weight="700" font-size="22" fill="#ffffff">${rotulo}</text>`;
    return `${semFoto}${etiqueta}${mais}`;
  }).join('');

  const X = 800;
  const pecas = `${p.pecas} ${p.pecas === 1 ? 'peça' : 'peças'}`;
  const valorRotulo = condicional ? 'Valor das peças' : 'Total';
  const extra = condicional ? 'Pague só o que ficar' : p.frete == null ? '+ frete a combinar' : p.frete === 0 ? 'Frete grátis' : `com frete de ${brl(p.frete)}`;
  const texto = `
    <text x="${X}" y="96" font-family="${FONTE}" font-weight="900" font-size="26" letter-spacing="6" fill="${COR.caramelo}">${xml(NOME.toUpperCase())}</text>
    <line x1="${X}" y1="120" x2="${L - M}" y2="120" stroke="${COR.borda}" stroke-width="2"/>
    <text x="${X}" y="176" font-family="${FONTE}" font-weight="700" font-size="22" letter-spacing="3" fill="${COR.suave}">${condicional ? 'CONDICIONAL' : 'PEDIDO'}</text>
    <text x="${X}" y="226" font-family="${FONTE}" font-weight="900" font-size="44" fill="${COR.marrom950}">${xml(p.codigo)}</text>
    <text x="${X}" y="276" font-family="${FONTE}" font-size="28" fill="${COR.marrom950}">${xml(pecas)}</text>
    <text x="${X}" y="400" font-family="${FONTE}" font-weight="700" font-size="22" letter-spacing="2" fill="${COR.suave}">${xml(valorRotulo.toUpperCase())}</text>
    <text x="${X}" y="458" font-family="${FONTE}" font-weight="900" font-size="54" fill="${COR.marrom950}">${xml(brl(p.total))}</text>
    <text x="${X}" y="498" font-family="${FONTE}" font-size="22" fill="${COR.suave}">${xml(extra)}</text>
    <text x="${X}" y="${A - M - 4}" font-family="${FONTE}" font-weight="700" font-size="21" fill="${COR.whatsapp}">Toque para ver as peças ›</text>`;

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}">${etiquetas}${texto}</svg>`);
  return sharp({ create: { width: L, height: A, channels: 3, background: COR.creme } })
    .composite([...fotos.filter((f): f is NonNullable<typeof f> => !!f), { input: svg, left: 0, top: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

const g = globalThis as unknown as { __cartoes?: Map<string, Promise<Buffer>> };
const cache = (g.__cartoes ??= new Map());

/** Versão do pedido: muda quando as peças, os valores ou a situação mudam (edição pelo vendedor, cancelamento). */
export const versaoDoCartao = (p: PedidoPublico) =>
  [p.codigo, p.status, p.total, p.frete, ...p.itens.map(i => `${i.id}:${i.quantidade}:${i.preco}:${i.imagem ?? ''}`)].join('|');

/** As cores seguem a identidade visual (D-25): mudou uma cor, a chave muda e o cartão é refeito. */
export async function cartaoDoPedido(p: PedidoPublico): Promise<Buffer> {
  const { cores, nome } = await marcaAtual();
  const COR: Paleta = {
    ...COR_PADRAO, marrom950: cores['marrom-950'], caramelo: cores.caramelo, oliva: cores.oliva, vermelho: cores.vermelho, areia: cores.areia,
    creme: cores.creme, card: cores.card, bege: cores.bege, borda: cores.borda, suave: cores.suave,
  };
  const chave = `${versaoDoCartao(p)}|${Object.values(COR).join(',')}|${nome}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  const gerando = gerar(p, COR, nome);
  cache.set(chave, gerando);
  gerando.catch(() => cache.delete(chave));
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return gerando;
}
