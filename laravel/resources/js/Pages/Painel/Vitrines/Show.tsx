import { useEffect, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import QRCode from 'qrcode';
import PainelLayout from '@/Layouts/PainelLayout';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FormVitrine, type DadosVitrine } from '@/Components/painel/vitrine/FormVitrine';
import { BotaoCopiar, PecasVitrine, type PecaVitrine } from '@/Components/painel/vitrine/PecasVitrine';
import { enviarAcao } from '@/lib/acao';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { STATUS_VITRINE, TIPOS_VITRINE, type StatusVitrine, type TipoVitrine } from '@/lib/vitrines';

type Vitrine = DadosVitrine & { slug: string; status: StatusVitrine; responsavel: string | null; pecas: PecaVitrine[]; avisos: string[] };
type Resultado = {
  visitas: number; atendimentos: number; ganhos: number; perdidos: number; pedidos: number; vendas: number; valorAberto: number; valorVendido: number; conversao: number;
  pecas: { produtoId: number; nome: string; pedidas: number; vendidas: number }[];
};
type Props = { vitrine: Vitrine; resultado: Resultado; site: string; vendedoras: { id: string; nome: string }[] | null; legendaSugerida: string; proximos: StatusVitrine[] };

const ACAO: Partial<Record<StatusVitrine, string>> = { agendada: 'Agendar live', no_ar: 'Iniciar live', publicada: 'Publicar', encerrada: 'Encerrar', arquivada: 'Arquivar', rascunho: 'Voltar para rascunho' };
const CONFIRMAR: Partial<Record<StatusVitrine, string>> = {
  encerrada: 'Encerrar esta vitrine? A página continua no ar, sem preço especial e sem o pedido pela página.',
  arquivada: 'Arquivar? A página sai do ar, e quem abrir o link verá que não existe.',
};
const ETAPAS: Record<'live' | 'outro', StatusVitrine[]> = { live: ['rascunho', 'agendada', 'no_ar', 'encerrada'], outro: ['rascunho', 'publicada', 'encerrada'] };
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Uma vitrine no painel (porta de painel/vitrines/[id]): etapas, peças, divulgação com QR code, resultado e os dados. */
export default function VitrineShow({ vitrine: v, resultado: r, site, vendedoras, legendaSugerida, proximos }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const [erro, setErro] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const tipo = v.tipo as TipoVitrine;
  const endereco = `${site}/vitrine/${v.slug}`;
  const legenda = v.legenda ?? legendaSugerida;
  const etapas = ETAPAS[tipo === 'live' ? 'live' : 'outro'];
  const atual = v.status === 'arquivada' ? etapas.length : etapas.indexOf(v.status);
  const funil = [
    { rotulo: 'Visitas', valor: r.visitas, base: r.visitas }, { rotulo: 'Atendimentos', valor: r.atendimentos, base: r.visitas },
    { rotulo: 'Pedidos', valor: r.pedidos, base: r.atendimentos }, { rotulo: 'Vendas', valor: r.vendas, base: r.pedidos },
  ];
  useEffect(() => { QRCode.toString(endereco, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2e2520', light: '#ffffff' } }).then(setQr, () => setQr('')); }, [endereco]);

  const mudar = async (s: StatusVitrine) => {
    if (CONFIRMAR[s] && !window.confirm(CONFIRMAR[s])) return;
    setErro(await enviarAcao(`/painel/vitrines/${v.id}/status`, { status: s }));
  };
  const duplicar = () => router.post(`/painel/vitrines/${v.id}/duplicar`, {}, { onError: e => setErro(e.erro ?? 'Não foi possível duplicar.') });

  return (
    <PainelLayout>
      <Head title={v.titulo} />
      <Button href="/painel/vitrines" size="small" sx={{ mb: 2 }}>← Vitrines</Button>
      <Box component="header" sx={{ mb: 3, display: 'grid', gap: 2 }}>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' }}>{TIPOS_VITRINE[tipo]}</Typography>
            <Typography component="h1" variant="h4" sx={{ mt: 0.5 }}>{v.titulo}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Pedidos vão para <strong>{v.responsavel}</strong>{v.inicioPrevisto ? ` · live em ${formatarDataHora(v.inicioPrevisto)}` : ''}</Typography>
          </Box>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {proximos.map(s => <Button key={s} variant={['publicada', 'agendada', 'no_ar'].includes(s) ? 'contained' : 'outlined'} color={['publicada', 'agendada', 'no_ar'].includes(s) ? 'success' : 'primary'} onClick={() => mudar(s)}>{ACAO[s]}</Button>)}
            <Button onClick={duplicar}>Duplicar</Button>
          </Stack>
        </Stack>
        <Stack component="ol" direction="row" useFlexGap aria-label="Etapas da vitrine" sx={{ m: 0, p: 0, listStyle: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          {etapas.map((e, i) => {
            const feito = i < atual, agora = i === atual;
            return (
              <Stack component="li" key={e} direction="row" spacing={1} sx={{ alignItems: 'center' }} aria-current={agora ? 'step' : undefined}>
                <Stack direction="row" spacing={1} sx={{ height: 32, pl: 0.75, pr: 1.5, borderRadius: 99, fontSize: 14, fontWeight: 600, alignItems: 'center', border: !agora && !feito ? 1 : 0, borderColor: 'marca.borda',
                  bgcolor: agora ? (e === 'no_ar' ? 'imperdivel.main' : 'marca.marrom-950') : feito ? 'rgba(107,112,64,.15)' : 'marca.card', color: agora ? (e === 'no_ar' ? '#fff' : 'marca.creme') : feito ? 'marca.oliva' : 'text.secondary' }}>
                  <Box sx={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, bgcolor: agora ? 'rgba(246,239,230,.2)' : feito ? 'marca.oliva' : 'marca.bege', color: feito ? 'marca.creme' : 'inherit' }}>{feito ? '✓' : i + 1}</Box>
                  <span>{STATUS_VITRINE[e]}</span>
                </Stack>
                {i < etapas.length - 1 && <Box aria-hidden sx={{ height: 1, width: 20, bgcolor: feito ? 'marca.oliva' : 'marca.borda-forte' }} />}
              </Stack>
            );
          })}
          {v.status === 'arquivada' && <Typography component="li" variant="body2" color="text.secondary">· Arquivada (fora do ar)</Typography>}
        </Stack>
      </Box>

      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      {(erro || errors.erro) && <Alert severity="error" sx={{ mb: 2 }}>{erro ?? errors.erro}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1fr 24rem' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          {v.avisos.length > 0 && (
            <Box sx={{ borderRadius: 6, border: 1, borderColor: 'rgba(160,106,60,.3)', bgcolor: 'rgba(239,228,214,.6)', p: 2.5 }}>
              <Typography sx={{ fontWeight: 600, color: 'secondary.main', mb: 1 }}>Para conferir antes de divulgar</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 14 }}>{v.avisos.map(a => <li key={a}>{a}</li>)}</Box>
            </Box>
          )}
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 2 }}>
              <Typography component="h2" variant="h6">Peças</Typography>
              <Typography variant="body2" color="text.secondary">{v.pecas.length} {v.pecas.length === 1 ? 'peça' : 'peças'}</Typography>
            </Stack>
            <PecasVitrine id={v.id} pecas={v.pecas} />
          </Card>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Dados da vitrine</Typography>
            <FormVitrine key={v.id} vitrine={v} vendedoras={vendedoras} legendaSugerida={legendaSugerida} />
          </Card>
        </Stack>

        <Stack spacing={3}>
          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 2 }}>
            <Typography component="h2" variant="h6">Divulgar</Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box role="img" aria-label="QR code da vitrine" sx={{ width: 112, flexShrink: 0, borderRadius: 4, border: 1, borderColor: 'marca.borda', bgcolor: '#fff', p: 0.75, '& svg': { width: '100%', height: 'auto', display: 'block' } }} dangerouslySetInnerHTML={{ __html: qr }} />
              <Box sx={{ minWidth: 0, display: 'grid', gap: 1 }}>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{endereco}</Typography>
                {qr && <Box component="a" href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} download={`vitrine-${v.slug}.svg`} sx={{ fontSize: 14, color: 'inherit', justifySelf: 'start' }}>Baixar o QR code</Box>}
              </Box>
            </Stack>
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
              <BotaoCopiar texto={endereco} rotulo="Copiar endereço" />
              <BotaoCopiar texto={legenda} rotulo="Copiar legenda" />
              <Button component="a" href={`/vitrine/${v.slug}`} target="_blank" rel="noopener" variant="outlined" size="small">Ver a página</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">Links em legendas e comentários não abrem no Instagram: use a bio, o story (figurinha de link) ou o Direct. O QR code serve para story, provador e etiqueta.</Typography>
          </Card>

          <Card variant="outlined" component="section" aria-label="Resultado" sx={{ p: 2.5, display: 'grid', gap: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography component="h2" variant="h6">Resultado</Typography>
              <Typography variant="body2" color="text.secondary">Conversão {r.conversao}%</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box sx={{ borderRadius: 4, bgcolor: 'marca.marrom-950', color: 'marca.creme', p: 2 }}><Box sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'marca.areia' }}>Vendido</Box><Box sx={{ fontWeight: 800, fontSize: 20 }}>{brl(r.valorVendido)}</Box></Box>
              <Box sx={{ borderRadius: 4, bgcolor: 'marca.creme', p: 2 }}><Box sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Em aberto</Box><Box sx={{ fontWeight: 800, fontSize: 20 }}>{brl(r.valorAberto)}</Box></Box>
            </Box>
            <Stack component="ul" spacing={1.25} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {funil.map((f, i) => (
                <Box component="li" key={f.rotulo} sx={{ display: 'grid', gap: 0.5 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14 }}><span>{f.rotulo}</span><Box component="span" sx={{ fontWeight: 600 }}>{f.valor}{i > 0 && f.base > 0 && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}> · {pct(f.valor, f.base)}%</Box>}</Box></Stack>
                  <Box sx={{ height: 8, borderRadius: 99, bgcolor: 'marca.creme', overflow: 'hidden' }}><Box sx={{ height: '100%', borderRadius: 99, bgcolor: 'secondary.main', width: `${funil[0].valor ? Math.max(2, pct(f.valor, funil[0].valor)) : 0}%` }} /></Box>
                </Box>
              ))}
            </Stack>
            {r.atendimentos > 0 && <LinkSimples href={`/painel/atendimento/lista?vitrine=${v.id}`} sx={{ fontSize: 14, textDecoration: 'underline' }}>Ver os atendimentos</LinkSimples>}
          </Card>

          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1 }}>
            <Typography component="h2" variant="h6">Por peça</Typography>
            {r.pecas.length === 0 ? <Typography variant="body2" color="text.secondary">Sem peças.</Typography> : (
              <Stack component="ul" spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none', fontSize: 14 }}>
                {r.pecas.map(p => <Stack component="li" key={p.produtoId} direction="row" sx={{ justifyContent: 'space-between', gap: 1.5 }}><Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</Box><Box sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{p.pedidas} pedidas · {p.vendidas} vendidas</Box></Stack>)}
              </Stack>
            )}
          </Card>
        </Stack>
      </Box>
    </PainelLayout>
  );
}
