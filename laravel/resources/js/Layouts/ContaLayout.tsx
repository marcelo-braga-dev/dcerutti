import type { ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { Box, Container, Paper } from '@mui/material';
import { ComTema } from '@/tema/ComTema';

/** Entrar, cadastro e senha: logo clara sobre a cor primária e o formulário num cartão. */
export default function ContaLayout({ children }: { children: ReactNode }) {
  const { identidade } = usePage().props;
  return (
    <ComTema area="loja">
      <Box sx={{ minHeight: '100dvh', bgcolor: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', py: { xs: 4, sm: 8 }, px: 2 }}>
        <Box component="img" src={identidade.logoClara.url} alt={identidade.nome} sx={{ width: 180, height: 'auto', mb: 4 }} />
        <Container maxWidth="xs" disableGutters>
          <Paper sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4 }}>{children}</Paper>
        </Container>
      </Box>
    </ComTema>
  );
}
