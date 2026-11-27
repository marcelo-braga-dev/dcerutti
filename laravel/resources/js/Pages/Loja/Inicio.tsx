import { Head } from '@inertiajs/react';
import LojaLayout from '@/Layouts/LojaLayout';
import { PaginaInicial, type DadosInicio } from '@/Components/loja/PaginaInicial';
import type { ConteudoInicio } from '@/lib/conteudo-inicio';

/** Página inicial da loja (src/app/(loja)/page.tsx). */
export default function Inicio({ dados, conteudo }: { dados: DadosInicio; conteudo: ConteudoInicio }) {
  return (
    <LojaLayout>
      <Head title="Início" />
      <PaginaInicial dados={dados} conteudo={conteudo} />
    </LojaLayout>
  );
}
