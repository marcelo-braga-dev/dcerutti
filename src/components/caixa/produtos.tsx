'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Foto } from '@/components/loja/foto';
import { tomDaCor, corClara } from '@/lib/cores';
import { brl, descontoPct } from '@/lib/dinheiro';
import { FILTROS_CAIXA, type FiltrosCaixa, type ModeloCaixa, type ProdutoCaixa, type VarianteCaixa, filtrarCaixa, linhasDeCor } from '@/lib/caixa';

type Contagens = ReturnType<typeof filtrarCaixa>['contagens'];

/**
 * Filtros do caixa: à vista só o fundamental (gênero, categoria e tamanho em listas); o resto (cor, preço, promoção,
 * esgotadas) em "Mais filtros", num painel suspenso. Tudo quebra a linha: nada precisa ser arrastado para o lado.
 */
export function FiltrosDoCaixa({ f, c, mudar }: { f: FiltrosCaixa; c: Contagens; mudar: (m: Partial<FiltrosCaixa>) => void }) {
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (painel.current && !painel.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const extras = [f.cor, f.preco, f.promo, !f.disponivel].filter(Boolean).length;
  const generos = [{ valor: 'feminino', rotulo: 'Feminino' }, { valor: 'masculino', rotulo: 'Masculino' }, { valor: 'unissex', rotulo: 'Unissex' }]
    .map(g => ({ ...g, n: c.generos.find(x => x.valor === g.valor)?.n ?? 0 }));
  const nomeCategoria = c.categorias.find(x => x.valor === f.categoria)?.rotulo ?? f.categoria;
  type Ativo = { rotulo: string; tirar: Partial<FiltrosCaixa> };
  const ativos = ([
    f.genero && { rotulo: generos.find(g => g.valor === f.genero)?.rotulo ?? f.genero, tirar: { genero: null } },
    f.categoria && { rotulo: nomeCategoria ?? '', tirar: { categoria: null } },
    f.tamanho && { rotulo: `Tam. ${f.tamanho}`, tirar: { tamanho: null } },
    f.cor && { rotulo: f.cor, tirar: { cor: null } },
    f.preco && { rotulo: c.precos.find(p => p.valor === f.preco)?.rotulo ?? f.preco, tirar: { preco: null } },
    f.promo && { rotulo: 'Promoção', tirar: { promo: false } },
    !f.disponivel && { rotulo: 'Com esgotadas', tirar: { disponivel: true } },
  ] as (Ativo | false | null | '')[]).filter((x): x is Ativo => !!x);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 border border-borda-forte bg-card" role="group" aria-label="Gênero">
          {generos.map((g, i) => (
            <button key={g.valor} type="button" aria-pressed={f.genero === g.valor} onClick={() => mudar({ genero: f.genero === g.valor ? null : g.valor })}
              className={`h-11 px-3 sm:px-4 text-sm ${i ? 'border-l border-borda-forte' : ''} ${f.genero === g.valor ? 'bg-marrom-950 text-creme' : 'hover:bg-bege'}`}>
              {g.rotulo} <span className={`text-xs ${f.genero === g.valor ? 'text-areia' : 'text-suave'}`}>{g.n}</span>
            </button>
          ))}
        </div>
        <Lista rotulo="Categoria" valor={f.categoria} opcoes={c.categorias} todas="Todas as categorias" mudar={v => mudar({ categoria: v })} />
        <Lista rotulo="Tamanho" valor={f.tamanho} opcoes={c.tamanhos.map(t => ({ ...t, rotulo: `Tam. ${t.rotulo}` }))} todas="Todos os tamanhos" mudar={v => mudar({ tamanho: v })} />
        <div className="relative" ref={painel}>
          <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
            className={`h-11 px-4 border flex items-center gap-2 text-sm ${aberto || extras ? 'border-marrom-950 bg-card' : 'border-borda-forte bg-card hover:border-marrom-950'}`}>
            Mais filtros{extras > 0 && <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-caramelo text-creme text-[0.65rem]">{extras}</span>}
            <span aria-hidden="true" className={`transition-transform ${aberto ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {aberto && (
            <div className="absolute z-30 left-0 top-full mt-2 w-[min(92vw,26rem)] bg-card border border-borda shadow-2xl p-4 grid gap-4">
              <Bloco titulo="Cor">
                {c.cores.map(x => {
                  const tom = tomDaCor(x.valor);
                  return (
                    <button key={x.valor} type="button" onClick={() => mudar({ cor: f.cor === x.valor ? null : x.valor })} aria-pressed={f.cor === x.valor}
                      className={`h-9 pl-2 pr-3 flex items-center gap-2 border text-sm ${f.cor === x.valor ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte hover:border-marrom-950'}`}>
                      <span className={`size-4 rounded-full ${tom === 'estampa' ? 'bg-[conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#c0312b)]' : ''} ${corClara(tom) ? 'border border-borda-forte' : ''}`} style={tom && tom !== 'estampa' ? { background: tom } : undefined} />
                      {x.valor} <span className={`text-xs ${f.cor === x.valor ? 'text-areia' : 'text-suave'}`}>{x.n}</span>
                    </button>
                  );
                })}
              </Bloco>
              <Bloco titulo="Preço">
                {c.precos.map(p => <Opcao key={p.valor} ativo={f.preco === p.valor} onClick={() => mudar({ preco: f.preco === p.valor ? null : p.valor as FiltrosCaixa['preco'] })} n={p.n}>{p.rotulo}</Opcao>)}
              </Bloco>
              <Bloco titulo="Mostrar">
                <Opcao ativo={f.promo} onClick={() => mudar({ promo: !f.promo })} n={c.promo} destaque>Só promoção</Opcao>
                <Opcao ativo={!f.disponivel} onClick={() => mudar({ disponivel: !f.disponivel })}>Incluir esgotadas</Opcao>
              </Bloco>
              <div className="flex justify-between border-t border-borda pt-3">
                <button type="button" onClick={() => mudar({ cor: null, preco: null, promo: false, disponivel: true })} className="text-sm text-suave underline underline-offset-4">Limpar estes</button>
                <button type="button" onClick={() => setAberto(false)} className="h-10 px-4 bg-marrom-950 text-creme rotulo !text-[0.62rem]">Pronto</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {ativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros escolhidos">
          {ativos.map(a => (
            <button key={a.rotulo} type="button" onClick={() => mudar(a.tirar)} className="h-8 pl-3 pr-2 flex items-center gap-2 bg-bege text-sm hover:bg-areia" aria-label={`Tirar o filtro ${a.rotulo}`}>
              {a.rotulo}<span aria-hidden="true">×</span>
            </button>
          ))}
          {ativos.length > 1 && <button type="button" onClick={() => mudar({ ...FILTROS_CAIXA, q: f.q })} className="text-xs text-caramelo underline underline-offset-4 px-1">Limpar tudo</button>}
        </div>
      )}
    </div>
  );
}

