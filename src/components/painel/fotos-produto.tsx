'use client';

import { useEffect, useRef, useState } from 'react';
import { Foto } from '@/components/loja/foto';
import { IconeAlerta, IconeAmpliar, IconeArrastar, IconeCheck, IconeEstrela, IconeImagem, IconeLink, IconeLixo, IconeSeta, IconeVoltar } from '@/components/ui/icones';
import { avisarMudanca } from './produto/campos';
import { JanelaMidia } from './produto/janela-midia';
import { AnelProgresso, enviarComProgresso, tamanhoLegivel, useReferencia, ZonaEnvio } from './produto/midia-comum';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;
type Enviando = { id: string; previa: string; nome: string; pct: number; erro?: string };
type Medidas = { l: number; a: number };

/**
 * Fotos do produto (U-09, visual 2026): vitrine grande em carrossel com a foto escolhida, miniaturas que se arrastam
 * para mudar a ordem, envio arrastando os arquivos (ou colando com Ctrl+V) com prévia e progresso na hora, tela cheia
 * com zoom e aviso de foto pequena ou fora do formato 3:4. O formulário recebe o mesmo campo `imagens` (um endereço
 * por linha, na ordem de exibição).
 */
export function FotosProduto({ inicial, restrito = false }: { inicial: string[]; /** Vendedora: só acrescenta (não remove as que já existem) e só por envio. */ restrito?: boolean }) {
  const [fotos, setFotos] = useState(inicial);
  const [atual, setAtual] = useState(0);
  const [enviando, setEnviando] = useState<Enviando[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [tela, setTela] = useState<number | null>(null);
  const [inteira, setInteira] = useState(false);
  const [medidas, setMedidas] = useState<Record<string, Medidas>>({});
  const [arrastando, setArrastando] = useState<number | null>(null);
  const oculto = useRef<HTMLInputElement>(null);
  const primeira = useRef(true);
  const referencia = useReferencia();

  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    avisarMudanca(oculto.current);
  }, [fotos]);
  const sel = Math.min(atual, Math.max(0, fotos.length - 1));

  const mover = (i: number, d: number) => {
    setFotos(f => { const n = [...f]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
    if (sel === i) setAtual(i + d);
  };
  const levar = (de: number, para: number) => {
    if (de === para) return;
    setFotos(f => { const n = [...f]; const [x] = n.splice(de, 1); n.splice(para, 0, x); return n; });
    setAtual(para);
  };
  const remover = (i: number) => { setFotos(f => f.filter((_, k) => k !== i)); setAtual(a => (a >= i && a > 0 ? a - 1 : a)); };
  const podeRemover = (src: string) => !restrito || !inicial.includes(src);

  const enviar = async (arquivos: File[]) => {
    if (!referencia) return setEstado('Preencha a referência antes de enviar fotos.');
    const validos = arquivos.filter(a => {
      if (!TIPOS.includes(a.type)) { setEstado(`“${a.name}” não é JPG, PNG, WebP ou AVIF.`); return false; }
      if (a.size > TAMANHO_MAXIMO) { setEstado(`“${a.name}” tem ${tamanhoLegivel(a.size)}: o limite é 8 MB.`); return false; }
      return true;
    });
    if (!validos.length) return;
    const fila = validos.map(a => ({ arquivo: a, item: { id: `${a.name}-${a.size}-${Math.random()}`, previa: URL.createObjectURL(a), nome: a.name, pct: 0 } }));
    setEnviando(e => [...e, ...fila.map(f => f.item)]);
    let falhas = 0;
    for (const [n, { arquivo, item }] of fila.entries()) {
      setEstado(`Enviando ${n + 1} de ${fila.length}…`);
      const corpo = new FormData();
      corpo.set('referencia', referencia);
      corpo.set('arquivo', arquivo);
      const r = await enviarComProgresso('/api/upload', corpo, pct => setEnviando(e => e.map(x => (x.id === item.id ? { ...x, pct } : x))));
      if (r.status === 200 && r.dados.publica) {
        setFotos(f => [...f, r.dados.publica!]);
        setEnviando(e => e.filter(x => x.id !== item.id));
        URL.revokeObjectURL(item.previa);
      } else {
        falhas++;
        const erro = r.dados.erro ?? (r.status === 413 ? 'Foto grande demais.' : 'Falha no envio.');
        setEnviando(e => e.map(x => (x.id === item.id ? { ...x, erro } : x)));
        setEstado(erro);
      }
    }
    if (!falhas) setEstado(restrito ? 'Fotos enviadas. Toque em Salvar para gravar.' : 'Fotos enviadas. Salve o produto para gravar.');
  };

  // Ctrl+V com uma imagem copiada (print, foto do WhatsApp Web) envia direto, se o foco não estiver num campo de texto.
  const enviarRef = useRef(enviar);
  useEffect(() => { enviarRef.current = enviar; });
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input, textarea, [contenteditable]')) return;
      const imagens = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
      if (imagens.length) { e.preventDefault(); enviarRef.current(imagens); }
    };
    document.addEventListener('paste', colar);
    return () => document.removeEventListener('paste', colar);
  }, []);

  const adicionarLink = () => {
    const u = link.trim();
    if (!/^https:\/\/\S+$/.test(u)) return setEstado('Use um endereço que comece com https://');
    setFotos(f => [...f, u]);
    setAtual(fotos.length);
    setLink('');
    setEstado(null);
  };

  const medir = (src: string, img: HTMLImageElement) => {
    if (!medidas[src] && img.naturalWidth) setMedidas(m => ({ ...m, [src]: { l: img.naturalWidth, a: img.naturalHeight } }));
  };
  const m = fotos[sel] ? medidas[fotos[sel]] : undefined;
  const avisoFoto = m && (Math.max(m.l, m.a) < 900 ? 'Resolução baixa: pode ficar borrada no zoom da loja (ideal: 1200 px ou mais).'
    : Math.abs(m.l / m.a - 0.75) > 0.08 ? (m.l > m.a ? 'Foto deitada: a loja mostra em pé (3:4) e corta as laterais.' : 'Fora do formato 3:4: a loja corta um pouco as bordas.') : null);

  return (
    <div className="grid gap-5">
      <input ref={oculto} type="hidden" name="imagens" value={fotos.join('\n')} />

      {fotos.length === 0 && enviando.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl bg-bege/50 border border-borda px-4 py-3 text-sm">
          <IconeImagem className="size-5 text-caramelo shrink-0 mt-0.5" />
          <span><strong className="text-marrom-950">Nenhuma foto ainda.</strong> <span className="text-suave">Sem foto o produto aparece com &quot;Sem foto&quot; na loja. Produtos com 3 ou mais fotos vendem mais.</span></span>
        </div>
      ) : fotos.length > 0 && (
        <div className="grid md:grid-cols-[minmax(0,300px)_1fr] gap-5 items-start">
          {/* Vitrine: a foto escolhida em tamanho grande, com setas para passar. */}
          <div className="grid gap-2">
            <div className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#efebe5] border border-borda">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={fotos[sel]} src={fotos[sel]} alt="" className="hidden" onLoad={e => medir(fotos[sel], e.currentTarget)} />
              <Foto key={`v-${fotos[sel]}`} src={fotos[sel]} alt={`Foto ${sel + 1} em destaque`} sizes="300px" inteira={inteira} className="animate-[aparecer_.25s_ease-out]" />
              {sel === 0 && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-marrom-950/85 text-creme text-[0.68rem] font-bold px-2.5 py-1 backdrop-blur"><IconeEstrela className="size-3" />Capa</span>}
              <span className="absolute right-3 top-3 rounded-full bg-card/90 text-marrom-950 text-[0.68rem] font-semibold px-2.5 py-1 tabular-nums backdrop-blur">{sel + 1}/{fotos.length}</span>
              {fotos.length > 1 && <>
                <button type="button" onClick={() => setAtual(sel - 1)} disabled={sel === 0} aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-full bg-card/90 shadow opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:!opacity-0 transition"><IconeVoltar className="size-4" /></button>
                <button type="button" onClick={() => setAtual(sel + 1)} disabled={sel === fotos.length - 1} aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-full bg-card/90 shadow opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:!opacity-0 transition"><IconeSeta className="size-4" /></button>
              </>}
              <button type="button" onClick={() => setTela(sel)} aria-label="Ver em tela cheia" className="absolute right-3 bottom-3 grid place-items-center size-9 rounded-full bg-card/90 shadow hover:bg-card"><IconeAmpliar className="size-4" /></button>
              {fotos.length > 1 && (
                <span className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 pointer-events-none">
                  {fotos.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === sel ? 'w-5 bg-card' : 'w-1.5 bg-card/60'}`} />)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-suave">
              <span className="tabular-nums">{m ? `${m.l} × ${m.a} px` : ' '}</span>
              <button type="button" onClick={() => setInteira(v => !v)} className="underline underline-offset-2 hover:text-marrom-950">{inteira ? 'Ver como na loja (3:4)' : 'Ver foto inteira'}</button>
            </div>
            {avisoFoto && <p className="flex items-start gap-1.5 text-xs text-caramelo"><IconeAlerta className="size-3.5 shrink-0 mt-px" />{avisoFoto}</p>}
            <div className="flex flex-wrap gap-2">
              {sel > 0 && <button type="button" onClick={() => levar(sel, 0)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-borda-forte text-xs font-semibold hover:border-marrom-950"><IconeEstrela className="size-3.5" />Usar como capa</button>}
              {podeRemover(fotos[sel]) && <button type="button" onClick={() => remover(sel)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-vermelho/40 text-vermelho text-xs font-semibold hover:bg-vermelho hover:text-creme"><IconeLixo className="size-3.5" />Remover esta</button>}
            </div>
          </div>

          {/* Miniaturas: clique para ver, arraste para mudar a ordem. */}
          <div className="grid gap-3 content-start">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-marrom-950">{fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-suave"><IconeArrastar className="size-3.5" />Arraste para reordenar · a primeira é a capa</span>
            </div>
            <ul className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
              {fotos.map((src, i) => (
                <li key={`${src}-${i}`} draggable onDragStart={e => { setArrastando(i); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { if (arrastando != null) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (arrastando != null) levar(arrastando, i); setArrastando(null); }}
                  onDragEnd={() => setArrastando(null)}
                  className={`grid gap-1 transition-opacity ${arrastando === i ? 'opacity-40' : ''}`}>
                  <button type="button" onClick={() => setAtual(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === sel}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-bege cursor-grab active:cursor-grabbing ring-offset-2 ring-offset-card transition ${i === sel ? 'ring-2 ring-marrom-950' : 'ring-1 ring-borda hover:ring-borda-forte'}`}>
                    <Foto src={src} alt="" sizes="96px" />
                    {i === 0 && <span className="absolute left-1 top-1 grid place-items-center size-5 rounded-full bg-marrom-950 text-creme" title="Capa"><IconeEstrela className="size-3" /></span>}
                    {!fotoLocalOuNova(src) && <span className="absolute right-1 top-1 grid place-items-center size-5 rounded-full bg-card/90 text-suave" title="Endereço externo"><IconeLink className="size-3" /></span>}
                  </button>
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid place-items-center size-6 rounded-full hover:bg-bege disabled:opacity-25" aria-label={`Mover foto ${i + 1} para antes`}><IconeVoltar className="size-3.5" /></button>
                    {podeRemover(src) && <button type="button" onClick={() => remover(i)} className="grid place-items-center size-6 rounded-full text-vermelho hover:bg-vermelho/10" aria-label={`Remover foto ${i + 1}`}><IconeLixo className="size-3.5" /></button>}
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="grid place-items-center size-6 rounded-full hover:bg-bege disabled:opacity-25" aria-label={`Mover foto ${i + 1} para depois`}><IconeSeta className="size-3.5" /></button>
                  </div>
                </li>
              ))}
              {enviando.map(e => <MiniaturaEnviando key={e.id} item={e} tirar={() => { URL.revokeObjectURL(e.previa); setEnviando(l => l.filter(x => x.id !== e.id)); }} />)}
            </ul>
          </div>
        </div>
      )}
      {fotos.length === 0 && enviando.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {enviando.map(e => <MiniaturaEnviando key={e.id} item={e} tirar={() => { URL.revokeObjectURL(e.previa); setEnviando(l => l.filter(x => x.id !== e.id)); }} />)}
        </ul>
      )}

      <ZonaEnvio titulo="Arraste as fotos aqui ou clique para escolher" compacta={fotos.length > 0}
        detalhe={<>JPG, PNG, WebP ou AVIF · até 8 MB cada · em pé (3:4) · <span className="hidden sm:inline">também dá para colar com Ctrl+V</span></>}
        aceita={TIPOS.join(',')} bloqueio={referencia ? null : 'Preencha a referência (etapa 1) para liberar o envio.'} aoEscolher={enviar} icone={<IconeImagem className="size-6" />} />

      {!restrito && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <IconeLink className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-suave pointer-events-none" />
            <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarLink(); } }}
              placeholder="ou cole o endereço de uma foto (https://…)" aria-label="Endereço de foto" className="h-10 w-full pl-9 pr-3 border border-borda-forte bg-card text-sm outline-none focus:border-marrom-950" />
          </div>
          <button type="button" onClick={adicionarLink} className="rotulo border border-borda-forte px-4 h-10 hover:border-marrom-950">Adicionar</button>
        </div>
      )}
      {estado && <p className="flex items-center gap-1.5 text-sm text-suave" role="status">{/enviad/.test(estado) && <IconeCheck className="size-4 text-oliva" />}{estado}</p>}

      {tela != null && fotos[tela] && (
        <JanelaMidia titulo="Fotos" indice={tela} total={fotos.length} ir={setTela} fechar={() => setTela(null)}
          rodape={<div className="flex gap-2 overflow-x-auto sem-barra max-w-full">{fotos.map((s, i) => (
            <button key={`${s}-${i}`} type="button" onClick={() => setTela(i)} aria-label={`Foto ${i + 1}`} className={`relative w-12 aspect-[3/4] shrink-0 rounded-lg overflow-hidden transition ${i === tela ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-100'}`}><Foto src={s} alt="" sizes="48px" /></button>
          ))}</div>}>
          <FotoComZoom key={fotos[tela]} src={fotos[tela]} />
        </JanelaMidia>
      )}
    </div>
  );
}

