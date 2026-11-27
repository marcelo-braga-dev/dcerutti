import { Head } from '@inertiajs/react';
import { Box, Button, Card, CardContent, LinearProgress, Link, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { tempoDesde } from '@/lib/atividade';
import { formatarTelefone } from '@/lib/telefone';
import { corDaMeta } from '@/lib/metas';

type Vendedor = { id: string; nome: string; email: string; ativo: boolean; clientes: number; online: boolean; ultimoAcessoEm: string | null; ultimoLoginEm: string | null; numero: { apelido: string; telefone: string } | null; meta: number; vendido: number };

/** Porta de src/app/(painel)/painel/vendedores/page.tsx. */
export default function Vendedores({ vendedores }: { vendedores: Vendedor[] }) {
  return (
    <PainelLayout>
      <Head title="Vendedores" />
      <CabecalhoPagina sobre="Equipe" titulo="Vendedores" acoes={<Button variant="contained" startIcon={<Add />} href="/painel/vendedores/novo">Novo vendedor</Button>} />
      {vendedores.length === 0 ? <Vazio>Nenhum vendedor cadastrado.</Vazio> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 1.5 }}>
          {vendedores.map(v => {
            const pct = v.meta ? (v.vendido / v.meta) * 100 : 0;
            return (
              <Card key={v.id} sx={{ opacity: v.ativo ? 1 : 0.6 }}><CardContent sx={{ display: 'grid', gap: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1.5 }}>
                  <Box>
                    <Link href={`/painel/vendedores/${v.id}`} sx={{ fontWeight: 600 }}>{v.nome}</Link> {!v.ativo && <Etiqueta cor="cinza">Inativo</Etiqueta>}
                    <Typography variant="body2" color="text.secondary">{v.email}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {v.online ? <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>● Online agora</Box>
                        : <><Box component="span" sx={{ color: 'text.secondary' }}>Último acesso:</Box> {v.ultimoAcessoEm ? <><strong>{formatarDataHora(v.ultimoAcessoEm)}</strong> <Box component="span" sx={{ color: 'text.secondary' }}>({tempoDesde(v.ultimoAcessoEm)})</Box></> : <Box component="span" sx={{ color: 'text.secondary' }}>sem registro</Box>}</>}
                    </Typography>
                    {v.ultimoLoginEm && <Typography variant="caption" color="text.secondary">Último login: {formatarDataHora(v.ultimoLoginEm)}</Typography>}
                    <Link href="/painel/numeros" variant="body2" sx={{ display: 'block', color: v.numero ? 'success.main' : 'error.main' }}>{v.numero ? `${v.numero.apelido} · ${formatarTelefone(v.numero.telefone)}` : 'Sem número — ligar em Números de WhatsApp'}</Link>
                  </Box>
                  <Link href={`/painel/clientes?vendedor=${v.id}`} variant="body2" color="text.secondary" sx={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{v.clientes} clientes</Link>
                </Stack>
                {v.ativo && <>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14 }}><span>{brl(v.vendido)} de {v.meta ? brl(v.meta) : 'sem meta'}</span><Box component="strong" sx={{ color: corDaMeta(pct) }}>{Math.round(pct)}%</Box></Stack>
                  <LinearProgress variant="determinate" value={Math.min(100, pct)} sx={{ height: 8, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: corDaMeta(pct) } }} />
                </>}
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="contained" href={`/painel/vendedores/${v.id}`}>Perfil</Button>
                  <Button size="small" variant="outlined" href={`/painel/clientes?vendedor=${v.id}`}>Clientes</Button>
                  <Button size="small" variant="outlined" href={`/painel/pedidos?vendedor=${v.id}`}>Pedidos</Button>
                  <Button size="small" variant="outlined" href={`/painel/vendas?vendedor=${v.id}`}>Vendas</Button>
                </Stack>
              </CardContent></Card>
            );
          })}
        </Box>
      )}
    </PainelLayout>
  );
}
