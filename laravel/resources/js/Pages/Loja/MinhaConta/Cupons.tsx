import { Box, Button, Stack, Typography } from '@mui/material';
import { ContaCliente, rotulo, VazioConta, type ResumoConta } from '@/Components/loja/ContaCliente';
import { Etiqueta } from '@/Components/ui/Basicos';
import { formatarData } from '@/lib/datas';

type Cupom = { id: number; codigo: string; origem: 'manual' | 'primeiraCompra' | 'proximaCompra'; regra: string; quemAplica: 'cliente' | 'equipe' | 'ambos'; inicioEm: string; fimEm: string | null; situacao: 'disponivel' | 'agendado' | 'usado' | 'expirado' };

const ROTULO = { disponivel: { texto: 'Disponível', cor: 'oliva' }, agendado: { texto: 'Em breve', cor: 'caramelo' }, usado: { texto: 'Usado', cor: 'cinza' }, expirado: { texto: 'Vencido', cor: 'cinza' } } as const;
const ORIGEM = { primeiraCompra: 'Primeira compra', proximaCompra: 'Presente pela sua compra', manual: 'Cupom para você' };

/** Os cupons da cliente (primeira compra, próxima compra e os criados para ela). */
export default function Cupons({ conta, cupons }: { conta: ResumoConta; cupons: Cupom[] }) {
  return (
    <ContaCliente conta={conta} titulo="Meus cupons">
      {!cupons.length ? <VazioConta>{conta.cuponsLigados ? 'Você ainda não tem cupons. Quando ganhar um, ele aparece aqui.' : 'Nenhum cupom por enquanto.'}</VazioConta> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 2 }}>
          {cupons.map(c => {
            const ok = c.situacao === 'disponivel';
            return (
              <Stack component="article" key={c.id} spacing={1} sx={{ borderRadius: 6, border: '2px dashed', borderColor: ok ? 'rgba(94,107,67,.6)' : 'divider', bgcolor: ok ? 'rgba(94,107,67,.05)' : 'background.paper', opacity: ok ? 1 : 0.8, p: 3 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={rotulo}>{ORIGEM[c.origem]}</Typography><Etiqueta cor={ROTULO[c.situacao].cor}>{ROTULO[c.situacao].texto}</Etiqueta></Stack>
                <Typography sx={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.04em', color: 'marca.marrom-950' }}>{c.codigo}</Typography>
                <Typography variant="body2">{c.regra}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.situacao === 'agendado' ? `Começa em ${formatarData(c.inicioEm)}` : c.fimEm ? `${c.situacao === 'expirado' ? 'Venceu' : 'Vale até'} ${formatarData(c.fimEm)}` : 'Sem data para acabar'}
                  {c.quemAplica === 'equipe' && ' · peça ao seu vendedor para aplicar'}
                </Typography>
                {ok && c.quemAplica !== 'equipe' && <Box><Button href={`/sacola?cupom=${encodeURIComponent(c.codigo)}`} variant="contained" color="success" size="small" sx={{ borderRadius: 99 }}>Usar na sacola</Button></Box>}
              </Stack>
            );
          })}
        </Box>
      )}
    </ContaCliente>
  );
}
