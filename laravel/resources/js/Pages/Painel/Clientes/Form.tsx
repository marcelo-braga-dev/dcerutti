import { Head, usePage } from '@inertiajs/react';
import { Card, CardContent, Link } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { FormCliente } from '@/Components/painel/cliente/FormCliente';

/** Cadastrar cliente (src/app/(painel)/painel/clientes/novo/page.tsx). */
export default function NovoCliente({ vendedores }: { vendedores: { id: string; nome: string }[] | null }) {
  const gestor = usePage().props.usuario?.papel === 'gestor';
  return (
    <PainelLayout titulo="Novo cliente">
      <Head title="Novo cliente" />
      <Link href="/painel/clientes" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Clientes</Link>
      <CabecalhoPagina sobre="Clientes" titulo="Cadastrar cliente" />
      <Card sx={{ maxWidth: 820 }}><CardContent sx={{ p: { sm: 4 } }}><FormCliente cliente={null} vendedores={vendedores} gestor={gestor} /></CardContent></Card>
    </PainelLayout>
  );
}
