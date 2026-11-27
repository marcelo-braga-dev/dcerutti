import { Head } from '@inertiajs/react';
import { Card, CardContent, Link } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { FormVendedor } from '@/Components/painel/vendedor/FormVendedor';

export default function NovoVendedor() {
  return (
    <PainelLayout titulo="Novo vendedor">
      <Head title="Novo vendedor" />
      <Link href="/painel/vendedores" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Vendedores</Link>
      <CabecalhoPagina sobre="Equipe" titulo="Cadastrar vendedor" />
      <Card sx={{ maxWidth: 820 }}><CardContent sx={{ p: { sm: 4 } }}><FormVendedor /></CardContent></Card>
    </PainelLayout>
  );
}
