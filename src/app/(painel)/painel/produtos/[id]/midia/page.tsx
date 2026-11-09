import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FotosProduto } from '@/components/painel/fotos-produto';
import { VideosProduto } from '@/components/painel/videos-produto';
import { Alerta, CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoEnviar, Formulario } from '@/components/ui/formulario';
import { salvarMidia } from '@/server/acoes/produtos';
import { midiaDaPeca } from '@/server/consultas/produtos';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Fotos e vídeos da peça' };

/** Mídia da peça (docs/26): a vendedora acrescenta fotos e vídeos, sem acesso a preço, custo ou estoque. */
export default async function MidiaDaPeca({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await midiaDaPeca(id) : null;
  if (!p) notFound();
  const restrito = u.papel !== 'gestor';
  return (
    <>
      {!restrito && <Link href={`/painel/produtos/${p.id}`} className="rotulo text-suave hover:text-marrom-950">← Produto</Link>}
      <div className="mt-4" />
      <CabecalhoPagina sobre={p.referencia} titulo={p.nome}>{restrito ? 'Acrescente fotos e vídeos desta peça. Para remover, fale com a gestão.' : 'Fotos e vídeos desta peça.'}</CabecalhoPagina>
      <div className="grid gap-4 max-w-3xl">
        <Alerta tipo="aviso">
          <strong>Gravando no iPhone?</strong> Em Ajustes → Câmera → Formatos, escolha <strong>Mais Compatível</strong>. O formato padrão (HEVC) é recusado, porque não toca em Android nem no Windows. Grave curto e na vertical: até 100 MB.
        </Alerta>
        <Cartao className="p-5 sm:p-8">
          <Formulario acao={salvarMidia} className="grid gap-6">
            <input type="hidden" name="id" value={p.id} />
            {/* Fotos e vídeos leem a referência deste campo, o mesmo id do formulário de produto. */}
            <input type="hidden" id="campo-referencia" value={p.referencia} />
            <FotosProduto inicial={p.imagens.map(i => i.url)} restrito={restrito} />
            <VideosProduto inicial={p.videos} restrito={restrito} />
            <div><BotaoEnviar>Salvar</BotaoEnviar></div>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
