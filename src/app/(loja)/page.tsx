import { PaginaInicial } from '@/components/loja/pagina-inicial';
import { lerConfig } from '@/server/config';

export default async function Inicio() {
  return <PaginaInicial conteudo={(await lerConfig()).inicio} />;
}
