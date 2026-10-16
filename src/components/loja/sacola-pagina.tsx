'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { conferirSacola, enviarPedido, previaCupom, type PreviaCupom, type ResultadoEnvio } from '@/server/acoes/pedidos';
import { Alerta, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl } from '@/lib/dinheiro';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';
import { montarMensagemPedido } from '@/lib/mensagem-pedido';
import { formatarCep } from '@/lib/telefone';
import { Foto } from './foto';
import { IconeWhatsApp, PreviaWhatsApp } from './previa-whatsapp';
import { maximoDo, useSacola } from './sacola';
import { nomeDaLoja } from '@/lib/loja';

type Props = {
  usuario: { nome: string; papel: 'cliente' | 'vendedor' | 'gestor' } | null;
  /** null = frete a combinar com o vendedor (C-03). */
  frete: { valor: number; gratisAcima: number } | null;
  cepsCondicional: string[];
  cidadeCondicional: string;
  /** CEP já salvo no cadastro (U-02). */
  cepInicial?: string | null;
  /** Cupons ligados pelo gestor (docs/20-cupons.md); o campo só aparece para cliente logada. */
  cuponsLigados?: boolean;
  /** Cupons que a cliente já tem (primeira compra, próxima compra, criados para ela), para aplicar com um clique. */
  ofertasCupom?: OfertaCupom[];
  /** Quem recebe o pedido (RN-03): o vendedor da cliente ou, com `nome` null, a loja. */
  destino?: { nome: string | null } | null;
};

type OfertaCupom = { codigo: string; regra: string; primeiraCompra: boolean };

const CHAVE_CUPOM = 'dcerutti:cupom';
const lerCupomGuardado = () => { try { return localStorage.getItem(CHAVE_CUPOM) ?? ''; } catch { return ''; } };
const guardarCupom = (c: string) => { try { if (c) localStorage.setItem(CHAVE_CUPOM, c); else localStorage.removeItem(CHAVE_CUPOM); } catch { /* sem armazenamento: só não lembra */ } };

type Enviado = Extract<ResultadoEnvio, { ok: true }>;

