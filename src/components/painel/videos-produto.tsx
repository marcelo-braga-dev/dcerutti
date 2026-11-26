'use client';

import { useEffect, useRef, useState } from 'react';
import { Foto } from '@/components/loja/foto';
import { IconeAlerta, IconeCheck, IconeInfo, IconeLixo, IconePlay, IconeSeta, IconeVideo, IconeVoltar } from '@/components/ui/icones';
import { avisarMudanca } from './produto/campos';
import { JanelaMidia } from './produto/janela-midia';
import { AnelProgresso, enviarComProgresso, tamanhoLegivel, useReferencia, ZonaEnvio } from './produto/midia-comum';

export type VideoProduto = { url: string; capa: string | null };
type Enviando = { previa: string; nome: string; tamanho: number; etapa: 'capa' | 'video'; pct: number };

const MAXIMO = 5;
const TAMANHO_MAXIMO = 100 * 1024 * 1024;

/**
 * D-29: vídeos do produto, como as fotos. O vídeo vai direto para o servidor, com prévia tocando e progresso na hora;
 * a capa é um quadro do vídeo tirado aqui no navegador e enviada como foto. Assistir abre em tela cheia. O formulário
 * recebe o campo `videos` (JSON, na ordem de exibição).
 */
export function VideosProduto({ inicial, restrito = false }: { inicial: VideoProduto[]; /** Vendedora: só acrescenta. */ restrito?: boolean }) {
  const [videos, setVideos] = useState(inicial);
  const [estado, setEstado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Enviando | null>(null);
  const [vendo, setVendo] = useState<number | null>(null);
  const [dica, setDica] = useState(false);
  const oculto = useRef<HTMLInputElement>(null);
  const primeira = useRef(true);
  const referencia = useReferencia();

  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    avisarMudanca(oculto.current);
  }, [videos]);

  const mover = (i: number, d: number) => setVideos(v => { const n = [...v]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remover = (i: number) => setVideos(v => v.filter((_, k) => k !== i));

  const enviar = async (arquivos: File[]) => {
    if (!referencia) return setEstado('Preencha a referência antes de enviar vídeos.');
    const lista = arquivos.slice(0, MAXIMO - videos.length);
    if (!lista.length) return setEstado(`No máximo ${MAXIMO} vídeos por produto.`);
    for (const [i, arquivo] of lista.entries()) {
      const rotulo = lista.length > 1 ? ` ${i + 1} de ${lista.length}` : '';
      if (arquivo.size > TAMANHO_MAXIMO) return setEstado(`“${arquivo.name}” tem ${tamanhoLegivel(arquivo.size)}: passa de 100 MB. Encurte ou exporte em resolução menor.`);
      const previa = URL.createObjectURL(arquivo);
      setEnviando({ previa, nome: arquivo.name, tamanho: arquivo.size, etapa: 'capa', pct: 0 });
      setEstado(`Preparando a capa do vídeo${rotulo}…`);
      const capa = await enviarCapa(referencia, arquivo);
      setEnviando(e => e && { ...e, etapa: 'video' });
      setEstado(`Enviando o vídeo${rotulo}…`);
      const r = await enviarComProgresso(`/api/upload/video?referencia=${encodeURIComponent(referencia)}`, arquivo, pct => setEnviando(e => e && { ...e, pct }));
      setEnviando(null);
      URL.revokeObjectURL(previa);
      if (!(r.status === 200 && r.dados.publica)) return setEstado(r.dados.erro ?? (r.status === 413 ? 'Vídeo grande demais.' : 'Falha no envio do vídeo.'));
      setVideos(v => [...v, { url: r.dados.publica!, capa }]);
    }
    setEstado(restrito ? 'Vídeos enviados. Toque em Salvar para gravar.' : 'Vídeos enviados. Salve o produto para gravar.');
  };

  const cheio = videos.length >= MAXIMO;
  return (
    <div className="grid gap-4">
      <input ref={oculto} type="hidden" name="videos" value={JSON.stringify(videos)} />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-marrom-950"><IconeVideo className="size-4 text-caramelo" />Vídeos <span className="font-normal text-suave">· {videos.length} de {MAXIMO}</span></span>
        <button type="button" onClick={() => setDica(d => !d)} aria-expanded={dica} className="inline-flex items-center gap-1 text-xs text-suave hover:text-marrom-950"><IconeInfo className="size-4" />Gravando no iPhone?</button>
      </div>
      {dica && (
        <div className="rounded-2xl border border-caramelo/40 bg-bege/60 px-4 py-3 text-sm text-marrom-900 animate-[aparecer_.2s_ease-out]">
          Em <strong>Ajustes → Câmera → Formatos</strong>, escolha <strong>Mais Compatível</strong>. O padrão (HEVC) é recusado, porque não toca em Android nem no Windows. Grave curto (até 30 s) e na vertical.
        </div>
      )}

      {(videos.length > 0 || enviando) && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
          {videos.map((v, i) => (
            <li key={v.url} className="grid gap-1">
              <button type="button" onClick={() => setVendo(i)} className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-marrom-950 ring-1 ring-borda hover:ring-borda-forte" aria-label={`Assistir ao vídeo ${i + 1}`}>
                {v.capa ? <Foto src={v.capa} alt="" sizes="112px" className="transition duration-500 group-hover:scale-105" /> : <video src={`${v.url}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />}
                <span className="absolute inset-0 bg-gradient-to-t from-marrom-950/60 to-transparent" />
                <span className="absolute inset-0 grid place-items-center"><span className="size-10 grid place-items-center rounded-full bg-card/90 text-marrom-950 shadow transition group-hover:scale-110"><IconePlay className="size-4 ml-0.5" /></span></span>
                <span className="absolute left-1.5 bottom-1.5 rounded-full bg-marrom-950/70 text-creme text-[0.6rem] font-bold px-1.5 py-0.5">{i + 1}</span>
              </button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid place-items-center size-6 rounded-full hover:bg-bege disabled:opacity-25" aria-label={`Mover vídeo ${i + 1} para antes`}><IconeVoltar className="size-3.5" /></button>
                {(!restrito || !inicial.some(x => x.url === v.url)) && <button type="button" onClick={() => remover(i)} className="grid place-items-center size-6 rounded-full text-vermelho hover:bg-vermelho/10" aria-label={`Remover vídeo ${i + 1}`}><IconeLixo className="size-3.5" /></button>}
                <button type="button" onClick={() => mover(i, 1)} disabled={i === videos.length - 1} className="grid place-items-center size-6 rounded-full hover:bg-bege disabled:opacity-25" aria-label={`Mover vídeo ${i + 1} para depois`}><IconeSeta className="size-3.5" /></button>
              </div>
            </li>
          ))}
          {enviando && (
            <li className="grid gap-1">
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-marrom-950 ring-1 ring-borda">
                <video src={enviando.previa} muted autoPlay loop playsInline className="absolute inset-0 size-full object-cover opacity-80" />
                <span className="absolute inset-0 grid place-items-center bg-marrom-950/40">
                  {enviando.etapa === 'capa' ? <span className="text-[0.7rem] font-semibold text-white">Gerando capa…</span> : <AnelProgresso pct={enviando.pct} />}
                </span>
              </div>
              <span className="text-[0.7rem] text-suave truncate">{tamanhoLegivel(enviando.tamanho)}</span>
            </li>
          )}
        </ul>
      )}

      <ZonaEnvio titulo={cheio ? `Limite de ${MAXIMO} vídeos atingido` : 'Arraste vídeos aqui ou clique para escolher'} compacta icone={<IconeVideo className="size-6" />}
        detalhe="MP4 (H.264), MOV ou WebM · até 100 MB · curto e na vertical · entram depois da primeira foto"
        aceita="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        bloqueio={!referencia ? 'Preencha a referência (etapa 1) para liberar o envio.' : enviando ? 'Aguarde o envio terminar.' : cheio ? 'Remova um vídeo para enviar outro.' : null}
        aoEscolher={enviar} />
      {estado && <p className="flex items-center gap-1.5 text-sm text-suave" role="status">{/enviad/.test(estado) ? <IconeCheck className="size-4 text-oliva" /> : /passa|Falha|caiu|recus|HEVC|grande/.test(estado) ? <IconeAlerta className="size-4 text-vermelho" /> : null}{estado}</p>}

      {vendo != null && videos[vendo] && (
        <JanelaMidia titulo="Vídeos" indice={vendo} total={videos.length} ir={setVendo} fechar={() => setVendo(null)}>
          <video key={videos[vendo].url} src={videos[vendo].url} poster={videos[vendo].capa ?? undefined} controls autoPlay muted playsInline className="max-h-[calc(100dvh-11rem)] max-w-full rounded-2xl bg-black" />
        </JanelaMidia>
      )}
    </div>
  );
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
