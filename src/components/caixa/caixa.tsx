'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { IconeFechar, IconeLupa } from '@/components/ui/icones';
import { buscarClientesCaixa, cadastrarClienteCaixa, previaCupomCaixa, registrarVendaCaixa, type ClienteCaixa, type PreviaCupomCaixa } from '@/server/acoes/caixa';
import { agruparModelos, calcularVenda, dentroDoLimite, FILTROS_CAIXA, filtrarCaixa, porCodigo, type DescontoGeral, type FiltrosCaixa, type Pagamento, type ProdutoCaixa, type VarianteCaixa } from '@/lib/caixa';
import { brl, lerValor } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { Cobrar, VendaConcluida } from './cobrar';
import { CardCaixa, FiltrosDoCaixa } from './produtos';

type Item = { varianteId: number; quantidade: number; precoCombinado: number | null };
type Concluida = { pedidoId: string; codigo: string; total: number; troco: number; comprovante: string; telefone: string | null; nomeCliente: string | null };

type Props = {
  produtos: ProdutoCaixa[];
  usuario: { id: string; nome: string; papel: 'vendedor' | 'gestor' };
  vendedores: { id: string; name: string }[] | null;
  limiteDesconto: number;
  parcelasMax: number;
  cupons: boolean;
  resumo: { total: number; vendas: number };
};

const POR_VEZ = 48;

/**
 * Caixa da loja física (D-23). O catálogo inteiro vem do servidor e a busca e os filtros rodam aqui, na hora. A venda em
 * andamento fica guardada no navegador (recarregar não perde nada). O servidor confere tudo ao registrar.
 */
