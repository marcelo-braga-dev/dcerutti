'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { criarSelecao } from '@/server/acoes/pedidos';
import { Foto } from '@/components/loja/foto';
import { Alerta, Cartao } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { normalizar, type VarianteCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';

type Produto = { id: number; referencia: string; nome: string; marca: string; cor: string | null; categoria: string; preco: number; imagem: string | null; variantes: VarianteCatalogo[] };
type Linha = { variante: VarianteCatalogo; produto: Produto; quantidade: number };

export function Montador({ clientes, produtos, clienteInicial, vendedor }: { clientes: { id: string; nome: string; telefone: string }[]; produtos: Produto[]; clienteInicial: string; vendedor: string }) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState(clienteInicial);
  const [busca, setBusca] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const resultados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    const base = termos.length ? produtos.filter(p => { const a = normalizar(`${p.nome} ${p.referencia} ${p.categoria} ${p.cor ?? ''}`); return termos.every(t => a.includes(t)); }) : produtos.filter(p => p.imagem);
    return base.slice(0, 12);
  }, [busca, produtos]);

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
    const aba = enviar && !navigator.canShare ? window.open('', '_blank') : null;
    iniciar(async () => {
      setEtapa('Salvando pedido…');
      const r = await criarSelecao({ clienteId, linhas: linhas.map(l => ({ varianteId: l.variante.id, quantidade: l.quantidade })) });
      if (!r.ok) { aba?.close(); setEtapa(null); return setErro(r.erro); }
      if (enviar) {
        setEtapa('Gerando imagem…');
        const imagem = await gerarImagemPedido({
          selo: 'SELEÇÃO PARA VOCÊ', codigo: r.codigo, titulo: `Olá, ${r.nomeCliente.split(' ')[0]}`,
          subtitulo: `${vendedor.split(' ')[0]} separou estas peças para você`, rodape: 'PAGAMENTO E ENTREGA A COMBINAR', itens: r.itens,
        });
        const texto = decodeURIComponent(r.url.split('?text=')[1] ?? '');
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
        <button type="button" disabled={pendente} onClick={() => salvar(true)} className={botao('oliva', 'm', 'w-full')}>{pendente ? etapa ?? 'Salvando…' : 'Salvar e enviar ao cliente'}</button>
        <button type="button" disabled={pendente} onClick={() => salvar(false)} className={botao('secundario', 'm', 'w-full')}>Só salvar</button>
      </Cartao>
    </div>
  );
}
