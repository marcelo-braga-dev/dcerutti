/** Envio de fotos e vídeos de produto (porta de src/components/painel/produto/midia-comum.tsx e videos-produto.tsx). */

const xsrf = () => decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');

/** Envio com progresso (o fetch não informa o envio). Multipart para fotos; corpo cru para vídeos. */
export function enviarComProgresso(url: string, corpo: FormData | File, progresso: (p: number) => void): Promise<{ status: number; dados: { publica?: string; erro?: string } }> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-XSRF-TOKEN', xsrf());
    xhr.setRequestHeader('Accept', 'application/json');
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

export function enviarFoto(referencia: string, arquivo: File, progresso: (p: number) => void = () => {}) {
  const corpo = new FormData();
  corpo.set('referencia', referencia);
  corpo.set('arquivo', arquivo);
  return enviarComProgresso('/api/upload', corpo, progresso);
}

const esperar = (el: HTMLVideoElement, evento: string) => new Promise<void>((ok, erro) => {
  el.addEventListener(evento, () => ok(), { once: true });
  el.addEventListener('error', () => erro(new Error('vídeo')), { once: true });
});

/** Capa do vídeo: um quadro tirado aqui no navegador e enviado como foto. null se não der. */
export async function enviarCapa(referencia: string, arquivo: File): Promise<string | null> {
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
    const r = await enviarFoto(referencia, new File([jpeg], 'capa.jpg', { type: 'image/jpeg' }));
    return r.status === 200 ? r.dados.publica ?? null : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(endereco);
  }
}
