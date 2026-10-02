'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type ResultadoAcao = { ok: boolean; erro?: string };

/** Botão de ação rápida (sem formulário): confirma se pedido, mostra o erro ao lado e atualiza a página no sucesso. */
export function BotaoAcao({ acao, children, confirmar, className = '' }: { acao: () => Promise<ResultadoAcao>; children: React.ReactNode; confirmar?: string; className?: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const executar = () => {
    if (confirmar && !window.confirm(confirmar)) return;
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r.ok) router.refresh();
      else setErro(r.erro ?? 'Não foi possível concluir.');
    });
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={executar} disabled={pendente} className={className}>{pendente ? '…' : children}</button>
      {erro && <span role="alert" className="text-xs text-vermelho max-w-56 text-right">{erro}</span>}
    </span>
  );
}
