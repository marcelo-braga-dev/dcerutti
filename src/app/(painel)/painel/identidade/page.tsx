import { CabecalhoPagina } from '@/components/ui/basicos';
import { EditorIdentidade } from '@/components/painel/editor-identidade';
import { lerConfig } from '@/server/config';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Identidade visual' };

/** Identidade visual da loja (D-25): cores, logos e favicon. Só o gestor. */
export default async function Identidade() {
  await exigirPapel(['gestor']);
  const cfg = await lerConfig();
  return (
    <>
      <CabecalhoPagina sobre="Loja" titulo="Identidade visual">
        Cores, logos e favicon da loja, do painel e do caixa. Veja na prévia antes de salvar.
      </CabecalhoPagina>
      <EditorIdentidade inicial={cfg.identidade} />
    </>
  );
}
