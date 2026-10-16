import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Cabecalho } from '@/components/loja/cabecalho';
import { Rodape } from '@/components/loja/rodape';
import { WhatsAppFlutuante } from '@/components/loja/whatsapp-flutuante';
import { ProvedorFavoritos } from '@/components/loja/favoritos';
import { GavetaSacola } from '@/components/loja/gaveta-sacola';
import { Rastreador } from '@/components/loja/rastreador';
import { ProvedorSacola } from '@/components/loja/sacola';
import { catalogo } from '@/server/catalogo';
import { favoritosDoClienteLogado } from '@/server/consultas/clientes';
import { lerConfig } from '@/server/config';
import { usuarioAtual } from '@/server/permissoes';
import { caminhoAtual } from '@/server/site';
import { marcaAtual } from '@/server/marca';

/** D-09: enquanto `catalogoPublico` estiver desligado, toda a loja exige login. */
export default async function LayoutLoja({ children }: { children: React.ReactNode }) {
  const [u, cfg, caminho, marca] = await Promise.all([usuarioAtual(), lerConfig(), caminhoAtual(), marcaAtual()]);
  const volta = caminho === '/' ? '' : `?volta=${encodeURIComponent(caminho)}`;
  // B-04: quem abre um link de produto sem estar logado volta para ele depois do login.
  if (!u && !cfg.catalogoPublico) redirect(`/entrar${volta}`);
  // LGPD: cliente sem aceite registrado (conta antiga ou criada pelo vendedor) aceita antes de usar a loja.
  // Minha conta fica liberada: quem não quer aceitar precisa conseguir excluir a conta (B-10).
  if (u?.papel === 'cliente' && !u.aceitouPrivacidadeEm && !caminho.startsWith('/minha-conta')) redirect(`/privacidade${volta}`);
  // Menu do celular e atalhos da busca: as 10 categorias com mais peças disponíveis.
  const porCategoria = new Map<string, { rotulo: string; href: string; n: number }>();
  for (const p of await catalogo()) {
    if (!p.variantes.some(v => v.disponivel > 0)) continue;
    const c = porCategoria.get(p.categoriaSlug) ?? { rotulo: p.categoria, href: `/catalogo?categoria=${p.categoriaSlug}`, n: 0 };
    c.n++;
    porCategoria.set(p.categoriaSlug, c);
  }
  const atalhos = [...porCategoria.values()].sort((a, b) => b.n - a.n).slice(0, 10).map(({ rotulo, href }) => ({ rotulo, href }));
  const favoritos = await favoritosDoClienteLogado(u);
  // Histórico do cliente (docs/21): só a navegação de clientes é registrada.
  const rastrear = u?.papel === 'cliente' && cfg.historico.ligado;
  return (
    <ProvedorSacola>
      <ProvedorFavoritos iniciais={favoritos} ativo={u?.papel === 'cliente'}>
      {rastrear && <Suspense><Rastreador /></Suspense>}
      <Suspense fallback={<div className="h-20 border-b border-borda" />}>
        <Cabecalho usuario={u ? { nome: u.name, papel: u.papel } : null} atalhos={atalhos} whatsapp={cfg.whatsappLoja} logo={marca.logo} />
      </Suspense>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8">{children}</main>
      <Rodape whatsapp={cfg.whatsappLoja} cidade={cfg.cidadeCondicional.split('/')[0]} logo={marca.logoClara} nome={marca.nome} slogan={marca.slogan} />
      <WhatsAppFlutuante telefone={cfg.whatsappLoja} />
      <GavetaSacola />
      </ProvedorFavoritos>
    </ProvedorSacola>
  );
}
