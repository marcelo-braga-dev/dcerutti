'use client';

import { useState, useTransition } from 'react';
import { Botao, botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { linkDirect, montarResposta, type VariaveisResposta } from '@/lib/atendimento';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';
import { marcarContato } from '@/server/acoes/atendimento';

/**
 * Botões de contato. O clique conta como contato: sem a API, é o que dá para medir. No WhatsApp o texto vai no link
 * (`data-acao="nenhuma"`: o servidor já registra). O Direct não aceita texto pronto: copia e abre a conversa.
 */
export function BotoesContato({ id, telefone, instagram, texto = '', tamanho = 'p' }: { id: string; telefone: string | null; instagram: string | null; texto?: string; tamanho?: 'p' | 'm' }) {
  const [copiado, setCopiado] = useState(false);
  const [, iniciar] = useTransition();
  const marcar = (canal: 'whatsapp' | 'instagram') => iniciar(async () => { await marcarContato(id, canal); });
  const abrirDirect = async () => {
    // Abre antes de esperar a cópia: o navegador bloqueia a aba aberta depois de um await.
    window.open(linkDirect(instagram!), '_blank', 'noopener');
    if (texto) {
      await navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => setCopiado(false));
    }
    marcar('instagram');
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {telefone && <a href={linkWhatsApp(telefone, texto)} target="_blank" rel="noopener" data-acao="nenhuma" onClick={() => marcar('whatsapp')} className={botao('whatsapp', tamanho)}>WhatsApp</a>}
      {instagram && <Botao variante="secundario" tamanho={tamanho} onClick={abrirDirect}>Direct{texto ? ' (copia o texto)' : ''}</Botao>}
      {copiado && <span role="status" className="text-xs text-oliva">Texto copiado: cole na conversa.</span>}
    </span>
  );
}

type Resposta = { id: number; titulo: string; texto: string };

/** Escolhe a resposta pronta, confere o texto e envia por onde houver contato. */
export function PainelContato({ id, telefone, instagram, respostas, variaveis, meuNumero }: {
  id: string; telefone: string | null; instagram: string | null; respostas: Resposta[]; variaveis: VariaveisResposta; meuNumero: { apelido: string; telefone: string } | null;
}) {
  const [texto, setTexto] = useState('');
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="rotulo text-suave">Resposta pronta</span>
        <select className={classeCampo} defaultValue="" onChange={e => { const r = respostas.find(x => x.id === Number(e.target.value)); if (r) setTexto(montarResposta(r.texto, variaveis)); }}>
          <option value="">Escolha um modelo…</option>
          {respostas.map(r => <option key={r.id} value={r.id}>{r.titulo}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="rotulo text-suave">Mensagem</span>
        <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000} className={`${classeCampo} h-auto py-2`} placeholder="Confira o texto antes de enviar." />
      </label>
      {!telefone && !instagram && <p className="text-sm text-vermelho">Sem WhatsApp nem @: informe um contato abaixo.</p>}
      <BotoesContato id={id} telefone={telefone} instagram={instagram} texto={texto} tamanho="m" />
      {telefone && (
        <p className="text-xs text-suave">
          {meuNumero ? <>Confira se o WhatsApp aberto é o número <strong>{meuNumero.apelido}</strong>, {formatarTelefone(meuNumero.telefone)}.</> : 'Você está sem número da loja ligado: fale com a gestão.'}
        </p>
      )}
    </div>
  );
}
