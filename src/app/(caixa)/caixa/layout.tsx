import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: { default: 'Caixa', template: "%s · Caixa D'Cerutti" } };

/** Caixa da loja física (D-23): tela própria, sem o menu do painel, para ficar aberta no balcão. Só a equipe. */
export default async function LayoutCaixa({ children }: { children: React.ReactNode }) {
  await exigirPapel(EQUIPE);
  return <div className="min-h-dvh bg-creme">{children}</div>;
}
