'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { buscarPecas, cupomDoPedido, editarItens, type PecaSelecao } from '@/server/acoes/pedidos';
import type { CorDoModelo } from '@/server/consultas/pedidos';
import { Foto } from '@/components/loja/foto';
import { Alerta, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { Popup } from '@/components/ui/popup';
import { brl, lerValor } from '@/lib/dinheiro';
import type { LinhaEdicao } from '@/server/pedidos';

export type ItemEdicao = {
  id: number; varianteId: number; produtoId: number; referencia: string; nome: string; marca: string; cor: string | null; imagem: string | null;
  tamanho: string; codigoInterno: string | null; quantidade: number; preco: number; precoTabela: number | null; linkProduto: string | null;
};

type Salvar = (linhas: LinhaEdicao[], observacao?: string) => Promise<string | null>;

/** Cupom no pedido (fase 3): o atual, os que a equipe pode aplicar para esta cliente e se pode aplicar. */
export type CupomDoPedido = {
  atual: { codigo: string; beneficio: string; desconto: number; freteGratis: boolean } | null;
  disponiveis: { codigo: string; regra: string }[];
  podeAplicar: boolean;
};

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Desconto em % de um preço sobre o do catálogo (até 2 casas, sem zeros sobrando); '' sem desconto. */
const pctDe = (preco: number, tabela: number) => (tabela > 0 && preco < tabela ? String(Math.round((1 - preco / tabela) * 10000) / 100).replace('.', ',') : '');
/** % digitado: número entre 0 e 99,99 (vazio = 0), ou null se inválido. */
const lerPct = (t: string) => { const n = t.trim() ? lerValor(t) : 0; return Number.isFinite(n) && n >= 0 && n < 100 ? n : null; };
const comDesconto = (tabela: number, pct: number) => centavos(tabela * (1 - pct / 100));
const tabelaDe = (i: ItemEdicao) => i.precoTabela ?? i.preco;
const linhaDe = (i: ItemEdicao): LinhaEdicao => ({ itemId: i.id, varianteId: i.varianteId, quantidade: i.quantidade, preco: i.preco });

/**
 * U-08: peças de um pedido pendente. Cada card mostra cor, tamanho, quantidade e desconto só para leitura; o botão
 * Editar abre um popup para mudar a peça (com o preço final na hora). O desconto geral aplica o mesmo % em todas.
 * Cada alteração vai para o histórico do pedido.
 */
export function PecasDoPedido({ pedidoId, itens, cores, cupom }: { pedidoId: string; itens: ItemEdicao[]; cores: Record<number, CorDoModelo[]>; cupom?: CupomDoPedido }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | 'geral' | 'incluir' | 'cupom' | null>(null);
  const [, iniciar] = useTransition();

  const salvar: Salvar = (linhas, observacao) =>
    new Promise(resolve =>
      iniciar(async () => {
        const r = await editarItens(pedidoId, { linhas, observacao: observacao || undefined });
        if (!r.ok) return resolve(r.erro ?? 'Não foi possível salvar.');
        setAviso(r.url ?? null);
        setEditando(null);
        router.refresh();
        resolve(null);
      }),
    );

  const item = typeof editando === 'number' ? itens.find(i => i.id === editando) : undefined;

  return (
    <div className="grid gap-4">
      {aviso && <Alerta tipo="ok">Pedido atualizado. <a href={aviso} data-acao="pedido" data-pedido={pedidoId} target="_blank" rel="noopener" className="underline underline-offset-4 font-semibold">Avisar a cliente pelo WhatsApp</a></Alerta>}
      <ul className="divide-y divide-borda">
        {itens.map(i => <CardPeca key={i.id} item={i} editar={() => setEditando(i.id)} />)}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditando('incluir')} className={botao('secundario', 'p')}>+ Incluir peça</button>
        <button type="button" onClick={() => setEditando('geral')} className={botao('secundario', 'p')}>Desconto geral</button>
        {cupom && (cupom.podeAplicar || cupom.atual) && (
          <button type="button" onClick={() => setEditando('cupom')} className={botao('secundario', 'p')}>{cupom.atual ? `Cupom ${cupom.atual.codigo}` : 'Cupom'}</button>
        )}
      </div>

      {item && (
        <Popup titulo="Editar peça" fechar={() => setEditando(null)}>
          <EditorPeca item={item} cores={cores[item.produtoId] ?? []} sozinha={itens.length === 1} cancelar={() => setEditando(null)}
            ocupadas={new Set(itens.filter(o => o.id !== item.id).map(o => o.varianteId))}
            salvar={(linha, obs) => salvar(itens.flatMap(o => (o.id !== item.id ? [linhaDe(o)] : linha ? [linha] : [])), obs)} />
        </Popup>
      )}
      {editando === 'geral' && (
        <Popup titulo="Desconto geral" fechar={() => setEditando(null)}>
          <EditorDescontoGeral itens={itens} salvar={salvar} cancelar={() => setEditando(null)} />
        </Popup>
      )}
      {editando === 'cupom' && cupom && (
        <Popup titulo="Cupom do pedido" fechar={() => setEditando(null)}>
          <EditorCupom cupom={cupom} cancelar={() => setEditando(null)}
            salvar={(codigo, obs) => new Promise(resolve => iniciar(async () => {
              const r = await cupomDoPedido(pedidoId, codigo, obs);
              if (!r.ok) return resolve(r.erro ?? 'Não foi possível salvar.');
              setAviso(r.url ?? null);
              setEditando(null);
              router.refresh();
              resolve(null);
            }))} />
        </Popup>
      )}
      {editando === 'incluir' && (
        <Popup titulo="Incluir peça" fechar={() => setEditando(null)} largura="max-w-3xl">
          <Incluir itens={itens} salvar={salvar} cancelar={() => setEditando(null)} />
        </Popup>
      )}
    </div>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="rotulo text-suave !text-[0.6rem]">{rotulo}</span>
      <span className="font-semibold text-marrom-950">{children}</span>
    </span>
  );
}