export function Caixa({ produtos, usuario, vendedores, limiteDesconto, parcelasMax, cupons, resumo }: Props) {
  const router = useRouter();
  const gestor = usuario.papel === 'gestor';
  const chave = `dcerutti-caixa:${usuario.id}`;
  const [f, setF] = useState<FiltrosCaixa>(FILTROS_CAIXA);
  const busca = useDeferredValue(f.q);
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const [itens, setItens] = useState<Item[]>([]);
  const [geral, setGeral] = useState<DescontoGeral>(null);
  const [cliente, setCliente] = useState<ClienteCaixa | null>(null);
  const [vendedorId, setVendedorId] = useState('');
  const [codigoCupom, setCodigoCupom] = useState('');
  const [cupom, setCupom] = useState<PreviaCupomCaixa | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluida, setConcluida] = useState<Concluida | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; em: number } | null>(null);
  const [verVenda, setVerVenda] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const carregado = useRef(false);

  // Venda guardada no navegador.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(chave) ?? 'null');
      if (s && Array.isArray(s.itens)) {
        /* eslint-disable react-hooks/set-state-in-effect -- leitura única do navegador ao abrir */
        setItens(s.itens); setGeral(s.geral ?? null); setCliente(s.cliente ?? null); setVendedorId(s.vendedorId ?? ''); setCodigoCupom(s.codigoCupom ?? '');
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch { /* sem armazenamento */ }
    carregado.current = true;
  }, [chave]);
  useEffect(() => {
    if (!carregado.current) return;
    try { localStorage.setItem(chave, JSON.stringify({ itens, geral, cliente, vendedorId, codigoCupom })); } catch { /* sem armazenamento */ }
  }, [chave, itens, geral, cliente, vendedorId, codigoCupom]);

  const porVariante = useMemo(() => {
    const m = new Map<number, { p: ProdutoCaixa; v: VarianteCaixa }>();
    for (const p of produtos) for (const v of p.variantes) m.set(v.id, { p, v });
    return m;
  }, [produtos]);
  const r = useMemo(() => filtrarCaixa(produtos, { ...f, q: busca }), [produtos, f, busca]);
  const modelos = useMemo(() => agruparModelos(r.produtos), [r.produtos]);
  // Sem busca nem filtro a lista fica vazia: ninguém procura peça a peça no catálogo inteiro.
  const semFiltro = !busca.trim() && !f.genero && !f.categoria && !f.tamanho && !f.cor && !f.preco && !f.promo;
  const naVenda = useMemo(() => new Map(itens.map(i => [i.varianteId, i.quantidade])), [itens]);
  const linhas = itens.filter(i => porVariante.has(i.varianteId));
  const calc = calcularVenda(linhas.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade, preco: porVariante.get(i.varianteId)!.p.preco, precoCombinado: i.precoCombinado })), geral);
  const descontoCupom = cupom?.ok ? cupom.desconto : 0;
  const total = Math.max(0, Math.round((calc.total - descontoCupom) * 100) / 100);
  const pecas = linhas.reduce((a, i) => a + i.quantidade, 0);
  const acimaDoLimite = !dentroDoLimite(calc.descontoParte, limiteDesconto, gestor);
  const precisaVendedor = gestor && !vendedorId && !cliente;

  const avisar = (texto: string) => setAviso({ texto, em: Date.now() });
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  const adicionar = useCallback((p: ProdutoCaixa, v: VarianteCaixa) => {
    const ja = itens.find(i => i.varianteId === v.id)?.quantidade ?? 0;
    if (ja >= v.disponivel) return avisar(`Sem mais estoque de ${p.nome} · ${v.tamanho}`);
    setItens(atual => atual.some(i => i.varianteId === v.id)
      ? atual.map(i => (i.varianteId === v.id ? { ...i, quantidade: i.quantidade + 1 } : i))
      : [...atual, { varianteId: v.id, quantidade: 1, precoCombinado: null }]);
    avisar(`+1 ${p.nome} · Tam. ${v.tamanho}`);
  }, [itens]);
  const alterar = (id: number, delta: number) => setItens(atual => atual.flatMap(i => {
    if (i.varianteId !== id) return [i];
    const max = porVariante.get(id)?.v.disponivel ?? 0;
    const q = Math.min(max, i.quantidade + delta);
    return q > 0 ? [{ ...i, quantidade: q }] : [];
  }));
  const definirPreco = (id: number, preco: number | null) => setItens(atual => atual.map(i => (i.varianteId === id ? { ...i, precoCombinado: preco } : i)));
  const limpar = () => { setItens([]); setGeral(null); setCliente(null); setCodigoCupom(''); setCupom(null); setErro(null); };

  // Prévia do cupom: refeita quando a venda muda.
  const chaveCupom = cupons && codigoCupom && linhas.length ? JSON.stringify([codigoCupom, cliente?.id, geral, linhas]) : '';
  useEffect(() => {
    if (!chaveCupom) return;
    let atual = true;
    const t = setTimeout(() => previaCupomCaixa({ codigo: codigoCupom, clienteId: cliente?.id ?? null, linhas, descontoGeral: geral })
      .then(x => { if (atual) setCupom(x); }).catch(() => {}), 300);
    return () => { atual = false; clearTimeout(t); };
  }, [chaveCupom]); // eslint-disable-line react-hooks/exhaustive-deps -- a chave já resume cupom, cliente, desconto e peças

  // Atalhos: F2 busca, F4 cobrar, Esc limpa a busca.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (cobrando || concluida) return;
      if (e.key === 'F2') { e.preventDefault(); campo.current?.focus(); campo.current?.select(); }
      if (e.key === 'F4') { e.preventDefault(); if (linhas.length && !acimaDoLimite && !precisaVendedor) setCobrando(true); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [cobrando, concluida, linhas.length, acimaDoLimite, precisaVendedor]);

  const aoEnter = () => {
    const achado = porCodigo(produtos, f.q);
    if (achado) { adicionar(achado.produto, achado.variante); setF(x => ({ ...x, q: '' })); return; }
    const so = r.produtos.length === 1 ? r.produtos[0] : null;
    const tamanhos = so?.variantes.filter(v => v.disponivel > 0) ?? [];
    if (so && tamanhos.length === 1) { adicionar(so, tamanhos[0]); setF(x => ({ ...x, q: '' })); }
  };

  const confirmar = (pagamentos: Pagamento[], observacao: string) => {
    setErro(null);
    iniciar(async () => {
      const res = await registrarVendaCaixa({
        linhas: linhas.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade, precoCombinado: i.precoCombinado })),
        descontoGeral: geral, clienteId: cliente?.id ?? null, cupom: cupom?.ok ? cupom.codigo : undefined,
        pagamentos, vendedorId: vendedorId || undefined, observacao: observacao || undefined,
      }).catch(() => ({ ok: false as const, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.' }));
      if (!res.ok) return setErro(res.erro);
      setCobrando(false);
      setConcluida(res);
      limpar();
      router.refresh(); // estoque e o total de hoje
    });
  };

  const novaVenda = () => { setConcluida(null); setVerVenda(false); setTimeout(() => campo.current?.focus(), 50); };

  return (
    <div className="h-dvh flex flex-col">
      <Topo usuario={usuario} resumo={resumo} />

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* Produtos */}
        <section className="min-h-0 flex flex-col">
          <div className="shrink-0 px-4 lg:px-6 pt-4 pb-3 grid gap-3 border-b border-borda bg-creme">
            <div className="relative">
              <IconeLupa className="size-5 absolute left-4 top-1/2 -translate-y-1/2 text-suave" />
              <input ref={campo} autoFocus value={f.q} onChange={e => { setF(x => ({ ...x, q: e.target.value })); setMostrar(POR_VEZ); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aoEnter(); } if (e.key === 'Escape') setF(x => ({ ...x, q: '' })); }}
                placeholder="Código da etiqueta, nome, referência ou cor…   (F2)" aria-label="Buscar peça ou digitar o código" type="search" autoComplete="off"
                className="w-full h-14 pl-12 pr-12 border-2 border-borda-forte bg-card text-lg outline-none focus:border-marrom-950 [&::-webkit-search-cancel-button]:hidden" />
              {f.q && <button type="button" onClick={() => { setF(x => ({ ...x, q: '' })); campo.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 size-10 grid place-items-center text-suave" aria-label="Limpar a busca"><IconeFechar className="size-5" /></button>}
            </div>
            <FiltrosDoCaixa f={f} c={r.contagens} mudar={m => { setF(x => ({ ...x, ...m })); setMostrar(POR_VEZ); }} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4 pb-28 lg:pb-6">
            {semFiltro ? (
              <div className="h-full min-h-64 grid place-items-center content-center gap-3 text-center text-suave px-4">
                <svg viewBox="0 0 24 24" className="size-10 text-borda-forte" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <p className="text-marrom-950 font-display font-bold text-lg">Digite o código da etiqueta e aperte Enter</p>
                <p className="text-sm max-w-sm">ou busque pelo nome, referência ou cor, ou escolha um filtro acima para ver as peças.</p>
              </div>
            ) : (<>
            <div className="flex items-baseline justify-between mb-3 text-sm text-suave">
              <span>{modelos.length.toLocaleString('pt-BR')} {modelos.length === 1 ? 'modelo' : 'modelos'} · {r.produtos.length.toLocaleString('pt-BR')} {r.produtos.length === 1 ? 'cor' : 'cores'}</span>
              <span className="hidden lg:inline">Enter com o código põe direto na venda</span>
            </div>
            {r.produtos.length === 0 ? (
              <p className="py-16 text-center text-suave">Nenhuma peça com esses filtros. {f.disponivel && <button type="button" onClick={() => setF(x => ({ ...x, disponivel: false }))} className="underline">Ver também as esgotadas</button>}</p>
            ) : (
              <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-2 items-start">
                {modelos.slice(0, mostrar).map(m => <CardCaixa key={m.chave} m={m} naVenda={naVenda} adicionar={adicionar} />)}
              </div>
            )}
            {modelos.length > mostrar && (
              <div className="mt-6 text-center"><button type="button" onClick={() => setMostrar(m => m + POR_VEZ)} className="h-12 px-6 border border-marrom-950 rotulo">Mostrar mais ({modelos.length - mostrar})</button></div>
            )}
            </>)}
          </div>
        </section>

        {/* Venda atual */}
        <aside className={`${verVenda ? 'fixed inset-0 z-40 flex' : 'hidden'} lg:static lg:flex min-h-0 flex-col bg-card border-l border-borda`} aria-label="Venda atual">
          <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-borda">
            <div className="flex items-baseline gap-2"><h2 className="titulo text-lg">Venda atual</h2><span className="text-sm text-suave">{pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'vazia'}</span></div>
            <div className="flex items-center gap-1">
              {linhas.length > 0 && <button type="button" onClick={() => { if (confirm('Limpar a venda atual?')) limpar(); }} className="h-10 px-3 text-sm text-suave underline underline-offset-4 hover:text-vermelho">Limpar</button>}
              <button type="button" onClick={() => setVerVenda(false)} className="lg:hidden size-11 grid place-items-center" aria-label="Voltar para as peças"><IconeFechar className="size-6" /></button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {linhas.length === 0 ? (
              <div className="px-6 py-14 text-center text-suave grid gap-2">
                <span className="text-4xl" aria-hidden="true">🛍️</span>
                <span>Toque no tamanho de uma peça, ou digite o código da etiqueta e aperte Enter.</span>
              </div>
            ) : (
              <ul className="divide-y divide-borda">
                {linhas.map(i => <LinhaVenda key={i.varianteId} item={i} info={porVariante.get(i.varianteId)!} precoFinal={calc.precos.get(i.varianteId) ?? 0} alterar={alterar} definirPreco={definirPreco} />)}
              </ul>
            )}

            <div className="px-5 py-4 grid gap-4 border-t border-borda">
              <BlocoCliente cliente={cliente} escolher={c => { setCliente(c); setCupom(null); }} gestor={gestor} vendedorId={vendedorId} />
              {gestor && vendedores && (
                <label className="grid gap-1">
                  <span className="rotulo !text-[0.62rem] text-suave">Vendido por</span>
                  <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} className={`h-11 px-3 border bg-creme ${precisaVendedor ? 'border-caramelo' : 'border-borda-forte'}`}>
                    <option value="">{cliente ? 'Quem atende a cliente' : 'Escolha a vendedora'}</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <DescontoGeralCampo geral={geral} mudar={setGeral} />
                {cupons && (
                  <label className="grid gap-1">
                    <span className="rotulo !text-[0.62rem] text-suave">Cupom</span>
                    <input value={codigoCupom} onChange={e => { setCodigoCupom(e.target.value.toUpperCase().trim()); setCupom(null); }} placeholder="Código" maxLength={30}
                      className="h-11 px-3 border border-borda-forte bg-creme uppercase outline-none focus:border-marrom-950" />
                  </label>
                )}
              </div>
              {codigoCupom && cupom && <p className={`text-xs ${cupom.ok ? 'text-oliva' : 'text-vermelho'}`}>{cupom.ok ? `Cupom ${cupom.codigo}: ${cupom.regra}` : `Cupom não aplicado: ${cupom.erro}`}</p>}
            </div>
          </div>

          <div className="shrink-0 border-t border-borda p-5 grid gap-2 bg-creme">
            <Valor rotulo="Peças" valor={brl(calc.subtotal)} />
            {calc.desconto > 0 && <Valor rotulo={`Desconto (${Math.round(calc.descontoParte * 100)}%)`} valor={`−${brl(calc.desconto)}`} cor="text-caramelo" />}
            {descontoCupom > 0 && <Valor rotulo={`Cupom ${cupom?.ok ? cupom.codigo : ''}`} valor={`−${brl(descontoCupom)}`} cor="text-oliva" />}
            <div className="flex items-baseline justify-between pt-2 border-t border-borda">
              <span className="titulo text-lg">Total</span>
              <span className="font-display font-extrabold text-3xl">{brl(total)}</span>
            </div>
            {acimaDoLimite && <p className="text-xs text-vermelho">Desconto acima de {limiteDesconto}%: peça ao gestor para registrar.</p>}
            {precisaVendedor && linhas.length > 0 && <p className="text-xs text-caramelo">Escolha quem fez a venda.</p>}
            <button type="button" disabled={!linhas.length || acimaDoLimite || precisaVendedor} onClick={() => { setErro(null); setCobrando(true); }}
              className="mt-1 h-14 bg-marrom-950 text-creme rotulo !text-[0.82rem] disabled:opacity-40 hover:bg-marrom-700">Cobrar {linhas.length ? brl(total) : ''} <span className="text-areia">· F4</span></button>
          </div>
        </aside>
      </div>

      {/* Celular: barra com o total */}
      {!verVenda && (
        <button type="button" onClick={() => setVerVenda(true)} className="lg:hidden fixed inset-x-3 bottom-3 z-30 h-14 px-5 bg-marrom-950 text-creme flex items-center justify-between shadow-xl">
          <span className="rotulo">Venda · {pecas} {pecas === 1 ? 'peça' : 'peças'}</span>
          <span className="font-display font-extrabold text-xl">{brl(total)}</span>
        </button>
      )}

      {aviso && <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 bg-marrom-950 text-creme px-5 py-3 shadow-xl text-sm animate-[aparecer_.2s_ease-out]">{aviso.texto}</div>}
      {cobrando && <Cobrar total={total} parcelasMax={parcelasMax} pendente={pendente} erro={erro} confirmar={confirmar} fechar={() => setCobrando(false)} />}
      {concluida && <VendaConcluida {...concluida} novaVenda={novaVenda} />}
    </div>
  );
}

function Topo({ usuario, resumo }: { usuario: Props['usuario']; resumo: Props['resumo'] }) {
  const [hora, setHora] = useState('');
  useEffect(() => {
    const t = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    t();
    const id = setInterval(t, 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="shrink-0 h-14 bg-marrom-950 text-creme flex items-center gap-4 px-4 lg:px-6">
      <Image src="/logo-dcerutti-claro.png" alt="D'Cerutti" width={96} height={44} className="h-9 w-auto" priority />
      <span className="rotulo text-areia border-l border-creme/20 pl-4">Caixa</span>
      <span className="hidden sm:inline text-sm text-areia">{usuario.nome.split(' ')[0]} · {usuario.papel === 'gestor' ? 'gestor' : 'vendedora'}</span>
      <span className="ml-auto hidden md:flex items-baseline gap-2 text-sm">
        <span className="text-areia">Hoje</span><strong className="font-display text-base">{brl(resumo.total)}</strong>
        <span className="text-areia">· {resumo.vendas} {resumo.vendas === 1 ? 'venda' : 'vendas'}</span>
      </span>
      <span className="font-display font-bold tabular-nums">{hora}</span>
      <Link href="/caixa/vendas" className="h-10 px-3 grid place-items-center rotulo !text-[0.62rem] border border-creme/25 hover:bg-creme/10">Vendas do dia</Link>
      <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
        className="hidden lg:grid h-10 px-3 place-items-center rotulo !text-[0.62rem] border border-creme/25 hover:bg-creme/10">Tela cheia</button>
      <Link href="/painel" className="hidden sm:grid h-10 px-3 place-items-center rotulo !text-[0.62rem] text-areia hover:text-creme">Painel</Link>
    </header>
  );
}

function LinhaVenda({ item, info, precoFinal, alterar, definirPreco }: {
  item: Item; info: { p: ProdutoCaixa; v: VarianteCaixa }; precoFinal: number;
  alterar: (id: number, d: number) => void; definirPreco: (id: number, preco: number | null) => void;
}) {
  const { p, v } = info;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [pct, setPct] = useState('');
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  // Os dois campos andam juntos: a % calcula o preço e o preço mostra a %.
  const porPct = (t: string) => { setPct(t); const n = lerValor(t); if (n >= 0 && n <= 100) setTexto(fmt(Math.round(p.preco * (100 - n)) / 100)); };
  const porPreco = (t: string) => { setTexto(t); const n = lerValor(t); if (n >= 0 && n <= p.preco) setPct(String(Math.round((1 - n / p.preco) * 1000) / 10).replace('.', ',')); };
  const combinado = item.precoCombinado != null && item.precoCombinado < p.preco;
  const aplicar = (preco: number | null) => { definirPreco(v.id, preco); setEditando(false); };
  return (
    <li className="px-5 py-3 grid gap-2">
      <div className="grid grid-cols-[48px_1fr_auto] gap-3 items-center">
        <div className="relative aspect-[3/4] bg-bege"><Foto src={p.imagem} alt="" sizes="48px" /></div>
        <div className="min-w-0 text-sm">
          <div className="text-marrom-950 line-clamp-1">{p.nome}</div>
          <div className="text-xs text-suave">Tam. <strong className="text-marrom-950">{v.tamanho}</strong>{p.corNome ? ` · ${p.corNome}` : ''} · Cód. {v.codigoInterno ?? '—'}</div>
          <button type="button" onClick={() => { const atual = item.precoCombinado ?? p.preco; setTexto(fmt(atual)); setPct(String(Math.round((1 - atual / p.preco) * 1000) / 10).replace('.', ',')); setEditando(e => !e); }} className="text-xs underline underline-offset-4 text-caramelo">
            {combinado ? <><s className="text-suave">{brl(p.preco)}</s> {brl(item.precoCombinado!)} · mudar</> : `${brl(p.preco)} · dar desconto`}
          </button>
        </div>
        <div className="grid justify-items-end gap-1">
          <div className="flex items-center border border-borda-forte bg-creme" aria-label="Quantidade">
            <button type="button" className="size-10 text-lg" onClick={() => alterar(v.id, -1)} aria-label="Diminuir">−</button>
            <span className="w-7 text-center font-display font-bold">{item.quantidade}</span>
            <button type="button" className="size-10 text-lg disabled:opacity-30" disabled={item.quantidade >= v.disponivel} onClick={() => alterar(v.id, 1)} aria-label="Aumentar">+</button>
          </div>
          <span className="font-display font-extrabold text-sm">{brl(precoFinal * item.quantidade)}</span>
        </div>
      </div>
      {editando && (
        <div className="flex flex-wrap items-center gap-2 bg-creme border border-borda p-2">
          <label className="flex items-center gap-1 text-xs text-suave">Desconto
            <span className="flex items-center border border-borda-forte bg-card focus-within:border-marrom-950">
              <input autoFocus inputMode="decimal" value={pct} onChange={e => porPct(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicar(lerValor(texto) >= 0 ? lerValor(texto) : null)}
                className="w-14 h-9 px-2 bg-transparent outline-none font-display font-bold text-marrom-950" aria-label="Desconto da peça em %" />
              <span className="pr-2 font-display font-bold text-marrom-950">%</span>
            </span>
          </label>
          <label className="flex items-center gap-1 text-xs text-suave">ou preço
            <span className="flex items-center border border-borda-forte bg-card focus-within:border-marrom-950">
              <span className="pl-2 text-suave">R$</span>
              <input inputMode="decimal" value={texto} onChange={e => porPreco(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicar(lerValor(texto) >= 0 ? lerValor(texto) : null)}
                className="w-20 h-9 px-1 bg-transparent outline-none font-display font-bold text-marrom-950" aria-label="Novo preço por peça" />
            </span>
          </label>
          <button type="button" onClick={() => aplicar(lerValor(texto) >= 0 ? lerValor(texto) : null)} className="h-9 px-3 bg-marrom-950 text-creme rotulo !text-[0.6rem]">Aplicar</button>
          {combinado && <button type="button" onClick={() => aplicar(null)} className="h-9 px-2 text-xs text-suave underline">Voltar ao preço</button>}
        </div>
      )}
    </li>
  );
}

function BlocoCliente({ cliente, escolher, gestor, vendedorId }: { cliente: ClienteCaixa | null; escolher: (c: ClienteCaixa | null) => void; gestor: boolean; vendedorId: string }) {
  const [q, setQ] = useState('');
  const [achados, setAchados] = useState<ClienteCaixa[]>([]);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    let atual = true;
    const t = setTimeout(() => buscarClientesCaixa(q).then(r => { if (atual) setAchados(r); }).catch(() => {}), 250);
    return () => { atual = false; clearTimeout(t); };
  }, [q]);

  if (cliente)
    return (
      <div className="flex items-center justify-between gap-3 bg-oliva/10 border border-oliva/40 px-3 py-2">
        <div className="min-w-0"><div className="rotulo !text-[0.6rem] text-oliva">Cliente</div><div className="text-sm text-marrom-950 truncate">{cliente.nome}</div><div className="text-xs text-suave">{cliente.telefone}</div></div>
        <button type="button" onClick={() => escolher(null)} className="text-sm underline underline-offset-4 text-suave shrink-0">Trocar</button>
      </div>
    );

  if (novo)
    return (
      <form className="grid gap-2 border border-borda p-3 bg-creme" onSubmit={e => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await cadastrarClienteCaixa({ nome, telefone: fone, vendedorId: gestor ? vendedorId || undefined : undefined });
          if (!r.ok) return setErro(r.erro);
          escolher(r.cliente);
          setNovo(false); setNome(''); setFone('');
        });
      }}>
        <span className="rotulo !text-[0.62rem] text-suave">Cadastro rápido</span>
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" className="h-11 px-3 border border-borda-forte bg-card" />
        <input value={fone} onChange={e => setFone(formatarTelefone(e.target.value))} inputMode="tel" placeholder="WhatsApp (49) 99999-9999" className="h-11 px-3 border border-borda-forte bg-card" />
        {erro && <p className="text-xs text-vermelho">{erro}</p>}
        <div className="flex gap-2">
          <button disabled={pendente} className="flex-1 h-11 bg-marrom-950 text-creme rotulo !text-[0.62rem]">{pendente ? 'Salvando…' : 'Cadastrar e usar'}</button>
          <button type="button" onClick={() => setNovo(false)} className="h-11 px-3 text-sm text-suave">Cancelar</button>
        </div>
      </form>
    );

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="rotulo !text-[0.62rem] text-suave">Cliente</span>
        <span className="text-xs text-suave">Sem escolher: consumidor final</span>
      </div>
      <div className="relative">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou WhatsApp" className="w-full h-11 px-3 border border-borda-forte bg-creme outline-none focus:border-marrom-950" />
        {q.trim().length >= 2 && (
          <ul className="absolute z-10 inset-x-0 top-full mt-1 bg-card border border-borda shadow-lg max-h-64 overflow-y-auto">
            {achados.map(c => (
              <li key={c.id}><button type="button" onClick={() => { escolher(c); setQ(''); setAchados([]); }} className="w-full text-left px-3 py-2 hover:bg-creme">
                <span className="block text-sm text-marrom-950">{c.nome}</span><span className="block text-xs text-suave">{c.telefone}{gestor ? ` · ${c.vendedor}` : ''}</span>
              </button></li>
            ))}
            <li><button type="button" onClick={() => { setNovo(true); setNome(/\d/.test(q) ? '' : q); setFone(/\d/.test(q) ? formatarTelefone(q) : ''); setQ(''); }} className="w-full text-left px-3 py-3 text-sm text-caramelo border-t border-borda hover:bg-creme">+ Cadastrar “{q.trim()}”</button></li>
          </ul>
        )}
      </div>
      <button type="button" onClick={() => setNovo(true)} className="justify-self-start text-xs text-marrom-950 underline underline-offset-4">+ Cadastrar cliente nova</button>
    </div>
  );
}

function DescontoGeralCampo({ geral, mudar }: { geral: DescontoGeral; mudar: (g: DescontoGeral) => void }) {
  const [tipo, setTipo] = useState<'percentual' | 'valor'>(geral?.tipo ?? 'percentual');
  const [texto, setTexto] = useState(geral ? String(geral.valor).replace('.', ',') : '');
  const aplicar = (t: string, ti = tipo) => { setTexto(t); const n = lerValor(t); mudar(n > 0 ? { tipo: ti, valor: n } : null); };
  return (
    <label className="grid gap-1">
      <span className="rotulo !text-[0.62rem] text-suave">Desconto na venda</span>
      <div className="flex border border-borda-forte bg-creme focus-within:border-marrom-950">
        <input inputMode="decimal" value={texto} onChange={e => aplicar(e.target.value)} placeholder="0" className="w-full min-w-0 h-11 px-3 bg-transparent outline-none" aria-label="Valor do desconto" />
        <button type="button" onClick={() => { const t = tipo === 'percentual' ? 'valor' : 'percentual'; setTipo(t); aplicar(texto, t); }} className="shrink-0 w-12 border-l border-borda-forte font-display font-bold text-sm" aria-label="Trocar entre % e R$">{tipo === 'percentual' ? '%' : 'R$'}</button>
      </div>
    </label>
  );
}

function Valor({ rotulo, valor, cor = '' }: { rotulo: string; valor: string; cor?: string }) {
  return <div className={`flex justify-between text-sm ${cor}`}><span>{rotulo}</span><span>{valor}</span></div>;
}