const fotoLocalOuNova = (src: string) => src.startsWith('/arquivos/') || src.startsWith('blob:');

function MiniaturaEnviando({ item, tirar }: { item: Enviando; tirar: () => void }) {
  return (
    <li className="grid gap-1">
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-bege ring-1 ring-borda">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.previa} alt="" className="absolute inset-0 size-full object-cover" />
        <span className={`absolute inset-0 grid place-items-center ${item.erro ? 'bg-vermelho/70' : 'bg-marrom-950/45'}`}>
          {item.erro ? <IconeAlerta className="size-7 text-white" /> : <AnelProgresso pct={item.pct} />}
        </span>
      </div>
      {item.erro
        ? <button type="button" onClick={tirar} className="text-[0.7rem] text-vermelho text-left leading-tight hover:underline" title={item.erro}>Falhou · tirar</button>
        : <span className="text-[0.7rem] text-suave truncate">{item.nome}</span>}
    </li>
  );
}

/** Foto em tela cheia: clique aproxima no ponto clicado; mover o mouse percorre a foto. */
function FotoComZoom({ src }: { src: string }) {
  const [zoom, setZoom] = useState(false);
  const [origem, setOrigem] = useState('50% 50%');
  const pos = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigem(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <button type="button" onClick={e => { pos(e); setZoom(z => !z); }} onMouseMove={e => zoom && pos(e)} aria-label={zoom ? 'Afastar' : 'Aproximar'}
      className={`relative h-[calc(100dvh-11rem)] aspect-[3/4] max-w-full overflow-hidden rounded-2xl ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 size-full object-contain transition-transform duration-300" style={{ transform: zoom ? 'scale(2.2)' : 'none', transformOrigin: origem }} />
    </button>
  );
}