export function Sacola({ usuario, frete, cepsCondicional, cidadeCondicional, cepInicial, cuponsLigados = false, ofertasCupom = [], destino }: Props) {
  const s = useSacola();
  const usaCupom = cuponsLigados && usuario?.papel === 'cliente';
  // Cupom: o código escolhido fica guardado no navegador; a prévia é refeita quando a sacola ou o tipo mudam.
  // Link de campanha (/sacola?cupom=CODIGO) ou o cupom guardado da última visita. Só roda no navegador; no servidor a
  // sacola ainda mostra "Carregando", então o estado inicial diferente não causa divergência na hidratação.
  const [codigoCupom, setCodigoCupom] = useState(() => {
    if (typeof window === 'undefined') return '';
    const daUrl = new URLSearchParams(window.location.search).get('cupom')?.trim().toUpperCase();
    if (daUrl) guardarCupom(daUrl);
    return daUrl ?? lerCupomGuardado();
  });
  const [previa, setPrevia] = useState<{ chave: string; r: PreviaCupom } | null>(null);
  const [modo, setModo] = useState<'compra' | 'condicional'>('compra');
  const [cep, setCep] = useState(cepInicial ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [foraDaArea, setForaDaArea] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  // O navegador pode bloquear a aba do WhatsApp (pop-up, navegador do Instagram): a tela final avisa e oferece o botão.
  const [abriu, setAbriu] = useState(true);
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('cupom')) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  // A prévia vale para esta combinação de cupom, tipo e peças; mudou a sacola, ela é refeita.
  const chaveCupom = usaCupom && pronta && codigoCupom && itens.length ? JSON.stringify([codigoCupom, modo, itens.map(i => [i.varianteId, i.quantidade])]) : '';
  useEffect(() => {
    if (!chaveCupom) return;
    let atual = true;
    const t = setTimeout(() => {
      previaCupom({ codigo: codigoCupom, tipo: modo, linhas: itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })) })
        .then(r => { if (atual) setPrevia({ chave: chaveCupom, r }); })
        .catch(() => {});
    }, 300);
    return () => { atual = false; clearTimeout(t); };
  }, [chaveCupom]); // eslint-disable-line react-hooks/exhaustive-deps -- a chave já resume codigo, modo e itens
  const cupom = chaveCupom && previa?.chave === chaveCupom ? previa.r : null;
  const conferindoCupom = !!chaveCupom && previa?.chave !== chaveCupom;

  if (enviado) return <Concluido e={enviado} abriu={abriu} imagem={imagem} gerando={gerandoImagem} imagemEnviada={imagemEnviada} aoCompartilhar={async () => { if (imagem && (await compartilharImagem(imagem, enviado.codigo))) setImagemEnviada(true); }} />;
  if (!s.pronta) return <div className="py-24 text-center text-suave">Carregando sacola…</div>;

  const equipe = usuario && usuario.papel !== 'cliente';
  const temGratis = !!frete && frete.gratisAcima > 0;
  const semFrete = temGratis && s.subtotal >= frete!.gratisAcima;
  const cupomOk = cupom?.ok ? cupom : null;
  const descontoCupom = cupomOk?.desconto ?? 0;
  const freteGratisCupom = !!cupomOk?.freteGratis;
  const valorFrete = frete && !freteGratisCupom ? (semFrete ? 0 : frete.valor) : 0;
  const aplicarCupom = (codigo: string) => { const c = codigo.trim().toUpperCase(); guardarCupom(c); setCodigoCupom(c); };
  const falta = temGratis ? Math.max(0, frete!.gratisAcima - s.subtotal) : 0;
  // Prévia: a mesma função do servidor, com os valores da sacola. O código e o link do pedido saem no envio.
  const cliente = usuario?.papel === 'cliente';
  const nomeDestino = destino?.nome ? destino.nome.trim().split(/\s+/)[0] : 'a loja';
  const mensagem = cliente ? montarMensagemPedido({
    tipo: modo, codigo: modo === 'condicional' ? 'COND-······' : 'PED-······',
    itens: s.itens.map(i => ({ nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: i.preco, imagem: i.imagem })),
    nomeCliente: usuario!.nome, nomeVendedor: destino?.nome ?? null, cep: formatarCep(cep) || null, cidadeCondicional,
    frete: modo === 'compra' && frete ? (freteGratisCupom || semFrete ? 0 : frete.valor) : null,
    cupom: cupomOk ? { codigo: cupomOk.codigo, desconto: cupomOk.desconto, freteGratis: cupomOk.freteGratis } : null,
    site: window.location.origin, linkPedido: `${window.location.origin}/painel/pedidos/…`,
    linkPublico: `${window.location.origin}/p/${modo === 'condicional' ? 'COND' : 'PED'}-......`,
  }).texto : '';
  const pecasSacola = s.itens.length;
  const cartao = cliente ? {
    fotos: s.itens.slice(0, 4).map(i => i.imagem), extras: Math.max(0, pecasSacola - 4),
    codigo: modo === 'condicional' ? 'CONDICIONAL' : 'PEDIDO',
    resumo: `${s.quantidade} ${s.quantidade === 1 ? 'peça' : 'peças'} · ${brl(modo === 'condicional' ? s.subtotal - descontoCupom : s.subtotal - descontoCupom + valorFrete)}`,
    titulo: `${modo === 'condicional' ? 'Condicional' : 'Pedido'} · ${nomeDaLoja()}`,
    dominio: window.location.host,
  } : undefined;

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
      const r = await enviarPedido({ tipo: modo, linhas: s.itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })), cep, cupom: cupomOk?.codigo });
      if (!r.ok) {
        aba?.close();
        if (r.cepFora) setForaDaArea(true);
        else setErro(r.erro);
        setConferencias(n => n + 1); // estoque pode ter mudado: confere de novo e marca o que saiu
        return;
      }
      let abriuAba = false;
      if (aba) try { aba.location.href = r.url; abriuAba = true; } catch { aba.close(); }
      setAbriu(abriuAba);
      setEnviado(r);
      s.limpar();
      guardarCupom('');
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
        <aside className="min-w-0 lg:sticky lg:top-28 self-start bg-card border border-borda p-5 sm:p-6 grid grid-cols-[minmax(0,1fr)] gap-5">
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
              {cupomOk && !freteGratisCupom && <div className="flex justify-between text-oliva"><span>Cupom {cupomOk.codigo}</span><span>−{brl(descontoCupom)}</span></div>}
              <div className="flex justify-between"><span>Frete</span><span>{freteGratisCupom ? `Grátis (cupom ${cupomOk!.codigo})` : frete ? (semFrete ? 'Grátis' : brl(frete.valor)) : 'A combinar'}</span></div>
              {temGratis && (
                <>
                  <div className="h-1.5 bg-bege mt-1"><div className="h-full bg-oliva" style={{ width: `${Math.min(100, (s.subtotal / frete!.gratisAcima) * 100)}%` }} /></div>
                  <p className="text-suave">{semFrete ? 'Você ganhou frete grátis.' : `Faltam ${brl(falta)} para o frete grátis.`}</p>
                </>
              )}
              <div className="flex justify-between border-t border-borda pt-3 mt-1 font-display font-extrabold text-lg">
                <span>Total</span><span>{brl(s.subtotal - descontoCupom + valorFrete)}{!frete && !freteGratisCupom && <span className="text-sm font-normal"> + frete</span>}</span>
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
              {cupomOk && descontoCupom > 0 && <div className="flex justify-between border-t border-borda pt-3 text-oliva"><span>Cupom {cupomOk.codigo} (sobre o que ficar)</span><span>−{brl(descontoCupom)}</span></div>}
              <div className="flex justify-between font-display font-extrabold text-lg border-t border-borda pt-3"><span>Valor das peças</span><span>{brl(s.subtotal - descontoCupom)}</span></div>
              <label className="grid gap-2">
                <span className="rotulo text-suave">CEP de entrega</span>
                <input value={cep} onChange={e => { setCep(formatarCep(e.target.value)); setErro(null); }} inputMode="numeric" placeholder="89874-000" className={classeCampo} />
                <span className="text-suave">Condicional disponível em {cidadeCondicional}.</span>
              </label>
            </div>
          )}


          {usaCupom && (
            <CampoCupom codigo={codigoCupom} previa={cupom} conferindo={conferindoCupom} aplicar={aplicarCupom} ofertas={ofertasCupom}
              remover={() => { guardarCupom(''); setCodigoCupom(''); }} />
          )}

          {erro && <Alerta><span className="whitespace-pre-line">{erro}</span></Alerta>}

          {cliente && (
            <details className="group border border-borda min-w-0">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 text-sm text-marrom-950">
                <span className="flex items-center gap-2"><IconeWhatsApp className="size-4 text-whatsapp" />Ver a mensagem para {nomeDestino}</span>
                <span className="group-open:rotate-45 transition-transform text-lg leading-none" aria-hidden="true">+</span>
              </summary>
              <PreviaWhatsApp texto={mensagem} cartao={cartao} para={destino?.nome ? destino.nome : nomeDaLoja()} hora={new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
            </details>
          )}

          <button type="button" onClick={enviar} disabled={pendente || !!equipe || indisponiveis.size > 0} className={botao('whatsapp', 'g', 'w-full h-14 !text-[0.8rem]')}>
            {pendente ? (
              <><span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />Registrando pedido…</>
            ) : (
              <><IconeWhatsApp />{modo === 'condicional' ? 'Enviar condicional no WhatsApp' : 'Enviar pedido no WhatsApp'}</>
            )}
          </button>
          <p className="text-xs text-suave text-center -mt-2">
            {destino?.nome ? <>Vai direto para <strong className="text-marrom-950">{nomeDestino}</strong>, que atende você.</> : 'Vai direto para o WhatsApp da loja.'}{' '}
            O pedido fica registrado e a conversa abre pronta: é só tocar em enviar.
          </p>
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

/** "Tem um cupom?": aplicado, mostra o código e a regra; recusado, o motivo (o pedido segue sem o cupom). */
function CampoCupom({ codigo, previa, conferindo, aplicar, remover, ofertas }: {
  codigo: string; previa: PreviaCupom | null; conferindo: boolean; aplicar: (c: string) => void; remover: () => void; ofertas: OfertaCupom[];
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  if (codigo)
    return (
      <div className={`grid gap-1 border p-3 text-sm ${previa?.ok ? 'border-oliva bg-oliva/5' : 'border-borda'}`}>
        <div className="flex items-center justify-between gap-2">
          <span>Cupom <strong className="font-display tracking-wide">{codigo}</strong>{conferindo && <span className="text-suave"> · conferindo…</span>}</span>
          <button type="button" onClick={() => { remover(); setTexto(''); }} className="rotulo !text-[0.6rem] underline underline-offset-4 text-suave">Remover</button>
        </div>
        {previa?.ok && <span className="text-oliva">{previa.regra}</span>}
        {previa && !previa.ok && <span className="text-vermelho">Não aplicado: {previa.erro}</span>}
      </div>
    );
  const primeira = ofertas.find(o => o.primeiraCompra);
  const outras = ofertas.filter(o => o !== primeira);
  const atalhos = (
    <>
      {primeira && (
        <div className="grid gap-2 border border-oliva bg-oliva/5 p-3 text-sm">
          <span><strong>Desconto na sua primeira compra</strong> <span className="text-suave">· {primeira.regra}</span></span>
          <button type="button" onClick={() => aplicar(primeira.codigo)} className={botao('oliva', 'p', 'justify-self-start')}>Usar cupom {primeira.codigo}</button>
        </div>
      )}
      {outras.length > 0 && (
        <div className="grid gap-1 text-sm">
          <span className="rotulo !text-[0.6rem] text-suave">Seus cupons</span>
          {outras.map(o => (
            <button key={o.codigo} type="button" onClick={() => aplicar(o.codigo)} className="text-left border border-borda px-3 py-2 hover:bg-bege">
              <strong className="font-display tracking-wide">{o.codigo}</strong> <span className="text-suave">· {o.regra}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
  if (!aberto)
    return (
      <div className="grid gap-3">
        {atalhos}
        <button type="button" onClick={() => setAberto(true)} className="justify-self-start rotulo !text-[0.65rem] underline underline-offset-4">{ofertas.length ? 'Tem outro cupom?' : 'Tem um cupom?'}</button>
      </div>
    );
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (texto.trim()) aplicar(texto); }}>
      <input value={texto} onChange={e => setTexto(e.target.value.toUpperCase())} placeholder="Código do cupom" aria-label="Código do cupom" autoFocus className={`${classeCampo} flex-1 uppercase`} maxLength={30} />
      <button type="submit" className={botao('secundario', 'm')}>Aplicar</button>
    </form>
  );
}

function Concluido({ e, abriu, imagem, gerando, imagemEnviada, aoCompartilhar }: { e: Enviado; abriu: boolean; imagem: Blob | null; gerando: boolean; imagemEnviada: boolean; aoCompartilhar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const condicional = e.tipo === 'condicional';
  const pecas = e.itens.reduce((a, i) => a + i.quantidade, 0);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(e.texto);
    } catch {
      // Sem a API (http, navegador antigo): copia por um campo escondido.
      const t = document.createElement('textarea');
      t.value = e.texto;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
  const passos = [
    { t: `Toque em enviar na conversa com ${e.destinatario}`, d: 'A mensagem já está escrita, com as peças, os tamanhos e os valores.' },
    { t: condicional ? 'Combine o dia da entrega' : 'Confirme as peças com quem atende você', d: condicional ? 'As peças ficam reservadas para você.' : 'Elas ficam separadas enquanto vocês conversam.' },
    { t: condicional ? 'Prove em casa e pague só o que ficar' : 'Combine o pagamento e a entrega', d: 'Tudo pelo WhatsApp, com atendimento de pessoa para pessoa.' },
  ];

  return (
    <div className="py-10 sm:py-16 max-w-2xl mx-auto grid gap-8">
      <div className="text-center grid gap-3 justify-items-center">
        <span className="size-16 rounded-full bg-whatsapp text-white grid place-items-center shadow-lg shadow-whatsapp/20">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="rotulo text-whatsapp">{condicional ? 'Condicional registrado' : 'Pedido registrado'}</div>
        <h1 className="titulo text-2xl sm:text-3xl">{abriu ? 'Agora é só tocar em enviar no WhatsApp' : 'Falta abrir o WhatsApp'}</h1>
        <p className="text-suave max-w-md">
          {abriu
            ? `A conversa com ${e.destinatario} abriu em outra aba com o ${condicional ? 'condicional' : 'pedido'} completo.`
            : 'O navegador não deixou abrir o WhatsApp sozinho. Toque no botão abaixo: a mensagem já está pronta.'}
        </p>
      </div>

      <div className="grid gap-3">
        <a href={e.url} target="_blank" rel="noopener" className={botao('whatsapp', 'g', 'w-full h-14 !text-[0.8rem]')}>
          <IconeWhatsApp />{abriu ? 'Abrir o WhatsApp de novo' : `Abrir o WhatsApp de ${e.destinatario}`}
        </a>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={copiar} className={botao('secundario', 'm', 'w-full')}>{copiado ? 'Mensagem copiada ✓' : 'Copiar mensagem'}</button>
          {imagem && !imagemEnviada
            ? <button type="button" onClick={aoCompartilhar} className={botao('secundario', 'm', 'w-full')}>Enviar a imagem</button>
            : <span className={`${botao('fantasma', 'm', 'w-full pointer-events-none')} text-suave`}>{gerando ? 'Preparando imagem…' : imagemEnviada ? 'Imagem enviada ✓' : 'Imagem indisponível'}</span>}
        </div>
      </div>

      <section className="bg-card border border-borda">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-borda">
          <span data-testid="codigo-pedido" className="font-display font-extrabold tracking-wide text-marrom-950">{e.codigo}</span>
          <span className="text-sm text-suave">{pecas} {pecas === 1 ? 'peça' : 'peças'} · para {e.destinatario}</span>
        </div>
        <ul className="divide-y divide-borda">
          {e.itens.map((i, n) => (
            <li key={n} className="flex gap-3 items-center px-5 py-3">
              <div className="relative w-12 aspect-[3/4] bg-bege shrink-0"><Foto src={i.imagem} alt="" sizes="48px" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-marrom-950 text-sm leading-snug line-clamp-1">{i.nome}</div>
                <div className="text-xs text-suave">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''} · {i.quantidade} × {brl(i.preco)}</div>
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">{brl(i.preco * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-1 px-5 py-4 border-t border-borda text-sm">
          {e.cupom && !e.cupom.freteGratis && e.cupom.desconto > 0 && <div className="flex justify-between text-oliva"><span>Cupom {e.cupom.codigo}</span><span>−{brl(e.cupom.desconto)}</span></div>}
          {!condicional && <div className="flex justify-between"><span>Frete</span><span>{e.frete == null ? 'A combinar' : e.frete === 0 ? 'Grátis' : brl(e.frete)}</span></div>}
          <div className="flex justify-between font-display font-extrabold text-lg pt-1">
            <span>{condicional ? 'Valor das peças' : 'Total'}</span>
            <span>{brl(e.total)}{!condicional && e.frete == null && <span className="text-sm font-normal"> + frete</span>}</span>
          </div>
        </div>
      </section>

      <ol className="grid gap-4">
        {passos.map((p, i) => (
          <li key={p.t} className="grid grid-cols-[2.25rem_1fr] gap-3 items-start">
            <span className={`size-9 rounded-full grid place-items-center font-display font-extrabold ${i === 0 ? 'bg-whatsapp text-white' : 'bg-bege text-caramelo'}`}>{i + 1}</span>
            <div><div className="text-marrom-950 font-semibold">{p.t}</div><div className="text-sm text-suave">{p.d}</div></div>
          </li>
        ))}
      </ol>

      <div className="flex gap-6 justify-center">
        <Link href="/minha-conta/pedidos" className="rotulo underline underline-offset-4">Meus pedidos</Link>
        <Link href="/catalogo" className="rotulo underline underline-offset-4">Continuar comprando</Link>
      </div>
    </div>
  );
}