function Lista({ rotulo, valor, opcoes, todas, mudar }: { rotulo: string; valor: string | null; opcoes: { valor: string; rotulo: string; n: number }[]; todas: string; mudar: (v: string | null) => void }) {
  return (
    <label className="relative">
      <span className="sr-only">{rotulo}</span>
      <select value={valor ?? ''} onChange={e => mudar(e.target.value || null)}
        className={`h-11 pl-3 pr-8 border text-sm bg-card cursor-pointer appearance-none ${valor ? 'border-marrom-950 font-semibold' : 'border-borda-forte hover:border-marrom-950'}`}>
        <option value="">{todas}</option>
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo} ({o.n})</option>)}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-suave">▾</span>
    </label>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="rotulo !text-[0.62rem] text-suave">{titulo}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Opcao({ ativo, onClick, n, destaque, children }: { ativo: boolean; onClick: () => void; n?: number; destaque?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`h-9 px-3 flex items-center gap-1.5 border text-sm ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : `border-borda-forte hover:border-marrom-950 ${destaque ? 'text-imperdivel' : 'text-marrom-900'}`}`}>
      {children}{n != null && <span className={`text-xs ${ativo ? 'text-areia' : 'text-suave'}`}>{n}</span>}
    </button>
  );
}

/**
 * Card do caixa: um por modelo, com uma linha por cor e os tamanhos daquela cor, como a grade da arara. Um toque
 * escolhe a cor e o tamanho juntos, sem nada escondido. O número miúdo é quanto resta (já descontando a venda); código
 * e estoque completos ficam na dica. A foto mostra a cor sob o mouse (ou a primeira).
 */
