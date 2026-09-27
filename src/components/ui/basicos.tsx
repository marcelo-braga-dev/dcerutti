import type { ReactNode } from 'react';

export function Etiqueta({ children, cor = 'bege' }: { children: ReactNode; cor?: 'bege' | 'oliva' | 'caramelo' | 'escuro' | 'vermelho' | 'imperdivel' | 'cinza' }) {
  const cores = {
    bege: 'bg-bege text-caramelo',
    oliva: 'bg-oliva text-creme',
    caramelo: 'bg-caramelo text-creme',
    escuro: 'bg-marrom-950 text-creme',
    vermelho: 'bg-vermelho text-creme',
    imperdivel: 'bg-imperdivel text-white',
    cinza: 'bg-borda text-suave',
  };
  return <span className={`inline-flex items-center rotulo !text-[0.62rem] px-2 py-1 ${cores[cor]}`}>{children}</span>;
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-card border border-borda ${className}`}>{children}</div>;
}

export function Kpi({ rotulo, valor, detalhe, tom = 'claro' }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: 'claro' | 'escuro' | 'oliva' }) {
  const t = {
    claro: ['bg-card border border-borda', 'text-suave', 'text-marrom-950', 'text-suave'],
    escuro: ['bg-marrom-950', 'text-areia', 'text-creme', 'text-areia'],
    oliva: ['bg-oliva', 'text-areia', 'text-creme', 'text-areia'],
  }[tom];
  return (
    <div className={`p-5 ${t[0]}`}>
      <div className={`rotulo ${t[1]}`}>{rotulo}</div>
      <div className={`mt-2 font-display font-extrabold text-2xl sm:text-[1.7rem] leading-tight ${t[2]}`}>{valor}</div>
      {detalhe && <div className={`mt-1 text-sm ${t[3]}`}>{detalhe}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-borda-forte p-10 text-center text-suave">{children}</div>;
}

export function Alerta({ children, tipo = 'erro' }: { children: ReactNode; tipo?: 'erro' | 'ok' | 'aviso' }) {
  const c = { erro: 'border-vermelho text-vermelho bg-vermelho/5', ok: 'border-oliva text-oliva bg-oliva/5', aviso: 'border-caramelo text-caramelo bg-bege' }[tipo];
  return <div role={tipo === 'erro' ? 'alert' : 'status'} className={`border-l-4 px-4 py-3 text-sm ${c}`}>{children}</div>;
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

export function Barra({ pct, cor = '#6D402A' }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 bg-bege w-full" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: cor }} />
    </div>
  );
}
