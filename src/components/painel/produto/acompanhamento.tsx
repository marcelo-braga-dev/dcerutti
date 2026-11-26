'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Foto } from '@/components/loja/foto';
import { BotaoEnviar, useEstadoForm } from '@/components/ui/formulario';
import { IconeAlerta, IconeCheck, IconeInfo, IconeOlho, IconeTeclado } from '@/components/ui/icones';
import { brl, descontoPct, lerValor } from '@/lib/dinheiro';

/**
 * Coluna de acompanhamento do cadastro de produto: prévia do card como a cliente vê, as etapas com o que falta em cada
 * uma (e onde há erro), a nota de qualidade do cadastro e os avisos. Lê o próprio formulário (eventos input/change),
 * sem controlar os campos.
 */

export type Etapa = { id: string; titulo: string };
export type AvisoExterno = { tipo: 'alerta' | 'info'; texto: ReactNode };

type Dados = {
  referencia: string; nome: string; marca: string; temMarca: boolean; temCategoria: boolean; genero: string; preco: number; precoCheio: number;
  fotos: string[]; videos: number; descricao: string; cor: string; composicao: string; destaques: number; ativo: boolean; imperdivel: boolean;
};

function ler(form: HTMLFormElement): Dados {
  const fd = new FormData(form);
  const t = (k: string) => String(fd.get(k) ?? '').trim();
  const marcaSel = form.querySelector<HTMLSelectElement>('select[name=marcaId]');
  const preco = lerValor(t('preco'));
  let videos = 0;
  try { videos = (JSON.parse(t('videos') || '[]') as unknown[]).length; } catch { /* ignora */ }
  return {
    referencia: t('referencia'), nome: t('nome'), marca: marcaSel?.value ? marcaSel.selectedOptions[0]?.text ?? '' : '', temMarca: !!t('marcaId'),
    temCategoria: Number(t('categoriaId')) > 0 || (t('categoriaId') === 'nova' && !!t('novaCategoria')),
    genero: t('genero'), preco, precoCheio: t('precoCheio') ? lerValor(t('precoCheio')) : preco,
    fotos: t('imagens').split('\n').filter(Boolean), videos, descricao: t('descricao'), cor: t('cor'), composicao: t('composicao'),
    destaques: t('destaques').split('\n').filter(Boolean).length, ativo: fd.get('ativo') === 'on', imperdivel: fd.get('imperdivel') === 'on',
  };
}

const retrato = (form: HTMLFormElement) => JSON.stringify([...new FormData(form).entries()].filter(([k, v]) => !k.startsWith('$') && typeof v === 'string'));

function useFormulario(ancora: React.RefObject<HTMLElement | null>) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [sujo, setSujo] = useState(false);
  const inicial = useRef('');
  const estado = useEstadoForm();

  useEffect(() => {
    const f = ancora.current?.closest('form');
    if (!f) return;
    inicial.current = retrato(f);
    const atualizar = () => { setDados(ler(f)); setSujo(retrato(f) !== inicial.current); };
    const marcarErros = () => setErros([...f.querySelectorAll<HTMLElement>('[data-etapa]')].filter(s => s.querySelector('[id$="-erro"]')).map(s => s.dataset.etapa!));
    atualizar();
    marcarErros();
    f.addEventListener('input', atualizar);
    f.addEventListener('change', atualizar);
    const obs = new MutationObserver(() => { marcarErros(); atualizar(); });
    obs.observe(f, { subtree: true, childList: true });
    return () => { f.removeEventListener('input', atualizar); f.removeEventListener('change', atualizar); obs.disconnect(); };
  }, [ancora]);

  // Salvou: o que está na tela passa a ser o "salvo" (o evento faz o "sujo" ser recalculado).
  useEffect(() => {
    const f = ancora.current?.closest('form');
    if (estado.ok && f) { inicial.current = retrato(f); f.dispatchEvent(new Event('input')); }
  }, [estado, ancora]);

  return { dados, erros, sujo };
}

/* ------------------------------------------------------------------------------------------------------------ */

