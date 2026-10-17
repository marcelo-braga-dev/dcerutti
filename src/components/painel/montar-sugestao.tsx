'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { Alerta, Cartao } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl, lerValor } from '@/lib/dinheiro';
import { DIAS_PADRAO, DIAS_VALIDADE, MAX_ITENS } from '@/lib/sugestoes';
import { buscarParaSugestao, criarSugestaoAcao, historicoDaClienteAcao, sugestaoAutomaticaAcao, tamanhosDaClienteAcao, type PecaSugestao } from '@/server/acoes/sugestoes';
import type { HistoricoSugestao } from '@/server/sugestoes';
import { tempoDesde } from '@/lib/atividade';

type Item = { peca: PecaSugestao; varianteId: number | null; pct: string; nota: string };

/**
 * Montar a sugestão (D-27): o vendedor escolhe a cliente, as peças (com o tamanho dela ou deixando a cliente
 * escolher), um preço especial por peça (em %), uma nota e a validade. "Criar e enviar" abre o WhatsApp da cliente
 * com a mensagem e o link.
 */
export type Inicial = { titulo: string; mensagem: string | null; cupom: string | null; itens: { peca: PecaSugestao; pct: string; nota: string }[] };

export function MontarSugestao({ clientes, clienteInicial, limite, gestor, cupons, inicial }: {
  clientes: { id: string; nome: string; telefone: string }[]; clienteInicial?: string; limite: number; gestor: boolean;
  /** Cupons ligados e a pessoa pode aplicar. */
  cupons: boolean;
  /** Duplicar (fase 2): começa com as peças de outra sugestão. */
  inicial?: Inicial | null;
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(clienteInicial ?? '');
  const [tamanhos, setTamanhos] = useState<string[]>([]);
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [mensagem, setMensagem] = useState(inicial?.mensagem ?? '');
  const [cupom, setCupom] = useState(inicial?.cupom ?? '');
  const [sugerindo, setSugerindo] = useState(false);
  const [dias, setDias] = useState(DIAS_PADRAO);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<PecaSugestao[]>([]);
  const [itens, setItens] = useState<Item[]>(() => (inicial?.itens ?? []).map(i => ({ ...i, varianteId: null })));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let atual = true;
    const t = setTimeout(() => buscarParaSugestao(busca).then(r => { if (atual) setAchados(r); }).catch(() => {}), 250);
    return () => { atual = false; clearTimeout(t); };
  }, [busca]);
  const [historico, setHistorico] = useState<HistoricoSugestao | null>(null);
  useEffect(() => {
    let atual = true;
    if (clienteId) {
      tamanhosDaClienteAcao(clienteId).then(r => { if (atual) setTamanhos(r); }).catch(() => {});
      historicoDaClienteAcao(clienteId).then(r => { if (atual) setHistorico(r); }).catch(() => {});
    }
    return () => { atual = false; };
  }, [clienteId]);

  const naLista = new Set(itens.map(i => i.peca.id));
  const doTamanho = (p: PecaSugestao) => p.variantes.find(v => tamanhos.includes(v.tamanho.toUpperCase()))?.id ?? null;
  /** Do histórico: o tamanho que ela usou, se ainda há estoque; senão o tamanho dela; senão ela escolhe. */
  const doHistorico = (p: PecaSugestao, varianteId?: number | null) => (varianteId && p.variantes.some(v => v.id === varianteId) ? varianteId : doTamanho(p));
  const adicionar = (p: PecaSugestao, varianteId: number | null) => {
    if (naLista.has(p.id) || itens.length >= MAX_ITENS) return;
    setItens(x => [...x, { peca: p, varianteId, pct: '', nota: '' }]);
    setErro(null);
  };
  const mudar = (id: number, m: Partial<Item>) => setItens(x => x.map(i => (i.peca.id === id ? { ...i, ...m } : i)));
  const preco = (i: Item) => { const pct = lerValor(i.pct); return pct > 0 && pct < 100 ? Math.round(i.peca.preco * (100 - pct)) / 100 : null; };
  const total = itens.reduce((a, i) => a + (preco(i) ?? i.peca.preco), 0);

  const criar = (enviar: boolean) => {
    setErro(null);
    if (!clienteId) return setErro('Escolha a cliente.');
    if (!itens.length) return setErro('Adicione pelo menos uma peça.');
    const acima = !gestor && itens.find(i => lerValor(i.pct) > limite);
    if (acima) return setErro(`Desconto acima de ${limite}% em ${acima.peca.nome}: só o gestor dá esse desconto.`);
    // Abre a aba antes da espera: o navegador bloqueia janelas abertas depois de uma resposta do servidor.
    const aba = enviar ? window.open('about:blank', '_blank') : null;
    iniciar(async () => {
      const r = await criarSugestaoAcao({
        clienteId, titulo: titulo.trim() || 'Separei para você', mensagem: mensagem.trim() || undefined, dias,
        itens: itens.map(i => ({ produtoId: i.peca.id, varianteId: i.varianteId, precoOferta: preco(i), nota: i.nota.trim() || null })), cupom: cupom.trim() || undefined, enviar,
      });
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      if (enviar) {
        if (aba) aba.location.href = r.url; else window.open(r.url, '_blank');
      }
      router.push(`/painel/sugestoes/${r.id}`);
    });
  };

  return (
    <div className="grid xl:grid-cols-[1.25fr_1fr] gap-6 items-start">
      <div className="grid gap-4 min-w-0">
        <Cartao className="p-4 sm:p-5 grid sm:grid-cols-2 gap-4">
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="rotulo !text-[0.62rem] text-suave">Cliente</span>
            <select value={clienteId} onChange={e => { setClienteId(e.target.value); setErro(null); }} className={classeCampo}>
              <option value="">Escolha a cliente…</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.telefone}</option>)}
            </select>
            {clienteId && (
              <button type="button" disabled={sugerindo} onClick={async () => {
                setSugerindo(true); setErro(null);
                try {
                  const r = await sugestaoAutomaticaAcao(clienteId);
                  if (!r.length) setErro('Ainda não há histórico suficiente desta cliente para sugerir. Busque as peças abaixo.');
                  setItens(x => [...x, ...r.filter(n => !x.some(i => i.peca.id === n.peca.id)).slice(0, MAX_ITENS - x.length).map(n => ({ peca: n.peca, varianteId: n.varianteId, pct: '', nota: '' }))]);
                } finally { setSugerindo(false); }
              }} className={botao('secundario', 'p', 'justify-self-start')}>{sugerindo ? 'Escolhendo…' : '✨ Sugerir automaticamente'}</button>
            )}
            {clienteId && <span className="text-xs text-suave">{tamanhos.length ? <>Tamanhos que ela mais usa: <strong className="text-marrom-950">{tamanhos.join(' · ')}</strong> (já vêm marcados ao adicionar)</> : 'Ainda sem tamanho preferido: a cliente escolhe.'}</span>}
          </label>
          <label className="grid gap-1.5">
            <span className="rotulo !text-[0.62rem] text-suave">Título</span>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={80} placeholder="Novidades no seu tamanho" className={classeCampo} />
          </label>
          <label className="grid gap-1.5">
            <span className="rotulo !text-[0.62rem] text-suave">Vale por</span>
            <select value={dias} onChange={e => setDias(Number(e.target.value))} className={classeCampo}>
              {DIAS_VALIDADE.map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </label>
          {cupons && (
            <label className="grid gap-1.5">
              <span className="rotulo !text-[0.62rem] text-suave">Cupom (opcional)</span>
              <input value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())} maxLength={30} placeholder="Aplicado quando ela pedir" className={`${classeCampo} uppercase`} />
            </label>
          )}
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="rotulo !text-[0.62rem] text-suave">Mensagem (opcional)</span>
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={2} maxLength={1000} placeholder="Chegou a coleção nova e lembrei de você…" className={`${classeCampo} h-auto py-2`} />
          </label>
        </Cartao>

        <label className="grid gap-1.5">
          <span className="rotulo !text-[0.62rem] text-suave">Buscar peças (sem busca: promoções primeiro)</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência, cor ou categoria…" className={classeCampo} />
        </label>
        <div className="grid sm:grid-cols-2 gap-2">
          {achados.map(p => {
            const ja = naLista.has(p.id);
            return (
              <article key={p.id} className={`bg-card border border-borda p-2 flex gap-3 ${ja ? 'opacity-50' : ''}`}>
                <div className="relative shrink-0 w-14 h-[70px] bg-bege overflow-hidden"><Foto src={p.imagem} alt="" sizes="56px" className="!text-[0.5rem]" /></div>
                <div className="min-w-0 flex-1 grid gap-1.5 content-start text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 leading-snug text-marrom-950 line-clamp-2">{p.nome}</span>
                    <span className="shrink-0 text-right font-display font-bold">{brl(p.preco)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.variantes.map(v => (
                      <button key={v.id} type="button" disabled={ja} onClick={() => adicionar(p, v.id)} title={`${v.disponivel} em estoque`}
                        className={`min-w-9 h-9 px-2 border text-xs font-display font-bold ${tamanhos.includes(v.tamanho.toUpperCase()) ? 'border-caramelo text-caramelo' : 'border-borda-forte'} hover:bg-marrom-950 hover:text-creme disabled:pointer-events-none`}>
                        {v.tamanho}
                      </button>
                    ))}
                    <button type="button" disabled={ja} onClick={() => adicionar(p, doTamanho(p))} className="h-9 px-2 text-xs underline underline-offset-2 text-suave disabled:no-underline">
                      {ja ? 'Na sugestão' : doTamanho(p) ? 'No tamanho dela' : 'Ela escolhe'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 content-start min-w-0">
      <Cartao className="p-4 sm:p-5 grid gap-4 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="titulo text-lg">Sugestão · {itens.length} {itens.length === 1 ? 'peça' : 'peças'}</h2>
          {itens.length > 0 && <span className="font-display font-bold">{brl(total)}</span>}
        </div>
        {itens.length === 0 ? <p className="text-sm text-suave">Toque no tamanho de uma peça para adicionar, ou em “Ela escolhe” para a cliente escolher o tamanho.</p> : (
          <ul className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1 min-w-0">
            {itens.map(i => {
              const especial = preco(i);
              return (
                <li key={i.peca.id} className="border border-borda p-2 grid grid-cols-[48px_1fr] gap-3">
                  <div className="relative w-12 h-16 bg-bege overflow-hidden"><Foto src={i.peca.imagem} alt="" sizes="48px" className="!text-[0.5rem]" /></div>
                  <div className="grid gap-1.5 min-w-0 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-marrom-950">{i.peca.nome}</span>
                      <button type="button" onClick={() => setItens(x => x.filter(y => y.peca.id !== i.peca.id))} className="text-xs text-suave underline shrink-0">tirar</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={i.varianteId ?? ''} onChange={e => mudar(i.peca.id, { varianteId: e.target.value ? Number(e.target.value) : null })} aria-label="Tamanho"
                        className="h-9 px-2 border border-borda-forte bg-card text-xs">
                        <option value="">Ela escolhe o tamanho</option>
                        {i.peca.variantes.map(v => <option key={v.id} value={v.id}>Tam. {v.tamanho}</option>)}
                      </select>
                      <label className="flex items-center border border-borda-forte bg-card h-9">
                        <span className="sr-only">Desconto em %</span>
                        <input value={i.pct} onChange={e => mudar(i.peca.id, { pct: e.target.value })} inputMode="decimal" placeholder="0" className="w-10 px-2 bg-transparent outline-none text-xs" />
                        <span className="pr-2 text-xs text-suave">% off</span>
                      </label>
                      <span className="text-xs">{especial ? <><s className="text-suave">{brl(i.peca.preco)}</s> <strong className="text-imperdivel">{brl(especial)}</strong></> : brl(i.peca.preco)}</span>
                    </div>
                    <input value={i.nota} onChange={e => mudar(i.peca.id, { nota: e.target.value })} maxLength={200} placeholder="Nota para a cliente (opcional)" className="h-9 px-2 border border-borda bg-creme text-xs outline-none focus:border-marrom-950" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!gestor && <p className="text-xs text-suave">Desconto de até {limite}% por peça; acima disso, só o gestor. Os preços especiais valem até o fim da validade.</p>}
        {erro && <Alerta>{erro}</Alerta>}
        <div className="grid gap-2">
          <button type="button" disabled={pendente} onClick={() => criar(true)} className={botao('oliva', 'm', 'w-full')}>{pendente ? 'Criando…' : 'Criar e enviar no WhatsApp'}</button>
          <button type="button" disabled={pendente} onClick={() => criar(false)} className={botao('secundario', 'm', 'w-full')}>Só criar (enviar depois)</button>
        </div>
      </Cartao>
      {clienteId && <HistoricoDaCliente h={historico} naLista={naLista} adicionar={(p, v) => adicionar(p, doHistorico(p, v))} />}
      </div>
    </div>
  );
}


type Aba = 'sacola' | 'vistas' | 'favoritos' | 'naoFechados' | 'compras';
type Linha = { peca: PecaSugestao; varianteId?: number | null; info: string };

/**
 * Registros da cliente escolhida (D-27): sacola atual (ou parada), peças que ela mais abriu, favoritos, pedidos que
 * não fecharam e compras. Cada peça tem "+" para entrar na sugestão, já no tamanho que ela usou.
 */
function HistoricoDaCliente({ h, naLista, adicionar }: { h: HistoricoSugestao | null; naLista: Set<number>; adicionar: (p: PecaSugestao, varianteId?: number | null) => void }) {
  const [aba, setAba] = useState<Aba | null>(null);
  if (!h) return <Cartao className="p-5 text-sm text-suave">Carregando o histórico da cliente…</Cartao>;
  const abas: { k: Aba; rotulo: string; linhas: Linha[] }[] = [
    { k: 'sacola', rotulo: h.sacola?.parada ? 'Sacola parada' : 'Sacola', linhas: (h.sacola?.itens ?? []).map(i => ({ peca: i.peca, varianteId: i.varianteId, info: `Tam. ${i.tamanho} · ${i.quantidade}×` })) },
    { k: 'vistas', rotulo: 'Mais vistas', linhas: h.vistas.map(v => ({ peca: v.peca, info: `Abriu ${v.vezes}× · ${tempoDesde(v.ultimaVez)}${v.tamanhos.length ? ` · tam. ${v.tamanhos.join(', ')}` : ''}${v.situacao === 'comprou' ? ' · já comprou' : ''}` })) },
    { k: 'favoritos', rotulo: 'Favoritos', linhas: h.favoritos.map(f => ({ peca: f.peca, info: `Guardou ${tempoDesde(f.criadoEm)}` })) },
    { k: 'naoFechados', rotulo: 'Não fechados', linhas: h.naoFechados.map(n => ({ peca: n.peca, varianteId: n.varianteId, info: `${n.codigo} · ${n.motivo === 'expirado' ? 'prazo vencido' : n.motivo === 'cliente' ? 'ela cancelou' : 'cancelado'}${n.quando ? ` ${tempoDesde(n.quando)}` : ''}` })) },
    { k: 'compras', rotulo: 'Compras', linhas: h.compras.map(c => ({ peca: c.peca, varianteId: c.varianteId, info: `${c.codigo}${c.quando ? ` · ${tempoDesde(c.quando)}` : ''} · para repetir ou combinar` })) },
  ];
  const atual = abas.find(a => a.k === aba) ?? abas.find(a => a.linhas.length) ?? abas[1];
  const comEstoque = (l: Linha) => l.peca.variantes.length > 0;
  return (
    <Cartao className="p-4 sm:p-5 grid gap-3 min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-lg">Histórico da cliente</h2>
        {h.tamanhos.length > 0 && <span className="text-xs text-suave">usa {h.tamanhos.slice(0, 3).join(' · ')}</span>}
      </div>
      {h.sacola && (
        <p className={`text-xs ${h.sacola.parada ? 'text-caramelo' : 'text-suave'}`}>
          {h.sacola.parada ? 'Sacola parada' : 'Sacola aberta'}: {h.sacola.itens.length} {h.sacola.itens.length === 1 ? 'peça' : 'peças'} · {brl(h.sacola.total)} · mexeu {tempoDesde(h.sacola.atualizadoEm)}
        </p>
      )}
      <div className="flex flex-wrap gap-1 border-b border-borda" role="tablist">
        {abas.map(a => (
          <button key={a.k} type="button" role="tab" aria-selected={atual.k === a.k} onClick={() => setAba(a.k)}
            className={`px-2.5 h-9 text-xs rotulo !text-[0.6rem] border-b-2 -mb-px ${atual.k === a.k ? 'border-marrom-950 text-marrom-950' : 'border-transparent text-suave hover:text-marrom-950'}`}>
            {a.rotulo} <span className="text-suave">{a.linhas.length}</span>
          </button>
        ))}
      </div>
      {atual.linhas.length === 0 ? <p className="text-sm text-suave py-2">Nada aqui ainda.</p> : (
        <>
          {atual.k === 'sacola' && atual.linhas.some(l => comEstoque(l) && !naLista.has(l.peca.id)) && (
            <button type="button" onClick={() => atual.linhas.filter(l => comEstoque(l) && !naLista.has(l.peca.id)).forEach(l => adicionar(l.peca, l.varianteId))}
              className={botao('secundario', 'p', 'justify-self-start')}>Pôr a sacola inteira na sugestão</button>
          )}
          <ul className="grid grid-cols-1 gap-2 max-h-[55vh] overflow-y-auto overflow-x-hidden pr-1 min-w-0">
            {atual.linhas.map(l => {
              const ja = naLista.has(l.peca.id), sem = !comEstoque(l);
              return (
                <li key={`${atual.k}-${l.peca.id}`} className={`min-w-0 flex items-center gap-3 border border-borda p-2 ${ja || sem ? 'opacity-60' : ''}`}>
                  <span className="relative w-10 h-12 bg-bege overflow-hidden shrink-0"><Foto src={l.peca.imagem} alt="" sizes="40px" className="!text-[0.45rem]" /></span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate text-marrom-950">{l.peca.nome}</span>
                    <span className="block text-xs text-suave truncate">{sem ? 'Sem estoque' : l.info}</span>
                  </span>
                  <span className="text-xs font-display font-bold whitespace-nowrap">{brl(l.peca.preco)}</span>
                  <button type="button" disabled={ja || sem} onClick={() => adicionar(l.peca, l.varianteId)} aria-label={`Adicionar ${l.peca.nome} à sugestão`}
                    className={`size-9 grid place-items-center border text-lg leading-none shrink-0 ${ja ? 'border-oliva text-oliva' : 'border-marrom-950 hover:bg-marrom-950 hover:text-creme'} disabled:pointer-events-none`}>
                    {ja ? '✓' : '+'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Cartao>
  );
}
