import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Comprar } from '@/components/loja/comprar';
import { BolinhaCor } from '@/components/loja/cores';
import { BotaoFavorito } from '@/components/loja/favoritos';
import { Foto } from '@/components/loja/foto';
import { Galeria } from '@/components/loja/galeria';
import { Vitrine } from '@/components/loja/vitrine';
import { IconeCaminhao, IconeCasa, IconeConversa, IconeSelo } from '@/components/ui/icones';
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

  return (
    <div className="py-6 sm:py-10 pb-28 lg:pb-10">
      <nav className="text-sm text-suave mb-6 flex flex-wrap gap-2" aria-label="Caminho">
        <Link href="/catalogo" className="hover:text-caramelo">Catálogo</Link>/
        <Link href={`/catalogo?genero=${p.genero}`} className="hover:text-caramelo capitalize">{p.genero}</Link>/
        <Link href={`/catalogo?categoria=${p.categoriaSlug}`} className="hover:text-caramelo">{p.categoria}</Link>
      </nav>
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-8 lg:gap-14">
        <Galeria imagens={p.imagens} nome={p.nome} />
        <div className="lg:sticky lg:top-28 self-start grid gap-6">
          <div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="rotulo text-suave">{p.marca}</span>
              {p.imperdivel && <span className="rotulo !text-[0.6rem] bg-imperdivel text-white px-2 py-1">Imperdível</span>}
            </div>
            <div className="flex items-start justify-between gap-4 mt-2">
              <div className="min-w-0">
                <h1 className="titulo text-2xl sm:text-3xl !normal-case !tracking-normal">{titulo}</h1>
                <p className="text-suave text-sm mt-1">{p.corNome ? `${p.corNome} · ` : ''}Ref. {p.referencia}</p>
              </div>
              <BotaoFavorito produtoId={p.id} nome={p.nome} grande className="shrink-0" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className={`font-display font-extrabold text-3xl ${p.imperdivel ? 'text-imperdivel' : desconto ? 'text-caramelo' : 'text-marrom-950'}`}>{brl(p.preco)}</span>
              {desconto > 0 && (
                <>
                  <s className="text-suave">{brl(p.precoCheio)}</s>
                  <span className={`rotulo !text-[0.65rem] px-2 py-1 ${p.imperdivel ? 'bg-imperdivel text-white' : 'bg-caramelo text-creme'}`}>−{desconto}%</span>
                </>
              )}
            </div>
            {desconto > 0 && <p className="text-sm text-oliva mt-1">Você economiza {brl(p.precoCheio - p.preco)}</p>}
            {cfg.parcelas > 1 && <p className="text-sm text-suave mt-1">ou {cfg.parcelas}x de {brl(p.preco / cfg.parcelas)}</p>}
          </div>

          {cores.length > 1 && (
            <div>
              <div className="rotulo text-marrom-950 mb-3">Cor <span className="text-suave">· {p.corNome ?? '—'}</span> <span className="text-suave font-normal normal-case tracking-normal">({cores.length} cores)</span></div>
              <div className="flex flex-wrap gap-2">
                {cores.map(c => {
                  const atual = c.referencia === p.referencia;
                  return (
                    <Link key={c.referencia} href={`/produto/${encodeURIComponent(c.referencia)}`} scroll={false} title={c.cor ?? undefined} aria-label={`Cor ${c.cor ?? c.referencia}${c.disponivel ? '' : ' (esgotada)'}`} aria-current={atual ? 'true' : undefined}
                      className={`relative w-14 aspect-[3/4] bg-bege border-2 ${atual ? 'border-marrom-950' : 'border-transparent hover:border-borda-forte'} ${c.disponivel ? '' : 'opacity-40'}`}>
                      <Foto src={c.imagem} alt="" sizes="56px" />
                      <span className="absolute -bottom-1.5 -right-1.5 p-0.5 bg-creme rounded-full"><BolinhaCor c={c} tamanho="size-3.5" /></span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <Comprar p={p} atendimento={atendimento} />

          <ul className="grid sm:grid-cols-2 gap-px bg-borda border border-borda text-sm">
            <Vantagem icone={<IconeCasa />} titulo="Condicional">Em {cfg.cidadeCondicional}, prove em casa e pague só o que ficar.</Vantagem>
            <Vantagem icone={<IconeCaminhao />} titulo="Entrega e frete">{cfg.frete ? (cfg.frete.gratisAcima > 0 ? `Frete grátis acima de ${brl(cfg.frete.gratisAcima)}.` : `${brl(cfg.frete.valor)} por pedido.`) : 'Combinados com quem te atende pelo WhatsApp.'}</Vantagem>
            <Vantagem icone={<IconeConversa />} titulo="Atendimento de verdade">Seu pedido vai para {atendimento.nome === 'a loja' ? 'a loja' : atendimento.nome.split(' ')[0]}, no WhatsApp.</Vantagem>
            <Vantagem icone={<IconeSelo />} titulo="Peça original">{p.marca}, com estoque na loja em Maravilha (SC).</Vantagem>
          </ul>

          <div className="border-t border-borda">
            {p.descricao && <Dobra titulo="Descrição" aberta><p className="whitespace-pre-line">{p.descricao}</p></Dobra>}
            {p.destaques.length > 0 && <Dobra titulo="Destaques" aberta={!p.descricao}><ul className="list-disc pl-5 grid gap-1">{p.destaques.map(d => <li key={d}>{d}</li>)}</ul></Dobra>}
            <Dobra titulo="Detalhes da peça" aberta={!p.descricao && !p.destaques.length}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                {detalhes.map(([k, v]) => <div key={k} className="contents"><dt className="text-suave">{k}</dt><dd className="text-marrom-950">{v}</dd></div>)}
              </dl>
            </Dobra>
          </div>
        </div>
      </div>

      <div className="grid gap-16 mt-16 sm:mt-20 [&>*]:min-w-0">
        <Vitrine titulo="Combine com" sobre="Para completar o look" produtos={combina} parcelas={cfg.parcelas} />
        <Vitrine titulo={`Mais ${p.categoria.toLowerCase()}`} produtos={mais} parcelas={cfg.parcelas} link={`/catalogo?categoria=${p.categoriaSlug}`} />
      </div>
    </div>
  );
}

function Vantagem({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="bg-card p-4 flex gap-3">
      <span className="text-caramelo shrink-0 mt-0.5">{icone}</span>
      <span><span className="block rotulo text-marrom-950">{titulo}</span><span className="text-suave">{children}</span></span>
    </li>
  );
}

function Dobra({ titulo, aberta, children }: { titulo: string; aberta?: boolean; children: ReactNode }) {
  return (
    <details open={aberta} className="group border-b border-borda">
      <summary className="flex justify-between items-center cursor-pointer min-h-14 rotulo text-marrom-950 list-none">
        {titulo}<span className="group-open:rotate-45 transition-transform text-lg leading-none" aria-hidden="true">+</span>
      </summary>
      <div className="pb-5 text-sm text-marrom-900 leading-relaxed">{children}</div>
    </details>
  );
}
