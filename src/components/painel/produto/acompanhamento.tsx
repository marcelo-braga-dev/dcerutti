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
    ...(!d.ativo ? [{ tipo: 'alerta' as const, texto: <><strong>Oculto na loja.</strong> A cliente não encontra este produto enquanto “Ativo no catálogo” estiver desligado.</> }] : []),
    ...(d.fotos.length === 0 ? [{ tipo: 'alerta' as const, texto: <><strong>Sem fotos.</strong> O produto aparece com “Sem foto” na vitrine.</> }] : d.fotos.length < 3 ? [{ tipo: 'info' as const, texto: <>Só {d.fotos.length} foto{d.fotos.length > 1 ? 's' : ''}: mostre frente, costas e um detalhe do tecido.</> }] : []),
    ...(d.descricao.length > 0 && d.descricao.length < 40 ? [{ tipo: 'info' as const, texto: <>Descrição curta: conte caimento, tecido e ocasião de uso.</> }] : []),
    ...avisos,
    ...(novo ? [{ tipo: 'info' as const, texto: <>Depois de cadastrar, você adiciona os <strong>tamanhos e o estoque</strong>. Sem estoque o produto aparece como esgotado.</> }] : []),
  ] : [];

  const desconto = d ? descontoPct(d.preco || 0, d.precoCheio || 0) : 0;

  return (
    <div ref={ancora} className="grid gap-5">
      {/* Prévia do card da vitrine. */}
      <div className="cartao bg-card border border-borda rounded-[1.25rem] p-5 sombra-suave">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-suave"><IconeOlho className="size-4" />Prévia na loja</span>
          {d && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${d.ativo ? 'bg-oliva/10 text-oliva' : 'bg-borda text-suave'}`}><span className={`size-1.5 rounded-full ${d.ativo ? 'bg-oliva' : 'bg-suave'}`} />{d.ativo ? 'Visível' : 'Oculto'}</span>}
        </div>
        <div className="group mx-auto max-w-[220px] xl:max-w-none">
          <div className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#efebe5] ${d && !d.ativo ? 'opacity-60 grayscale-[40%]' : ''}`}>
            <Foto src={d?.fotos[0]} alt="" sizes="260px" className={`transition duration-700 ${d?.fotos[1] ? 'group-hover:opacity-0' : ''}`} />
            {d?.fotos[1] && <Foto src={d.fotos[1]} alt="" sizes="260px" className="opacity-0 transition duration-700 group-hover:opacity-100" />}
            <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
              {d?.imperdivel && <span className="px-2.5 py-1 rounded-full bg-imperdivel text-white text-[0.68rem] font-bold">Imperdível</span>}
              {desconto > 0 && <span className={`px-2.5 py-1 rounded-full text-[0.68rem] font-bold ${d?.imperdivel ? 'bg-card text-imperdivel' : 'bg-marrom-950 text-creme'}`}>−{desconto}%</span>}
            </span>
            {(d?.fotos.length ?? 0) > 1 && <span className="absolute right-2.5 bottom-2.5 rounded-full bg-card/90 text-[0.62rem] font-semibold px-2 py-0.5">{d!.fotos.length} fotos{d!.videos ? ` · ${d!.videos} vídeo${d!.videos > 1 ? 's' : ''}` : ''}</span>}
          </div>
          <div className="pt-3 px-0.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-suave">{d?.marca || 'Marca'}</span>
            <h3 className={`mt-1 text-[0.92rem] leading-snug line-clamp-2 ${d?.nome ? 'text-marrom-950' : 'text-suave/60'}`}>{d?.nome || 'Nome do produto'}</h3>
            <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
              <span className={`text-base font-extrabold tracking-tight ${d?.imperdivel || desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{d && d.preco > 0 ? brl(d.preco) : 'R$ —'}</span>
              {desconto > 0 && <s className="text-[0.8rem] text-suave">{brl(d!.precoCheio)}</s>}
            </div>
          </div>
        </div>
      </div>

      {/* Etapas e nota do cadastro. */}
      <nav aria-label="Etapas do cadastro" className="cartao bg-card border border-borda rounded-[1.25rem] p-5">
        <div className="flex items-center gap-4 mb-4">
          <span className="relative grid place-items-center size-14 shrink-0" role="img" aria-label={`Cadastro ${nota}% completo`}>
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-borda)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={corNota} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(nota / 100) * 97.4} 97.4`} className="transition-all duration-500" /></svg>
            <span className="text-sm font-extrabold tabular-nums" style={{ color: corNota }}>{nota}%</span>
          </span>
          <div>
            <div className="text-sm font-semibold text-marrom-950">Qualidade do cadastro</div>
            <div className="text-xs text-suave leading-snug">{nota >= 85 ? 'Excelente: pronto para vender.' : nota >= 55 ? 'Bom. Fotos, descrição e destaques deixam melhor.' : 'Faltam informações importantes.'}</div>
          </div>
        </div>
        <ol className="grid gap-1">
          {etapas.map((e, i) => {
            const erro = erros.includes(e.id);
            const ok = completa[e.id] && !erro;
            return (
              <li key={e.id}>
                <a href={`#${e.id}`} onClick={ev => { ev.preventDefault(); document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${visivel === e.id ? 'bg-creme' : 'hover:bg-creme/60'}`} aria-current={visivel === e.id ? 'step' : undefined}>
                  <span className={`grid place-items-center size-7 shrink-0 rounded-full text-xs font-bold transition-colors ${erro ? 'bg-vermelho text-white' : ok ? 'bg-oliva text-creme' : 'border-2 border-borda-forte text-suave'}`}>
                    {erro ? <IconeAlerta className="size-3.5" /> : ok ? <IconeCheck className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-marrom-950 leading-tight">{e.titulo}</span>
                    <span className={`block text-xs truncate ${erro ? 'text-vermelho' : 'text-suave'}`}>{erro ? 'Corrija os campos marcados' : ok ? falta[e.id] : `Falta: ${falta[e.id] ?? '…'}`}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {lista.length > 0 && (
        <ul className="grid gap-2" aria-label="Avisos">
          {lista.map((a, i) => (
            <li key={i} className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[0.82rem] leading-snug ${a.tipo === 'alerta' ? 'bg-bege/70 border border-caramelo/30 text-marrom-900' : 'bg-card border border-borda text-suave'}`}>
              {a.tipo === 'alerta' ? <IconeAlerta className="size-4 mt-0.5 shrink-0 text-caramelo" /> : <IconeInfo className="size-4 mt-0.5 shrink-0 text-suave" />}
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-marrom-950/95 text-creme pl-5 pr-2 py-2 shadow-[0_18px_40px_-12px_rgb(46_37_32/.55)] backdrop-blur">
        <span className="flex items-center gap-2.5 text-sm" aria-live="polite">
          {sujo
            ? <><span className="relative flex size-2.5"><span className="absolute inset-0 rounded-full bg-areia animate-ping opacity-60" /><span className="relative size-2.5 rounded-full bg-areia" /></span>{novo ? 'Cadastro em andamento' : 'Alterações não salvas'}</>
            : <><IconeCheck className="size-4 text-areia" />{novo ? 'Preencha as etapas e cadastre' : 'Tudo salvo'}</>}
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-areia/80 ml-2"><IconeTeclado className="size-4" /><kbd className="font-sans">Ctrl</kbd>+<kbd className="font-sans">S</kbd> salva</span>
        </span>
        <span className="flex items-center gap-2">
          {sujo && !novo && <button type="button" onClick={() => { enviando.current = true; window.location.reload(); }} className="h-11 px-4 rounded-full text-sm text-areia hover:text-creme hover:bg-white/10">Descartar</button>}
          <BotaoEnviar variante="claro" className="min-w-44">{rotulo}</BotaoEnviar>
        </span>
      </div>
    </div>
  );
}
