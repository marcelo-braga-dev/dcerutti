import { usePage } from '@inertiajs/react';
import { Box, Typography } from '@mui/material';
import { ContaCliente, VazioConta, type ResumoConta } from '@/Components/loja/ContaCliente';
import { useFavoritos } from '@/Components/loja/Favoritos';
import { estiloTitulo, GradeProdutos, type Cartao } from '@/Components/loja/Vitrine';

/** Peças guardadas com o coração (D-22). As que saíram do catálogo não aparecem. */
export default function Favoritos({ conta, produtos, fora }: { conta: ResumoConta; produtos: Cartao[]; fora: number }) {
  const { loja } = usePage().props;
  const { ids } = useFavoritos();
  const lista = produtos.filter(p => ids.has(p.id));
  return (
    <ContaCliente conta={conta} titulo="Favoritos">
      <Box sx={{ mb: 3 }}>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: { xs: 24, sm: 30 } }}>Favoritos</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {lista.length ? `${lista.length} ${lista.length === 1 ? 'peça guardada' : 'peças guardadas'}. Toque no coração para tirar.` : 'Toque no coração de uma peça para guardar aqui.'}
          {fora > 0 && ` ${fora} ${fora === 1 ? 'saiu' : 'saíram'} do catálogo.`}
        </Typography>
      </Box>
      {lista.length === 0 ? <VazioConta acao={{ href: '/catalogo', rotulo: 'Ver o catálogo' }}>Nenhuma peça guardada ainda.</VazioConta> : <GradeProdutos produtos={lista} parcelas={loja?.parcelas ?? 0} />}
    </ContaCliente>
  );
}
