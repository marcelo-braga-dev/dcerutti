'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { corClara, tomDaCor } from '@/lib/cores';
import { brl } from '@/lib/dinheiro';
import { ESCOLHAS, totaisEscolhidos, type Escolha } from '@/lib/sugestoes';
import { formatarCep } from '@/lib/telefone';
import { adicionarNaSugestaoAcao, responderSugestaoAcao, salvarEscolhasAcao } from '@/server/acoes/sugestoes';
import type { SugestaoPublica } from '@/server/sugestoes';

type Estado = { escolha: Escolha; produtoId: number; varianteId: number | null; quantidade: number };

/**
 * A cliente escolhe nas sugestões (D-27): Quero / Talvez / Não em cada peça, cor, tamanho e quantidade. As marcações
 * ficam salvas no link enquanto ela escolhe. No fim, "Quero comprar" ou "Quero provar em casa" viram pedido e abrem
 * o WhatsApp de quem atende.
 */
export function EscolherSugestao({ chave, s }: { chave: string; s: SugestaoPublica }) {
  const [estado, setEstado] = useState<Record<number, Estado>>(() =>
    Object.fromEntries(s.itens.map(i => [i.id, { escolha: i.escolha, produtoId: i.corInicial, varianteId: i.varianteInicial, quantidade: i.quantidade }])));
  // Peças que a cliente pôs pela faixa "Mais para você" (fase 2).
  const [extras, setExtras] = useState<SugestaoPublica['itens']>([]);
  const [mais, setMais] = useState(s.maisParaVoce);
  const [pondo, setPondo] = useState<number | null>(null);
  const todos = [...s.itens, ...extras];
  const [cep, setCep] = useState('');
  const [pedirCep, setPedirCep] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ codigo: string | null; url: string | null; destinatario: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const primeiro = useRef(true);

  const escolhas = () => todos.map(i => ({ id: i.id, escolha: estado[i.id].escolha, varianteId: estado[i.id].varianteId, quantidade: estado[i.id].quantidade }));
  // Guarda as marcações um pouco depois de cada mudança (a cliente pode fechar e voltar).
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    const t = setTimeout(() => { salvarEscolhasAcao(chave, escolhas()).catch(() => {}); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const mudar = (id: number, m: Partial<Estado>) => { setErro(null); setEstado(x => ({ ...x, [id]: { ...x[id], ...m } })); };
  const totais = totaisEscolhidos(todos.map(i => ({ escolha: estado[i.id].escolha, preco: i.preco, quantidade: estado[i.id].quantidade, temTamanho: !!estado[i.id].varianteId })));

  const responder = (modo: 'pensando' | 'compra' | 'condicional') => {
    setErro(null);
    if (modo !== 'pensando') {
      if (!totais.pecas) return setErro('Marque "Quero" nas peças que você quer.');
      if (totais.semTamanho) return setErro('Escolha o tamanho das peças marcadas como "Quero".');
      if (modo === 'condicional' && !s.condicionalNoCep && !pedirCep) return setPedirCep(true);
    }
    const aba = window.open('about:blank', '_blank');
    iniciar(async () => {
      const r = await responderSugestaoAcao(chave, modo, escolhas(), modo === 'condicional' ? cep : undefined);
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      if (r.url) { if (aba) aba.location.href = r.url; else window.open(r.url, '_blank'); } else aba?.close();
      setFeito(r);
    });
  };

  if (feito)
    return (
      <div className="bg-card border border-borda p-6 text-center grid gap-3 justify-items-center">
        <div className="size-14 rounded-full bg-oliva text-creme grid place-items-center text-2xl" aria-hidden="true">✓</div>
        <h2 className="titulo text-xl">{feito.codigo ? `Pedido ${feito.codigo} enviado!` : 'Escolhas guardadas!'}</h2>
        <p className="text-suave max-w-sm">{feito.codigo ? `${feito.destinatario === 'a loja' ? 'A loja' : feito.destinatario} recebeu as peças que você escolheu e vai combinar pagamento e entrega com você pelo WhatsApp.` : `Avisamos ${feito.destinatario}. Quando decidir, é só voltar neste link.`}</p>
        {feito.url && <a href={feito.url} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Abrir o WhatsApp</a>}
      </div>
    );

  return (
    <div className="grid gap-4 pb-40">
      {todos.map(i => {
        const e = estado[i.id];
        const cor = i.cores.find(c => c.produtoId === e.produtoId) ?? i.cores[0];
        const oferta = i.preco < i.precoCatalogo;
        return (
          <article key={i.id} className={`bg-card border p-3 sm:p-4 grid grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] gap-4 ${e.escolha === 'quero' ? 'border-oliva' : e.escolha === 'nao' ? 'border-borda opacity-60' : 'border-borda'}`}>
            <div className="relative aspect-[4/5] bg-bege overflow-hidden"><Foto src={cor?.imagem ?? null} alt={i.nome} sizes="120px" /></div>
            <div className="grid gap-2.5 min-w-0 content-start">
              <div>
                <h3 className="text-marrom-950 leading-snug">{i.nome}</h3>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <strong className={`font-display text-lg ${oferta ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(i.preco)}</strong>
                  {(oferta || i.precoCheio > i.preco) && <s className="text-xs text-suave">{brl(oferta ? i.precoCatalogo : i.precoCheio)}</s>}
                  {oferta && <span className="text-[0.65rem] rotulo text-imperdivel">Preço especial</span>}
                </div>
                {i.nota && <p className="text-sm italic text-suave mt-1">“{i.nota}”</p>}
              </div>
              {i.cores.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">
                  {i.cores.map(c => {
                    const tom = tomDaCor(c.cor);
                    const ativa = c.produtoId === e.produtoId;
                    const temEstoque = c.variantes.some(v => v.disponivel > 0);
                    return (
                      <button key={c.produtoId} type="button" disabled={!temEstoque} onClick={() => mudar(i.id, { produtoId: c.produtoId, varianteId: null })} aria-pressed={ativa}
                        className={`h-11 pl-1 pr-2.5 flex items-center gap-1.5 border text-xs ${ativa ? 'border-marrom-950 bg-marrom-950 text-creme' : 'border-borda-forte'} disabled:opacity-35 disabled:line-through`}>
                        {/* Miniatura da peça: o mesmo nome de cor pode ser estampas diferentes. */}
                        {c.imagem
                          ? <span className="relative w-7 h-9 bg-bege overflow-hidden shrink-0"><Foto src={c.imagem} alt="" sizes="28px" /></span>
                          : <span className={`size-4 rounded-full ${corClara(tom) || !tom ? 'border border-borda-forte' : ''} ${tom === 'estampa' ? 'bg-[conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#c0312b)]' : tom ? '' : 'bg-bege'}`} style={tom && tom !== 'estampa' ? { background: tom } : undefined} />}
                        {c.cor ?? 'Única'}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tamanho">
                {cor?.variantes.map(v => (
                  <button key={v.id} type="button" disabled={v.disponivel <= 0} onClick={() => mudar(i.id, { varianteId: v.id, escolha: e.escolha === 'pendente' || e.escolha === 'nao' ? 'quero' : e.escolha })} aria-pressed={e.varianteId === v.id}
                    className={`min-w-10 h-10 px-2 border font-display font-bold text-sm ${e.varianteId === v.id ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte'} disabled:opacity-35 disabled:line-through`}>
                    {v.tamanho}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(ESCOLHAS) as (keyof typeof ESCOLHAS)[]).map(k => (
                  <button key={k} type="button" onClick={() => mudar(i.id, { escolha: e.escolha === k ? 'pendente' : k })} aria-pressed={e.escolha === k}
                    className={`h-10 px-3 border text-sm font-semibold ${e.escolha === k ? (k === 'quero' ? 'bg-oliva text-creme border-oliva' : k === 'talvez' ? 'bg-caramelo text-creme border-caramelo' : 'bg-suave text-creme border-suave') : 'border-borda-forte'}`}>
                    {k === 'quero' ? '♥ ' : ''}{ESCOLHAS[k]}
                  </button>
                ))}
                {e.escolha === 'quero' && (
                  <span className="flex items-center border border-borda-forte h-10 ml-auto">
                    <button type="button" onClick={() => mudar(i.id, { quantidade: Math.max(1, e.quantidade - 1) })} className="w-9 h-full" aria-label="Menos">−</button>
                    <span className="w-6 text-center font-display font-bold">{e.quantidade}</span>
                    <button type="button" onClick={() => mudar(i.id, { quantidade: Math.min(10, e.quantidade + 1) })} className="w-9 h-full" aria-label="Mais">+</button>
                  </span>
                )}
              </div>
              {e.escolha === 'quero' && !e.varianteId && <p className="text-xs text-vermelho">Escolha o tamanho.</p>}
            </div>
          </article>
        );
      })}

      {mais.length > 0 && (
        <section className="grid gap-3 mt-2">
          <h2 className="titulo text-lg">Mais para você</h2>
          <p className="text-sm text-suave -mt-2">Combina com o que {s.nomeVendedor} separou. Toque para incluir.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mais.map(m => (
              <article key={m.produtoId} className="bg-card border border-borda grid">
                <div className="relative aspect-[4/5] bg-bege overflow-hidden"><Foto src={m.imagem} alt={m.nome} sizes="200px" /></div>
                <div className="p-2.5 grid gap-1.5">
                  <span className="text-sm leading-snug line-clamp-2 text-marrom-950">{m.nome}</span>
                  <span className="flex items-baseline gap-1.5"><strong className={`font-display ${m.preco < m.precoCheio ? 'text-imperdivel' : ''}`}>{brl(m.preco)}</strong>{m.preco < m.precoCheio && <s className="text-xs text-suave">{brl(m.precoCheio)}</s>}</span>
                  <button type="button" disabled={pondo === m.produtoId} onClick={async () => {
                    setPondo(m.produtoId); setErro(null);
                    const r = await adicionarNaSugestaoAcao(chave, m.produtoId).catch(() => ({ ok: false as const, erro: 'Não foi possível pôr a peça.' }));
                    setPondo(null);
                    if (!r.ok) return setErro(r.erro);
                    const item = r.item;
                    setExtras(x => [...x, item]);
                    setEstado(x => ({ ...x, [item.id]: { escolha: 'quero', produtoId: item.corInicial, varianteId: null, quantidade: 1 } }));
                    setMais(x => x.filter(y => y.produtoId !== m.produtoId));
                  }} className={botao('secundario', 'p', 'w-full')}>{pondo === m.produtoId ? 'Incluindo…' : '+ Incluir'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-card/95 backdrop-blur border-t border-borda shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-2xl px-4 py-3 grid gap-2">
          {erro && <Alerta>{erro}</Alerta>}
          {pedirCep && (
            <label className="flex items-center gap-2 text-sm">
              <span className="shrink-0">CEP para o condicional</span>
              <input value={cep} onChange={ev => setCep(formatarCep(ev.target.value))} inputMode="numeric" placeholder="89874-000" className="h-10 px-3 border border-borda-forte bg-creme w-32" />
              <span className="text-xs text-suave">Atendemos {s.cidadeCondicional}</span>
            </label>
          )}
          <div className="flex items-baseline justify-between text-sm">
            <span>{totais.pecas ? `${totais.pecas} ${totais.pecas === 1 ? 'peça escolhida' : 'peças escolhidas'}` : 'Marque "Quero" nas peças que gostou'}</span>
            <strong className="font-display text-lg">{brl(totais.total)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pendente} onClick={() => responder('compra')} className={botao('primario', 'm', 'w-full')}>{pendente ? 'Enviando…' : 'Quero comprar'}</button>
            <button type="button" disabled={pendente} onClick={() => responder('condicional')} className={botao('oliva', 'm', 'w-full')}>{pedirCep ? 'Confirmar o CEP' : 'Quero provar em casa'}</button>
          </div>
          <button type="button" disabled={pendente} onClick={() => responder('pensando')} className="text-sm text-suave underline underline-offset-4 justify-self-center">Ainda estou pensando · falar com {s.nomeVendedor}</button>
        </div>
      </div>
    </div>
  );
}
