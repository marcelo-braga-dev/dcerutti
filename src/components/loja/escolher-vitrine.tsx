'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { registrarInteresseVitrine, type ResultadoInteresseVitrine } from '@/server/acoes/vitrines';
import type { VitrinePublica } from '@/server/consultas/vitrines';
import { CamposContato, PedidoRecebido } from './quero-peca';

type Peca = VitrinePublica['pecas'][number];

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
const ORDEM = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'G1', 'G2', 'G3', 'UN', 'UNI'];
const pesoTamanho = (t: string) => {
  const i = ORDEM.indexOf(t.toUpperCase());
  if (i >= 0) return i;
  const n = Number(t);
  return Number.isFinite(n) ? 100 + n : 1000;
};

/**
 * Vitrine pública (docs/26, D-36): filtro pelo tamanho, grade de peças com o tamanho a um toque, barra fixa com o que
 * foi escolhido e a gaveta do pedido (peças, nome e WhatsApp). Só registra o pedido de atendimento: a peça fica
 * reservada depois que a loja confirma, e a página diz isso.
 */
export function EscolherVitrine({ slug, pecas, aberta }: { slug: string; pecas: VitrinePublica['pecas']; aberta: boolean }) {
  // Peça → variante escolhida (uma por peça: outro tamanho da mesma peça substitui).
  const [escolhas, setEscolhas] = useState<Record<number, number>>({});
  const [filtro, setFiltro] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState(false);
  const [feito, setFeito] = useState<Extract<ResultadoInteresseVitrine, { ok: true }> | null>(null);
  // Estável: a gaveta registra o Esc e lê o contato salvo uma vez só, ao abrir.
  const fecharGaveta = useCallback(() => setGaveta(false), []);

  const tamanhos = useMemo(() => {
    const todos = new Set(pecas.flatMap(p => p.variantes.map(v => v.tamanho)));
    return [...todos].sort((a, b) => pesoTamanho(a) - pesoTamanho(b) || a.localeCompare(b));
  }, [pecas]);
  const visiveis = filtro ? pecas.filter(p => p.variantes.some(v => v.tamanho === filtro)) : pecas;
  const escolhidas = pecas.filter(p => escolhas[p.produtoId]).map(p => ({ p, v: p.variantes.find(v => v.id === escolhas[p.produtoId])! })).filter(x => x.v);
  const total = escolhidas.reduce((a, x) => a + x.p.preco, 0);
  const economia = escolhidas.reduce((a, x) => a + Math.max(0, x.p.precoCheio - x.p.preco), 0);

  const alternar = (produtoId: number, varianteId: number) => setEscolhas(e => {
    const n = { ...e };
    if (n[produtoId] === varianteId) delete n[produtoId];
    else n[produtoId] = varianteId;
    return n;
  });

  if (feito) return <div className="max-w-xl w-full justify-self-center"><PedidoRecebido destinatario={feito.destinatario} url={feito.url} /></div>;

  return (
    <div className={`grid gap-5 ${aberta ? 'pb-28' : ''}`}>
      {aberta && tamanhos.length > 1 && (
        <div className="grid gap-2">
          <span id="filtro-tamanho" className="rotulo !text-[0.65rem] text-suave">Seu tamanho</span>
          <div role="group" aria-labelledby="filtro-tamanho" className="flex gap-2 overflow-x-auto sem-barra -mx-4 px-4 sm:mx-0 sm:px-0">
            <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)}
              className={`shrink-0 h-10 px-4 rounded-full border text-sm font-semibold transition-colors ${!filtro ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
              Todos
            </button>
            {tamanhos.map(t => (
              <button key={t} type="button" aria-pressed={filtro === t} onClick={() => setFiltro(f => (f === t ? null : t))}
                className={`shrink-0 h-10 min-w-12 px-3 rounded-full border text-sm font-semibold transition-colors ${filtro === t ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-suave" aria-live="polite">
        {visiveis.length} {visiveis.length === 1 ? 'peça' : 'peças'}{filtro ? ` no tamanho ${filtro}` : ''}
        {aberta && ' · toque no tamanho para escolher'}
      </p>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8">
        {visiveis.map((p, i) => (
          <CartaoPeca key={p.produtoId} p={p} escolhida={escolhas[p.produtoId]} aberta={aberta} destaque={filtro} prioridade={i < 2} alternar={alternar} />
        ))}
      </ul>

      {aberta && (
        <>
          {/* Barra fixa: o que foi escolhido e o caminho para pedir, sempre à mão (no navegador do Instagram também). */}
          <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-creme via-creme/95 to-creme/0 pointer-events-none">
            <div className="mx-auto max-w-xl pointer-events-auto flex items-center gap-3 rounded-full bg-marrom-950 text-creme pl-5 pr-1.5 py-1.5 shadow-xl shadow-marrom-950/20">
              <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
                {escolhidas.length ? (
                  <>
                    <div className="text-sm font-semibold truncate">{escolhidas.length} {escolhidas.length === 1 ? 'peça' : 'peças'} · {brl(total)}</div>
                    {economia > 0 && <div className="text-[0.72rem] text-areia">Você economiza {brl(economia)}</div>}
                  </>
                ) : <div className="text-sm text-areia">Escolha o tamanho das peças</div>}
              </div>
              <button type="button" onClick={() => setGaveta(true)} disabled={!escolhidas.length}
                className="shrink-0 h-11 px-5 rounded-full bg-whatsapp text-white text-sm font-semibold disabled:bg-creme/15 disabled:text-areia transition-colors">
                Quero estas peças
              </button>
            </div>
          </div>
          {gaveta && (
            <GavetaPedido slug={slug} escolhidas={escolhidas} total={total} fechar={fecharGaveta}
              tirar={id => setEscolhas(e => { const n = { ...e }; delete n[id]; return n; })} concluir={setFeito} />
          )}
        </>
      )}
    </div>
  );
}

function CartaoPeca({ p, escolhida, aberta, destaque, prioridade, alternar }: {
  p: Peca; escolhida?: number; aberta: boolean; destaque: string | null; prioridade: boolean; alternar: (produtoId: number, varianteId: number) => void;
}) {
  const [foto, setFoto] = useState(0);
  const trilho = useRef<HTMLDivElement>(null);
  const esgotada = !p.variantes.length;
  const escolhidaV = p.variantes.find(v => v.id === escolhida);
  const imagens = p.imagens.length ? p.imagens : [p.imagem];

  return (
    <li className="min-w-0 grid content-start gap-2.5">
      <div className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-bege transition-shadow ${escolhidaV ? 'ring-2 ring-marrom-950 ring-offset-2 ring-offset-creme' : ''}`}>
        <div ref={trilho} onScroll={e => { const el = e.currentTarget; setFoto(Math.round(el.scrollLeft / el.clientWidth)); }}
          className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory sem-barra">
          {imagens.map((src, i) => (
            <div key={i} className="relative shrink-0 w-full h-full snap-start">
              <Foto src={src} alt={i === 0 ? p.nome : ''} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" prioridade={prioridade && i === 0} className={esgotada ? 'grayscale opacity-70' : ''} />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute top-2 left-2 right-2 flex flex-wrap gap-1.5">
          {p.desconto > 0 && <span className="h-6 px-2 rounded-full bg-imperdivel text-white text-[0.7rem] font-bold grid place-items-center">−{p.desconto}%</span>}
          {p.ultimas && !esgotada && <span className="h-6 px-2 rounded-full bg-card/95 text-caramelo text-[0.68rem] font-semibold grid place-items-center">Últimas</span>}
        </div>
        {escolhidaV && (
          <span className="pointer-events-none absolute top-2 right-2 h-7 pl-1.5 pr-2.5 rounded-full bg-marrom-950 text-creme text-xs font-semibold flex items-center gap-1" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {escolhidaV.tamanho}
          </span>
        )}
        {esgotada && <span className="pointer-events-none absolute inset-x-0 bottom-0 py-2 bg-marrom-950/80 text-creme text-center text-xs font-semibold tracking-wide uppercase">Esgotada</span>}
        {imagens.length > 1 && (
          <div className="pointer-events-none absolute bottom-2 inset-x-0 flex justify-center gap-1" aria-hidden="true">
            {imagens.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === foto ? 'w-4 bg-card' : 'w-1.5 bg-card/60'}`} />)}
          </div>
        )}
      </div>

      <div className="grid gap-1 px-0.5">
        <h3 className="text-[0.92rem] leading-snug text-marrom-950 line-clamp-2">{p.nome}</h3>
        {p.cor && <span className="text-xs text-suave truncate">{p.cor}</span>}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <strong className={`font-display text-[1.05rem] ${p.desconto > 0 ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</strong>
          {p.desconto > 0 && <span className="text-xs text-suave line-through">{brl(p.precoCheio)}</span>}
        </div>
      </div>

      {aberta && !esgotada && (
        <div role="group" aria-label={`Tamanhos de ${p.nome}`} className="flex flex-wrap gap-1.5">
          {p.tamanhos.map(t => {
            const v = p.variantes.find(x => x.tamanho === t.tamanho);
            if (!v) return <span key={t.tamanho} aria-hidden="true" className="min-w-9 h-9 px-1.5 rounded-lg border border-borda text-xs text-borda-forte line-through grid place-items-center">{t.tamanho}</span>;
            const ativo = v.id === escolhida;
            return (
              <button key={v.id} type="button" aria-pressed={ativo} aria-label={`${p.nome}, tamanho ${v.tamanho}`} onClick={() => alternar(p.produtoId, v.id)}
                className={`min-w-9 h-9 px-1.5 rounded-lg border text-xs font-semibold transition-colors ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : destaque === v.tamanho ? 'border-marrom-950 text-marrom-950 bg-card' : 'border-borda-forte text-marrom-950 bg-card hover:border-marrom-950'}`}>
                {v.tamanho}
              </button>
            );
          })}
        </div>
      )}
      {escolhidaV?.ultimas && <p className="text-xs text-caramelo">Últimas unidades no {escolhidaV.tamanho}.</p>}
    </li>
  );
}

function GavetaPedido({ slug, escolhidas, total, fechar, tirar, concluir }: {
  slug: string; escolhidas: { p: Peca; v: Peca['variantes'][number] }[]; total: number; fechar: () => void; tirar: (produtoId: number) => void;
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

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    painel.current?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [fechar]);

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
      document.body.style.overflow = '';
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
              <li key={p.produtoId} className="flex items-center gap-3 bg-card border border-borda rounded-2xl p-2 pr-3">
                <span className="relative w-12 aspect-[3/4] shrink-0 rounded-lg overflow-hidden bg-bege"><Foto src={p.imagem} alt="" sizes="48px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-marrom-950 truncate">{p.nome}</span>
                  <span className="block text-xs text-suave">Tam. <strong className="text-marrom-950">{v.tamanho}</strong> · {brl(p.preco)}</span>
                </span>
                <button type="button" onClick={() => tirar(p.produtoId)} className="text-xs text-suave underline underline-offset-2 hover:text-vermelho" aria-label={`Tirar ${p.nome}`}>Tirar</button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between items-baseline border-t border-borda pt-3">
            <span className="text-sm text-suave">{escolhidas.length} {escolhidas.length === 1 ? 'peça' : 'peças'}</span>
            <strong className="font-display text-xl">{brl(total)}</strong>
          </div>
          <CamposContato nome={nome} setNome={setNome} telefone={telefone} setTelefone={setTelefone} aceite={aceite} setAceite={setAceite} site={site} setSite={setSite} ofertas={ofertas} setOfertas={setOfertas} />
          {erro && <p role="alert" className="text-sm text-vermelho">{erro}</p>}
          <button type="submit" disabled={pendente} className={botao('whatsapp', 'g', 'w-full')}>{pendente ? 'Enviando…' : 'Enviar pedido pelo WhatsApp'}</button>
          <p className="text-xs text-suave text-center">As peças só ficam reservadas depois da confirmação da loja. Frete e pagamento são combinados na conversa.</p>
        </form>
      </div>
    </div>
  );
}
