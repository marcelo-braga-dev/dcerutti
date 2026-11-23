'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { registrarInteresseVitrine, type ResultadoInteresseVitrine } from '@/server/acoes/vitrines';
import type { VitrinePublica } from '@/server/consultas/vitrines';
import { CamposContato } from './quero-peca';

type Peca = VitrinePublica['pecas'][number];
type Variante = Peca['variantes'][number];
type Escolha = { p: Peca; v: Variante };
type Ordem = 'destaque' | 'menor' | 'maior' | 'desconto';

const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'destaque', rotulo: 'Destaques' }, { valor: 'menor', rotulo: 'Menor preço' }, { valor: 'maior', rotulo: 'Maior preço' }, { valor: 'desconto', rotulo: 'Maior desconto' },
];

/** Nome e WhatsApp lembrados só neste aparelho, para quem volta em outra vitrine não digitar de novo. */
const CHAVE_CONTATO = 'dcerutti-contato-vitrine';
function lerContato(): { nome: string; telefone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_CONTATO) ?? '{}');
    return { nome: typeof v.nome === 'string' ? v.nome : '', telefone: typeof v.telefone === 'string' ? v.telefone : '' };
  } catch { return { nome: '', telefone: '' }; }
}
function gravarContato(nome: string, telefone: string) {
  try { localStorage.setItem(CHAVE_CONTATO, JSON.stringify({ nome, telefone })); } catch { /* sem armazenamento */ }
}

/** Ordem de vestir: PP, P, M, G, GG, XG…; numeração em ordem; o resto como veio. */
const ORDEM_TAMANHO = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'G1', 'G2', 'G3', 'UN', 'UNI'];
const pesoTamanho = (t: string) => {
  const i = ORDEM_TAMANHO.indexOf(t.toUpperCase());
  if (i >= 0) return i;
  const n = Number(t);
  return Number.isFinite(n) ? 100 + n : 1000;
};

/** Trava a rolagem da página e fecha com Esc enquanto uma gaveta está aberta. */
function useGaveta(fechar: () => void, foco: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    foco.current?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
  }, [fechar, foco]);
}

/**
 * Vitrine pública (docs/26, D-36): filtro de tamanho e ordenação fixos ao rolar, grade de peças com o tamanho a um toque
 * (vários tamanhos da mesma peça), detalhes da peça ao tocar na foto, barra fixa que aparece com a primeira escolha e a
 * gaveta do pedido. Só registra o pedido de atendimento: a peça fica reservada depois que a loja confirma.
 */
