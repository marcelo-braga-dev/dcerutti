import { Box, Stack, Typography } from '@mui/material';
import { ContaCliente, VazioConta, type ResumoConta } from '@/Components/loja/ContaCliente';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { estiloTitulo } from '@/Components/loja/Vitrine';
import { Etiqueta } from '@/Components/ui/Basicos';
import { formatarData } from '@/lib/datas';
import { aberta, SITUACOES, situacaoDe, type StatusGravado } from '@/lib/sugestoes';

type Sugestao = { id: string; titulo: string; vendedor: string | null; pecas: number; criadaEm: string; validaAte: string; status: StatusGravado; enviadaEm: string | null; link: string };
const COR = { bege: 'contorno', caramelo: 'caramelo', oliva: 'oliva', escuro: 'contorno', cinza: 'cinza' } as const;

/** As sugestões que quem atende separou para a cliente (D-27); cada uma abre a página de escolher. */
export default function Sugestoes({ conta, sugestoes }: { conta: ResumoConta; sugestoes: Sugestao[] }) {
  return (
    <ContaCliente conta={conta} titulo="Sugestões para você">
      <Box sx={{ mb: 3 }}>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: { xs: 24, sm: 30 } }}>Sugestões para você</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Peças que separaram pensando em você. Abra, marque o que gostou e escolha o tamanho.</Typography>
      </Box>
      {!sugestoes.length ? <VazioConta>Nenhuma sugestão ainda.</VazioConta> : (
        <Stack spacing={1.5}>
          {sugestoes.map(s => {
            const situacao = situacaoDe({ status: s.status, validaAte: new Date(s.validaAte), enviadaEm: s.enviadaEm ? new Date(s.enviadaEm) : null });
            const pode = aberta(situacao);
            return (
              <LinkSimples key={s.id} href={s.link} sx={{ borderRadius: 6, bgcolor: 'marca.creme', border: 1, borderColor: 'transparent', p: 2.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, '&:hover': { borderColor: 'marca.marrom-950' } }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, color: 'marca.marrom-950' }}>{s.titulo}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.vendedor?.split(' ')[0]} · {s.pecas} {s.pecas === 1 ? 'peça' : 'peças'} · {formatarData(s.criadaEm)}{pode ? ` · até ${formatarData(s.validaAte)}` : ''}</Typography>
                </Box>
                <Etiqueta cor={pode ? 'caramelo' : COR[SITUACOES[situacao].cor]}>{pode ? 'Escolher' : SITUACOES[situacao].rotulo}</Etiqueta>
              </LinkSimples>
            );
          })}
        </Stack>
      )}
    </ContaCliente>
  );
}
