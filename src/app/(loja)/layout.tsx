import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Cabecalho } from '@/components/loja/cabecalho';
import { Rodape } from '@/components/loja/rodape';
import { Rastreador } from '@/components/loja/rastreador';
import { ProvedorSacola } from '@/components/loja/sacola';
import { lerConfig } from '@/server/config';
import { usuarioAtual } from '@/server/permissoes';
import { caminhoAtual } from '@/server/site';

/** D-09: enquanto `catalogoPublico` estiver desligado, toda a loja exige login. */
export default async function LayoutLoja({ children }: { children: React.ReactNode }) {
  const [u, cfg, caminho] = await Promise.all([usuarioAtual(), lerConfig(), caminhoAtual()]);
  const volta = caminho === '/' ? '' : `?volta=${encodeURIComponent(caminho)}`;
  // B-04: quem abre um link de produto sem estar logado volta para ele depois do login.
  if (!u && !cfg.catalogoPublico) redirect(`/entrar${volta}`);
  // LGPD: cliente sem aceite registrado (conta antiga ou criada pelo vendedor) aceita antes de usar a loja.
  // Minha conta fica liberada: quem não quer aceitar precisa conseguir excluir a conta (B-10).
  if (u?.papel === 'cliente' && !u.aceitouPrivacidadeEm && !caminho.startsWith('/minha-conta')) redirect(`/privacidade${volta}`);
  // Histórico do cliente (docs/21): só a navegação de clientes é registrada.
  const rastrear = u?.papel === 'cliente' && cfg.historico.ligado;
  return (
    <ProvedorSacola>
      {rastrear && <Suspense><Rastreador /></Suspense>}
      <Suspense fallback={<div className="h-20 border-b border-borda" />}>
        <Cabecalho usuario={u ? { nome: u.name, papel: u.papel } : null} />
      </Suspense>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8">{children}</main>
      <Rodape whatsapp={cfg.whatsappLoja} />
    </ProvedorSacola>
  );
}
