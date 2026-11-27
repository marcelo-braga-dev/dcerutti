import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, Card, Stack, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FotoCheia } from '@/Components/loja/Vitrine';
import { BotaoCopiar } from '@/Components/painel/vitrine/PecasVitrine';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { STATUS_VITRINE, TIPOS_VITRINE, type StatusVitrine, type TipoVitrine } from '@/lib/vitrines';

type Item = {
  id: string; slug: string; tipo: TipoVitrine; status: StatusVitrine; titulo: string; inicioPrevisto: string | null; criadoEm: string; visitas: number;
  responsavel: string | null; pecas: number; atendimentos: number; pedidos: number; imagens: string[]; vendido: number;
};
type Props = { lista: Item[]; contagem: Record<string, number>; emUso: number; status: StatusVitrine | null; site: string };

/** Cor da situação: no ar em vermelho (como na página pública), ativas em oliva, o resto discreto. */
export const COR_STATUS: Record<StatusVitrine, { bgcolor: string; color: string; border?: number }> = {
  rascunho: { bgcolor: 'marca.card', color: 'text.secondary', border: 1 }, agendada: { bgcolor: 'secondary.main', color: 'marca.creme' }, no_ar: { bgcolor: 'imperdivel.main', color: '#fff' },
  publicada: { bgcolor: 'marca.oliva', color: 'marca.creme' }, encerrada: { bgcolor: 'rgba(46,37,32,.7)', color: 'marca.creme' }, arquivada: { bgcolor: 'marca.card', color: 'text.secondary', border: 1 },
};

