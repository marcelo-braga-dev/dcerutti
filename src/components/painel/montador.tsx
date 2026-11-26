'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { buscarPecas, criarSelecao, type PecaSelecao } from '@/server/acoes/pedidos';
import { Foto } from '@/components/loja/foto';
import { Alerta, CartaoSecao } from '@/components/ui/basicos';
import { IconeCabide, IconeCaixa, IconeCaixaLoja, IconeCheck, IconeEtiqueta, IconeInfo, IconeLixo, IconeLupa, IconePessoa, IconeSacola, IconeTelefone } from '@/components/ui/icones';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import type { VarianteCatalogo } from '@/lib/catalogo';
import { brl } from '@/lib/dinheiro';
import { avisarEnvio } from './sinal-equipe';
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
        // D-26: a seleção enviada entra no acompanhamento da equipe.
        avisarEnvio({ acao: 'oferta', pedidoId: r.pedidoId });
      }
      router.push(`/painel/pedidos/${r.pedidoId}`);
    });
  };

  const cliente = clientes.find(c => c.id === clienteId);
  const naSelecao = (id: number) => linhas.filter(l => l.produto.id === id).reduce((a, l) => a + l.quantidade, 0);
  const etapas = [
    { id: 'm-cliente', titulo: 'Cliente e tipo', ok: !!clienteId, info: cliente?.nome.split(' ')[0] ?? 'escolher' },
    { id: 'm-pecas', titulo: 'Peças', ok: pecas > 0, info: pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'adicionar' },
    { id: 'm-enviar', titulo: tipo === 'balcao' ? 'Registrar' : 'Enviar', ok: false, info: brl(total) },
  ];
  const TIPOS: { valor: Tipo; rotulo: string; legenda: string; icone: React.ReactNode }[] = [
    { valor: 'compra', rotulo: 'Pedido', legenda: 'Cliente confirma e paga', icone: <IconeSacola className="size-5" /> },
    { valor: 'condicional', rotulo: 'Condicional', legenda: 'Leva para provar; reserva', icone: <IconeCaixa className="size-5" /> },
    { valor: 'balcao', rotulo: 'Venda na loja', legenda: 'Já pago: baixa o estoque', icone: <IconeCaixaLoja className="size-5" /> },
  ];
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="grid gap-4">
      {/* Etapas: o que já está pronto e o que falta. */}
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto sem-barra" aria-label="Etapas">
        {etapas.map((e, i) => (
          <li key={e.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
            {i > 0 && <span className={`h-px w-4 sm:w-10 ${etapas[i - 1].ok ? 'bg-oliva' : 'bg-borda-forte'}`} aria-hidden="true" />}
            <button type="button" onClick={() => ir(e.id)} className="flex items-center gap-2 rounded-full bg-card border border-borda pl-1 pr-3 h-9 hover:border-borda-forte">
              <span className={`grid place-items-center size-7 rounded-full text-xs font-bold ${e.ok ? 'bg-oliva text-creme' : 'bg-creme text-suave border border-borda-forte'}`}>{e.ok ? <IconeCheck className="size-3.5" /> : i + 1}</span>
              <span className="text-sm font-semibold text-marrom-950">{e.titulo}</span>
              <span className="hidden sm:inline text-xs text-suave">{e.info}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="grid gap-4 min-w-0">
          <CartaoSecao id="m-cliente" icone={<IconePessoa />} titulo="1 · Cliente e tipo">
            <div className="grid gap-4">
              <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                <label className="grid gap-1.5">
                  <span className="rotulo text-suave">Cliente<span className="text-vermelho ml-0.5" aria-hidden="true">*</span></span>
                  <select value={clienteId} onChange={e => { setClienteId(e.target.value); setErro(null); }} className={classeCampo}>
                    <option value="">Escolha o cliente…</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.telefone}</option>)}
                  </select>
                </label>
                {cliente && (
                  <span className="flex items-center gap-2 h-11 px-3 rounded-xl bg-creme border border-borda text-sm">
                    <span className="grid place-items-center size-7 rounded-full bg-marrom-950 text-creme text-xs font-bold">{cliente.nome.trim()[0]?.toUpperCase()}</span>
                    <IconeTelefone className="size-3.5 text-suave" /><span className="tabular-nums">{cliente.telefone}</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo">
                {TIPOS.map(t => (
                  <button key={t.valor} type="button" aria-pressed={tipo === t.valor} aria-label={t.rotulo} onClick={() => setTipo(t.valor)}
                    className={`flex flex-col sm:flex-row items-center sm:items-start gap-1 sm:gap-2.5 rounded-xl border p-2.5 text-center sm:text-left transition ${tipo === t.valor ? 'border-marrom-950 bg-marrom-950 text-creme shadow-sm' : 'border-borda bg-card text-marrom-950 hover:border-borda-forte'}`}>
                    <span className={tipo === t.valor ? 'text-areia' : 'text-caramelo'}>{t.icone}</span>
                    <span className="grid">
                      <span className="text-sm font-semibold leading-tight">{t.rotulo}</span>
                      <span className={`hidden sm:block text-[0.7rem] leading-snug ${tipo === t.valor ? 'text-areia' : 'text-suave'}`}>{t.legenda}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CartaoSecao>

          <CartaoSecao id="m-pecas" icone={<IconeCabide />} titulo="2 · Peças" extra={<span className="text-xs">{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}</span>}>
            <div className="grid gap-3">
              <div className="relative">
                <IconeLupa className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-suave pointer-events-none" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência ou categoria…" aria-label="Buscar peça" className={`${classeCampo} pl-10`} />
              </div>
              <p className="text-xs text-suave -mt-1">Toque no tamanho para pôr na seleção. Passe o mouse no tamanho para ver o estoque.</p>
              <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-2">
                {resultados.map(p => {
                  const qtd = naSelecao(p.id);
                  return (
                    <div key={p.id} className={`cartao bg-card border rounded-xl p-2.5 transition ${qtd ? 'border-oliva/60 ring-1 ring-oliva/20' : 'border-borda'}`}>
                      <div className="grid grid-cols-[64px_1fr] gap-3">
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-bege">
                          <Foto src={p.imagem} alt={p.nome} sizes="64px" />
                          {qtd > 0 && <span className="absolute right-1 top-1 grid place-items-center min-w-5 h-5 px-1 rounded-full bg-oliva text-creme text-[0.65rem] font-bold">{qtd}</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm text-marrom-950 leading-snug line-clamp-2">{p.nome}</div>
                          <div className="text-xs text-suave">Ref. {p.referencia} · <strong className="text-marrom-950">{brl(p.preco)}</strong></div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {p.variantes.map(v => {
                              const escolhido = linhas.some(l => l.variante.id === v.id);
                              return (
                                <button key={v.id} type="button" onClick={() => adicionar(p, v)} title={`Cód. ${v.codigoInterno ?? '—'} · ${v.disponivel} em estoque`} aria-label={`Adicionar ${p.nome} tamanho ${v.tamanho}`}
                                  className={`relative min-w-9 h-8 px-2 rounded-lg border text-sm font-display font-bold transition-colors ${escolhido ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte hover:bg-marrom-950 hover:text-creme hover:border-marrom-950'}`}>
                                  {v.tamanho}
                                  {v.disponivel === 1 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-caramelo" aria-hidden="true" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!resultados.length && <p className="text-suave text-sm">Nenhuma peça encontrada.</p>}
              </div>
              <p className="flex items-center gap-1.5 text-[0.7rem] text-suave"><span className="size-2 rounded-full bg-caramelo" />última unidade do tamanho</p>
            </div>
          </CartaoSecao>
        </div>

        <CartaoSecao id="m-enviar" icone={<IconeSacola />} titulo={`3 · ${tipo === 'balcao' ? 'Registrar' : 'Revisar e enviar'}`} className="xl:sticky xl:top-4"
          extra={<span className="text-xs">{pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'Vazia'}</span>}>
          <div className="grid gap-3">
            {linhas.length === 0 ? (
              <div className="grid place-items-center gap-1 rounded-xl border border-dashed border-borda-forte py-6 text-center">
                <IconeSacola className="size-6 text-suave/60" />
                <p className="text-sm text-suave">Toque no tamanho de uma peça para adicionar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-borda -my-1 max-h-[45vh] overflow-y-auto">
                {linhas.map(l => (
                  <li key={l.variante.id} className="py-2 grid grid-cols-[40px_1fr_auto] gap-2.5 items-center">
                    <div className="relative aspect-[3/4] rounded-md overflow-hidden bg-bege"><Foto src={l.produto.imagem} alt="" sizes="40px" /></div>
                    <div className="text-sm min-w-0">
                      <div className="truncate text-marrom-950">{l.produto.nome}</div>
                      <div className="text-xs text-suave">Tam. {l.variante.tamanho}{l.variante.codigoInterno ? ` · Cód. ${l.variante.codigoInterno}` : ''} · {brl(l.produto.preco * l.quantidade)}</div>
                    </div>
                    <div className="flex items-center rounded-full border border-borda-forte">
                      <button type="button" className="grid place-items-center size-7 rounded-full hover:bg-bege" onClick={() => alterar(l.variante.id, -1)} aria-label="Diminuir">{l.quantidade === 1 ? <IconeLixo className="size-3.5 text-vermelho" /> : '−'}</button>
                      <span className="w-5 text-center text-sm font-bold tabular-nums">{l.quantidade}</span>
                      <button type="button" className="grid place-items-center size-7 rounded-full hover:bg-bege disabled:opacity-30" disabled={l.quantidade >= l.variante.disponivel} onClick={() => alterar(l.variante.id, 1)} aria-label="Aumentar">+</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between items-baseline border-t border-borda pt-3"><span className="text-sm text-suave">Total</span><span className="font-display font-extrabold text-xl">{brl(total)}</span></div>
            {cupons && (
              <div className="grid gap-1.5">
                <div className="relative">
                  <IconeEtiqueta className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-suave pointer-events-none" />
                  <input value={cupom} onChange={e => { setCupom(e.target.value.toUpperCase()); setErro(null); }} placeholder="Cupom (opcional)" aria-label="Cupom (opcional)" maxLength={30} className={`${classeCampo} !h-10 pl-9 uppercase`} />
                </div>
                {cuponsDaCliente.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cuponsDaCliente.map(c => (
                      <button key={c.codigo} type="button" title={c.regra} onClick={() => setCupom(cupom === c.codigo ? '' : c.codigo)} aria-pressed={cupom === c.codigo}
                        className={`h-7 px-2.5 rounded-full border text-xs font-display font-bold tracking-wide ${cupom === c.codigo ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-dashed border-borda-forte hover:bg-bege'}`}>
                        {c.codigo}
                      </button>
                    ))}
                  </div>
                )}
                {cupom && <p className="text-xs text-suave">{cuponsDaCliente.find(c => c.codigo === cupom)?.regra ?? 'O cupom é conferido ao salvar.'}</p>}
              </div>
            )}
            <p className="flex items-start gap-1.5 text-xs text-suave">
              <IconeInfo className="size-3.5 mt-px shrink-0" />
              {tipo === 'condicional' ? 'As peças ficam reservadas até você fechar o condicional.' : tipo === 'balcao' ? 'Entra confirmada: as peças saem do estoque e o valor conta na meta.' : 'Vai pelo WhatsApp com uma imagem da seleção. Reserva só na confirmação.'}
            </p>
            {erro && <Alerta>{erro}</Alerta>}
            {tipo === 'balcao' ? (
              <button type="button" disabled={pendente} onClick={() => salvar(false)} className={botao('oliva', 'm', 'w-full')}><IconeCheck className="size-4" />{pendente ? etapa ?? 'Registrando…' : `Registrar venda · ${brl(total)}`}</button>
            ) : (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button type="button" disabled={pendente} onClick={() => salvar(true)} className={botao('whatsapp', 'm', 'w-full')}><IconeWhatsApp className="size-4" />{pendente ? etapa ?? 'Salvando…' : 'Salvar e enviar ao cliente'}</button>
                <button type="button" disabled={pendente} onClick={() => salvar(false)} className={botao('secundario', 'm')}>Só salvar</button>
              </div>
            )}
          </div>
        </CartaoSecao>
      </div>
    </div>
  );
}