export function Acompanhamento({ etapas, novo, avisos = [] }: { etapas: Etapa[]; novo: boolean; avisos?: AvisoExterno[] }) {
  const ancora = useRef<HTMLDivElement>(null);
  const { dados: d, erros } = useFormulario(ancora);
  const [visivel, setVisivel] = useState(etapas[0]?.id);

  // Etapa à vista na tela (destaca na lista).
  useEffect(() => {
    const obs = new IntersectionObserver(es => {
      const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (v) setVisivel(v.target.id);
    }, { rootMargin: '-20% 0px -60% 0px' });
    etapas.forEach(e => { const el = document.getElementById(e.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [etapas]);

  const completa: Record<string, boolean> = d ? {
    identificacao: d.referencia.length >= 2 && d.nome.length >= 3 && d.temMarca && d.temCategoria,
    midia: d.fotos.length > 0,
    preco: d.preco > 0 && d.precoCheio >= d.preco,
    detalhes: !!d.genero,
  } : {};
  const falta: Record<string, string> = d ? {
    identificacao: [!d.referencia && 'referência', d.nome.length < 3 && 'nome', !d.temMarca && 'marca', !d.temCategoria && 'categoria'].filter(Boolean).join(', '),
    midia: d.fotos.length ? `${d.fotos.length} foto${d.fotos.length > 1 ? 's' : ''}${d.videos ? ` · ${d.videos} vídeo${d.videos > 1 ? 's' : ''}` : ''}` : 'pelo menos 1 foto',
    preco: d.preco > 0 ? brl(d.preco) : 'preço de venda',
    detalhes: d.genero ? 'gênero escolhido' : 'gênero',
  } : {};

  const criterios = d ? [
    d.referencia.length >= 2, d.nome.length >= 3, d.temMarca, d.temCategoria, !!d.genero, d.preco > 0, d.fotos.length > 0, d.fotos.length >= 3,
    d.descricao.length >= 40, !!d.cor, !!d.composicao, d.destaques > 0, d.videos > 0,
  ] : [];
  const nota = criterios.length ? Math.round((criterios.filter(Boolean).length / criterios.length) * 100) : 0;
  const corNota = nota >= 85 ? 'var(--color-oliva)' : nota >= 55 ? 'var(--color-caramelo)' : 'var(--color-vermelho)';

  const lista: AvisoExterno[] = d ? [
    ...(!d.ativo ? [{ tipo: 'alerta' as const, texto: <><strong>Oculto:</strong> a cliente não encontra este produto na loja.</> }] : []),
    ...(d.fotos.length === 0 ? [{ tipo: 'alerta' as const, texto: <><strong>Sem fotos:</strong> aparece “Sem foto” na vitrine.</> }] : d.fotos.length < 3 ? [{ tipo: 'info' as const, texto: <>Ideal: 3+ fotos (frente, costas, detalhe).</> }] : []),
    ...(d.descricao.length > 0 && d.descricao.length < 40 ? [{ tipo: 'info' as const, texto: <>Descrição curta: fale de caimento e tecido.</> }] : []),
    ...avisos,
    ...(novo ? [{ tipo: 'info' as const, texto: <>Tamanhos e estoque entram depois de cadastrar.</> }] : []),
  ] : [];

  const desconto = d ? descontoPct(d.preco || 0, d.precoCheio || 0) : 0;

  return (
    <div ref={ancora} className="grid gap-4">
      {/* Prévia do card da vitrine (miniatura) + etapas, num cartão só. */}
      <div className="hidden xl:block cartao bg-card border border-borda rounded-[1.25rem] p-4">
        <div className="flex gap-3">
          <div className={`group relative w-24 shrink-0 aspect-[3/4] rounded-xl overflow-hidden bg-[#efebe5] ${d && !d.ativo ? 'opacity-60 grayscale-[40%]' : ''}`}>
            <Foto src={d?.fotos[0]} alt="" sizes="96px" className={`transition duration-500 ${d?.fotos[1] ? 'group-hover:opacity-0' : ''}`} />
            {d?.fotos[1] && <Foto src={d.fotos[1]} alt="" sizes="96px" className="opacity-0 transition duration-500 group-hover:opacity-100" />}
            <span className="absolute left-1 top-1 flex flex-col items-start gap-0.5">
              {d?.imperdivel && <span className="px-1.5 py-0.5 rounded-full bg-imperdivel text-white text-[0.55rem] font-bold">Imperdível</span>}
              {desconto > 0 && <span className="px-1.5 py-0.5 rounded-full bg-marrom-950 text-creme text-[0.55rem] font-bold">−{desconto}%</span>}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-suave"><IconeOlho className="size-3.5" />Prévia</span>
              {d && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold ${d.ativo ? 'bg-oliva/10 text-oliva' : 'bg-borda text-suave'}`}><span className={`size-1.5 rounded-full ${d.ativo ? 'bg-oliva' : 'bg-suave'}`} />{d.ativo ? 'Visível' : 'Oculto'}</span>}
            </div>
            <div className="mt-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-suave truncate">{d?.marca || 'Marca'}</div>
            <div className={`text-sm leading-snug line-clamp-2 ${d?.nome ? 'text-marrom-950' : 'text-suave/60'}`}>{d?.nome || 'Nome do produto'}</div>
            <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
              <span className={`text-sm font-extrabold ${d?.imperdivel || desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{d && d.preco > 0 ? brl(d.preco) : 'R$ —'}</span>
              {desconto > 0 && <s className="text-xs text-suave">{brl(d!.precoCheio)}</s>}
            </div>
          </div>
        </div>

        <nav aria-label="Etapas do cadastro" className="mt-4 pt-3 border-t border-borda">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-suave">Etapas</span>
            <span className="flex items-center gap-2" title="Qualidade do cadastro">
              <span className="w-16 h-1.5 rounded-full bg-borda overflow-hidden"><span className="block h-full rounded-full transition-all duration-500" style={{ width: `${nota}%`, background: corNota }} /></span>
              <span className="text-xs font-bold tabular-nums" style={{ color: corNota }}>{nota}%</span>
            </span>
          </div>
          <ol className="grid">
            {etapas.map((e, i) => {
              const erro = erros.includes(e.id);
              const ok = completa[e.id] && !erro;
              return (
                <li key={e.id}>
                  <a href={`#${e.id}`} onClick={ev => { ev.preventDefault(); document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${visivel === e.id ? 'bg-creme' : 'hover:bg-creme/60'}`} aria-current={visivel === e.id ? 'step' : undefined}>
                    <span className={`grid place-items-center size-5 shrink-0 rounded-full text-[0.62rem] font-bold ${erro ? 'bg-vermelho text-white' : ok ? 'bg-oliva text-creme' : 'border-[1.5px] border-borda-forte text-suave'}`}>
                      {erro ? <IconeAlerta className="size-3" /> : ok ? <IconeCheck className="size-3" /> : i + 1}
                    </span>
                    <span className="text-sm font-medium text-marrom-950">{e.titulo}</span>
                    <span className={`ml-auto text-[0.7rem] truncate max-w-[50%] ${erro ? 'text-vermelho' : 'text-suave'}`}>{erro ? 'corrigir' : ok ? falta[e.id] : falta[e.id] ?? ''}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {lista.length > 0 && (
        <ul className="grid gap-1.5" aria-label="Avisos">
          {lista.slice(0, 3).map((a, i) => (
            <li key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug ${a.tipo === 'alerta' ? 'bg-bege/70 border border-caramelo/30 text-marrom-900' : 'bg-card border border-borda text-suave'}`}>
              {a.tipo === 'alerta' ? <IconeAlerta className="size-3.5 mt-px shrink-0 text-caramelo" /> : <IconeInfo className="size-3.5 mt-px shrink-0 text-suave" />}
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/**
 * Barra fixa no rodapé com o botão de salvar: mostra se há alterações não salvas, salva com Ctrl+S e pergunta antes de
 * sair da página com alterações.
 */
export function BarraSalvar({ rotulo, novo }: { rotulo: string; novo: boolean }) {
  const ancora = useRef<HTMLDivElement>(null);
  const { sujo } = useFormulario(ancora);
  const enviando = useRef(false);

  useEffect(() => {
    const f = ancora.current?.closest('form');
    if (!f) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); f.requestSubmit(); }
    };
    const aoEnviar = () => { enviando.current = true; setTimeout(() => { enviando.current = false; }, 4000); };
    window.addEventListener('keydown', tecla);
    f.addEventListener('submit', aoEnviar);
    return () => { window.removeEventListener('keydown', tecla); f.removeEventListener('submit', aoEnviar); };
  }, []);

  useEffect(() => {
    if (!sujo) return;
    const sair = (e: BeforeUnloadEvent) => { if (!enviando.current) e.preventDefault(); };
    window.addEventListener('beforeunload', sair);
    return () => window.removeEventListener('beforeunload', sair);
  }, [sujo]);

  return (
    <div ref={ancora} className="sticky bottom-3 z-20 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-marrom-950/95 text-creme pl-4 pr-1.5 py-1.5 shadow-[0_18px_40px_-12px_rgb(46_37_32/.55)] backdrop-blur">
        <span className="flex items-center gap-2.5 text-sm" aria-live="polite">
          {sujo
            ? <><span className="relative flex size-2.5"><span className="absolute inset-0 rounded-full bg-areia animate-ping opacity-60" /><span className="relative size-2.5 rounded-full bg-areia" /></span>{novo ? 'Cadastro em andamento' : 'Alterações não salvas'}</>
            : <><IconeCheck className="size-4 text-areia" />{novo ? 'Preencha as etapas e cadastre' : 'Tudo salvo'}</>}
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-areia/80 ml-2"><IconeTeclado className="size-4" /><kbd className="font-sans">Ctrl</kbd>+<kbd className="font-sans">S</kbd> salva</span>
        </span>
        <span className="flex items-center gap-2">
          {sujo && !novo && <button type="button" onClick={() => { enviando.current = true; window.location.reload(); }} className="h-10 px-4 rounded-full text-sm text-areia hover:text-creme hover:bg-white/10">Descartar</button>}
          <BotaoEnviar variante="claro" className="min-w-40 !h-10">{rotulo}</BotaoEnviar>
        </span>
      </div>
    </div>
  );
}