/** Vitrines no painel (porta de painel/vitrines/page.tsx): cartões com a capa das peças, a situação e o resultado. */
export default function Vitrines({ lista, contagem, emUso, status, site }: Props) {
  const dominio = site.replace(/^https?:\/\//, '');
  const filtros = [
    { href: '/painel/vitrines', rotulo: 'Em uso', n: emUso, ativo: !status },
    ...(Object.keys(STATUS_VITRINE) as StatusVitrine[]).filter(s => contagem[s] || status === s).map(s => ({ href: `/painel/vitrines?status=${s}`, rotulo: STATUS_VITRINE[s], n: contagem[s] ?? 0, ativo: status === s })),
  ];
  const gestor = usePage().props.usuario?.papel === 'gestor';

  return (
    <PainelLayout>
      <Head title="Vitrines" />
      <CabecalhoPagina sobre="Instagram" titulo="Vitrines" acoes={<Button href="/painel/vitrines/nova" variant="contained">+ Nova vitrine</Button>}>
        Peças de lives e publicações numa página aberta, com pedido pelo WhatsApp.
      </CabecalhoPagina>

      <Card variant="outlined" sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary' }}>Link da bio</Typography>
          <Typography sx={{ fontWeight: 600, wordBreak: 'break-all' }}>{dominio}/vitrines</Typography>
          <Typography variant="caption" color="text.secondary">Mostra a live no ar (ou a próxima) e as vitrines publicadas. Para falar na live: <strong>{dominio}/live</strong></Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <BotaoCopiar texto={`${site}/vitrines`} rotulo="Copiar link da bio" />
          <Button component="a" href="/vitrines" target="_blank" rel="noopener" variant="outlined" size="small">Abrir</Button>
        </Stack>
      </Card>

      <Stack direction="row" spacing={0.5} component="nav" aria-label="Filtrar por situação" sx={{ mb: 3, p: 0.5, borderRadius: 99, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {filtros.map(f => (
          <LinkSimples key={f.href} href={f.href} aria-current={f.ativo ? 'page' : undefined}
            sx={{ flexShrink: 0, px: 2, height: 36, display: 'inline-flex', alignItems: 'center', gap: 1, borderRadius: 99, fontSize: 14, fontWeight: 600, bgcolor: f.ativo ? 'marca.marrom-950' : 'transparent', color: f.ativo ? 'marca.creme' : 'text.secondary' }}>
            {f.rotulo}<Box component="span" sx={{ fontSize: 11, opacity: 0.7 }}>{f.n}</Box>
          </LinkSimples>
        ))}
      </Stack>

      {lista.length === 0 ? (
        <Vazio>
          {status ? 'Nenhuma vitrine nesta situação.' : 'Nenhuma vitrine ainda. Crie uma para a próxima live ou publicação: escolha as peças, publique e coloque o link na bio.'}
          {!status && <Box sx={{ mt: 2 }}><Button href="/painel/vitrines/nova" variant="contained">+ Nova vitrine</Button></Box>}
        </Vazio>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          {lista.map(v => {
            const quando = v.status === 'agendada' && v.inicioPrevisto ? `Live em ${formatarDataHora(v.inicioPrevisto)}` : `Criada em ${formatarData(v.criadoEm)}`;
            const apagada = v.status === 'encerrada' || v.status === 'arquivada';
            const imagens = v.imagens.length ? v.imagens : [null];
            return (
              <Card key={v.id} variant="outlined" sx={{ borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Box onClick={() => router.visit(`/painel/vitrines/${v.id}`)} sx={{ position: 'relative', height: 160, bgcolor: 'marca.bege', cursor: 'pointer' }}>
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gap: '2px', gridTemplateColumns: `repeat(${Math.min(3, imagens.length)}, 1fr)` }}>
                    {imagens.map((src, i) => <Box key={i} sx={{ position: 'relative', overflow: 'hidden', filter: apagada ? 'grayscale(1)' : undefined }}><FotoCheia src={src} /></Box>)}
                  </Box>
                  <Stack direction="row" spacing={0.75} sx={{ position: 'absolute', left: 12, top: 12 }}>
                    <Box sx={{ height: 24, px: 1.25, borderRadius: 99, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', borderColor: 'marca.borda-forte', ...COR_STATUS[v.status] }}>{STATUS_VITRINE[v.status]}</Box>
                    <Box sx={{ height: 24, px: 1.25, borderRadius: 99, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,.95)' }}>{TIPOS_VITRINE[v.tipo]}</Box>
                  </Stack>
                </Box>
                <Box sx={{ p: 2, display: 'grid', gap: 1.5, flex: 1, alignContent: 'start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <LinkSimples href={`/painel/vitrines/${v.id}`} sx={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.titulo}</LinkSimples>
                    <Typography variant="caption" color="text.secondary">{quando}{gestor && v.responsavel ? ` · ${v.responsavel.split(' ')[0]}` : ''} · {v.pecas} {v.pecas === 1 ? 'peça' : 'peças'}</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, textAlign: 'center' }}>
                    {([['Visitas', v.visitas], ['Atend.', v.atendimentos], ['Pedidos', v.pedidos], ['Vendido', brl(v.vendido).replace(',00', '')]] as const).map(([r, n]) => (
                      <Box key={r} sx={{ borderRadius: 3, bgcolor: 'marca.creme', py: 1, px: 0.5, minWidth: 0 }}>
                        <Box sx={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{r}</Box>
                        <Box sx={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Stack direction="row" spacing={1} sx={{ px: 2, pb: 2 }}>
                  <Button href={`/painel/vitrines/${v.id}`} variant="contained" size="small" sx={{ flex: 1 }}>Abrir</Button>
                  {v.status !== 'arquivada' && <Button component="a" href={`/vitrine/${v.slug}`} target="_blank" rel="noopener" variant="outlined" size="small" aria-label={`Ver a página de ${v.titulo}`}>Ver página</Button>}
                  {v.status !== 'rascunho' && v.status !== 'arquivada' && <BotaoCopiar texto={`${site}/vitrine/${v.slug}`} rotulo="Copiar link" />}
                </Stack>
              </Card>
            );
          })}
        </Box>
      )}
    </PainelLayout>
  );
}
