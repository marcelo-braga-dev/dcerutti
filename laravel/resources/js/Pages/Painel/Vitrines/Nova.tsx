import { Head, usePage } from '@inertiajs/react';
import { Alert, Button, Card } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { FormVitrine } from '@/Components/painel/vitrine/FormVitrine';

/** Nova vitrine (porta de painel/vitrines/nova). */
export default function NovaVitrine({ vendedoras }: { vendedoras: { id: string; nome: string }[] | null }) {
  const { errors } = usePage().props as unknown as { errors: Record<string, string> };
  return (
    <PainelLayout>
      <Head title="Nova vitrine" />
      <Button href="/painel/vitrines" size="small" sx={{ mb: 2 }}>← Vitrines</Button>
      <CabecalhoPagina sobre="Vendas" titulo="Nova vitrine">Depois de criar, você adiciona as peças e publica.</CabecalhoPagina>
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 768 }}><FormVitrine vendedoras={vendedoras} /></Card>
    </PainelLayout>
  );
}
