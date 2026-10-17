'use client';

import { useState, useTransition } from 'react';
import { botao } from '@/components/ui/botao';
import { TIPOS_NOTIFICACAO, quer, type Preferencias, type TipoNotificacao } from '@/lib/notificacoes';
import { salvarPreferenciasAcao } from '@/server/acoes/notificacoes';

/** Liga e desliga cada tipo de notificação no painel e por e-mail (D-28). */
export function PreferenciasNotificacao({ inicial, tipos }: { inicial: Preferencias; tipos: TipoNotificacao[] }) {
  const [p, setP] = useState(inicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const alternar = (canal: 'painel' | 'email', t: TipoNotificacao) => {
    setAviso(null);
    setP(x => ({ ...x, [canal]: x[canal].includes(t) ? x[canal].filter(y => y !== t) : [...x[canal], t] }));
  };
  return (
    <div className="grid gap-4">
      <table className="w-full text-sm">
        <thead className="rotulo !text-[0.6rem] text-suave text-left"><tr><th className="py-2">Aviso</th><th className="py-2 text-center w-20">No painel</th><th className="py-2 text-center w-20">E-mail</th></tr></thead>
        <tbody className="divide-y divide-borda">
          {tipos.map(t => (
            <tr key={t}>
              <td className="py-2.5 pr-3"><div className="font-semibold text-marrom-950">{TIPOS_NOTIFICACAO[t].rotulo}</div><div className="text-xs text-suave">{TIPOS_NOTIFICACAO[t].descricao}</div></td>
              <td className="text-center"><input type="checkbox" className="size-5 accent-[var(--color-marrom-950)]" checked={quer(p, t, 'painel')} onChange={() => alternar('painel', t)} aria-label={`${TIPOS_NOTIFICACAO[t].rotulo} no painel`} /></td>
              <td className="text-center"><input type="checkbox" className="size-5 accent-[var(--color-marrom-950)]" checked={quer(p, t, 'email')} onChange={() => alternar('email', t)} aria-label={`${TIPOS_NOTIFICACAO[t].rotulo} por e-mail`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pendente} onClick={() => iniciar(async () => { await salvarPreferenciasAcao(p); setAviso('Preferências salvas.'); })} className={botao('primario')}>{pendente ? 'Salvando…' : 'Salvar preferências'}</button>
        {aviso && <span className="text-sm text-oliva">{aviso}</span>}
      </div>
    </div>
  );
}