/** Peça como está no pedido, só para leitura, com o botão de editar. */
function CardPeca({ item, editar }: { item: ItemEdicao; editar: () => void }) {
  const tabela = tabelaDe(item);
  const pct = pctDe(item.preco, tabela);
  return (
    <li className="py-4 grid grid-cols-[64px_1fr] gap-4 items-start">
      <div className="relative aspect-[3/4] bg-bege"><Foto src={item.imagem} alt={item.nome} sizes="64px" /></div>
      <div className="grid gap-2 min-w-0 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.linkProduto ? <Link href={item.linkProduto} className="text-marrom-950 font-semibold hover:underline">{item.nome}</Link> : <span className="text-marrom-950 font-semibold">{item.nome}</span>}
            <div className="text-suave">{item.marca} · Ref. {item.referencia}{item.codigoInterno ? ` · Cód. ${item.codigoInterno}` : ''}</div>
          </div>
          <button type="button" onClick={editar} aria-label={`Editar ${item.nome}`} className={botao('secundario', 'p', 'shrink-0')}>Editar</button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Info rotulo="Cor">{item.cor ?? '—'}</Info>
          <Info rotulo="Tamanho">{item.tamanho}</Info>
          <Info rotulo="Qtd.">{item.quantidade}</Info>
          <Info rotulo="Desconto">{pct ? `${pct}%` : '—'}</Info>
        </div>
        <Preco quantidade={item.quantidade} preco={item.preco} tabela={tabela} />
      </div>
    </li>
  );
}

function Preco({ quantidade, preco, tabela }: { quantidade: number; preco: number; tabela: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-2">
      <span className="flex flex-wrap items-center gap-2">
        <span>{quantidade} x {preco < tabela && <s className="text-suave mr-1">{brl(tabela)}</s>}<strong>{brl(preco)}</strong></span>
        {preco < tabela && <Etiqueta cor="oliva">−{brl(centavos((tabela - preco) * quantidade))}</Etiqueta>}
      </span>
      <span className="font-display font-extrabold text-base">{brl(centavos(preco * quantidade))}</span>
    </div>
  );
}

