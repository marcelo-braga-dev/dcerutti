import { Fragment, type ReactNode } from 'react';
import { Foto } from './foto';

/** Ícone do WhatsApp (traço simples, herda a cor do texto). */
export function IconeWhatsApp({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;

/** Uma linha com a marcação do WhatsApp (*negrito*, _itálico_, ~riscado~ e links) em elementos React, sem HTML cru. */
function linha(texto: string): ReactNode[] {
  return texto.split(TOKEN).map((parte, i) => {
    if (!parte) return null;
    if (/^https?:\/\//.test(parte)) {
      let curto = parte;
      try { const u = new URL(parte); curto = `${u.host}${u.pathname.length > 18 ? `${u.pathname.slice(0, 16)}…` : u.pathname}`; } catch { /* mostra como veio */ }
      return <span key={i} className="text-[#027eb5] break-all">{curto}</span>;
    }
    const m = parte.match(/^([*_~])(.+)\1$/);
    if (m) {
      const dentro = linha(m[2]);
      return m[1] === '*' ? <strong key={i}>{dentro}</strong> : m[1] === '_' ? <em key={i}>{dentro}</em> : <s key={i}>{dentro}</s>;
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

/** Prévia do link (D-20): imita o cartão que o WhatsApp monta com a imagem gerada pelo servidor (cartao.jpg). */
export type CartaoLink = { fotos: (string | null)[]; extras: number; codigo: string; resumo: string; titulo: string; dominio: string };

function Cartao({ c }: { c: CartaoLink }) {
  const fotos = c.fotos.slice(0, 4);
  const grade = fotos.length <= 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className="-mx-1.5 -mt-0.5 mb-2 rounded-md overflow-hidden bg-black/5">
      <div className="aspect-[1200/630] grid grid-cols-[60%_40%] bg-creme">
        <div className={`grid ${grade} gap-0.5 p-1.5`}>
          {fotos.map((f, i) => (
            <div key={i} className={`relative bg-bege ${fotos.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
              <Foto src={f} alt="" sizes="120px" />
              {i === fotos.length - 1 && c.extras > 0 && <span className="absolute inset-0 grid place-items-center bg-marrom-950/60 text-white font-display font-extrabold">+{c.extras}</span>}
            </div>
          ))}
        </div>
        <div className="p-2 grid content-center gap-0.5 text-marrom-950">
          <span className="text-[0.5rem] tracking-[0.2em] font-black text-caramelo">D’CERUTTI</span>
          <span className="font-display font-extrabold text-[0.7rem] leading-tight">{c.codigo}</span>
          <span className="text-[0.6rem] text-suave leading-tight">{c.resumo}</span>
        </div>
      </div>
      <div className="px-2 py-1.5 bg-[#d9eecb]">
        <div className="font-semibold text-[0.78rem] leading-snug">{c.titulo}</div>
        <div className="text-[0.7rem] text-[#667781]">{c.dominio}</div>
      </div>
    </div>
  );
}

/**
 * Prévia da mensagem como aparece na conversa: balão verde à direita, com a hora. Mesma função que monta o link
 * (lib/mensagem-pedido.ts), então o que a cliente vê é o que o vendedor recebe.
 */
export function PreviaWhatsApp({ texto, para, hora, cartao }: { texto: string; para: string; hora: string; cartao?: CartaoLink }) {
  return (
    <div className="bg-[#efe7dd] p-3 sm:p-4" aria-label={`Prévia da mensagem para ${para}`}>
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-black/5 text-sm text-marrom-950">
        <span className="size-8 rounded-full bg-whatsapp text-white grid place-items-center"><IconeWhatsApp className="size-4" /></span>
        <span className="font-semibold">{para}</span>
      </div>
      <div className="ml-auto max-w-[94%] bg-balao rounded-lg rounded-tr-none shadow-sm px-3 py-2 text-[0.82rem] leading-relaxed text-[#111b21] [overflow-wrap:anywhere]">
        {cartao && <Cartao c={cartao} />}
        {texto.split('\n').map((l, i) => <div key={i} className={l ? '' : 'h-3'}>{linha(l)}</div>)}
        <div className="text-right text-[0.65rem] text-[#667781] mt-1">{hora} ✓✓</div>
      </div>
    </div>
  );
}
