import { Suspense } from 'react';
import { Avisos, avisosDaLoja } from '@/components/loja/avisos';
import { Cabecalho } from '@/components/loja/cabecalho';
import { EditorInicio } from '@/components/loja/editor-inicio';
import { ProvedorFavoritos } from '@/components/loja/favoritos';
import { PaginaInicial } from '@/components/loja/pagina-inicial';
import { ProvedorSacola } from '@/components/loja/sacola';
import { lerConfig } from '@/server/config';
import { marcaAtual } from '@/server/marca';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Página inicial' };

/** Editor visual da página inicial: a página real, com textos, fotos do banner e seções editáveis. */
export default async function EditarInicio() {
  const [u, cfg, marca] = await Promise.all([exigirPapel(['gestor']), lerConfig(), marcaAtual()]);
  return (
    <ProvedorSacola>
      <ProvedorFavoritos iniciais={[]} ativo={false}>
        <EditorInicio inicial={cfg.inicio}>
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
