'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { botao } from '@/components/ui/botao';
import { lembrarSugestaoAcao, marcarEnviadaAcao } from '@/server/acoes/sugestoes';

type Tam = 'p' | 'm';

/**
 * Enviar a sugestão: abre o WhatsApp da cliente com a mensagem e o link e marca como enviada (uma sugestão criada com
 * "Só criar" fica Para enviar até aqui). O primeiro envio é registrado no servidor (acompanhamento da equipe, D-26).
 */
export function BotaoEnviarSugestao({ id, url, enviada, tamanho = 'm' }: { id: string; url: string; enviada: boolean; tamanho?: Tam }) {
  const router = useRouter();
  const [feito, setFeito] = useState(enviada);
  return (
    <a href={url} target="_blank" rel="noopener" data-acao={feito ? 'contato' : 'nenhuma'}
      onClick={() => { if (!feito) { setFeito(true); marcarEnviadaAcao(id).then(() => router.refresh()).catch(() => {}); } }}
      className={botao(feito ? 'secundario' : 'oliva', tamanho)}>
      {feito ? 'Enviar de novo' : 'Enviar no WhatsApp'}
    </a>
  );
}

/** Lembrar a cliente: abre o WhatsApp com o lembrete certo para o ponto em que ela parou e guarda o lembrete. */
export function BotaoLembrar({ id, url, tamanho = 'm', lembretes = 0 }: { id: string; url: string; tamanho?: Tam; lembretes?: number }) {
  const router = useRouter();
  return (
    <a href={url} target="_blank" rel="noopener" data-acao="nenhuma"
      onClick={() => { lembrarSugestaoAcao(id).then(() => router.refresh()).catch(() => {}); }}
      className={botao('primario', tamanho)} title={lembretes ? `Já lembrada ${lembretes}×` : undefined}>
      Lembrar no WhatsApp{lembretes ? ` (${lembretes + 1}º)` : ''}
    </a>
  );
}
