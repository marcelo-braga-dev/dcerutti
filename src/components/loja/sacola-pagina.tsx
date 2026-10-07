'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { conferirSacola, enviarPedido, type ResultadoEnvio } from '@/server/acoes/pedidos';
import { Alerta, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl } from '@/lib/dinheiro';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';
import { formatarCep } from '@/lib/telefone';
import { Foto } from './foto';
import { maximoDo, useSacola } from './sacola';

type Props = {
  usuario: { nome: string; papel: 'cliente' | 'vendedor' | 'gestor' } | null;
  /** null = frete a combinar com o vendedor (C-03). */
  frete: { valor: number; gratisAcima: number } | null;
  cepsCondicional: string[];
  cidadeCondicional: string;
  /** CEP já salvo no cadastro (U-02). */
  cepInicial?: string | null;
};

type Enviado = Extract<ResultadoEnvio, { ok: true }>;

export function Sacola({ usuario, frete, cepsCondicional, cidadeCondicional, cepInicial }: Props) {
  const s = useSacola();
  const [modo, setModo] = useState<'compra' | 'condicional'>('compra');
  const [cep, setCep] = useState(cepInicial ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [foraDaArea, setForaDaArea] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [imagem, setImagem] = useState<Blob | null>(null);
  const [imagemEnviada, setImagemEnviada] = useState(false);
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [pendente, iniciar] = useTransition();
  // Q-02/B-06: ao abrir (e depois de um envio recusado), confere preço e estoque com o catálogo atual.
  const [indisponiveis, setIndisponiveis] = useState<Set<number>>(new Set());
  const [avisoConferencia, setAvisoConferencia] = useState<string | null>(null);
  const [conferencias, setConferencias] = useState(0);
  const conferidoEm = useRef(-1);
  const { pronta, itens, conferir } = s;
  useEffect(() => {
    if (!pronta || !itens.length || conferidoEm.current === conferencias) return;
    conferidoEm.current = conferencias;
    conferirSacola(itens.map(i => i.varianteId)).then(c => {
      const fora = new Set(itens.filter(i => !c[i.varianteId] || c[i.varianteId]!.disponivel <= 0).map(i => i.varianteId));
      setIndisponiveis(fora);
      const { precos, ajustados } = conferir(c);
      const partes = [
        precos.length ? `O preço mudou: ${precos.join(', ')}.` : '',
        ajustados.length ? `Quantidade ajustada ao estoque: ${ajustados.join(', ')}.` : '',
      ].filter(Boolean);
      setAvisoConferencia(partes.length ? partes.join(' ') : null);
    }).catch(() => {});
  }, [pronta, itens, conferir, conferencias]);

  if (enviado) return <Concluido e={enviado} imagem={imagem} gerando={gerandoImagem} imagemEnviada={imagemEnviada} aoCompartilhar={async () => { if (imagem && (await compartilharImagem(imagem, enviado.codigo))) setImagemEnviada(true); }} />;
  if (!s.pronta) return <div className="py-24 text-center text-suave">Carregando sacola…</div>;

  const equipe = usuario && usuario.papel !== 'cliente';
  const temGratis = !!frete && frete.gratisAcima > 0;
  const semFrete = temGratis && s.subtotal >= frete!.gratisAcima;
  const valorFrete = frete ? (semFrete ? 0 : frete.valor) : 0;
  const falta = temGratis ? Math.max(0, frete!.gratisAcima - s.subtotal) : 0;

  const enviar = () => {
    setErro(null);
    if (modo === 'condicional') {
      const c = formatarCep(cep);
      if (c.length !== 9) return setErro('Digite um CEP válido com 8 números.');
      if (!cepsCondicional.includes(c)) return setForaDaArea(true);
    }
    // Abre a aba já no clique (senão o navegador bloqueia) e aponta para o WhatsApp quando o pedido estiver gravado.
    const aba = window.open('', '_blank');
    iniciar(async () => {
      const r = await enviarPedido({ tipo: modo, linhas: s.itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })), cep });
      if (!r.ok) {
        aba?.close();
        if (r.cepFora) setForaDaArea(true);
        else setErro(r.erro);
        setConferencias(n => n + 1); // estoque pode ter mudado: confere de novo e marca o que saiu
        return;
      }
      if (aba) aba.location.href = r.url;
      setEnviado(r);
      s.limpar();
      setGerandoImagem(true);
      gerarImagemPedido({
        selo: r.tipo === 'condicional' ? 'CONDICIONAL' : 'PEDIDO',
        codigo: r.codigo,
        titulo: r.tipo === 'condicional' ? 'Peças para provar em casa' : 'Meu pedido',
        subtitulo: `Cliente: ${r.nomeCliente}${r.cep ? `   ·   CEP ${r.cep} · ${cidadeCondicional}` : ''}`,
        rodape: r.tipo === 'condicional' ? 'PAGUE SÓ O QUE FICAR' : 'PAGAMENTO E ENTREGA A COMBINAR',
        itens: r.itens,
      }).then(setImagem).catch(() => {}).finally(() => setGerandoImagem(false));
    });
  };

  return (
    <div className="py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-10">
      <section>
        <h1 className="titulo text-3xl">Sua sacola</h1>
        <p className="text-suave mt-1">{s.quantidade === 0 ? 'Vazia' : `${s.quantidade} ${s.quantidade === 1 ? 'peça' : 'peças'}`}</p>
        {avisoConferencia && <div className="mt-4"><Alerta tipo="aviso">{avisoConferencia}</Alerta></div>}
        {indisponiveis.size > 0 && (
          <div className="mt-4"><Alerta>
            {indisponiveis.size === 1 ? 'Uma peça da sacola não está mais disponível.' : `${indisponiveis.size} peças da sacola não estão mais disponíveis.`}{' '}
            <button type="button" className="underline underline-offset-4" onClick={() => { indisponiveis.forEach(id => s.remover(id)); setIndisponiveis(new Set()); }}>Remover da sacola</button>
          </Alerta></div>
        )}
        <div className="mt-6">
          {s.itens.length === 0 ? (
            <Vazio>
              Sua sacola está vazia.
              <div className="mt-4"><BotaoLink href="/catalogo">Ver o catálogo</BotaoLink></div>
            </Vazio>
          ) : (
            <ul className="divide-y divide-borda border-y border-borda">
              {s.itens.map(i => (
                <li key={i.varianteId} className={`py-4 grid grid-cols-[88px_1fr] gap-4 ${indisponiveis.has(i.varianteId) ? 'opacity-60' : ''}`}>
                  <Link href={`/produto/${i.referencia}`} className="relative aspect-[3/4] bg-bege"><Foto src={i.imagem} alt={i.nome} sizes="88px" /></Link>
                  <div className="grid gap-1 content-start">
                    <div className="rotulo !text-[0.62rem] text-suave">{i.marca}</div>
                    <Link href={`/produto/${i.referencia}`} className="text-marrom-950 leading-snug hover:underline">{i.nome}</Link>
                    <div className="text-sm text-suave">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''}{i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''}</div>
                    {indisponiveis.has(i.varianteId) && (
                      <div className="flex items-center gap-3 text-sm text-vermelho">
                        Indisponível agora
                        <button type="button" onClick={() => { s.remover(i.varianteId); setIndisponiveis(x => { const n = new Set(x); n.delete(i.varianteId); return n; }); }} className="underline underline-offset-4">Remover</button>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center border border-borda-forte" aria-label="Quantidade">
                        <button type="button" onClick={() => s.alterar(i.varianteId, -1)} className="size-9 hover:bg-bege" aria-label="Diminuir">−</button>
                        <span className="w-8 text-center font-display font-bold">{i.quantidade}</span>
                        <button type="button" onClick={() => s.alterar(i.varianteId, 1)} disabled={i.quantidade >= maximoDo(i)} className="size-9 hover:bg-bege disabled:text-borda-forte disabled:hover:bg-transparent" aria-label="Aumentar" title={i.quantidade >= maximoDo(i) ? 'Máximo disponível' : undefined}>+</button>
                      </div>
                      <span className="font-display font-extrabold">{brl(i.preco * i.quantidade)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {s.itens.length > 0 && <Link href="/catalogo" className="inline-block mt-6 rotulo underline underline-offset-4">← Continuar comprando</Link>}
      </section>

      {s.itens.length > 0 && (
        <aside className="min-w-0 lg:sticky lg:top-28 self-start bg-card border border-borda p-5 sm:p-6 grid gap-5">
          {equipe ? (
            <Alerta tipo="aviso">
              Você está logado como {usuario!.papel}. Para montar um pedido para um cliente, use <Link href="/painel/pedidos/novo" className="underline">Painel → Novo pedido</Link>.
            </Alerta>
          ) : null}
          <div className="grid grid-cols-2 border border-marrom-950" role="tablist">
            {(['compra', 'condicional'] as const).map(m => (
              <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setErro(null); }}
                className={`h-11 rotulo ${modo === m ? 'bg-marrom-950 text-creme' : 'text-marrom-950'}`}>
                {m === 'compra' ? 'Pedido' : 'Condicional'}
              </button>
            ))}
          </div>

          {modo === 'compra' ? (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span>Peças</span><span>{brl(s.subtotal)}</span></div>
              <div className="flex justify-between"><span>Frete</span><span>{frete ? (semFrete ? 'Grátis' : brl(frete.valor)) : 'A combinar'}</span></div>
              {temGratis && (
                <>
                  <div className="h-1.5 bg-bege mt-1"><div className="h-full bg-oliva" style={{ width: `${Math.min(100, (s.subtotal / frete!.gratisAcima) * 100)}%` }} /></div>
                  <p className="text-suave">{semFrete ? 'Você ganhou frete grátis.' : `Faltam ${brl(falta)} para o frete grátis.`}</p>
                </>
              )}
              <div className="flex justify-between border-t border-borda pt-3 mt-1 font-display font-extrabold text-lg">
                <span>Total</span><span>{brl(s.subtotal + valorFrete)}{!frete && <span className="text-sm font-normal"> + frete</span>}</span>
              </div>
              <p className="text-suave">Pagamento e entrega você combina com seu vendedor pelo WhatsApp.</p>
            </div>
          ) : (
            <div className="grid gap-3 text-sm">
              <ol className="grid grid-cols-2 gap-3">
                {['Envie pelo WhatsApp', 'Receba em casa', 'Prove com calma', 'Pague só o que ficar'].map((t, i) => (
                  <li key={t} className="bg-bege p-3"><div className="font-display font-extrabold text-caramelo">0{i + 1}</div>{t}</li>
                ))}
              </ol>
              <div className="flex justify-between font-display font-extrabold text-lg border-t border-borda pt-3"><span>Valor das peças</span><span>{brl(s.subtotal)}</span></div>
              <label className="grid gap-2">
                <span className="rotulo text-suave">CEP de entrega</span>
                <input value={cep} onChange={e => { setCep(formatarCep(e.target.value)); setErro(null); }} inputMode="numeric" placeholder="89874-000" className={classeCampo} />
                <span className="text-suave">Condicional disponível em {cidadeCondicional}.</span>
              </label>
            </div>
          )}


          {erro && <Alerta><span className="whitespace-pre-line">{erro}</span></Alerta>}

          <button type="button" onClick={enviar} disabled={pendente || !!equipe || indisponiveis.size > 0} className={botao(modo === 'condicional' ? 'oliva' : 'primario', 'g', 'w-full')}>
            {pendente ? 'Registrando pedido…' : modo === 'condicional' ? 'Enviar condicional no WhatsApp' : 'Enviar pedido no WhatsApp'}
          </button>
          <p className="text-xs text-suave text-center">Abre a conversa com seu vendedor já com todas as peças, fotos e valores. É só tocar em enviar.</p>
        </aside>
      )}

      {foraDaArea && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-marrom-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="fora-titulo" onClick={() => setForaDaArea(false)}>
          <div className="bg-card max-w-sm w-full p-6 grid gap-4" onClick={e => e.stopPropagation()}>
            <h2 id="fora-titulo" className="titulo text-xl">Ainda não chegamos aí</h2>
            <p className="text-suave">O condicional atende somente {cidadeCondicional}. Você pode enviar como pedido normal e combinar a entrega com seu vendedor.</p>
            <button type="button" className={botao('primario')} onClick={() => { setForaDaArea(false); setModo('compra'); }}>Enviar como pedido</button>
            <button type="button" className={botao('fantasma')} onClick={() => setForaDaArea(false)}>Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Concluido({ e, imagem, gerando, imagemEnviada, aoCompartilhar }: { e: Enviado; imagem: Blob | null; gerando: boolean; imagemEnviada: boolean; aoCompartilhar: () => void }) {
  return (
    <div className="py-16 max-w-xl mx-auto text-center grid gap-5 justify-items-center">
      <div className="rotulo text-oliva">{e.tipo === 'condicional' ? 'Condicional enviado' : 'Pedido enviado'} · {e.codigo}</div>
      <h1 className="titulo text-3xl">Pedido enviado para {e.destinatario}</h1>
      <p className="text-suave">A conversa abriu no WhatsApp com o pedido completo. Toque em enviar por lá — o vendedor responde com pagamento e entrega.</p>
      <div className="flex gap-2 flex-wrap justify-center">
        {e.itens.map((i, n) => (
          <div key={n} className="relative w-16 aspect-[3/4] bg-bege"><Foto src={i.imagem} alt="" sizes="64px" /><span className="absolute bottom-0 inset-x-0 bg-card/90 text-[0.65rem] font-bold">{i.tamanho}{i.quantidade > 1 ? ` ×${i.quantidade}` : ''}</span></div>
        ))}
      </div>
      <a href={e.url} target="_blank" rel="noopener" className={botao('primario', 'g')}>WhatsApp não abriu? Toque aqui</a>
      {imagem && !imagemEnviada && <button type="button" onClick={aoCompartilhar} className={botao('secundario')}>Enviar também a imagem do pedido</button>}
      {gerando && <p className="text-xs text-suave">Preparando a imagem do pedido…</p>}
      <div className="flex gap-4">
        <Link href="/minha-conta" className="rotulo underline underline-offset-4">Meus pedidos</Link>
        <Link href="/catalogo" className="rotulo underline underline-offset-4">Continuar comprando</Link>
      </div>
    </div>
  );
}
