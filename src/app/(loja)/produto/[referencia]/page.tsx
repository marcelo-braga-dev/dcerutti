import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Comprar } from '@/components/loja/comprar';
import { BolinhaCor } from '@/components/loja/cores';
import { BotaoFavorito } from '@/components/loja/favoritos';
import { Foto } from '@/components/loja/foto';
import { Galeria } from '@/components/loja/galeria';
import { Vitrine } from '@/components/loja/vitrine';
import { IconeCaminhao, IconeCasa, IconeCheck, IconeConversa, IconeEtiqueta, IconeSelo } from '@/components/ui/icones';
import { brl, descontoPct } from '@/lib/dinheiro';
import { emEstoque, ESTACOES, GENEROS, grupoDaCategoria, umPorModelo, type ProdutoCatalogo } from '@/lib/catalogo';
import { nomeDoModelo } from '@/lib/cores';
import { catalogo, produtoPorReferencia } from '@/server/catalogo';
import { lerConfig } from '@/server/config';
import { atendimentoDoCliente } from '@/server/consultas/clientes';
import { usuarioAtual } from '@/server/permissoes';

type Props = { params: Promise<{ referencia: string }> };

export async function generateMetadata({ params }: Props) {
  const p = await produtoPorReferencia(decodeURIComponent((await params).referencia));
  return { title: p?.nome ?? 'Produto' };
}

