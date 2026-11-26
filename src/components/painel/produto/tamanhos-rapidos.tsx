'use client';

import { avisarMudanca } from './campos';

const COMUNS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'U', '36', '38', '40', '42', '44', '46'];

/** Atalhos de tamanho: um toque preenche o campo "Tamanho" do formulário em volta. Os que já existem ficam de fora. */
export function TamanhosRapidos({ existentes }: { existentes: string[] }) {
  const livres = COMUNS.filter(t => !existentes.includes(t));
  if (!livres.length) return null;
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1">
      <span className="text-xs text-suave mr-1">Rápido:</span>
      {livres.map(t => (
        <button key={t} type="button"
          onClick={e => {
            const campo = e.currentTarget.closest('form')?.querySelector<HTMLInputElement>('input[name=tamanho]');
            if (!campo) return;
            campo.value = t;
            avisarMudanca(campo);
            campo.closest('form')?.querySelector<HTMLInputElement>('input[name=estoque]')?.focus();
          }}
          className="h-7 min-w-8 px-2 rounded-md border border-borda-forte bg-card text-xs font-bold text-marrom-950 hover:border-marrom-950 hover:bg-marrom-950 hover:text-creme transition-colors">
          {t}
        </button>
      ))}
    </div>
  );
}
