'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classeCampo, Rotulo, useCampo } from '@/components/ui/formulario';
import { IconeAlerta, IconeFechar, IconeMais } from '@/components/ui/icones';
import { brl, descontoPct, lerValor } from '@/lib/dinheiro';
import { corClara, tomDaCor } from '@/lib/cores';

/**
 * Campos do cadastro de produto (visual 2026). Todos mandam ao servidor os mesmos nomes de antes; os que guardam o valor
 * em estado avisam o formulário com um evento `input`, para a prévia e o "alterações não salvas" acompanharem.
 */

/** Dispara `input` no elemento (campos ocultos e valores trocados por botão não disparam sozinhos). */
export function avisarMudanca(el: HTMLElement | null) {
  el?.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Avisa o formulário quando `valor` muda, menos na montagem. */
function useAvisar<T>(ref: React.RefObject<HTMLElement | null>, valor: T) {
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    avisarMudanca(ref.current);
  }, [valor, ref]);
}

function Mensagem({ id, erro, ajuda }: { id: string; erro?: string; ajuda?: ReactNode }) {
  if (erro) return <p id={`${id}-erro`} className="mt-1.5 text-sm text-vermelho flex items-center gap-1.5"><IconeAlerta className="size-4 shrink-0" />{erro}</p>;
  return ajuda ? <p className="mt-1.5 text-[0.8rem] leading-snug text-suave">{ajuda}</p> : null;
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Bloco numerado do formulário, com ícone, título e uma linha explicando para que serve. */
export function Secao({ id, numero, icone, titulo, descricao, children, extra }: { id: string; numero: number; icone: ReactNode; titulo: string; descricao: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <section id={id} data-etapa={id} aria-labelledby={`${id}-titulo`} className="cartao bg-card border border-borda rounded-[1.25rem] scroll-mt-24 sombra-suave">
      <header className="flex items-start gap-4 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-borda">
        <span className="relative grid place-items-center size-11 shrink-0 rounded-2xl bg-bege text-caramelo">
          {icone}
          <span className="absolute -top-1.5 -right-1.5 grid place-items-center size-5 rounded-full bg-marrom-950 text-creme text-[0.62rem] font-bold">{numero}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="titulo text-xl leading-tight">{titulo}</h2>
          <p className="mt-0.5 text-sm text-suave">{descricao}</p>
        </div>
        {extra}
      </header>
      <div className="px-5 sm:px-7 py-5 sm:py-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Texto com contador de caracteres, ícone à esquerda e (opcional) caixa alta enquanto digita. */
export function CampoTexto({
  nome, rotulo, padrao, placeholder, ajuda, maximo, icone, maiusculas, linhas, obrigatorio, className = '', id: idProprio,
}: {
  nome: string; rotulo: string; padrao?: string | null; placeholder?: string; ajuda?: ReactNode; maximo?: number; icone?: ReactNode;
  maiusculas?: boolean; linhas?: number; obrigatorio?: boolean; className?: string; /** Id fixo (fotos e vídeos leem a referência por ele). */ id?: string;
}) {
  const { id, erro, valorInicial, chave, comum } = useCampo(nome, padrao);
  const [tamanho, setTamanho] = useState(valorInicial.length);
  const perto = maximo && tamanho > maximo * 0.9;
  const props = {
    ...comum, id: idProprio ?? id, defaultValue: valorInicial, placeholder, maxLength: maximo,
    onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const t = e.currentTarget;
      if (maiusculas) { const p = t.selectionStart; t.value = t.value.toUpperCase(); t.setSelectionRange(p, p); }
      setTamanho(t.value.length);
    },
  };
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <Rotulo htmlFor={props.id} obrigatorio={obrigatorio}>{rotulo}</Rotulo>
        {maximo && <span className={`text-[0.7rem] tabular-nums mb-2 ${perto ? 'text-vermelho' : 'text-suave/70'}`}>{tamanho}/{maximo}</span>}
      </div>
      <div className="relative">
        {icone && !linhas && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-suave pointer-events-none">{icone}</span>}
        {linhas
          ? <textarea key={chave} rows={linhas} className={`${classeCampo} h-auto py-2.5 leading-relaxed resize-y`} {...props} />
          : <input key={chave} type="text" autoComplete="off" className={`${classeCampo} ${icone ? 'pl-10' : ''} ${maiusculas ? 'font-mono tracking-wider uppercase' : ''}`} {...props} />}
      </div>
      <Mensagem id={id} erro={erro} ajuda={ajuda} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

type OpcaoSeg = { valor: string; rotulo: string; icone?: ReactNode };

/** Grupo de botões de rádio em pílulas (gênero, estação): tudo à vista, um toque para escolher. */
export function Segmentado({ nome, rotulo, opcoes, padrao, ajuda, obrigatorio }: { nome: string; rotulo: string; opcoes: OpcaoSeg[]; padrao?: string | null; ajuda?: ReactNode; obrigatorio?: boolean }) {
  const { id, erro, valorInicial, chave } = useCampo(nome, padrao);
  return (
    <fieldset aria-describedby={erro ? `${id}-erro` : undefined}>
      <legend className="block rotulo text-suave mb-2">{rotulo}{obrigatorio && <span className="text-vermelho ml-0.5" aria-hidden="true">*</span>}</legend>
      <div key={chave} className={`inline-flex flex-wrap gap-1 p-1 rounded-2xl bg-bege/70 border ${erro ? 'border-vermelho' : 'border-borda'}`}>
        {opcoes.map(o => (
          <label key={o.valor} className="relative cursor-pointer">
            <input type="radio" name={nome} value={o.valor} defaultChecked={valorInicial === o.valor} className="peer sr-only" />
            <span className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm text-suave transition-all peer-hover:text-marrom-950 peer-checked:bg-card peer-checked:text-marrom-950 peer-checked:font-semibold peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-caramelo">
              {o.icone}{o.rotulo}
            </span>
          </label>
        ))}
      </div>
      <Mensagem id={id} erro={erro} ajuda={ajuda} />
    </fieldset>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Chave liga/desliga com título e explicação (um checkbox por baixo: manda "on" quando ligado). */
export function Interruptor({ nome, titulo, descricao, padrao, tom = 'escuro', icone }: { nome: string; titulo: string; descricao: ReactNode; padrao?: boolean; tom?: 'escuro' | 'imperdivel' | 'oliva'; icone?: ReactNode }) {
  const { id, marcado, chave } = useCampo(nome, padrao);
  const cor = { escuro: 'peer-checked:bg-marrom-950', imperdivel: 'peer-checked:bg-imperdivel', oliva: 'peer-checked:bg-oliva' }[tom];
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none rounded-2xl p-3 -mx-3 hover:bg-creme/70 transition-colors">
      {icone && <span className="mt-0.5 text-suave">{icone}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-marrom-950">{titulo}</span>
        <span className="block text-[0.8rem] leading-snug text-suave mt-0.5">{descricao}</span>
      </span>
      <span className="relative shrink-0 mt-0.5">
        <input key={chave} id={id} name={nome} type="checkbox" role="switch" defaultChecked={marcado} className="peer sr-only" />
        <span className={`block w-11 h-6 rounded-full bg-borda-forte transition-colors ${cor} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-caramelo`} />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Categoria com "+ Nova categoria…": o campo do nome novo só aparece quando essa opção é escolhida. */
export function SeletorCategoria({ categorias, padrao }: { categorias: { id: number; nome: string }[]; padrao?: number | null }) {
  const cat = useCampo('categoriaId', padrao);
  const nova = useCampo('novaCategoria');
  const [valor, setValor] = useState(cat.valorInicial);
  return (
    <div className="grid gap-4">
      <div>
        <Rotulo htmlFor={cat.id} obrigatorio>Categoria</Rotulo>
        <select key={cat.chave} {...cat.comum} defaultValue={cat.valorInicial} onChange={e => setValor(e.target.value)} className={classeCampo}>
          <option value="">Escolha…</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="nova">+ Nova categoria…</option>
        </select>
        <Mensagem id={cat.id} erro={cat.erro} />
      </div>
      {valor === 'nova' && (
        <div className="animate-[aparecer_.2s_ease-out] rounded-2xl border border-dashed border-caramelo/50 bg-bege/40 p-4">
          <Rotulo htmlFor={nova.id} obrigatorio>Nome da nova categoria</Rotulo>
          <input key={nova.chave} {...nova.comum} defaultValue={nova.valorInicial} placeholder="Ex.: Macacões" autoFocus className={classeCampo} />
          <Mensagem id={nova.id} erro={nova.erro} ajuda="A categoria é criada ao salvar e passa a valer para os outros produtos." />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

const CORES_RAPIDAS = ['Preto', 'Branco', 'Off White', 'Cinza', 'Marinho', 'Azul', 'Jeans', 'Verde', 'Oliva', 'Bege', 'Caramelo', 'Marrom', 'Vinho', 'Vermelho', 'Rosa', 'Amarelo', 'Estampado'];
const TOM_EXTRA: Record<string, string> = { Caramelo: '#a5683c' };

/** Bolinha com o tom aproximado da cor (estampa vira um degradê). */
export function Amostra({ cor, className = 'size-5' }: { cor: string | null | undefined; className?: string }) {
  const tom = (cor && TOM_EXTRA[cor]) || tomDaCor(cor);
  if (!tom) return <span className={`${className} rounded-full border border-dashed border-borda-forte bg-card shrink-0`} aria-hidden="true" />;
  const fundo = tom === 'estampa' ? 'conic-gradient(#c0312b, #e7c447, #4f7d4c, #3f6ea8, #bba6d8, #c0312b)' : tom;
  return <span className={`${className} rounded-full shrink-0 ${corClara(tom) ? 'border border-borda-forte' : ''}`} style={{ background: fundo }} aria-hidden="true" />;
}

/** Cor com amostra ao vivo e paleta de cores comuns (um toque preenche). */
export function CampoCor({ padrao }: { padrao?: string | null }) {
  const { id, erro, valorInicial, chave, comum } = useCampo('cor', padrao);
  return <CampoCorInterno key={chave} id={id} erro={erro} valorInicial={valorInicial} comum={comum} />;
}

function CampoCorInterno({ id, erro, valorInicial, comum }: { id: string; erro?: string; valorInicial: string; comum: Record<string, unknown> }) {
  const [cor, setCor] = useState(valorInicial);
  const ref = useRef<HTMLInputElement>(null);
  useAvisar(ref, cor);
  return (
    <div>
      <Rotulo htmlFor={id}>Cor</Rotulo>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2"><Amostra cor={cor} /></span>
        <input ref={ref} {...comum} value={cor} onChange={e => setCor(e.target.value)} maxLength={60} placeholder="Ex.: Azul Marinho" autoComplete="off" className={`${classeCampo} pl-11`} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Cores comuns">
        {CORES_RAPIDAS.map(c => {
          const ativa = cor.trim().toLowerCase() === c.toLowerCase();
          return (
            <button key={c} type="button" onClick={() => setCor(c)} aria-pressed={ativa} title={c}
              className={`flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full border text-xs transition-colors ${ativa ? 'border-marrom-950 bg-marrom-950 text-creme' : 'border-borda bg-card text-marrom-900 hover:border-borda-forte'}`}>
              <Amostra cor={c} className="size-5" />{c}
            </button>
          );
        })}
      </div>
      <Mensagem id={id} erro={erro} ajuda="Aparece na página da peça e ajuda a cliente na busca." />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Destaques como etiquetas: Enter acrescenta, × remove. O servidor recebe um por linha, como antes. */
export function EditorDestaques({ padrao }: { padrao: string[] }) {
  const { id, erro, valorInicial, chave } = useCampo('destaques', padrao.join('\n'));
  return <EditorDestaquesInterno key={chave} id={id} erro={erro} inicial={valorInicial.split(/\r?\n/).map(l => l.trim()).filter(Boolean)} />;
}

const SUGESTOES = ['Tecido macio', 'Não amassa', 'Toque gelado', 'Modelagem ampla', 'Cintura alta', 'Com elastano', 'Proteção UV', 'Peça básica'];

function EditorDestaquesInterno({ id, erro, inicial }: { id: string; erro?: string; inicial: string[] }) {
  const [itens, setItens] = useState(inicial);
  const [texto, setTexto] = useState('');
  const oculto = useRef<HTMLInputElement>(null);
  useAvisar(oculto, itens);
  const incluir = (t: string) => {
    const v = t.trim().slice(0, 80);
    if (v && !itens.some(i => i.toLowerCase() === v.toLowerCase()) && itens.length < 10) setItens(l => [...l, v]);
    setTexto('');
  };
  return (
    <div>
      <Rotulo htmlFor={id}>Destaques</Rotulo>
      <input ref={oculto} type="hidden" name="destaques" value={itens.join('\n')} />
      <div className={`${classeCampo} !h-auto min-h-11 flex flex-wrap items-center gap-1.5 py-1.5 focus-within:border-marrom-950`}>
        {itens.map((t, i) => (
          <span key={t} className="inline-flex items-center gap-1 h-7 pl-3 pr-1 rounded-full bg-bege text-sm text-marrom-950">
            {t}
            <button type="button" onClick={() => setItens(l => l.filter((_, k) => k !== i))} className="grid place-items-center size-5 rounded-full hover:bg-borda-forte/60" aria-label={`Tirar o destaque ${t}`}>
              <IconeFechar className="size-3" />
            </button>
          </span>
        ))}
        <input id={id} value={texto} onChange={e => setTexto(e.target.value)} placeholder={itens.length ? 'Mais um…' : 'Digite e tecle Enter'}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); incluir(texto); }
            else if (e.key === 'Backspace' && !texto && itens.length) setItens(l => l.slice(0, -1));
          }}
          onBlur={() => texto && incluir(texto)}
          className="flex-1 min-w-36 h-8 bg-transparent outline-none border-0 !rounded-none px-1" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGESTOES.filter(s => !itens.some(i => i.toLowerCase() === s.toLowerCase())).slice(0, 6).map(s => (
          <button key={s} type="button" onClick={() => incluir(s)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-borda-forte text-xs text-suave hover:text-marrom-950 hover:border-marrom-950">
            <IconeMais className="size-3" />{s}
          </button>
        ))}
      </div>
      <Mensagem id={id} erro={erro} ajuda="Aparecem em lista na página da peça. Curtos e objetivos; até 10." />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

/** Formata o valor digitado como "1.259,70" ao sair do campo; texto que não for número fica como está (o servidor avisa). */
function formatar(t: string) {
  const v = lerValor(t);
  return Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : t;
}

function Dinheiro({ nome, rotulo, padrao, ajuda, obrigatorio, aoMudar, destaque }: { nome: string; rotulo: ReactNode; padrao: string; ajuda?: ReactNode; obrigatorio?: boolean; aoMudar: (v: string) => void; destaque?: ReactNode }) {
  const { id, erro, valorInicial, chave, comum } = useCampo(nome, padrao);
  useEffect(() => { aoMudar(valorInicial); }, [valorInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <Rotulo htmlFor={id} obrigatorio={obrigatorio}>{rotulo}</Rotulo>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-suave pointer-events-none">R$</span>
        <input key={chave} {...comum} type="text" inputMode="decimal" autoComplete="off" defaultValue={valorInicial} placeholder="0,00"
          onInput={e => aoMudar(e.currentTarget.value)}
          onBlur={e => { const t = e.currentTarget; t.value = t.value.trim() ? formatar(t.value) : ''; aoMudar(t.value); }}
          className={`${classeCampo} pl-10 text-right tabular-nums font-semibold text-base ${destaque ? 'pr-20' : ''}`} />
        {destaque && <span className="absolute right-2 top-1/2 -translate-y-1/2">{destaque}</span>}
      </div>
      <Mensagem id={id} erro={erro} ajuda={ajuda} />
    </div>
  );
}

/**
 * Preço de venda, preço cheio e custo, com o resumo ao vivo: desconto que a cliente vê, lucro e margem por peça.
 * Repete no navegador as regras do servidor (cheio ≥ venda), só para avisar antes de salvar.
 */
export function PrecosProduto({ preco, precoCheio, custo }: { preco: string; precoCheio: string; custo: string }) {
  const [v, setV] = useState({ preco, precoCheio, custo });
  const venda = lerValor(v.preco);
  const cheio = v.precoCheio.trim() ? lerValor(v.precoCheio) : venda;
  const c = v.custo.trim() ? lerValor(v.custo) : NaN;
  const okVenda = Number.isFinite(venda) && venda > 0;
  const desconto = okVenda && Number.isFinite(cheio) ? descontoPct(venda, cheio) : 0;
  const cheioMenor = okVenda && Number.isFinite(cheio) && cheio < venda;
  const lucro = okVenda && Number.isFinite(c) ? venda - c : NaN;
  const margem = Number.isFinite(lucro) ? (lucro / venda) * 100 : NaN;
  const markup = Number.isFinite(c) && c > 0 && okVenda ? venda / c : NaN;
  const corMargem = !Number.isFinite(margem) ? '' : margem < 0 ? 'var(--color-vermelho)' : margem < 30 ? 'var(--color-caramelo)' : 'var(--color-oliva)';

  return (
    <div className="grid gap-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <Dinheiro nome="preco" rotulo="Preço de venda" padrao={preco} obrigatorio aoMudar={x => setV(s => ({ ...s, preco: x }))} ajuda="O que a cliente paga." />
        <Dinheiro nome="precoCheio" rotulo="Preço cheio (de)" padrao={precoCheio} aoMudar={x => setV(s => ({ ...s, precoCheio: x }))}
          ajuda="Maior que o de venda = promoção. Vazio = igual ao de venda."
          destaque={desconto > 0 ? <span className="rounded-full bg-imperdivel text-white text-xs font-bold px-2 py-1">−{desconto}%</span> : undefined} />
        <Dinheiro nome="custo" rotulo={<>Custo <span className="normal-case tracking-normal font-normal">· só gestor</span></>} padrao={custo} aoMudar={x => setV(s => ({ ...s, custo: x }))}
          ajuda="Nunca aparece na loja nem para a vendedora." />
      </div>

      {cheioMenor && (
        <p className="flex items-start gap-2 rounded-xl bg-vermelho/5 border border-vermelho/30 px-3.5 py-2.5 text-sm text-vermelho" role="status">
          <IconeAlerta className="size-4 mt-0.5 shrink-0" />O preço cheio está menor que o de venda. Aumente o preço cheio ou deixe em branco.
        </p>
      )}

      <div className="grid sm:grid-cols-3 gap-3" aria-live="polite">
        <Resumo rotulo="Na loja aparece">
          {okVenda ? (
            <span className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-lg font-extrabold ${desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(venda)}</span>
              {desconto > 0 && <s className="text-sm text-suave">{brl(cheio)}</s>}
            </span>
          ) : <span className="text-suave">—</span>}
          {desconto > 0 && <span className="block text-xs text-suave mt-0.5">Cliente economiza {brl(cheio - venda)}</span>}
        </Resumo>
        <Resumo rotulo="Lucro por peça">
          {Number.isFinite(lucro) ? <span className="text-lg font-extrabold" style={{ color: corMargem }}>{brl(lucro)}</span> : <span className="text-suave text-sm">Informe o custo</span>}
          {Number.isFinite(markup) && <span className="block text-xs text-suave mt-0.5">Markup {markup.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×</span>}
        </Resumo>
        <Resumo rotulo="Margem">
          {Number.isFinite(margem) ? (
            <>
              <span className="text-lg font-extrabold" style={{ color: corMargem }}>{Math.round(margem)}%</span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-borda overflow-hidden"><span className="block h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, margem))}%`, background: corMargem }} /></span>
            </>
          ) : <span className="text-suave text-sm">—</span>}
        </Resumo>
      </div>
      {Number.isFinite(margem) && margem < 0 && (
        <p className="flex items-start gap-2 text-sm text-vermelho"><IconeAlerta className="size-4 mt-0.5 shrink-0" />Vendendo abaixo do custo: prejuízo de {brl(-lucro)} por peça.</p>
      )}
    </div>
  );
}

function Resumo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-creme/80 border border-borda px-4 py-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-suave mb-1">{rotulo}</div>
      {children}
    </div>
  );
}
