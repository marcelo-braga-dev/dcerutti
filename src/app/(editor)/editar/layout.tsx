import { exigirPapel } from '@/server/permissoes';
import { marcaAtual } from '@/server/marca';

export async function generateMetadata() {
  return { title: { default: 'Editor', template: `%s · Editor ${(await marcaAtual()).nome}` } };
}

/** Editor visual das páginas da loja: só o gestor. A página aparece como na loja, com os campos editáveis. */
export default async function LayoutEditor({ children }: { children: React.ReactNode }) {
  await exigirPapel(['gestor']);
  return <div className="loja bg-card min-h-dvh">{children}</div>;
}
