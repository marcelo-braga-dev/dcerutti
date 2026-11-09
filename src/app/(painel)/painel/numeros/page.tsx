import { CabecalhoPagina } from '@/components/ui/basicos';
import { NumerosQuadro } from '@/components/painel/numeros-quadro';
import { quadroDeNumeros } from '@/server/consultas/numeros';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Números de WhatsApp' };

/** D-31: os números são da loja; a gestora decide quem usa cada um. */
export default async function Numeros() {
  const u = await exigirPapel(['gestor']);
  const quadro = await quadroDeNumeros(u);
  return (
    <>
      <CabecalhoPagina sobre="Equipe" titulo="Números de WhatsApp">
        Os números são da loja. Arraste as pessoas para definir quem usa cada um. As clientes falam com o número principal (★) da vendedora delas.
      </CabecalhoPagina>
      <NumerosQuadro {...quadro} />
    </>
  );
}
