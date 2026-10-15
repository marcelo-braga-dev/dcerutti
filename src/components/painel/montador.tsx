'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { buscarPecas, criarSelecao, type PecaSelecao } from '@/server/acoes/pedidos';
import { Foto } from '@/components/loja/foto';
import { Alerta, Cartao } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import type { VarianteCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';

type Produto = PecaSelecao;
type Linha = { variante: VarianteCatalogo; produto: Produto; quantidade: number };

type Tipo = 'compra' | 'condicional' | 'balcao';

/** Cupons que a equipe pode aplicar (fase 3); `clientes` null = qualquer cliente. */
export type CupomMontador = { codigo: string; regra: string; clientes: string[] | null };

export function Montador({ clientes, iniciais, clienteInicial, vendedor, tipoInicial = 'compra', cupons, buscaInicial = '' }: { clientes: { id: string; nome: string; telefone: string }[]; iniciais: Produto[]; clienteInicial: string; vendedor: string; tipoInicial?: Tipo; cupons?: CupomMontador[]; buscaInicial?: string }) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(clienteInicial);
  const [busca, setBusca] = useState(buscaInicial);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cupom, setCupom] = useState('');
  const cuponsDaCliente = (cupons ?? []).filter(c => !c.clientes || c.clientes.includes(clienteId));
  const [etapa, setEtapa] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [resultados, setResultados] = useState<Produto[]>(iniciais);
  // Busca no servidor (o catálogo inteiro não vem para o navegador), 250 ms depois da última tecla.
  useEffect(() => {
    let atual = true;
    const t = setTimeout(() => buscarPecas(busca).then(r => { if (atual) setResultados(r); }).catch(() => {}), busca ? 250 : 0);
    return () => { atual = false; clearTimeout(t); };
  }, [busca]);

  const adicionar = (produto: Produto, variante: VarianteCatalogo) => {
    setErro(null);
    setLinhas(ls => {
      const ex = ls.find(l => l.variante.id === variante.id);
      if (ex) return ls.map(l => (l.variante.id === variante.id ? { ...l, quantidade: Math.min(variante.disponivel, l.quantidade + 1) } : l));
      return [...ls, { produto, variante, quantidade: 1 }];
    });
  };
  const alterar = (id: number, d: number) => setLinhas(ls => ls.map(l => (l.variante.id === id ? { ...l, quantidade: Math.min(l.variante.disponivel, l.quantidade + d) } : l)).filter(l => l.quantidade > 0));
  const total = linhas.reduce((a, l) => a + l.produto.preco * l.quantidade, 0);
  const pecas = linhas.reduce((a, l) => a + l.quantidade, 0);

  const salvar = (enviar: boolean) => {
    if (!clienteId) return setErro('Escolha o cliente.');
    if (!linhas.length) return setErro('Adicione pelo menos uma peça.');
    if (tipo === 'balcao') enviar = false; // venda na loja: registra e baixa o estoque, sem WhatsApp
    const aba = enviar && !navigator.canShare ? window.open('', '_blank') : null;
    iniciar(async () => {
      setEtapa(tipo === 'balcao' ? 'Registrando venda…' : 'Salvando pedido…');
      const r = await criarSelecao({ clienteId, tipo, cupom: cupom.trim() || undefined, linhas: linhas.map(l => ({ varianteId: l.variante.id, quantidade: l.quantidade })) });
      if (!r.ok) { aba?.close(); setEtapa(null); return setErro(r.erro); }
      if (enviar) {
        setEtapa('Gerando imagem…');
        const imagem = await gerarImagemPedido({
          selo: tipo === 'condicional' ? 'CONDICIONAL' : 'SELEÇÃO PARA VOCÊ', codigo: r.codigo, titulo: `Olá, ${r.nomeCliente.split(' ')[0]}`,
          subtitulo: `${vendedor.split(' ')[0]} separou estas peças para você`, rodape: 'PAGAMENTO E ENTREGA A COMBINAR', itens: r.itens,
        });
        const texto = r.texto;
        const podeCompartilhar = imagem && navigator.canShare?.({ files: [new File([imagem], `${r.codigo}.png`, { type: 'image/png' })] });
        if (imagem && podeCompartilhar) {
          // Celular: compartilha imagem + texto de uma vez; a pessoa escolhe o contato no WhatsApp.
          const enviado = await compartilharImagem(imagem, r.codigo, texto);
          if (!enviado) window.open(r.url, '_blank');
        } else {
          // Computador: baixa a imagem e abre o WhatsApp Web com o texto.
          if (imagem) await compartilharImagem(imagem, r.codigo);
          if (aba) aba.location.href = r.url; else window.open(r.url, '_blank');
        }
      }
      router.push(`/painel/pedidos/${r.pedidoId}`);
    });
  };

  return (
    <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6 items-start">
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="rotulo text-suave">Cliente</span>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setErro(null); }} className={classeCampo}>
            <option value="">Escolha o cliente…</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.telefone}</option>)}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="rotulo text-suave">Buscar peça</span>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência ou categoria…" className={classeCampo} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          {resultados.map(p => (
            <Cartao key={p.id} className="p-3 grid grid-cols-[64px_1fr] gap-3">
              <div className="relative aspect-[3/4] bg-bege"><Foto src={p.imagem} alt={p.nome} sizes="64px" /></div>
              <div className="min-w-0">
                <div className="text-sm text-marrom-950 leading-snug line-clamp-2">{p.nome}</div>
                <div className="text-xs text-suave">Ref. {p.referencia} · {brl(p.preco)}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.variantes.map(v => (
                    <button key={v.id} type="button" onClick={() => adicionar(p, v)} title={`Cód. ${v.codigoInterno ?? '—'} · ${v.disponivel} em estoque`}
                      className="min-w-9 h-8 px-2 border border-borda-forte text-sm font-display font-bold hover:bg-marrom-950 hover:text-creme">
                      {v.tamanho}
                    </button>
                  ))}
                </div>
              </div>
            </Cartao>
          ))}
          {!resultados.length && <p className="text-suave text-sm">Nenhuma peça encontrada.</p>}
        </div>
      </div>

      <Cartao className="p-5 xl:sticky xl:top-8 grid gap-4">
        <div className="flex justify-between items-baseline">
          <h2 className="titulo text-lg">Seleção</h2>
          <span className="text-sm text-suave">{pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'Vazia'}</span>
        </div>
        {linhas.length === 0 ? (
          <p className="text-sm text-suave">Clique no tamanho de uma peça para adicionar.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {linhas.map(l => (
              <li key={l.variante.id} className="py-3 grid grid-cols-[48px_1fr_auto] gap-3 items-center">
                <div className="relative aspect-[3/4] bg-bege"><Foto src={l.produto.imagem} alt="" sizes="48px" /></div>
                <div className="text-sm min-w-0">
                  <div className="truncate">{l.produto.nome}</div>
                  <div className="text-suave">Tam. {l.variante.tamanho}{l.variante.codigoInterno ? ` · Cód. ${l.variante.codigoInterno}` : ''}</div>
                </div>
                <div className="flex items-center border border-borda-forte">
                  <button type="button" className="size-8" onClick={() => alterar(l.variante.id, -1)} aria-label="Diminuir">−</button>
                  <span className="w-6 text-center text-sm font-bold">{l.quantidade}</span>
                  <button type="button" className="size-8" onClick={() => alterar(l.variante.id, 1)} aria-label="Aumentar">+</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between border-t border-borda pt-3 font-display font-extrabold text-lg"><span>Total</span><span>{brl(total)}</span></div>
        {erro && <Alerta>{erro}</Alerta>}
        <div className="grid grid-cols-3 border border-marrom-950" role="group" aria-label="Tipo">
          {(['compra', 'condicional', 'balcao'] as const).map(t => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={`h-10 rotulo !text-[0.65rem] ${tipo === t ? 'bg-marrom-950 text-creme' : 'text-marrom-950'}`}>
              {t === 'compra' ? 'Pedido' : t === 'condicional' ? 'Condicional' : 'Venda na loja'}
            </button>
          ))}
        </div>
        {cupons && (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="rotulo text-suave">Cupom (opcional)</span>
              <input value={cupom} onChange={e => { setCupom(e.target.value.toUpperCase()); setErro(null); }} placeholder="Código do cupom" maxLength={30} className={`${classeCampo} uppercase`} />
            </label>
            {cuponsDaCliente.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {cuponsDaCliente.map(c => (
                  <button key={c.codigo} type="button" title={c.regra} onClick={() => setCupom(cupom === c.codigo ? '' : c.codigo)} aria-pressed={cupom === c.codigo}
                    className={`h-7 px-2 border text-xs font-display font-bold tracking-wide ${cupom === c.codigo ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte hover:bg-bege'}`}>
                    {c.codigo}
                  </button>
                ))}
              </div>
            )}
            {cupom && <p className="text-xs text-suave">{cuponsDaCliente.find(c => c.codigo === cupom)?.regra ?? 'O cupom é conferido ao salvar.'}</p>}
          </div>
        )}
        {tipo === 'condicional' && <p className="text-xs text-suave">As peças ficam reservadas até você fechar o condicional.</p>}
        {tipo === 'balcao' && <p className="text-xs text-suave">A venda já entra confirmada: as peças saem do estoque e o valor conta na meta.</p>}
        {tipo === 'balcao' ? (
          <button type="button" disabled={pendente} onClick={() => salvar(false)} className={botao('oliva', 'm', 'w-full')}>{pendente ? etapa ?? 'Registrando…' : `Registrar venda · ${brl(total)}`}</button>
        ) : (
          <>
            <button type="button" disabled={pendente} onClick={() => salvar(true)} className={botao('oliva', 'm', 'w-full')}>{pendente ? etapa ?? 'Salvando…' : 'Salvar e enviar ao cliente'}</button>
            <button type="button" disabled={pendente} onClick={() => salvar(false)} className={botao('secundario', 'm', 'w-full')}>Só salvar</button>
          </>
        )}
      </Cartao>
    </div>
  );
}
