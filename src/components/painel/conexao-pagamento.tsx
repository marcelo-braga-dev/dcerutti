'use client';

import { useState, useTransition } from 'react';
import { testarConexaoPagamento } from '@/server/acoes/pagamentos';
import { botao } from '@/components/ui/botao';

/** Copiar um texto (o endereço do aviso) com retorno visual. */
export function CopiarTexto({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className={botao('secundario', 'p')}
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setCopiado(false); } }}>
      {copiado ? 'Copiado ✓' : rotulo}
    </button>
  );
}

/** "Testar conexão": confere o Access Token no Mercado Pago e mostra de qual conta ele é. */
export function TestarConexao({ desabilitado }: { desabilitado?: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="grid gap-2">
      <button type="button" className={botao('primario', 'p', 'justify-self-start')} disabled={pendente || desabilitado}
        onClick={() => iniciar(async () => {
          const x = await testarConexaoPagamento();
          setR(x.ok ? { ok: true, texto: x.mensagem } : { ok: false, texto: x.erro });
        })}>
        {pendente ? 'Testando…' : 'Testar conexão'}
      </button>
      {r && <p role="status" className={`text-sm ${r.ok ? 'text-oliva' : 'text-vermelho'}`}>{r.ok ? '✓ ' : ''}{r.texto}</p>}
    </div>
  );
}
