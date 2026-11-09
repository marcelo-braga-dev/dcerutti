import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { concluirPosVenda, descadastrarDeOfertas, posVendaViraAtendimento } from '@/server/acoes/pos-venda';

/** O contato de pós-venda na fila: chamar e registrar como foi. */
export function BotoesPosVenda({ id, clienteId, url, oferta }: { id: number; clienteId: string; url: string; oferta: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" rel="noopener" data-acao="contato" className={botao('whatsapp', 'p')}>WhatsApp</a>
      <BotaoAcao acao={concluirPosVenda.bind(null, id, 'respondeu')} className={botao('secundario', 'p')}>Respondeu</BotaoAcao>
      <BotaoAcao acao={concluirPosVenda.bind(null, id, 'nao_respondeu')} className={botao('secundario', 'p')}>Não respondeu</BotaoAcao>
      <BotaoAcao acao={posVendaViraAtendimento.bind(null, id)} className={botao('secundario', 'p')}>Virou atendimento</BotaoAcao>
      <BotaoAcao acao={concluirPosVenda.bind(null, id, 'pulado')} className={botao('fantasma', 'p')}>Pular</BotaoAcao>
      {oferta && <BotaoAcao acao={descadastrarDeOfertas.bind(null, clienteId)} confirmar="Esta cliente pediu para não receber ofertas? Ela sai da fila de ofertas." className={botao('fantasma', 'p')}>Não quer ofertas</BotaoAcao>}
    </div>
  );
}