function Rodape({ erro, salvando, podeSalvar, salvar, cancelar, rotulo = 'Salvar', perigo = false }: {
  erro: string | null; salvando: boolean; podeSalvar: boolean; salvar: () => void; cancelar: () => void; rotulo?: string; perigo?: boolean;
}) {
  return (
    <>
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-borda pt-4">
        <button type="button" disabled={salvando} onClick={cancelar} className={botao('fantasma', 'm')}>Cancelar</button>
        <button type="button" disabled={salvando || !podeSalvar} onClick={salvar} className={botao(perigo ? 'perigo' : 'primario', 'm')}>{salvando ? 'Salvando…' : rotulo}</button>
      </div>
    </>
  );
}

/** Popup de uma peça: cor, tamanho, quantidade e desconto, com o preço final na hora; também retira a peça. */
function EditorPeca({ item, cores, sozinha, ocupadas, salvar, cancelar }: {
  item: ItemEdicao; cores: CorDoModelo[]; sozinha: boolean; ocupadas: Set<number>;
  salvar: (linha: LinhaEdicao | null, observacao?: string) => Promise<string | null>; cancelar: () => void;
}) {
  const tabelaOriginal = tabelaDe(item);
  // A cor da linha pode ter saído do catálogo: nesse caso ela aparece só com o tamanho atual.
  const opcoes: CorDoModelo[] = cores.some(c => c.id === item.produtoId)
    ? cores
    : [{ id: item.produtoId, referencia: item.referencia, nome: item.nome, cor: item.cor, preco: tabelaOriginal, imagem: item.imagem, variantes: [{ id: item.varianteId, tamanho: item.tamanho, disponivel: 0, codigoInterno: item.codigoInterno }] }, ...cores];

  const [produtoId, setProdutoId] = useState(item.produtoId);
  const [varianteId, setVarianteId] = useState(item.varianteId);
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const [pct, setPct] = useState(pctDe(item.preco, tabelaOriginal));
  const [pctMexido, setPctMexido] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [retirando, setRetirando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const cor = opcoes.find(c => c.id === produtoId)!;
  const variante = cor.variantes.find(v => v.id === varianteId);
  const tabela = produtoId === item.produtoId ? tabelaOriginal : cor.preco;
  const p = lerPct(pct);
  // Sem mexer no desconto nem na cor, mantém o preço combinado; senão calcula o % sobre o preço do catálogo.
  const preco = !pctMexido && produtoId === item.produtoId ? item.preco : p != null ? comDesconto(tabela, p) : item.preco;
  const mudou = varianteId !== item.varianteId || quantidade !== item.quantidade || preco !== item.preco;

  const trocarCor = (id: number) => {
    const nova = opcoes.find(c => c.id === id)!;
    const mesmoTam = nova.variantes.find(v => v.tamanho === variante?.tamanho) ?? nova.variantes.find(v => v.disponivel > 0) ?? nova.variantes[0];
    setProdutoId(id);
    if (mesmoTam) setVarianteId(mesmoTam.id);
    setPctMexido(true); // o mesmo % vale sobre o preço da nova cor
  };
  const confirmar = async () => {
    setErro(null);
    if (!retirando && ocupadas.has(varianteId)) return setErro('Essa cor e tamanho já estão em outra peça do pedido: ajuste a quantidade lá.');
    if (p == null) return setErro('Desconto entre 0 e 99%.');
    setSalvando(true);
    const e = await salvar(retirando ? null : { itemId: item.id, varianteId, quantidade, preco }, observacao);
    setSalvando(false);
    if (e) setErro(e);
  };

  const motivo = <input value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 500))} placeholder="Motivo (opcional, fica no histórico)" aria-label="Motivo da alteração" className={classeCampo} />;

  if (retirando)
    return (
      <>
        <p className="text-sm">Retirar <strong>{item.nome}</strong> (tam. {item.tamanho}, {item.quantidade} un.) do pedido? No condicional, a reserva volta para o estoque.</p>
        {motivo}
        <Rodape erro={erro} salvando={salvando} podeSalvar salvar={confirmar} cancelar={() => setRetirando(false)} rotulo="Retirar peça" perigo />
      </>
    );

  return (
    <>
      <div className="grid grid-cols-[56px_1fr] gap-3 items-center text-sm">
        <div className="relative aspect-[3/4] bg-bege"><Foto src={cor.imagem} alt={cor.nome} sizes="56px" /></div>
        <div className="min-w-0">
          <div className="font-semibold">{cor.nome}</div>
          <div className="text-suave">Ref. {cor.referencia}{variante?.codigoInterno ? ` · Cód. ${variante.codigoInterno}` : ''}</div>
        </div>
      </div>

      {opcoes.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="rotulo text-suave mb-2">Cor {cor.cor && <span className="normal-case tracking-normal text-marrom-950">· {cor.cor}</span>}</legend>
          <div className="flex flex-wrap gap-2">
            {opcoes.map(c => (
              <button key={c.id} type="button" onClick={() => trocarCor(c.id)} aria-pressed={c.id === produtoId} aria-label={`Cor ${c.cor ?? c.referencia}`} title={`${c.cor ?? c.nome} · Ref. ${c.referencia} · ${brl(c.preco)}`}
                className={`relative w-10 aspect-[3/4] bg-bege border-2 ${c.id === produtoId ? 'border-marrom-950' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                <Foto src={c.imagem} alt="" sizes="40px" />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-2">
        <legend className="rotulo text-suave mb-2">Tamanho <span className="normal-case tracking-normal text-suave">· riscado = sem estoque</span></legend>
        <div className="flex flex-wrap gap-1">
          {cor.variantes.map(v => (
            <button key={v.id} type="button" onClick={() => setVarianteId(v.id)} aria-pressed={v.id === varianteId} title={`${v.disponivel} disponível(is)`}
              className={`min-w-10 h-9 px-2 border text-sm font-display font-bold ${v.id === varianteId ? 'bg-marrom-950 text-creme border-marrom-950' : v.disponivel > 0 || v.id === item.varianteId ? 'border-borda-forte hover:bg-bege' : 'border-borda text-suave line-through'}`}>
              {v.tamanho}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <span className="rotulo text-suave">Quantidade</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Menos uma unidade" disabled={quantidade <= 1} onClick={() => setQuantidade(q => q - 1)} className="size-9 border border-borda-forte bg-card disabled:opacity-40">−</button>
            <span className="w-8 text-center tabular-nums" aria-label="Quantidade">{quantidade}</span>
            <button type="button" aria-label="Mais uma unidade" disabled={quantidade >= 20} onClick={() => setQuantidade(q => q + 1)} className="size-9 border border-borda-forte bg-card disabled:opacity-40">+</button>
          </div>
        </div>
        <label className="grid gap-2">
          <span className="rotulo text-suave">Desconto</span>
          <span className="flex items-center gap-1">
            <input value={pct} onChange={e => { setPct(e.target.value); setPctMexido(true); }} inputMode="decimal" placeholder="0" aria-label="Desconto em %"
              className={`${classeCampo} !h-9 !w-20 !px-2 text-right tabular-nums ${p == null ? '!border-vermelho' : ''}`} />
            %
          </span>
        </label>
      </div>

      <div className="text-sm"><Preco quantidade={quantidade} preco={preco} tabela={tabela} /></div>
      {motivo}
      {!sozinha && <button type="button" onClick={() => { setErro(null); setRetirando(true); }} className="justify-self-start rotulo !text-[0.6rem] underline underline-offset-4 text-vermelho">Retirar peça do pedido</button>}
      <Rodape erro={erro} salvando={salvando} podeSalvar={mudou && p != null} salvar={confirmar} cancelar={cancelar} />
    </>
  );
}

/** Popup do desconto geral: o mesmo % em todas as peças, sobre o preço do catálogo de cada uma. */
function EditorDescontoGeral({ itens, salvar, cancelar }: { itens: ItemEdicao[]; salvar: Salvar; cancelar: () => void }) {
  const tabela = centavos(itens.reduce((a, i) => a + tabelaDe(i) * i.quantidade, 0));
  const atual = centavos(itens.reduce((a, i) => a + i.preco * i.quantidade, 0));
  const [pct, setPct] = useState(pctDe(atual, tabela));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const p = lerPct(pct);
  const novo = p == null ? atual : centavos(itens.reduce((a, i) => a + comDesconto(tabelaDe(i), p) * i.quantidade, 0));

  const confirmar = async () => {
    if (p == null) return setErro('Desconto entre 0 e 99%.');
    setErro(null);
    setSalvando(true);
    const e = await salvar(itens.map(i => ({ ...linhaDe(i), preco: comDesconto(tabelaDe(i), p) })), p ? `Desconto geral de ${pct.trim()}%` : 'Desconto geral retirado');
    setSalvando(false);
    if (e) setErro(e);
  };

  return (
    <>
      <label className="grid gap-2">
        <span className="rotulo text-suave">Desconto em todas as peças</span>
        <span className="flex items-center gap-1">
          <input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Desconto geral em %" autoFocus
            className={`${classeCampo} !h-10 !w-24 !px-2 text-right tabular-nums ${p == null ? '!border-vermelho' : ''}`} />
          %
        </span>
      </label>
      <div className="text-sm grid gap-1">
        <div className="flex justify-between text-suave"><span>Peças pelo preço do catálogo</span><span>{brl(tabela)}</span></div>
        {novo < tabela && <div className="flex justify-between text-oliva"><span>Desconto</span><span>−{brl(centavos(tabela - novo))}</span></div>}
        <div className="flex justify-between font-display font-extrabold text-lg border-t border-borda pt-2"><span>Total das peças</span><span>{brl(novo)}</span></div>
      </div>
      <p className="text-xs text-suave">Substitui o desconto de cada peça. Para uma peça só, use o Editar dela.</p>
      <Rodape erro={erro} salvando={salvando} podeSalvar={p != null && novo !== atual} salvar={confirmar} cancelar={cancelar} />
    </>
  );
}

/** Popup de incluir peça: busca no catálogo; a peça entra pelo preço do catálogo. */
function Incluir({ itens, salvar, cancelar }: { itens: ItemEdicao[]; salvar: Salvar; cancelar: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<PecaSelecao[]>([]);
  const [escolhida, setEscolhida] = useState<{ p: PecaSelecao; v: PecaSelecao['variantes'][number] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    let atual = true;
    const t = setTimeout(() => buscarPecas(busca).then(r => { if (atual) setResultados(r); }).catch(() => {}), busca ? 250 : 0);
    return () => { atual = false; clearTimeout(t); };
  }, [busca]);

  const confirmar = async () => {
    if (!escolhida) return;
    if (itens.some(i => i.varianteId === escolhida.v.id)) return setErro('Essa peça e tamanho já estão no pedido: aumente a quantidade no Editar dela.');
    setErro(null);
    setSalvando(true);
    const e = await salvar([...itens.map(linhaDe), { varianteId: escolhida.v.id, quantidade: 1, preco: escolhida.p.preco }]);
    setSalvando(false);
    if (e) setErro(e);
  };

  return (
    <>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar peça: nome, referência ou categoria…" aria-label="Buscar peça para incluir" className={classeCampo} autoFocus />
      <div className="grid sm:grid-cols-2 gap-3 max-h-[50dvh] overflow-y-auto">
        {resultados.map(p => (
          <div key={p.id} className="grid grid-cols-[48px_1fr] gap-3">
            <div className="relative aspect-[3/4] bg-bege"><Foto src={p.imagem} alt={p.nome} sizes="48px" /></div>
            <div className="min-w-0 grid gap-1">
              <span className="text-sm leading-snug line-clamp-2">{p.nome}</span>
              <span className="text-xs text-suave">Ref. {p.referencia}{p.cor ? ` · ${p.cor}` : ''} · {brl(p.preco)}</span>
              <div className="flex flex-wrap gap-1">
                {p.variantes.map(v => (
                  <button key={v.id} type="button" onClick={() => setEscolhida({ p, v })} aria-pressed={escolhida?.v.id === v.id} title={`${v.disponivel} disponível(is)`}
                    className={`min-w-9 h-8 px-2 border text-sm font-display font-bold ${escolhida?.v.id === v.id ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte hover:bg-bege'}`}>
                    {v.tamanho}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {!resultados.length && <p className="text-suave text-sm">Nenhuma peça encontrada.</p>}
      </div>
      {escolhida && <p className="text-sm">Incluir <strong>{escolhida.p.nome}</strong> · tam. {escolhida.v.tamanho} · {brl(escolhida.p.preco)}</p>}
      <Rodape erro={erro} salvando={salvando} podeSalvar={!!escolhida} salvar={confirmar} cancelar={cancelar} rotulo="Incluir peça" />
    </>
  );
}

/** Popup do cupom: aplicar (digitando ou escolhendo um disponível), trocar ou retirar. A regra é conferida no servidor. */
function EditorCupom({ cupom, salvar, cancelar }: { cupom: CupomDoPedido; salvar: (codigo: string | null, observacao?: string) => Promise<string | null>; cancelar: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviar = async (c: string | null) => {
    setErro(null);
    setSalvando(true);
    const e = await salvar(c, observacao || undefined);
    setSalvando(false);
    if (e) setErro(e);
  };
  return (
    <>
      {cupom.atual ? (
        <div className="grid gap-2 border border-oliva bg-oliva/5 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Cupom <strong className="font-display tracking-wide">{cupom.atual.codigo}</strong> · {cupom.atual.freteGratis ? 'frete grátis' : `−${brl(cupom.atual.desconto)}`}</span>
            <button type="button" disabled={salvando} onClick={() => enviar(null)} className={botao('perigo', 'p')}>Retirar cupom</button>
          </div>
          <span className="text-suave">{cupom.atual.beneficio}</span>
        </div>
      ) : (
        <p className="text-sm text-suave">O pedido não tem cupom. O desconto do cupom soma com o desconto do vendedor.</p>
      )}
      {cupom.podeAplicar ? (
        <>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (codigo.trim()) enviar(codigo); }}>
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder={cupom.atual ? 'Trocar por outro código' : 'Código do cupom'} aria-label="Código do cupom" maxLength={30} className={`${classeCampo} flex-1 uppercase`} autoFocus />
            <button type="submit" disabled={salvando || !codigo.trim()} className={botao('primario', 'm')}>{salvando ? 'Aplicando…' : 'Aplicar'}</button>
          </form>
          {cupom.disponiveis.length > 0 && (
            <div className="grid gap-1">
              <span className="rotulo text-suave">Disponíveis para esta cliente</span>
              <ul className="grid gap-1 max-h-56 overflow-y-auto">
                {cupom.disponiveis.map(c => (
                  <li key={c.codigo}>
                    <button type="button" disabled={salvando || c.codigo === cupom.atual?.codigo} onClick={() => enviar(c.codigo)}
                      className="w-full text-left border border-borda px-3 py-2 text-sm hover:bg-bege disabled:opacity-50">
                      <strong className="font-display tracking-wide">{c.codigo}</strong> <span className="text-suave">· {c.regra}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-suave">Aplicar cupom não está liberado agora. Você ainda pode retirar o cupom atual.</p>
      )}
      <input value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 500))} placeholder="Motivo (opcional, fica no histórico)" aria-label="Motivo da alteração" className={classeCampo} />
      {erro && <Alerta>{erro}</Alerta>}
      <div className="flex justify-end border-t border-borda pt-4">
        <button type="button" disabled={salvando} onClick={cancelar} className={botao('fantasma', 'm')}>Fechar</button>
      </div>
    </>
  );
}
