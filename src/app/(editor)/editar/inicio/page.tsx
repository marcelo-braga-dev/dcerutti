import { Suspense } from 'react';
import type { GrupoDestinos } from '@/components/loja/editavel';
import { Avisos, avisosDaLoja } from '@/components/loja/avisos';
import { Cabecalho } from '@/components/loja/cabecalho';
import { EditorInicio } from '@/components/loja/editor-inicio';
import { ProvedorFavoritos } from '@/components/loja/favoritos';
import { PaginaInicial } from '@/components/loja/pagina-inicial';
import { ProvedorSacola } from '@/components/loja/sacola';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';
import { marcaAtual } from '@/server/marca';
import { exigirPapel } from '@/server/permissoes';
import { FAIXAS_PRECO } from '@/lib/catalogo';

export const metadata = { title: 'Página inicial' };

/** Páginas da loja oferecidas na janela de link do editor. */
async function destinosDaLoja(): Promise<GrupoDestinos[]> {
  const lista = await catalogo();
  const unicos = (par: (p: (typeof lista)[number]) => [string, string]) => [...new Map(lista.map(par))].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  return [
    { grupo: 'Catálogo', itens: [
      { rotulo: 'Todas as peças', href: '/catalogo' },
      { rotulo: 'Novidades', href: '/catalogo?ordem=novidades' },
      { rotulo: 'Promoções', href: '/catalogo?promo=1' },
      { rotulo: 'Maiores descontos', href: '/catalogo?promo=1&ordem=desconto' },
      { rotulo: 'Imperdível', href: '/catalogo?imperdivel=1' },
      { rotulo: 'Feminino', href: '/catalogo?genero=feminino' },
      { rotulo: 'Masculino', href: '/catalogo?genero=masculino' },
    ] },
    { grupo: 'Categorias', itens: unicos(p => [p.categoriaSlug, p.categoria]).map(([slug, rotulo]) => ({ rotulo, href: `/catalogo?categoria=${slug}` })) },
    { grupo: 'Marcas', itens: unicos(p => [p.marcaSlug, p.marca]).map(([slug, rotulo]) => ({ rotulo, href: `/catalogo?marca=${slug}` })) },
    { grupo: 'Preço', itens: FAIXAS_PRECO.map(f => ({ rotulo: f.rotulo, href: `/catalogo?preco=${f.valor}` })) },
    { grupo: 'Conta do cliente', itens: [
      { rotulo: 'Sacola', href: '/sacola' },
      { rotulo: 'Minha conta', href: '/minha-conta' },
      { rotulo: 'Favoritos', href: '/minha-conta/favoritos' },
    ] },
  ];
}

/** Editor visual da página inicial: a página real, com textos, fotos do banner, links e seções editáveis. */
export default async function EditarInicio() {
  const [u, cfg, marca, destinos] = await Promise.all([exigirPapel(['gestor']), lerConfig(), marcaAtual(), destinosDaLoja()]);
  return (
    <ProvedorSacola>
      <ProvedorFavoritos iniciais={[]} ativo={false}>
        <EditorInicio inicial={cfg.inicio} destinos={destinos}>
          <Avisos itens={avisosDaLoja(cfg)} />
          <div className="[&>header]:!static">
            <Suspense fallback={<div className="h-28 lg:h-32" />}>
              <Cabecalho usuario={{ nome: u.name, papel: u.papel }} logo={marca.logo} whatsapp={cfg.whatsappLoja} />
            </Suspense>
          </div>
          <main className="w-full mx-auto max-w-[1440px] px-4 sm:px-8 pb-24">
            <PaginaInicial conteudo={cfg.inicio} editando />
          </main>
        </EditorInicio>
      </ProvedorFavoritos>
    </ProvedorSacola>
  );
}
