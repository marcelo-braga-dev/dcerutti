'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelarCobrancaDoPedido, conferirCobranca, definirFretePedido, estornarPagamento, gerarLinkPagamento } from '@/server/acoes/pagamentos';
import { Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { Popup } from '@/components/ui/popup';
import { brl } from '@/lib/dinheiro';
import { formatarDataHora } from '@/lib/datas';
import { COR_STATUS, descreverMeio, ROTULO_METODO, ROTULO_STATUS, type MetodoCobranca, type StatusCobranca } from '@/lib/pagamento';

type Cobranca = {
  id: string; metodo: MetodoCobranca; status: StatusCobranca; valor: number; valorEstornado: number; meio: string | null; parcelas: number | null;
  taxa: number | null; semEstoque: boolean; expiraEm: Date | null; aprovadaEm: Date | null; criadaEm: Date; ativa: boolean; paga: boolean;
  mpOrderId?: string | null;
};

type Evento = { id: number; cobrancaId: string | null; origem: string; tipo: string; statusMp: string | null; erro: string | null; criadoEm: Date };

export type DadosPagamento = {
  pedidoId: string;
  configurado: boolean;
  pix: boolean;
  cartao: boolean;
  valor: { ok: true; valor: number } | { ok: false; motivo: string; precisaFrete?: boolean };
  cobrancas: Cobranca[];
  podeEstornar: boolean;
  podeDefinirFrete: boolean;
  frete: number | null;
  /** Só para o gestor (R-10). */
  eventos?: Evento[];
};

const COR_ETIQUETA = { oliva: 'oliva', cinza: 'cinza', escuro: 'escuro', vermelho: 'vermelho', padrao: 'bege' } as const;

/** Quadro "Pagamento online" do pedido (docs/27): link para a cliente, situação, conferência, cancelamento e estorno. */
export function PagamentoPedido(d: DadosPagamento) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<{ link: string; whatsapp: string | null; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [frete, setFrete] = useState(d.frete != null ? String(d.frete).replace('.', ',') : '');
  const [estornar, setEstornar] = useState<Cobranca | null>(null);

  const ativa = d.cobrancas.find(c => c.ativa) ?? null;
  const paga = d.cobrancas.find(c => c.paga) ?? null;
  const rodar = (f: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) => {
    setErro(null); setOk(null);
    iniciar(async () => {
      const r = await f();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.');
      else { if (r.mensagem) setOk(r.mensagem); router.refresh(); }
    });
  };

  const gerar = () => {
    setErro(null); setOk(null);
    iniciar(async () => {
      const r = await gerarLinkPagamento(d.pedidoId);
      if (!r.ok) { setErro(r.erro); return; }
      setLink(r);
      router.refresh();
    });
  };

  const copiar = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setCopiado(false); }
  };

  return (
    <div className="grid gap-4 text-sm">
      <div>
        <h2 className="titulo text-lg">Pagamento online</h2>
        <p className="text-xs text-suave">Pix e cartão pelo Mercado Pago. A baixa é automática quando a cliente paga.</p>
      </div>

      {!d.configurado && <p className="text-vermelho">As credenciais do Mercado Pago ainda não estão no servidor: nada pode ser cobrado.</p>}

      {paga && (
        <div className="border border-oliva bg-oliva/5 p-4 grid gap-1">
          <div className="flex flex-wrap items-center gap-2"><Etiqueta cor={COR_ETIQUETA[COR_STATUS[paga.status]]}>{ROTULO_STATUS[paga.status]}</Etiqueta><strong className="font-display text-lg">{brl(paga.valor)}</strong></div>
          <div className="text-suave">{descreverMeio(paga)}{paga.aprovadaEm ? ` · ${formatarDataHora(paga.aprovadaEm)}` : ''}{paga.taxa != null ? ` · tarifa informada ${brl(paga.taxa)}` : ''}</div>
          {paga.valorEstornado > 0 && <div className="text-suave">Estornado: {brl(paga.valorEstornado)}</div>}
          {paga.semEstoque && <p className="text-vermelho font-semibold">Uma peça acabou antes do pagamento cair. Troque a peça com a cliente (cancele e refaça o pedido) ou estorne.</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className={botao('secundario', 'p')} disabled={pendente} onClick={() => rodar(() => conferirCobranca(paga.id))}>Conferir no Mercado Pago</button>
            {d.podeEstornar && paga.status !== 'contestada' && <button type="button" className={botao('perigo', 'p')} disabled={pendente} onClick={() => setEstornar(paga)}>Estornar</button>}
          </div>
        </div>
      )}

      {!paga && ativa && (
        <div className="border border-borda p-4 grid gap-1">
          <div className="flex flex-wrap items-center gap-2"><Etiqueta cor="escuro">{ROTULO_STATUS[ativa.status]}</Etiqueta><span>{ROTULO_METODO[ativa.metodo]} · {brl(ativa.valor)}</span></div>
          <div className="text-suave">Aberta em {formatarDataHora(ativa.criadaEm)}{ativa.expiraEm ? ` · vale até ${formatarDataHora(ativa.expiraEm)}` : ''}. As peças ficam reservadas enquanto isso.</div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className={botao('secundario', 'p')} disabled={pendente} onClick={() => rodar(() => conferirCobranca(ativa.id))}>Conferir no Mercado Pago</button>
            <button type="button" className={botao('perigo', 'p')} disabled={pendente} onClick={() => { if (window.confirm('Cancelar esta cobrança? A cliente não consegue mais pagar por ela e a reserva das peças volta ao estoque.')) rodar(() => cancelarCobrancaDoPedido(ativa.id)); }}>Cancelar cobrança</button>
          </div>
        </div>
      )}

      {!paga && !d.valor.ok && d.valor.precisaFrete && d.podeDefinirFrete && (
        <form className="grid gap-2" onSubmit={e => { e.preventDefault(); rodar(() => definirFretePedido({ pedidoId: d.pedidoId, frete })); }}>
          <p className="text-suave">O frete está a combinar. Informe o valor combinado com a cliente para liberar o pagamento.</p>
          <div className="flex gap-2 items-end">
            <label className="grid gap-1 flex-1"><span className="rotulo text-marrom-900">Frete (R$)</span>
              <input value={frete} onChange={e => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-10 px-3 border border-borda-forte bg-card" /></label>
            <button type="submit" className={botao('secundario')} disabled={pendente}>Salvar frete</button>
          </div>
          <p className="text-xs text-suave">0 = retirada na loja ou frete grátis.</p>
        </form>
      )}
      {!paga && !d.valor.ok && !(d.valor.precisaFrete && d.podeDefinirFrete) && <p className="text-suave">{d.valor.motivo}</p>}

      {!paga && d.valor.ok && d.configurado && (
        <div className="grid gap-2">
          <div className="flex justify-between items-baseline"><span>Valor a cobrar</span><strong className="font-display text-lg">{brl(d.valor.valor)}</strong></div>
          <button type="button" className={botao('oliva', 'm', 'w-full')} disabled={pendente} onClick={gerar}>{link ? 'Gerar o link de novo' : 'Gerar link de pagamento'}</button>
          {link && (
            <div className="grid gap-2 border border-borda p-3">
              <code className="text-xs break-all select-all">{link.link}</code>
              <div className="flex flex-wrap gap-2">
                {link.whatsapp && <a href={link.whatsapp} target="_blank" rel="noopener" className={botao('whatsapp', 'p')}>Enviar no WhatsApp</a>}
                <button type="button" className={botao('secundario', 'p')} onClick={copiar}>{copiado ? 'Mensagem copiada ✓' : 'Copiar mensagem'}</button>
              </div>
              <p className="text-xs text-suave">A cliente escolhe {d.pix && d.cartao ? 'Pix ou cartão' : d.pix ? 'Pix' : 'cartão'} no link, sem precisar entrar na conta.</p>
            </div>
          )}
        </div>
      )}

      {erro && <p className="text-vermelho" role="alert">{erro}</p>}
      {ok && <p className="text-oliva" role="status">{ok}</p>}

      {d.cobrancas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-suave">Tentativas ({d.cobrancas.length})</summary>
          <ul className="mt-2 grid gap-1">
            {d.cobrancas.map(c => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>{formatarDataHora(c.criadaEm)} · {ROTULO_METODO[c.metodo]}</span>
                <span className="text-suave">{ROTULO_STATUS[c.status]} · {brl(c.valor)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!!d.eventos?.length && (
        <details>
          <summary className="cursor-pointer text-suave">Registro do Mercado Pago</summary>
          <ul className="mt-2 grid gap-1 text-xs">
            {d.cobrancas.filter(c => c.mpOrderId).map(c => <li key={c.id} className="text-suave">{ROTULO_METODO[c.metodo]} de {formatarDataHora(c.criadaEm)}: order <code className="select-all">{c.mpOrderId}</code></li>)}
            {d.eventos.map(e => (
              <li key={e.id} className="flex flex-wrap gap-x-2 border-t border-borda pt-1">
                <span className="tabular-nums">{formatarDataHora(e.criadoEm)}</span>
                <span className="text-suave">{e.origem}</span>
                <span>{e.tipo.replace(/_/g, ' ')}</span>
                {e.statusMp && <span className="text-suave">({e.statusMp})</span>}
                {e.erro && <span className="text-vermelho basis-full">{e.erro}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {estornar && <Estorno cobranca={estornar} fechar={() => setEstornar(null)} />}
    </div>
  );
}

function Estorno({ cobranca, fechar }: { cobranca: Cobranca; fechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const resta = Math.round((cobranca.valor - cobranca.valorEstornado) * 100) / 100;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await estornarPagamento({ cobrancaId: cobranca.id, motivo, valor });
      if (!r.ok) { setErro(r.erro); return; }
      fechar();
      router.refresh();
    });
  };
  return (
    <Popup titulo="Estornar pagamento" fechar={fechar}>
      <form onSubmit={enviar} className="grid gap-4 text-sm">
        <p>O valor volta para a cliente pelo mesmo meio ({descreverMeio(cobranca)}). Disponível para estorno: <strong>{brl(resta)}</strong>.</p>
        <label className="grid gap-1"><span className="rotulo text-marrom-900">Motivo</span>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} required minLength={3} maxLength={300} className="px-3 py-2 border border-borda-forte bg-card" /></label>
        <label className="grid gap-1"><span className="rotulo text-marrom-900">Valor (R$)</span>
          <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder={`Em branco = tudo (${brl(resta)})`} className="h-10 px-3 border border-borda-forte bg-card" /></label>
        <p className="text-xs text-suave">Depois do estorno total, o pedido pode ser cancelado ou a venda desfeita normalmente.</p>
        {erro && <p className="text-vermelho" role="alert">{erro}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" className={botao('fantasma')} onClick={fechar}>Voltar</button>
          <button type="submit" className={botao('perigo')} disabled={pendente}>{pendente ? 'Estornando…' : 'Estornar'}</button>
        </div>
      </form>
    </Popup>
  );
}