export default async function Produto({ params }: Props) {
  const p = await produtoPorReferencia(decodeURIComponent((await params).referencia));
  if (!p) notFound();
  const [lista, cfg, u] = await Promise.all([catalogo(), lerConfig(), usuarioAtual()]);
  const atendimento = (await atendimentoDoCliente(u)) ?? { nome: 'a loja', telefone: cfg.whatsappLoja };
  const desconto = descontoPct(p.preco, p.precoCheio);
  const cores = p.cores ?? [];
  const titulo = cores.length > 1 ? nomeDoModelo(p.nome) : p.nome;
  const grupo = grupoDaCategoria(p.categoria);

  // Vitrines: peças de outro grupo do mesmo gênero (para combinar) e mais da mesma categoria. Uma por modelo.
  const prontas = (x: ProdutoCatalogo) => x.modelo !== p.modelo && emEstoque(x) && x.imagens.length > 0;
  const mesmoGenero = (x: ProdutoCatalogo) => x.genero === p.genero || x.genero === 'unissex' || p.genero === 'unissex';
  const complementar: Record<string, string> = { 'Parte de cima': 'Parte de baixo', 'Parte de baixo': 'Parte de cima' };
  const combina = complementar[grupo]
    ? umPorModelo(lista.filter(x => prontas(x) && mesmoGenero(x) && grupoDaCategoria(x.categoria) === complementar[grupo])).sort((a, b) => b.id - a.id).slice(0, 4)
    : [];
  const mais = umPorModelo(lista.filter(x => prontas(x) && x.categoriaSlug === p.categoriaSlug && !combina.includes(x)))
    .sort((a, b) => Number(mesmoGenero(b)) - Number(mesmoGenero(a)) || b.id - a.id).slice(0, 8);

  const detalhes = ([
    ['Marca', p.marca],
    ['Categoria', [p.categoria, p.subcategoria].filter(Boolean).join(' · ')],
    ['Cor', p.corNome ?? p.cor],
    ['Gênero', GENEROS.find(g => g.valor === p.genero)?.rotulo],
    ['Estação', p.estacao ? ESTACOES.find(e => e.valor === p.estacao)?.rotulo : null],
    ['Composição', p.composicao],
    ['Referência', p.referencia],
  ] as [string, string | null | undefined][]).filter((d): d is [string, string] => !!d[1]);

  const economia = p.precoCheio - p.preco;

  return (
    <div className="pt-3 sm:pt-6 pb-32 lg:pb-10">
      <nav className="text-sm text-suave mb-4 sm:mb-6 flex flex-wrap items-center gap-1.5" aria-label="Caminho">
        <Link href="/" className="hover:text-marrom-950">Início</Link><span aria-hidden="true">/</span>
        <Link href={`/catalogo?genero=${p.genero}`} className="hover:text-marrom-950 capitalize">{p.genero}</Link><span aria-hidden="true">/</span>
        <Link href={`/catalogo?categoria=${p.categoriaSlug}`} className="hover:text-marrom-950">{p.categoria}</Link>
      </nav>
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-14 xl:gap-20">
        <Galeria imagens={p.imagens} videos={p.videos} nome={p.nome} />
        <div className="lg:sticky lg:top-36 self-start grid gap-7">
          <div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-suave">{p.marca}</span>
              {p.imperdivel && <span className="px-2.5 py-1 rounded-full bg-imperdivel text-white text-[0.68rem] font-bold">Imperdível</span>}
            </div>
            <div className="flex items-start justify-between gap-4 mt-2">
              <div className="min-w-0">
                <h1 className="titulo text-3xl sm:text-4xl leading-tight">{titulo}</h1>
                <p className="text-suave text-sm mt-2">{p.corNome ? `${p.corNome} · ` : ''}Ref. {p.referencia}</p>
              </div>
              <BotaoFavorito produtoId={p.id} nome={p.nome} grande className="shrink-0" />
            </div>
          </div>

          <div className="rounded-3xl bg-creme p-5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${p.imperdivel || desconto ? 'text-imperdivel' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
              {desconto > 0 && (
                <>
                  <s className="text-suave">{brl(p.precoCheio)}</s>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.imperdivel ? 'bg-imperdivel text-white' : 'bg-marrom-950 text-creme'}`}>−{desconto}%</span>
                </>
              )}
            </div>
            {cfg.parcelas > 1 && <p className="text-sm text-marrom-900 mt-1.5">ou <strong>{cfg.parcelas}x de {brl(p.preco / cfg.parcelas)}</strong></p>}
            {desconto > 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-oliva"><IconeEtiqueta className="size-4" />Você economiza {brl(economia)}</p>}
          </div>

          {cores.length > 1 && (
            <div>
              <div className="text-sm font-bold text-marrom-950 mb-3">Cor <span className="font-normal text-suave">· {p.corNome ?? '—'} ({cores.length} cores)</span></div>
              <div className="flex flex-wrap gap-2.5">
                {cores.map(c => {
                  const atual = c.referencia === p.referencia;
                  return (
                    <Link key={c.referencia} href={`/produto/${encodeURIComponent(c.referencia)}`} scroll={false} title={c.cor ?? undefined} aria-label={`Cor ${c.cor ?? c.referencia}${c.disponivel ? '' : ' (esgotada)'}`} aria-current={atual ? 'true' : undefined}
                      className={`relative w-14 aspect-[3/4] rounded-xl bg-bege transition ${atual ? 'ring-2 ring-marrom-950 ring-offset-2 ring-offset-card' : 'hover:ring-1 hover:ring-borda-forte hover:ring-offset-2'} ${c.disponivel ? '' : 'opacity-40'}`}>
                      <span className="absolute inset-0 rounded-xl overflow-hidden"><Foto src={c.imagem} alt="" sizes="56px" /></span>
                      <span className="absolute -bottom-1.5 -right-1.5 p-0.5 bg-card rounded-full"><BolinhaCor c={c} tamanho="size-3.5" /></span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <Comprar p={p} atendimento={atendimento} />

          <ul className="grid grid-cols-2 gap-2 text-sm">
            <Vantagem icone={<IconeCasa />} titulo="Prove em casa">Em {cfg.cidadeCondicional}, pague só o que ficar.</Vantagem>
            <Vantagem icone={<IconeCaminhao />} titulo="Entrega">{cfg.frete ? (cfg.frete.gratisAcima > 0 ? `Frete grátis acima de ${brl(cfg.frete.gratisAcima)}.` : `${brl(cfg.frete.valor)} por pedido.`) : 'Combinada pelo WhatsApp.'}</Vantagem>
            <Vantagem icone={<IconeConversa />} titulo="Atendimento">Seu pedido vai para {atendimento.nome === 'a loja' ? 'a loja' : atendimento.nome.split(' ')[0]}.</Vantagem>
            <Vantagem icone={<IconeSelo />} titulo="Original">{p.marca}, com estoque em Maravilha (SC).</Vantagem>
          </ul>

          <div className="border-t border-borda">
            {p.descricao && <Dobra titulo="Descrição" aberta><p className="whitespace-pre-line">{p.descricao}</p></Dobra>}
            {p.destaques.length > 0 && <Dobra titulo="Destaques" aberta={!p.descricao}><ul className="grid gap-2">{p.destaques.map(d => <li key={d} className="flex gap-2"><IconeCheck className="size-4 mt-0.5 text-oliva shrink-0" />{d}</li>)}</ul></Dobra>}
            <Dobra titulo="Detalhes da peça" aberta={!p.descricao && !p.destaques.length}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
                {detalhes.map(([k, v]) => <div key={k} className="contents"><dt className="text-suave">{k}</dt><dd className="text-marrom-950">{v}</dd></div>)}
              </dl>
            </Dobra>
          </div>
        </div>
      </div>

      <div className="grid gap-20 mt-20 sm:mt-28 [&>*]:min-w-0">
        <Vitrine titulo="Combine com" sobre="Para completar o look" produtos={combina} parcelas={cfg.parcelas} />
        <Vitrine titulo={`Mais ${p.categoria.toLowerCase()}`} sobre="Você também pode gostar" produtos={mais} parcelas={cfg.parcelas} link={`/catalogo?categoria=${p.categoriaSlug}`} />
      </div>
    </div>
  );
}

function Vantagem({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-borda p-3.5 flex gap-3">
      <span className="size-9 shrink-0 grid place-items-center rounded-full bg-creme text-caramelo [&>svg]:size-[1.15rem]">{icone}</span>
      <span className="min-w-0"><span className="block font-bold text-marrom-950 text-[0.82rem]">{titulo}</span><span className="block text-suave text-xs leading-snug mt-0.5">{children}</span></span>
    </li>
  );
}

function Dobra({ titulo, aberta, children }: { titulo: string; aberta?: boolean; children: ReactNode }) {
  return (
    <details open={aberta} className="group border-b border-borda">
      <summary className="flex justify-between items-center cursor-pointer min-h-14 text-[0.95rem] font-bold text-marrom-950 list-none">
        {titulo}<span className="size-8 grid place-items-center rounded-full bg-creme group-open:rotate-45 transition-transform text-lg leading-none" aria-hidden="true">+</span>
      </summary>
      <div className="pb-5 text-sm text-marrom-900 leading-relaxed">{children}</div>
    </details>
  );
}
