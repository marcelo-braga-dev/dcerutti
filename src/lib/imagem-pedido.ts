'use client';

import { brl } from './dinheiro';
import { otimizavel, urlOtimizada } from './imagens';
import type { ItemMensagem } from './whatsapp';
import { COR } from './marca';

/**
 * Gera a imagem do pedido (PNG 1080 px de largura, 2 peças por linha) — mesma arte do protótipo.
 * As fotos passam pelo otimizador do próprio site (/_next/image), que é mesma origem: sem problema de CORS no canvas.
 */
export type DadosImagem = {
  selo: string; // "PEDIDO", "CONDICIONAL", "SELEÇÃO PARA VOCÊ"
  codigo: string;
  titulo: string; // "MEU PEDIDO", "OLÁ, MARIANA"
  subtitulo: string;
  rodape: string; // "PAGAMENTO E ENTREGA A COMBINAR"
  itens: ItemMensagem[];
};


async function carregar(url: string): Promise<CanvasImageSource | null> {
  try {
    const src = otimizavel(url) ? urlOtimizada(url) : url;
    const r = await fetch(src, { mode: 'cors' });
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

function carregarLocal(src: string) {
  return new Promise<HTMLImageElement | null>(ok => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });
}

const dimensoes = (im: CanvasImageSource) => {
  const x = im as { width: number; height: number };
  return { w: x.width, h: x.height };
};

export async function gerarImagemPedido(d: DadosImagem): Promise<Blob | null> {
  try { await document.fonts.ready; } catch {}
  const css = getComputedStyle(document.documentElement);
  const D = `${css.getPropertyValue('--font-archivo').trim() || 'Archivo'}, Arial, sans-serif`;
  const B = `${css.getPropertyValue('--font-hanken').trim() || 'Hanken Grotesk'}, Arial, sans-serif`;
  const [logo, ...fotos] = await Promise.all([carregarLocal('/logo-dcerutti.png'), ...d.itens.map(i => (i.imagem ? carregar(i.imagem) : Promise.resolve(null)))]);

  const W = 1080, P = 56, G = 20, CW = (W - P * 2 - G) / 2, IH = Math.round((CW * 4) / 3), TH = 230, HEAD = 300, FOOT = 240;
  const linhas = Math.ceil(d.itens.length / 2);
  const H = HEAD + linhas * (IH + TH) + (linhas - 1) * G + FOOT;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;

  x.fillStyle = COR.creme;
  x.fillRect(0, 0, W, H);
  if (logo) {
    const lh = 110, lw = (logo.width * lh) / logo.height;
    x.globalCompositeOperation = 'multiply';
    x.drawImage(logo, P, 44, lw, lh);
    x.globalCompositeOperation = 'source-over';
  }
  x.textAlign = 'right';
  x.fillStyle = COR.oliva; x.font = `800 24px ${D}`; x.fillText(d.selo, W - P, 70);
  x.fillStyle = COR.marrom950; x.font = `800 44px ${D}`; x.fillText(d.codigo, W - P, 118);
  x.fillStyle = COR.suave; x.font = `500 24px ${B}`;
  x.fillText(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), W - P, 152);
  x.textAlign = 'left';
  x.fillStyle = COR.marrom950; x.font = `800 40px ${D}`; x.fillText(d.titulo.toUpperCase(), P, 222);
  x.fillStyle = COR.suave; x.font = `500 26px ${B}`; x.fillText(d.subtitulo, P, 262);
  x.fillStyle = COR.borda; x.fillRect(P, 280, W - P * 2, 2);

  const quebrar = (t: string, max: number, maxLinhas: number) => {
    const out: string[] = [];
    let ln = '';
    for (const p of t.split(' ')) {
      const tt = ln ? `${ln} ${p}` : p;
      if (x.measureText(tt).width > max && ln) { out.push(ln); ln = p; } else ln = tt;
    }
    if (ln) out.push(ln);
    if (out.length > maxLinhas) { out.length = maxLinhas; out[maxLinhas - 1] += '…'; }
    return out;
  };

  d.itens.forEach((it, i) => {
    const cx = P + (i % 2) * (CW + G), cy = HEAD + Math.floor(i / 2) * (IH + TH + G);
    x.fillStyle = COR.bege; x.fillRect(cx, cy, CW, IH);
    const im = fotos[i];
    if (im) {
      const { w: iw, h: ih } = dimensoes(im);
      const r = Math.max(CW / iw, IH / ih), w = iw * r, h = ih * r;
      x.save(); x.beginPath(); x.rect(cx, cy, CW, IH); x.clip();
      x.drawImage(im, cx + (CW - w) / 2, cy + (IH - h) / 2, w, h);
      x.restore();
    }
    x.font = `800 24px ${D}`;
    const tag = `TAM. ${it.tamanho}   QTD. ${it.quantidade}${it.codigoInterno ? `   CÓD. ${it.codigoInterno}` : ''}`;
    const tw = x.measureText(tag).width + 28;
    x.fillStyle = COR.card; x.fillRect(cx + 14, cy + IH - 60, tw, 44);
    x.fillStyle = COR.marrom950; x.fillText(tag, cx + 28, cy + IH - 29);
    x.font = `600 27px ${B}`; x.fillStyle = COR.marrom950;
    quebrar(it.nome, CW, 2).forEach((t, k) => x.fillText(t, cx, cy + IH + 40 + k * 34));
    x.font = `400 23px ${B}`; x.fillStyle = COR.suave;
    x.fillText(`${it.marca} · Ref. ${it.referencia}`, cx, cy + IH + 122);
    if (it.cor) x.fillText(`Cor: ${it.cor}`, cx, cy + IH + 152);
    x.fillText(`${it.quantidade} x ${brl(it.preco)}`, cx, cy + IH + 190);
    x.font = `800 30px ${D}`; x.fillStyle = COR.marrom950; x.textAlign = 'right';
    x.fillText(brl(it.preco * it.quantidade), cx + CW, cy + IH + 192);
    x.textAlign = 'left';
  });

  const fy = H - FOOT + 30;
  x.fillStyle = COR.marrom950; x.fillRect(P, fy, W - P * 2, FOOT - 60);
  const n = d.itens.reduce((a, i) => a + i.quantidade, 0);
  const total = d.itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  x.fillStyle = COR.areia; x.font = `700 22px ${D}`;
  x.fillText(`${n} ${n === 1 ? 'PEÇA' : 'PEÇAS'}  ·  ${d.rodape}`, P + 28, fy + 58);
  x.fillStyle = COR.creme; x.font = `800 54px ${D}`; x.fillText(brl(total), P + 28, fy + 130);
  x.fillStyle = COR.areia; x.font = `500 22px ${B}`; x.textAlign = 'right';
  x.fillText("D'Cerutti · Maravilha (SC) · @dcerutti_", W - P - 28, fy + 130);

  return new Promise(ok => c.toBlob(b => ok(b), 'image/png'));
}

/** Compartilha a imagem (celular) ou baixa o arquivo (computador). Retorna false se a pessoa cancelou. */
export async function compartilharImagem(blob: Blob, codigo: string, texto?: string): Promise<boolean> {
  const arquivo = new File([blob], `${codigo}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: codigo, text: texto });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${codigo}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}
