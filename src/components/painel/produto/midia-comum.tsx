'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { IconeAlerta, IconeMais, IconeNuvem } from '@/components/ui/icones';

/** Fotos e vídeos são gravados na pasta da referência: lê o campo `#campo-referencia` e acompanha o que é digitado. */
export function useReferencia() {
  const [ref, setRef] = useState('');
  useEffect(() => {
    const ler = () => setRef((document.getElementById('campo-referencia') as HTMLInputElement | null)?.value.trim() ?? '');
    ler();
    document.addEventListener('input', ler);
    return () => document.removeEventListener('input', ler);
  }, []);
  return ref;
}

/** Envio com progresso (o fetch não informa o envio). Multipart para fotos; corpo cru para vídeos. */
export function enviarComProgresso(url: string, corpo: FormData | File, progresso: (p: number) => void): Promise<{ status: number; dados: { publica?: string; erro?: string } }> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (corpo instanceof File) xhr.setRequestHeader('Content-Type', corpo.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) progresso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let dados: { publica?: string; erro?: string } = {};
      try { dados = JSON.parse(xhr.responseText); } catch { /* resposta do Nginx, não do app */ }
      resolve({ status: xhr.status, dados });
    };
    xhr.onerror = () => resolve({ status: 0, dados: { erro: 'A conexão caiu durante o envio. Tente de novo.' } });
    xhr.send(corpo);
  });
}

export const tamanhoLegivel = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`);

/** Área de soltar arquivos (ou clicar para escolher). Fica desligada, com o motivo, quando não dá para enviar. */
export function ZonaEnvio({ titulo, detalhe, aceita, multiplo = true, bloqueio, aoEscolher, icone, compacta, bloco }: {
  titulo: string; detalhe: ReactNode; aceita: string; multiplo?: boolean; bloqueio?: string | null; aoEscolher: (f: File[]) => void; icone?: ReactNode; compacta?: boolean; /** Miniatura 3:4 "+ Adicionar" no fim da grade. */ bloco?: boolean;
}) {
  const [sobre, setSobre] = useState(false);
  const livre = !bloqueio;
  if (bloco)
    return (
      <label title={bloqueio ?? titulo}
        onDragOver={e => { if (!livre) return; e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={e => { e.preventDefault(); setSobre(false); if (livre && e.dataTransfer.files.length) aoEscolher([...e.dataTransfer.files]); }}
        className={`aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-center px-1 transition-colors
          ${!livre ? 'border-borda text-suave/60 cursor-not-allowed' : sobre ? 'border-caramelo bg-bege/70 text-caramelo' : 'border-borda-forte text-suave hover:border-caramelo hover:text-caramelo cursor-pointer'}`}>
        <IconeMais className="size-5" />
        <span className="text-[0.68rem] font-semibold leading-tight">{sobre ? 'Solte aqui' : 'Adicionar'}</span>
        <input type="file" accept={aceita} multiple={multiplo} className="sr-only" disabled={!livre}
          onChange={e => { if (e.target.files?.length) aoEscolher([...e.target.files]); e.target.value = ''; }} />
      </label>
    );
  return (
    <label
      onDragOver={e => { if (!livre) return; e.preventDefault(); setSobre(true); }}
      onDragLeave={() => setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); if (livre && e.dataTransfer.files.length) aoEscolher([...e.dataTransfer.files]); }}
      className={`group relative flex ${compacta ? 'flex-row gap-3 px-4 py-3 text-left' : 'flex-col justify-center gap-2 px-6 py-8 text-center'} items-center rounded-2xl border-2 border-dashed transition-all
        ${!livre ? 'border-borda bg-creme/50 cursor-not-allowed' : sobre ? 'border-caramelo bg-bege/70 scale-[1.01]' : 'border-borda-forte bg-creme/40 hover:border-caramelo hover:bg-bege/40 cursor-pointer'}`}>
      <span className={`grid place-items-center ${compacta ? 'size-9' : 'size-14'} shrink-0 rounded-2xl transition-colors ${livre ? 'bg-card text-caramelo shadow-sm group-hover:bg-caramelo group-hover:text-creme' : 'bg-borda/60 text-suave'}`}>
        {icone ?? <IconeNuvem className="size-6" />}
      </span>
      <span className="grid gap-0.5">
        <span className={`text-sm font-semibold ${livre ? 'text-marrom-950' : 'text-suave'}`}>{sobre ? 'Solte para enviar' : titulo}</span>
        <span className="text-xs text-suave">{livre ? detalhe : <span className="inline-flex items-center gap-1 text-caramelo"><IconeAlerta className="size-3.5" />{bloqueio}</span>}</span>
      </span>
      <input type="file" accept={aceita} multiple={multiplo} className="sr-only" disabled={!livre}
        onChange={e => { if (e.target.files?.length) aoEscolher([...e.target.files]); e.target.value = ''; }} />
    </label>
  );
}

/** Anel de progresso sobre a miniatura que está subindo. */
export function AnelProgresso({ pct }: { pct: number }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <span className="relative grid place-items-center size-11" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90"><circle cx="22" cy="22" r={r} fill="none" stroke="rgb(255 255 255 / .3)" strokeWidth="4" /><circle cx="22" cy="22" r={r} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset]" /></svg>
      <span className="text-xs font-bold text-white tabular-nums">{pct}%</span>
    </span>
  );
}
