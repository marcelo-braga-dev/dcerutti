import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Cabecalho } from '@/components/loja/cabecalho';
import { Rodape } from '@/components/loja/rodape';
import { ProvedorSacola } from '@/components/loja/sacola';
import { lerConfig } from '@/server/config';
import { usuarioAtual } from '@/server/permissoes';

/** D-09: enquanto `catalogoPublico` estiver desligado, toda a loja exige login. */
export default async function LayoutLoja({ children }: { children: React.ReactNode }) {
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  if (!u && !cfg.catalogoPublico) redirect('/entrar');
  // LGPD: cliente sem aceite registrado (conta antiga ou criada pelo vendedor) aceita antes de usar a loja.
  if (u?.papel === 'cliente' && !u.aceitouPrivacidadeEm) redirect('/privacidade');
  return (
    <ProvedorSacola>
      <Suspense fallback={<div className="h-20 border-b border-borda" />}>
        <Cabecalho usuario={u ? { nome: u.name, papel: u.papel } : null} />
      </Suspense>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8">{children}</main>
      <Rodape whatsapp={cfg.whatsappLoja} />
    </ProvedorSacola>
  );
}
