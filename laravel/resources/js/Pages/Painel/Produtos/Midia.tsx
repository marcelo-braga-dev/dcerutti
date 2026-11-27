import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Button, Card, CardContent, Link, Stack } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { FotosProduto, VideosProduto, type VideoProduto } from '@/Components/painel/produto/Midia';

type Props = { produto: { id: number; referencia: string; nome: string; imagens: string[]; videos: VideoProduto[] } };

/** Só fotos e vídeos da peça (docs/26): a vendedora acrescenta; remover é com o gestor. */
export default function MidiaDaPeca({ produto: p }: Props) {
  const { usuario, flash } = usePage().props;
  const restrito = usuario?.papel !== 'gestor';
  const form = useForm({ imagens: p.imagens, videos: p.videos });
  const erro = (form.errors as Record<string, string>).erro;
  return (
    <PainelLayout titulo="Fotos e vídeos">
      <Head title={`Fotos e vídeos · ${p.referencia}`} />
      <Link href={restrito ? '/painel' : `/painel/produtos/${p.id}`} variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Voltar</Link>
      <CabecalhoPagina sobre={p.referencia} titulo={p.nome}>{restrito ? 'Acrescente fotos e vídeos da peça. Para remover, fale com a gestão.' : 'Fotos e vídeos da peça, sem mexer em preço e estoque.'}</CabecalhoPagina>
      <Card sx={{ maxWidth: 900 }}><CardContent component="form" onSubmit={e => { e.preventDefault(); form.put(`/painel/produtos/${p.id}/midia`, { preserveScroll: true }); }}>
        <Stack sx={{ gap: 3 }}>
          <FotosProduto referencia={p.referencia} valor={form.data.imagens} mudar={v => form.setData('imagens', v)} restrito={restrito} iniciais={p.imagens} />
          <VideosProduto referencia={p.referencia} valor={form.data.videos} mudar={v => form.setData('videos', v)} restrito={restrito} iniciais={p.videos} />
          {erro && <Alert severity="error">{erro}</Alert>}
          {flash.sucesso && <Alert severity="success">{flash.sucesso}</Alert>}
          <div><Button type="submit" variant="contained" loading={form.processing} disabled={!form.isDirty}>Salvar</Button></div>
        </Stack>
      </CardContent></Card>
    </PainelLayout>
  );
}
