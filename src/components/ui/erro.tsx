'use client';

import { useEffect } from 'react';
import { botao } from './botao';

/** Tela de erro inesperado das áreas (loja, painel, conta). O `digest` identifica o erro no log do servidor. */
export function TelaDeErro({ error, retry, voltar }: { error: Error & { digest?: string }; retry: () => void; voltar: { href: string; rotulo: string } }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="py-24 text-center grid gap-4 justify-items-center">
      <h1 className="titulo text-3xl">Algo deu errado</h1>
      <p className="text-suave max-w-md">Não foi possível carregar esta página. Tente de novo; se continuar, avise a loja{error.digest ? ` informando o código ${error.digest}` : ''}.</p>
      <div className="flex gap-3 flex-wrap justify-center">
        <button type="button" onClick={() => retry()} className={botao('primario')}>Tentar de novo</button>
        <a href={voltar.href} className={botao('secundario')}>{voltar.rotulo}</a>
      </div>
    </div>
  );
}
