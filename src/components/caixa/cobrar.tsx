'use client';

import { useEffect, useRef, useState } from 'react';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { IconeFechar } from '@/components/ui/icones';
import { conferirPagamentos, FORMAS, rotuloForma, type FormaPagamento, type Pagamento } from '@/lib/caixa';
import { brl, lerValor } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';

const ICONE: Record<FormaPagamento, string> = { pix: '◆', debito: '▭', credito: '▭', dinheiro: '$' };
const centavos = (n: number) => Math.round(n * 100) / 100;
const valorTexto = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * Cobrar: escolher a forma (ou dividir em várias), parcelas do crédito, valor recebido e troco do dinheiro.
 * Tocar numa forma lança o que falta pagar nela. Confirma só quando a soma bate com o total.
 */
export function Cobrar({ total, parcelasMax, pendente, erro, confirmar, fechar }: {
  total: number; parcelasMax: number; pendente: boolean; erro: string | null;
  confirmar: (pagamentos: Pagamento[], observacao: string) => void; fechar: () => void;
}) {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [textos, setTextos] = useState<{ valor: string; recebido: string }[]>([]);
  const [observacao, setObservacao] = useState('');
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const c = conferirPagamentos(pagamentos, total);
  const dinheiroCurto = pagamentos.some(p => p.forma === 'dinheiro' && p.recebido != null && p.recebido < p.valor);
  const motivo = !pagamentos.length ? 'Escolha a forma de pagamento' : dinheiroCurto ? 'Confira o dinheiro recebido'
    : c.sobra > 0 ? `Passou ${brl(c.sobra)} do total` : c.falta > 0 ? `Falta lançar ${brl(c.falta)}` : 'Confira os valores';

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pendente) fechar();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && c.ok && !pendente) confirmarRef.current?.click();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [c.ok, pendente, fechar]);

  const adicionar = (forma: FormaPagamento) => {
    const valor = centavos(Math.max(c.falta, 0)) || (pagamentos.length ? 0 : total);
    if (valor <= 0) return;
    setPagamentos(ps => [...ps, { forma, valor, parcelas: forma === 'credito' ? 1 : null, recebido: forma === 'dinheiro' ? valor : null }]);
    setTextos(ts => [...ts, { valor: valorTexto(valor), recebido: valorTexto(valor) }]);
  };
  const mudar = (i: number, m: Partial<Pagamento>) => setPagamentos(ps => ps.map((p, j) => (j === i ? { ...p, ...m } : p)));
  const remover = (i: number) => { setPagamentos(ps => ps.filter((_, j) => j !== i)); setTextos(ts => ts.filter((_, j) => j !== i)); };

  return (
    <div className="fixed inset-0 z-50 bg-marrom-950/60 grid place-items-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Cobrar">
      <div className="bg-creme w-full max-w-2xl h-full sm:h-auto sm:max-h-[92dvh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 sm:px-6 h-16 bg-marrom-950 text-creme shrink-0">
          <div>
            <div className="rotulo !text-[0.6rem] text-areia">Cobrar</div>
            <div className="font-display font-extrabold text-2xl leading-none">{brl(total)}</div>
          </div>
          <button type="button" onClick={fechar} disabled={pendente} className="size-11 grid place-items-center" aria-label="Voltar para a venda"><IconeFechar className="size-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid gap-5 content-start">
          <div>
            <div className="rotulo text-suave mb-2">{pagamentos.length ? 'Dividir: escolha outra forma para o que falta' : 'Como a cliente vai pagar?'}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FORMAS.map(f => (
                <button key={f.valor} type="button" onClick={() => adicionar(f.valor)} disabled={c.falta <= 0 && pagamentos.length > 0}
                  className="h-20 border-2 border-borda-forte bg-card hover:border-marrom-950 disabled:opacity-40 grid place-items-center content-center gap-1 transition-colors active:scale-[0.98]">
                  <span className="font-display font-extrabold text-xl text-caramelo" aria-hidden="true">{ICONE[f.valor]}</span>
                  <span className="rotulo text-marrom-950">{f.rotulo}</span>
                </button>
              ))}
            </div>
          </div>

          {pagamentos.length > 0 && (
            <ul className="grid gap-3">
              {pagamentos.map((p, i) => {
                const t = textos[i];
                const troco = p.forma === 'dinheiro' && p.recebido != null ? Math.max(0, p.recebido - p.valor) : 0;
                return (
                  <li key={i} className="bg-card border border-borda p-4 grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rotulo text-marrom-950">{rotuloForma(p.forma)}</span>
                      <button type="button" onClick={() => remover(i)} className="text-sm text-suave underline underline-offset-4 hover:text-vermelho">Tirar</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-suave">Valor nesta forma</span>
                        <div className="flex items-center border border-borda-forte bg-creme focus-within:border-marrom-950">
                          <span className="pl-3 text-suave">R$</span>
                          <input inputMode="decimal" value={t.valor} onChange={e => { const v = e.target.value; setTextos(ts => ts.map((x, j) => (j === i ? { ...x, valor: v } : x))); const n = lerValor(v); if (n >= 0) mudar(i, { valor: centavos(n) }); }}
                            className="flex-1 h-12 px-2 bg-transparent outline-none font-display font-bold text-lg" />
                        </div>
                      </label>
                      {p.forma === 'credito' && (
                        <label className="grid gap-1">
                          <span className="text-xs text-suave">Parcelas</span>
                          <select value={p.parcelas ?? 1} onChange={e => mudar(i, { parcelas: Number(e.target.value) })} className="h-12 px-3 border border-borda-forte bg-creme font-display font-bold">
                            {Array.from({ length: parcelasMax }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x de ${brl(p.valor / n)}`}</option>)}
                          </select>
                        </label>
                      )}
                      {p.forma === 'dinheiro' && (
                        <label className="grid gap-1">
                          <span className="text-xs text-suave">Recebido</span>
                          <div className="flex items-center border border-borda-forte bg-creme focus-within:border-marrom-950">
                            <span className="pl-3 text-suave">R$</span>
                            <input inputMode="decimal" value={t.recebido} onChange={e => { const v = e.target.value; setTextos(ts => ts.map((x, j) => (j === i ? { ...x, recebido: v } : x))); const n = lerValor(v); if (n >= 0) mudar(i, { recebido: centavos(n) }); }}
                              className="flex-1 h-12 px-2 bg-transparent outline-none font-display font-bold text-lg" />
                          </div>
                        </label>
                      )}
                    </div>
                    {p.forma === 'dinheiro' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {[p.valor, ...[20, 50, 100, 200].filter(n => n > p.valor)].slice(0, 4).map(n => (
                          <button key={n} type="button" onClick={() => { mudar(i, { recebido: n }); setTextos(ts => ts.map((x, j) => (j === i ? { ...x, recebido: valorTexto(n) } : x))); }}
                            className="h-9 px-3 border border-borda-forte bg-creme text-sm hover:border-marrom-950">{n === p.valor ? 'Exato' : brl(n)}</button>
                        ))}
                        {troco > 0 && <span className="ml-auto font-display font-extrabold text-oliva text-lg">Troco {brl(troco)}</span>}
                        {p.recebido != null && p.recebido < p.valor && <span className="ml-auto text-sm text-vermelho">O recebido é menor que o valor em dinheiro</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <label className="grid gap-1">
            <span className="text-xs text-suave">Observação (opcional)</span>
            <input value={observacao} onChange={e => setObservacao(e.target.value)} maxLength={200} placeholder="Ex.: troca combinada, presente…" className="h-11 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
          </label>
          {erro && <p role="alert" className="border-l-4 border-vermelho bg-vermelho/5 px-4 py-3 text-sm text-vermelho">{erro}</p>}
        </div>

        <div className="shrink-0 border-t border-borda bg-card p-4 sm:p-5 grid gap-3">
          <div className="grid grid-cols-3 text-center">
            <div><div className="text-xs text-suave">Total</div><div className="font-display font-extrabold">{brl(total)}</div></div>
            <div><div className="text-xs text-suave">Pago</div><div className="font-display font-extrabold">{brl(c.pago)}</div></div>
            <div>
              <div className="text-xs text-suave">{c.sobra > 0 ? 'Passou' : c.troco > 0 ? 'Troco' : 'Falta'}</div>
              <div className={`font-display font-extrabold ${c.sobra > 0 ? 'text-vermelho' : c.falta > 0 ? 'text-caramelo' : 'text-oliva'}`}>{brl(c.sobra || c.falta || c.troco)}</div>
            </div>
          </div>
          <button ref={confirmarRef} type="button" disabled={!c.ok || pendente} onClick={() => confirmar(pagamentos, observacao)}
            className="h-14 bg-oliva text-creme rotulo !text-[0.8rem] disabled:opacity-40 flex items-center justify-center gap-2">
            {pendente ? <><span className="size-4 rounded-full border-2 border-creme/40 border-t-creme animate-spin" aria-hidden="true" />Registrando a venda…</> : c.ok ? `Confirmar venda · ${brl(total)}` : motivo}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Venda registrada: troco em destaque, comprovante pelo WhatsApp (sem impressora na loja) e nova venda. */
export function VendaConcluida({ codigo, total, troco, comprovante, telefone, nomeCliente, pedidoId, novaVenda }: {
  codigo: string; total: number; troco: number; comprovante: string; telefone: string | null; nomeCliente: string | null; pedidoId: string; novaVenda: () => void;
}) {
  const [fone, setFone] = useState(telefone ? formatarTelefone(telefone) : '');
  const [copiado, setCopiado] = useState(false);
  const novaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { novaRef.current?.focus(); }, []);
  const valido = fone.replace(/\D/g, '').length >= 10;
  return (
    <div className="fixed inset-0 z-50 bg-marrom-950/60 grid place-items-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Venda registrada">
      <div className="bg-creme w-full max-w-lg h-full sm:h-auto overflow-y-auto shadow-2xl p-6 sm:p-8 grid gap-6 content-start text-center">
        <span className="mx-auto size-16 rounded-full bg-oliva text-creme grid place-items-center">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <div>
          <div className="rotulo text-oliva">Venda registrada · {codigo}</div>
          <div className="font-display font-extrabold text-4xl mt-2">{brl(total)}</div>
          {nomeCliente && <div className="text-suave mt-1">{nomeCliente}</div>}
        </div>
        {troco > 0 && (
          <div className="bg-oliva text-creme py-4">
            <div className="rotulo !text-[0.65rem] text-creme/80">Troco</div>
            <div className="font-display font-extrabold text-4xl">{brl(troco)}</div>
          </div>
        )}
        <div className="grid gap-3 text-left">
          <span className="rotulo text-suave">Comprovante para a cliente</span>
          <div className="flex gap-2">
            <input value={fone} onChange={e => setFone(formatarTelefone(e.target.value))} inputMode="tel" placeholder="WhatsApp da cliente" aria-label="WhatsApp da cliente"
              className="flex-1 min-w-0 h-12 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" />
            <a href={valido ? linkWhatsApp(fone, comprovante) : undefined} target="_blank" rel="noopener" aria-disabled={!valido}
              className={`h-12 px-4 flex items-center gap-2 bg-whatsapp text-white rotulo !text-[0.68rem] ${valido ? '' : 'opacity-40 pointer-events-none'}`}>
              <IconeWhatsApp className="size-5" />Enviar
            </a>
          </div>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(comprovante).then(() => setCopiado(true), () => {}); }}
            className="justify-self-start text-sm text-marrom-950 underline underline-offset-4">{copiado ? 'Comprovante copiado ✓' : 'Copiar o comprovante'}</button>
        </div>
        <div className="grid gap-2">
          <button ref={novaRef} type="button" onClick={novaVenda} className="h-14 bg-marrom-950 text-creme rotulo !text-[0.8rem]">Nova venda</button>
          <a href={`/painel/pedidos/${pedidoId}`} className="text-sm text-suave underline underline-offset-4">Ver a venda no painel</a>
        </div>
      </div>
    </div>
  );
}
