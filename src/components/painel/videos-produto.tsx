'use client';

import { useState } from 'react';
import { Foto } from '@/components/loja/foto';
import { IconePlay } from '@/components/ui/icones';

export type VideoProduto = { url: string; capa: string | null };

const MAXIMO = 5;
const TAMANHO_MAXIMO = 100 * 1024 * 1024;

/**
 * D-29: vídeos do produto, como as fotos (mover, remover, enviar). O vídeo vai direto para o servidor, com barra de
 * progresso; a capa é um quadro do vídeo tirado aqui no navegador e enviada como foto. O formulário recebe o campo
 * `videos` (JSON, na ordem de exibição).
 */
export function VideosProduto({ inicial }: { inicial: VideoProduto[] }) {
  const [videos, setVideos] = useState(inicial);
  const [estado, setEstado] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);

  const mover = (i: number, d: number) => setVideos(v => { const n = [...v]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remover = (i: number) => setVideos(v => v.filter((_, k) => k !== i));

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const referencia = (document.getElementById('campo-referencia') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!referencia) return setEstado('Preencha a referência antes de enviar vídeos.');
    const lista = [...arquivos].slice(0, MAXIMO - videos.length);
    if (!lista.length) return setEstado(`No máximo ${MAXIMO} vídeos por produto.`);
    for (const [i, arquivo] of lista.entries()) {
      const rotulo = lista.length > 1 ? ` ${i + 1} de ${lista.length}` : '';
      if (arquivo.size > TAMANHO_MAXIMO) return setEstado(`“${arquivo.name}” passa de 100 MB. Encurte ou exporte em resolução menor.`);
      setEstado(`Preparando a capa do vídeo${rotulo}…`);
      const capa = await enviarCapa(referencia, arquivo);
      setEstado(`Enviando o vídeo${rotulo}…`);
      const r = await enviarVideo(referencia, arquivo, setProgresso);
      setProgresso(null);
      if ('erro' in r) return setEstado(r.erro);
      setVideos(v => [...v, { url: r.publica, capa }]);
    }
    setEstado('Vídeos enviados. Salve o produto para gravar.');
  };

  return (
    <div className="grid gap-3">
      <span className="block rotulo text-suave">Vídeos (aparecem depois da primeira foto)</span>
      <input type="hidden" name="videos" value={JSON.stringify(videos)} />
      {videos.length === 0 ? (
        <p className="text-sm text-suave">Nenhum vídeo. MP4 (H.264), MOV ou WebM, até 100 MB; de preferência curto e na vertical.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {videos.map((v, i) => (
            <li key={v.url} className="w-28 grid gap-1">
              <button type="button" onClick={() => setVendo(v.url)} className="relative aspect-[3/4] bg-bege border border-borda" aria-label={`Assistir ao vídeo ${i + 1}`}>
                {v.capa ? <Foto src={v.capa} alt="" sizes="112px" /> : <video src={`${v.url}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />}
                <span className="absolute inset-0 grid place-items-center"><span className="size-9 grid place-items-center rounded-full bg-marrom-950/70 text-creme"><IconePlay className="size-4 ml-0.5" /></span></span>
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="px-2 disabled:text-borda-forte" aria-label={`Mover vídeo ${i + 1} para antes`}>←</button>
                <button type="button" onClick={() => remover(i)} className="px-2 text-vermelho" aria-label={`Remover vídeo ${i + 1}`}>Remover</button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === videos.length - 1} className="px-2 disabled:text-borda-forte" aria-label={`Mover vídeo ${i + 1} para depois`}>→</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {vendo && (
        <div className="grid gap-2 justify-items-start">
          <video src={vendo} controls autoPlay muted playsInline className="max-h-96 max-w-full bg-marrom-950" />
          <button type="button" onClick={() => setVendo(null)} className="text-sm underline">Fechar vídeo</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className={`rotulo border border-marrom-950 px-3 py-2 ${progresso != null || videos.length >= MAXIMO ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-marrom-950 hover:text-creme'}`}>
          Enviar vídeos
          <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple className="sr-only" disabled={progresso != null || videos.length >= MAXIMO}
            onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
        </label>
        {progresso != null && (
          <span className="flex items-center gap-2 flex-1 min-w-48">
            <span className="h-2 flex-1 bg-bege border border-borda"><span className="block h-full bg-marrom-950 transition-[width]" style={{ width: `${progresso}%` }} /></span>
            <span className="tabular-nums">{progresso}%</span>
          </span>
        )}
      </div>
      {estado && <p className="text-sm text-suave" role="status">{estado}</p>}
    </div>
  );
}

/** Envia o arquivo como corpo da requisição (não multipart), com progresso. XHR porque o fetch não informa o envio. */
function enviarVideo(referencia: string, arquivo: File, progresso: (p: number) => void): Promise<{ publica: string } | { erro: string }> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload/video?referencia=${encodeURIComponent(referencia)}`);
    xhr.setRequestHeader('Content-Type', arquivo.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) progresso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let d: { publica?: string; erro?: string } = {};
      try { d = JSON.parse(xhr.responseText); } catch { /* resposta do Nginx, não do app */ }
      if (xhr.status === 200 && d.publica) resolve({ publica: d.publica });
      else resolve({ erro: d.erro ?? (xhr.status === 413 ? 'Vídeo grande demais.' : 'Falha no envio do vídeo.') });
    };
    xhr.onerror = () => resolve({ erro: 'A conexão caiu durante o envio. Tente de novo.' });
    xhr.send(arquivo);
  });
}

/**
 * Tira um quadro do vídeo (perto de 1 s) e envia como foto pela mesma rota das fotos, que converte para WebP.
 * Se o navegador não conseguir abrir o vídeo, segue sem capa: a loja mostra o primeiro quadro do próprio vídeo.
 */
async function enviarCapa(referencia: string, arquivo: File): Promise<string | null> {
  const endereco = URL.createObjectURL(arquivo);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = endereco;
    await esperar(video, 'loadedmetadata');
    // WebM gravado no navegador pode vir sem duração (Infinity): fica no começo.
    video.currentTime = Number.isFinite(video.duration) ? Math.min(1, video.duration / 3) : 0.1;
    await esperar(video, 'seeked');
    const escala = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    if (!canvas.width || !canvas.height) return null;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>(ok => canvas.toBlob(ok, 'image/jpeg', 0.88));
    if (!jpeg) return null;
    const corpo = new FormData();
    corpo.set('referencia', referencia);
    corpo.set('arquivo', new File([jpeg], 'capa.jpg', { type: 'image/jpeg' }));
    const r = await fetch('/api/upload', { method: 'POST', body: corpo });
    return r.ok ? ((await r.json()).publica as string) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

function esperar(video: HTMLVideoElement, evento: 'loadedmetadata' | 'seeked') {
  return new Promise<void>((ok, erro) => {
    const tempo = setTimeout(() => erro(new Error('tempo')), 15_000);
    video.addEventListener(evento, () => { clearTimeout(tempo); ok(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(tempo); erro(new Error('video')); }, { once: true });
  });
}