export function EscolherVitrine({ slug, pecas, aberta, vendedora }: { slug: string; pecas: VitrinePublica['pecas']; aberta: boolean; vendedora: string | null }) {
  const [escolhas, setEscolhas] = useState<number[]>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('destaque');
  const [gaveta, setGaveta] = useState(false);
  const [detalhe, setDetalhe] = useState<Peca | null>(null);
  const [feito, setFeito] = useState<{ r: Extract<ResultadoInteresseVitrine, { ok: true }>; itens: Escolha[] } | null>(null);
  const fecharGaveta = useCallback(() => setGaveta(false), []);
  const fecharDetalhe = useCallback(() => setDetalhe(null), []);

  const tamanhos = useMemo(() => {
    const todos = new Set(pecas.flatMap(p => p.variantes.map(v => v.tamanho)));
    return [...todos].sort((a, b) => pesoTamanho(a) - pesoTamanho(b) || a.localeCompare(b));
  }, [pecas]);
  const visiveis = useMemo(() => {
    const lista = filtro ? pecas.filter(p => p.variantes.some(v => v.tamanho === filtro)) : [...pecas];
    if (ordem === 'menor') lista.sort((a, b) => a.preco - b.preco);
    if (ordem === 'maior') lista.sort((a, b) => b.preco - a.preco);
    if (ordem === 'desconto') lista.sort((a, b) => b.desconto - a.desconto);
    return lista;
  }, [pecas, filtro, ordem]);
  const escolhidas: Escolha[] = escolhas.flatMap(id => {
    for (const p of pecas) { const v = p.variantes.find(x => x.id === id); if (v) return [{ p, v }]; }
    return [];
  });
  const total = escolhidas.reduce((a, x) => a + x.p.preco, 0);
  const economia = escolhidas.reduce((a, x) => a + Math.max(0, x.p.precoCheio - x.p.preco), 0);
  const alternar = useCallback((varianteId: number) => setEscolhas(e => (e.includes(varianteId) ? e.filter(x => x !== varianteId) : [...e, varianteId])), []);

  if (feito) return <PedidoEnviado destinatario={feito.r.destinatario} url={feito.r.url} itens={feito.itens} voltar={() => { setFeito(null); setEscolhas([]); }} />;

  return (
    <div className={`grid gap-5 ${aberta && escolhidas.length ? 'pb-28' : ''}`}>
      {/* Fixo ao rolar: trocar o tamanho e a ordem sem voltar ao topo. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-creme/90 backdrop-blur-md border-b border-borda/70 grid gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-suave" aria-live="polite">
            <strong className="text-marrom-950">{visiveis.length}</strong> {visiveis.length === 1 ? 'peça' : 'peças'}{filtro ? ` no ${filtro}` : ''}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only text-suave">Ordenar</span>
            <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar as peças"
              className="h-9 pl-3 pr-8 rounded-full border border-borda-forte bg-card text-sm font-semibold text-marrom-950 appearance-none bg-[length:12px] bg-[right_0.7rem_center] bg-no-repeat"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232e2520' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}>
              {ORDENS.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </label>
        </div>
        {tamanhos.length > 1 && (
          <div role="group" aria-label="Filtrar pelo seu tamanho" className="flex gap-2 overflow-x-auto sem-barra -mx-4 px-4 sm:mx-0 sm:px-0">
            <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)}
              className={`shrink-0 h-9 px-4 rounded-full border text-sm font-semibold transition-colors ${!filtro ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
              Todos os tamanhos
            </button>
            {tamanhos.map(t => (
              <button key={t} type="button" aria-pressed={filtro === t} aria-label={`Mostrar só o ${t}`} onClick={() => setFiltro(f => (f === t ? null : t))}
                className={`shrink-0 h-9 min-w-11 px-3 rounded-full border text-sm font-semibold transition-colors ${filtro === t ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-card border border-borda rounded-3xl p-8 text-center grid gap-3 justify-items-center">
          <p className="text-marrom-950 font-semibold">Nenhuma peça no tamanho {filtro} nesta vitrine.</p>
          <p className="text-sm text-suave max-w-sm">Fale com {vendedora ?? 'a loja'}: podemos ter outras peças no seu tamanho.</p>
          <button type="button" onClick={() => setFiltro(null)} className={botao('secundario', 'p')}>Ver todos os tamanhos</button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9">
          {visiveis.map((p, i) => (
            <CartaoPeca key={p.produtoId} p={p} escolhas={escolhas} aberta={aberta} destaque={filtro} prioridade={i < 2} alternar={alternar} abrir={() => setDetalhe(p)} />
          ))}
        </ul>
      )}

      {aberta && escolhidas.length > 0 && (
        // Aparece com a primeira escolha: o que foi escolhido e o caminho para pedir, sempre à mão.
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-creme via-creme/95 to-creme/0 pointer-events-none animate-[subir_.25s_ease-out] motion-reduce:animate-none">
          <div className="mx-auto max-w-xl pointer-events-auto flex items-center gap-3 rounded-full bg-marrom-950 text-creme pl-5 pr-1.5 py-1.5 shadow-xl shadow-marrom-950/25">
            <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
              <div className="text-sm font-semibold truncate">{escolhidas.length} {escolhidas.length === 1 ? 'peça' : 'peças'} · {brl(total)}</div>
              {economia > 0 && <div className="text-[0.72rem] text-areia">Você economiza {brl(economia)}</div>}
            </div>
            <button type="button" onClick={() => setGaveta(true)} className="shrink-0 h-11 px-5 rounded-full bg-whatsapp text-white text-sm font-semibold hover:bg-whatsapp-escuro transition-colors">
              Quero estas peças
            </button>
          </div>
        </div>
      )}
      {detalhe && <DetalhesPeca p={detalhe} escolhas={escolhas} aberta={aberta} alternar={alternar} fechar={fecharDetalhe} escolhidas={escolhidas.length} pedir={() => { setDetalhe(null); setGaveta(true); }} />}
      {gaveta && aberta && (
        <GavetaPedido slug={slug} escolhidas={escolhidas} total={total} economia={economia} fechar={fecharGaveta} tirar={alternar}
          concluir={r => { setFeito({ r, itens: escolhidas }); setGaveta(false); }} />
      )}
    </div>
  );
}

function Tamanhos({ p, escolhas, alternar, destaque, grande }: { p: Peca; escolhas: number[]; alternar: (id: number) => void; destaque?: string | null; grande?: boolean }) {
  return (
    <div role="group" aria-label={`Tamanhos de ${p.nome}`} className="flex flex-wrap gap-1.5">
      {p.tamanhos.map(t => {
        const v = p.variantes.find(x => x.tamanho === t.tamanho);
        const tam = grande ? 'min-w-12 h-12 text-sm rounded-xl' : 'min-w-9 h-9 text-xs rounded-lg';
        if (!v) return <span key={t.tamanho} title="Esgotado" className={`${tam} px-1.5 border border-borda text-borda-forte line-through grid place-items-center`}><span aria-hidden="true">{t.tamanho}</span><span className="sr-only">{t.tamanho} esgotado</span></span>;
        const ativo = escolhas.includes(v.id);
        return (
          <button key={v.id} type="button" aria-pressed={ativo} aria-label={`${p.nome}, tamanho ${v.tamanho}`} onClick={() => alternar(v.id)}
            className={`${tam} px-1.5 border font-semibold transition-colors ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : destaque === v.tamanho ? 'border-marrom-950 text-marrom-950 bg-card' : 'border-borda-forte text-marrom-950 bg-card hover:border-marrom-950'}`}>
            {v.tamanho}
          </button>
        );
      })}
    </div>
  );
}

function Preco({ p, grande }: { p: Peca; grande?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <strong className={`font-display ${grande ? 'text-2xl' : 'text-[1.05rem]'} ${p.desconto > 0 ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</strong>
      {p.desconto > 0 && <span className={`${grande ? 'text-sm' : 'text-xs'} text-suave line-through`}>{brl(p.precoCheio)}</span>}
      {p.desconto > 0 && grande && <span className="h-6 px-2 rounded-full bg-imperdivel text-white text-xs font-bold inline-flex items-center">−{p.desconto}%</span>}
    </div>
  );
}

function CartaoPeca({ p, escolhas, aberta, destaque, prioridade, alternar, abrir }: {
  p: Peca; escolhas: number[]; aberta: boolean; destaque: string | null; prioridade: boolean; alternar: (id: number) => void; abrir: () => void;
}) {
  const [foto, setFoto] = useState(0);
  const esgotada = !p.variantes.length;
  const minhas = p.variantes.filter(v => escolhas.includes(v.id));
  const imagens = p.imagens.length ? p.imagens.slice(0, 4) : [p.imagem];

  return (
    <li className="min-w-0 grid content-start gap-2.5">
      <div className={`group relative aspect-[3/4] rounded-2xl overflow-hidden bg-bege transition-shadow ${minhas.length ? 'ring-2 ring-marrom-950 ring-offset-2 ring-offset-creme' : ''}`}>
        <div onScroll={e => { const el = e.currentTarget; setFoto(Math.round(el.scrollLeft / el.clientWidth)); }} className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory sem-barra">
          {imagens.map((src, i) => (
            <button key={i} type="button" onClick={abrir} tabIndex={i === 0 ? 0 : -1} aria-label={i === 0 ? `Ver detalhes de ${p.nome}` : undefined} aria-hidden={i === 0 ? undefined : true}
              className="relative shrink-0 w-full h-full snap-start cursor-zoom-in">
              <Foto src={src} alt={i === 0 ? p.nome : ''} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" prioridade={prioridade && i === 0} className={`transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none ${esgotada ? 'grayscale opacity-70' : ''}`} />
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute top-2 left-2 right-2 flex flex-wrap gap-1.5">
          {p.desconto > 0 && <span className="h-6 px-2 rounded-full bg-imperdivel text-white text-[0.7rem] font-bold grid place-items-center">−{p.desconto}%</span>}
          {p.ultimas && !esgotada && <span className="h-6 px-2 rounded-full bg-card/95 text-caramelo text-[0.68rem] font-semibold grid place-items-center">Últimas</span>}
          {p.video && <span className="h-6 px-2 rounded-full bg-marrom-950/75 text-creme text-[0.68rem] font-semibold grid place-items-center">▶ Vídeo</span>}
        </div>
        {minhas.length > 0 && (
          <span className="pointer-events-none absolute top-2 right-2 h-7 pl-1.5 pr-2.5 rounded-full bg-marrom-950 text-creme text-xs font-semibold flex items-center gap-1" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {minhas.map(v => v.tamanho).join(' · ')}
          </span>
        )}
        {esgotada && <span className="pointer-events-none absolute inset-x-0 bottom-0 py-2 bg-marrom-950/80 text-creme text-center text-xs font-semibold tracking-wide uppercase">Esgotada</span>}
        {imagens.length > 1 && !esgotada && (
          <div className="pointer-events-none absolute bottom-2 inset-x-0 flex justify-center gap-1" aria-hidden="true">
            {imagens.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === foto ? 'w-4 bg-card' : 'w-1.5 bg-card/60'}`} />)}
          </div>
        )}
      </div>

      <button type="button" onClick={abrir} className="grid gap-1 px-0.5 text-left">
        <span className="text-[0.92rem] leading-snug text-marrom-950 line-clamp-2">{p.nome}</span>
        {p.cor && <span className="text-xs text-suave truncate">{p.cor}</span>}
        <Preco p={p} />
      </button>

      {aberta && !esgotada && <Tamanhos p={p} escolhas={escolhas} alternar={alternar} destaque={destaque} />}
      {minhas.some(v => v.ultimas) && <p className="text-xs text-caramelo">Últimas unidades no {minhas.filter(v => v.ultimas).map(v => v.tamanho).join(' e ')}.</p>}
    </li>
  );
}

/** Detalhes da peça (D-36): fotos e vídeo grandes, descrição, tecido, destaques e os tamanhos, sem sair da vitrine. */
function DetalhesPeca({ p, escolhas, aberta, alternar, fechar, escolhidas, pedir }: {
  p: Peca; escolhas: number[]; aberta: boolean; alternar: (id: number) => void; fechar: () => void; escolhidas: number; pedir: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  useGaveta(fechar, painel);
  const [foto, setFoto] = useState(0);
  const midias: ({ tipo: 'foto'; src: string | null } | { tipo: 'video'; src: string; capa: string | null })[] = [
    ...(p.imagens.length ? p.imagens.slice(0, 1) : [p.imagem]).map(src => ({ tipo: 'foto' as const, src })),
    ...(p.video ? [{ tipo: 'video' as const, src: p.video.url, capa: p.video.capa }] : []),
    ...p.imagens.slice(1).map(src => ({ tipo: 'foto' as const, src })),
  ];
  const minhas = p.variantes.filter(v => escolhas.includes(v.id));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={p.nome}>
      <button type="button" tabIndex={-1} aria-label="Fechar" className="absolute inset-0 bg-marrom-950/55 backdrop-blur-sm" onClick={fechar} />
      <div ref={painel} tabIndex={-1} className="absolute inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[min(56rem,calc(100vw-2rem))] max-h-[94dvh] overflow-y-auto bg-creme rounded-t-3xl sm:rounded-3xl shadow-2xl outline-none sm:grid sm:grid-cols-2 animate-[aparecer_.2s_ease-out] motion-reduce:animate-none">
        <div className="relative bg-bege aspect-[4/5] sm:aspect-auto sm:min-h-[34rem]">
          <div onScroll={e => { const el = e.currentTarget; setFoto(Math.round(el.scrollLeft / el.clientWidth)); }} className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory sem-barra">
            {midias.map((m, i) => (
              <div key={i} className="relative shrink-0 w-full h-full snap-start">
                {m.tipo === 'foto'
                  ? <Foto src={m.src} alt={i === 0 ? p.nome : ''} sizes="(min-width: 640px) 28rem, 100vw" prioridade={i === 0} />
                  : <video src={m.src} poster={m.capa ?? undefined} muted loop playsInline autoPlay controls className="absolute inset-0 size-full object-cover" aria-label={`Vídeo de ${p.nome}`} />}
              </div>
            ))}
          </div>
          {midias.length > 1 && (
            <div className="pointer-events-none absolute bottom-3 inset-x-0 flex justify-center gap-1.5" aria-hidden="true">
              {midias.map((m, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === foto ? 'w-5 bg-card' : 'w-1.5 bg-card/60'} ${m.tipo === 'video' ? 'ring-1 ring-card' : ''}`} />)}
            </div>
          )}
          <button type="button" onClick={fechar} aria-label="Fechar os detalhes" className="absolute top-3 right-3 size-10 grid place-items-center rounded-full bg-card/95 text-marrom-950 shadow">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="p-5 sm:p-7 grid content-start gap-4">
          <div className="grid gap-1">
            {p.marca && <span className="rotulo !text-[0.62rem] text-suave">{p.marca}</span>}
            <h2 className="text-xl text-marrom-950 leading-snug font-semibold">{p.nome}</h2>
            {p.cor && <span className="text-sm text-suave">Cor: {p.cor}</span>}
          </div>
          <Preco p={p} grande />
          {aberta && p.variantes.length > 0 && (
            <div className="grid gap-2">
              <span className="text-sm font-semibold text-marrom-950">Escolha o tamanho {minhas.length ? <span className="font-normal text-suave">· {minhas.map(v => v.tamanho).join(', ')}</span> : null}</span>
              <Tamanhos p={p} escolhas={escolhas} alternar={alternar} grande />
              {minhas.some(v => v.ultimas) && <p className="text-xs text-caramelo">Últimas unidades neste tamanho.</p>}
            </div>
          )}
          {!p.variantes.length && <p className="text-sm text-suave">Esgotada nesta vitrine.</p>}
          {p.descricao && <p className="text-sm text-marrom-900 leading-relaxed whitespace-pre-line">{p.descricao}</p>}
          {(p.composicao || p.destaques.length > 0) && (
            <dl className="grid gap-2 text-sm border-t border-borda pt-3">
              {p.composicao && <div><dt className="rotulo !text-[0.62rem] text-suave">Tecido</dt><dd>{p.composicao}</dd></div>}
              {p.destaques.length > 0 && <div><dt className="rotulo !text-[0.62rem] text-suave">Destaques</dt><dd><ul className="list-disc pl-4">{p.destaques.map(d => <li key={d}>{d}</li>)}</ul></dd></div>}
            </dl>
          )}
          <div className="sticky bottom-0 -mx-5 sm:-mx-7 px-5 sm:px-7 py-3 bg-creme/95 backdrop-blur grid gap-2 border-t border-borda">
            {aberta && escolhidas > 0
              ? <button type="button" onClick={pedir} className={botao('whatsapp', 'g', 'w-full')}>Ver meu pedido ({escolhidas})</button>
              : <button type="button" onClick={fechar} className={botao('primario', 'g', 'w-full')}>Voltar às peças</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GavetaPedido({ slug, escolhidas, total, economia, fechar, tirar, concluir }: {
  slug: string; escolhidas: Escolha[]; total: number; economia: number; fechar: () => void; tirar: (varianteId: number) => void;
  concluir: (r: Extract<ResultadoInteresseVitrine, { ok: true }>) => void;
}) {
  // A gaveta só existe depois de um toque (nunca no servidor): dá para ler o contato salvo direto no estado inicial.
  const [nome, setNome] = useState(() => lerContato().nome);
  const [telefone, setTelefone] = useState(() => lerContato().telefone);
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState('');
  const [ofertas, setOfertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const painel = useRef<HTMLDivElement>(null);
  useGaveta(fechar, painel);

  useEffect(() => { if (!escolhidas.length) fechar(); }, [escolhidas.length, fechar]);

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setErro(null);
    if (!escolhidas.length) return setErro('Escolha pelo menos uma peça e o tamanho.');
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (!celularValido(telefone)) return setErro('Informe o WhatsApp com DDD e 9 dígitos.');
    if (!aceite) return setErro('Para continuar, aceite o contato da loja.');
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    iniciar(async () => {
      const r = await registrarInteresseVitrine(slug, { variantes: escolhidas.map(x => x.v.id), nome, telefone, aceite, site, ofertas });
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      gravarContato(nome.trim(), telefone);
      if (aba) aba.location.href = r.url;
      concluir(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="titulo-pedido-vitrine">
      <button type="button" tabIndex={-1} aria-label="Fechar" className="absolute inset-0 bg-marrom-950/50 backdrop-blur-sm" onClick={fechar} />
      <div ref={painel} tabIndex={-1} className="absolute inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[min(36rem,calc(100vw-2rem))] max-h-[92dvh] overflow-y-auto bg-creme rounded-t-3xl sm:rounded-3xl shadow-2xl outline-none animate-[aparecer_.2s_ease-out] motion-reduce:animate-none">
        <div className="sticky top-0 z-10 bg-creme/95 backdrop-blur px-5 pt-3 pb-3 border-b border-borda">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-borda-forte sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <h2 id="titulo-pedido-vitrine" className="titulo text-xl">Seu pedido</h2>
            <button type="button" onClick={fechar} className="size-10 grid place-items-center rounded-full hover:bg-bege" aria-label="Fechar o pedido">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <form onSubmit={enviar} className="relative p-5 grid gap-4" noValidate>
          <ul className="grid gap-2.5">
            {escolhidas.map(({ p, v }) => (
              <li key={v.id} className="flex items-center gap-3 bg-card border border-borda rounded-2xl p-2 pr-3">
                <span className="relative w-12 aspect-[3/4] shrink-0 rounded-lg overflow-hidden bg-bege"><Foto src={p.imagem} alt="" sizes="48px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-marrom-950 truncate">{p.nome}</span>
                  <span className="block text-xs text-suave">Tam. <strong className="text-marrom-950">{v.tamanho}</strong> · {brl(p.preco)}{p.desconto > 0 && <s className="ml-1">{brl(p.precoCheio)}</s>}</span>
                </span>
                <button type="button" onClick={() => tirar(v.id)} className="text-xs text-suave underline underline-offset-2 hover:text-vermelho" aria-label={`Tirar ${p.nome} tamanho ${v.tamanho}`}>Tirar</button>
              </li>
            ))}
          </ul>
          <div className="grid gap-1 border-t border-borda pt-3">
            {economia > 0 && <div className="flex justify-between text-sm text-oliva"><span>Você economiza</span><span>{brl(economia)}</span></div>}
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-suave">{escolhidas.length} {escolhidas.length === 1 ? 'peça' : 'peças'}</span>
              <strong className="font-display text-xl">{brl(total)}</strong>
            </div>
          </div>
          <CamposContato nome={nome} setNome={setNome} telefone={telefone} setTelefone={setTelefone} aceite={aceite} setAceite={setAceite} site={site} setSite={setSite} ofertas={ofertas} setOfertas={setOfertas} />
          {erro && <p role="alert" className="text-sm text-vermelho">{erro}</p>}
          <button type="submit" disabled={pendente} className={botao('whatsapp', 'g', 'w-full')}>{pendente ? 'Enviando…' : 'Enviar pedido pelo WhatsApp'}</button>
          <p className="text-xs text-suave text-center">Sem cadastro. As peças só ficam reservadas depois da confirmação da loja; frete e pagamento são combinados na conversa.</p>
        </form>
      </div>
    </div>
  );
}

/** Tela final: o que foi pedido, o próximo passo e o botão do WhatsApp (o navegador do Instagram pode bloquear a aba). */
function PedidoEnviado({ destinatario, url, itens, voltar }: { destinatario: string; url: string; itens: Escolha[]; voltar: () => void }) {
  const total = itens.reduce((a, x) => a + x.p.preco, 0);
  return (
    <section className="max-w-xl w-full justify-self-center bg-card border border-borda rounded-[2rem] p-6 sm:p-8 grid gap-5">
      <div className="text-center grid gap-3 justify-items-center">
        <span className="size-16 rounded-full bg-oliva text-creme grid place-items-center shadow-lg shadow-oliva/20" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <h2 className="titulo text-2xl">Pedido recebido!</h2>
        <p className="text-suave max-w-sm">Agora é só enviar a mensagem no WhatsApp para falar com {destinatario}. As peças ficam reservadas depois da confirmação da loja.</p>
      </div>
      <a href={url} target="_blank" rel="noopener" className={botao('whatsapp', 'g', 'w-full')}>Abrir o WhatsApp</a>
      <ul className="grid gap-2 border-t border-borda pt-4">
        {itens.map(({ p, v }) => (
          <li key={v.id} className="flex items-center gap-3 text-sm">
            <span className="relative w-10 aspect-[3/4] shrink-0 rounded-lg overflow-hidden bg-bege"><Foto src={p.imagem} alt="" sizes="40px" /></span>
            <span className="min-w-0 flex-1 truncate">{p.nome} · <strong>{v.tamanho}</strong></span>
            <span className="font-semibold">{brl(p.preco)}</span>
          </li>
        ))}
        <li className="flex justify-between font-display font-extrabold text-lg pt-1"><span>Total</span><span>{brl(total)}</span></li>
      </ul>
      <ol className="grid gap-2 text-sm">
        {[`Envie a mensagem para ${destinatario} no WhatsApp`, 'A loja confere e separa as peças', 'Vocês combinam o frete e o pagamento'].map((t, i) => (
          <li key={t} className="flex gap-3 items-center"><span className="size-7 shrink-0 rounded-full bg-bege text-caramelo font-display font-extrabold grid place-items-center text-xs">{i + 1}</span>{t}</li>
        ))}
      </ol>
      <button type="button" onClick={voltar} className="text-sm underline underline-offset-4 justify-self-center text-marrom-950">Continuar vendo as peças</button>
    </section>
  );
}