export function CardCaixa({ m, naVenda, adicionar }: { m: ModeloCaixa; naVenda: Map<number, number>; adicionar: (p: ProdutoCaixa, v: VarianteCaixa) => void }) {
  const [foco, setFoco] = useState(0);
  const linhas = linhasDeCor(m);
  const atual = linhas[foco]?.p ?? m.cores[0];
  const unico = new Set(m.cores.map(c => c.preco)).size === 1;
  const total = m.cores.reduce((a, c) => a + c.variantes.reduce((b, v) => b + v.disponivel, 0), 0);
  return (
    <article className={`bg-card border border-borda p-2 flex gap-3 ${total ? '' : 'opacity-60'}`}>
      <div className="relative shrink-0 w-14 h-[70px] bg-[#efebe5] overflow-hidden">
        <Foto src={atual.imagem} alt="" sizes="56px" className="!text-[0.5rem] text-center" />
      </div>
      <div className="min-w-0 flex-1 grid gap-1.5 content-start">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[0.8rem] leading-snug text-marrom-950 line-clamp-2" title={m.nome}>{m.nome}</span>
          {unico && <Preco p={m.cores[0]} />}
        </div>
        <ul className="grid gap-1.5">
          {linhas.map((l, i) => (
            <li key={l.chave} onMouseEnter={() => setFoco(i)} className="flex items-center gap-2 border-t border-borda/60 pt-1.5">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-marrom-900" title={l.cor ?? 'Cor única'}>
                <Bolinha cor={l.cor} />
                <span className="truncate">{l.cor ?? 'Única'}</span>
              </span>
              <div className="min-w-0 flex-1 flex flex-wrap gap-1.5">
                {l.tamanhos.map(t => {
                  const ja = t.opcoes.reduce((a, o) => a + (naVenda.get(o.v.id) ?? 0), 0);
                  const livre = t.opcoes.reduce((a, o) => a + o.v.disponivel, 0) - ja;
                  // Mesma cor e tamanho em duas referências: sai da que tem mais peças livres.
                  const escolha = [...t.opcoes].sort((a, b) => (b.v.disponivel - (naVenda.get(b.v.id) ?? 0)) - (a.v.disponivel - (naVenda.get(a.v.id) ?? 0)))[0];
                  const codigos = t.opcoes.map(o => o.v.codigoInterno ?? '—').join(', ');
                  return (
                    <button key={t.tamanho} type="button" disabled={livre <= 0} onClick={() => adicionar(escolha.p, escolha.v)} onFocus={() => setFoco(i)}
                      title={`${l.cor ?? ''} ${t.tamanho} · Cód. ${codigos} · ${livre + ja} em estoque${ja ? ` · ${ja} na venda` : ''}`}
                      aria-label={`${l.cor ?? ''} tamanho ${t.tamanho}, ${Math.max(0, livre)} em estoque`}
                      className={`min-w-10 h-10 px-2 border text-sm flex items-center justify-center gap-1 transition-colors ${ja ? 'border-oliva bg-oliva/10 text-oliva' : 'border-borda-forte'} ${livre <= 0 ? 'opacity-35 line-through cursor-not-allowed' : 'hover:bg-marrom-950 hover:text-creme hover:border-marrom-950 active:scale-95'}`}>
                      <span className="font-display font-bold">{t.tamanho}</span>
                      {livre > 0 && <span className="text-[0.6rem] opacity-60">{livre}</span>}
                    </button>
                  );
                })}
              </div>
              {!unico && <Preco p={l.p} />}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Preco({ p }: { p: ProdutoCaixa }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  return (
    <span className="shrink-0 text-right leading-tight">
      <span className={`block font-display font-extrabold text-sm ${desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
      {desconto > 0 && <span className="block text-[0.65rem] text-imperdivel">−{desconto}%</span>}
    </span>
  );
}

function Bolinha({ cor }: { cor: string | null }) {
  const tom = tomDaCor(cor);
  return (
    <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-full ${tom === 'estampa' ? 'bg-[conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#c0312b)]' : tom ? '' : 'bg-bege'} ${!tom || corClara(tom) ? 'border border-borda-forte' : ''}`}
      style={tom && tom !== 'estampa' ? { background: tom } : undefined} />
  );
}
