import type { ReactNode } from 'react';

export function Etiqueta({ children, cor = 'bege' }: { children: ReactNode; cor?: 'bege' | 'oliva' | 'caramelo' | 'escuro' | 'vermelho' | 'imperdivel' | 'cinza' | 'contorno' }) {
  const cores = {
    bege: 'bg-bege text-caramelo',
    oliva: 'bg-oliva text-creme',
    caramelo: 'bg-caramelo text-creme',
    escuro: 'bg-marrom-950 text-creme',
    vermelho: 'bg-vermelho text-creme',
    imperdivel: 'bg-imperdivel text-white',
    cinza: 'bg-borda text-suave',
    contorno: 'border border-borda-forte text-marrom-900',
  };
  return <span className={`etiqueta inline-flex items-center rotulo !text-[0.62rem] px-2 py-1 ${cores[cor]}`}>{children}</span>;
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cartao bg-card border border-borda ${className}`}>{children}</div>;
}

export function Kpi({ rotulo, valor, detalhe, tom = 'claro' }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: 'claro' | 'escuro' | 'oliva' }) {
  const t = {
    claro: ['bg-card border border-borda', 'text-suave', 'text-marrom-950', 'text-suave'],
    escuro: ['bg-marrom-950', 'text-areia', 'text-creme', 'text-areia'],
    oliva: ['bg-oliva', 'text-areia', 'text-creme', 'text-areia'],
  }[tom];
  return (
    <div className={`kpi p-5 ${t[0]}`}>
      <div className={`rotulo ${t[1]}`}>{rotulo}</div>
      <div className={`mt-2 font-display font-extrabold text-2xl sm:text-[1.7rem] leading-tight ${t[2]}`}>{valor}</div>
      {detalhe && <div className={`mt-1 text-sm ${t[3]}`}>{detalhe}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio border border-dashed border-borda-forte p-10 text-center text-suave">{children}</div>;
}

export function Alerta({ children, tipo = 'erro' }: { children: ReactNode; tipo?: 'erro' | 'ok' | 'aviso' }) {
  const c = { erro: 'border-vermelho text-vermelho bg-vermelho/5', ok: 'border-oliva text-oliva bg-oliva/5', aviso: 'border-caramelo text-caramelo bg-bege' }[tipo];
  return <div role={tipo === 'erro' ? 'alert' : 'status'} className={`alerta border-l-4 px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function CabecalhoPagina({ sobre, titulo, acoes, children }: { sobre?: string; titulo: string; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {sobre && <div className="rotulo text-caramelo mb-2">{sobre}</div>}
        <h1 className="titulo text-2xl sm:text-3xl">{titulo}</h1>
        {children && <div className="mt-2 text-suave">{children}</div>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Barra({ pct, cor = 'var(--color-caramelo)' }: { pct: number; cor?: string }) {
  return (
    <div className="barra h-2 bg-bege w-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: cor }} />
    </div>
  );
}

/**
 * Cartão com cabeçalho de uma linha (ícone, título, contador ou ação à direita): o padrão compacto do painel (visual 2026).
 * `semPadding` deixa o conteúdo encostar nas bordas (listas com divisórias).
 */
export function CartaoSecao({ icone, titulo, extra, children, className = '', id, tom, semPadding }: {
  icone?: ReactNode; titulo: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; id?: string; tom?: 'perigo' | 'destaque'; semPadding?: boolean;
}) {
  const borda = tom === 'perigo' ? 'border-vermelho/30' : tom === 'destaque' ? 'border-marrom-950/40 ring-1 ring-marrom-950/10' : 'border-borda';
  return (
    <section id={id} className={`cartao bg-card border ${borda} rounded-[1.25rem] scroll-mt-24 ${className}`}>
      <header className="flex items-center gap-2.5 px-5 py-3 border-b border-borda">
        {icone && <span className={`shrink-0 [&>svg]:size-[18px] ${tom === 'perigo' ? 'text-vermelho' : 'text-caramelo'}`}>{icone}</span>}
        <h2 className={`titulo text-lg leading-tight min-w-0 ${tom === 'perigo' ? '!text-vermelho' : ''}`}>{titulo}</h2>
        {extra && <div className="ml-auto flex items-center gap-2 text-sm text-suave">{extra}</div>}
      </header>
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
