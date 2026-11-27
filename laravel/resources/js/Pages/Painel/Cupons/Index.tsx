import { Head } from '@inertiajs/react';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { DivulgarCupom } from '@/Components/painel/cupom/DivulgarCupom';
import { QUEM_APLICA, ROTULO_SITUACAO, type QuemAplica, type SituacaoCupom } from '@/lib/cupom';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Base = { id: number; codigo: string; descricao: string | null; tipo: string; quemAplica: QuemAplica; inicioEm: string; fimEm: string | null; regra: string; situacao: SituacaoCupom };
type DoGestor = Base & { origem: string; limiteTotal: number | null; clientes: number; beneficio: string; usos: number; desconto: number };
type Divulgar = Base & { temLimite: boolean; especifico: boolean; clientes: { id: string; nome: string }[] };
type Props = { gestor: boolean; ligados: boolean; site: string; cupons: (DoGestor | Divulgar)[] };

const COR = { ativo: 'oliva', agendado: 'caramelo', expirado: 'cinza', esgotado: 'vermelho', desativado: 'cinza' } as const;
const linkDe = (site: string, codigo: string, quem: string) => (quem === 'equipe' ? null : `${site}/sacola?cupom=${encodeURIComponent(codigo)}`);
const validade = (inicio: string, fim: string | null) => new Date(inicio) > new Date() ? `De ${formatarData(inicio)}${fim ? ` a ${formatarData(fim)}` : ''}` : fim ? `Até ${formatarData(fim)}` : 'Sem data para acabar';
const rotulo = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/** Gestor: todos os cupons, com usos e desconto. Vendedora: os disponíveis para divulgar (porta de painel/cupons/page.tsx). */
export default function Cupons({ gestor, ligados, site, cupons }: Props) {
  if (!gestor)
    return (
      <PainelLayout>
        <Head title="Cupons" />
        <CabecalhoPagina sobre="Vendas" titulo="Cupons">{ligados ? 'Cupons criados pela loja para você divulgar aos seus clientes. Copie o código ou o link, ou envie pelo WhatsApp.' : undefined}</CabecalhoPagina>
        {!ligados ? <Vazio>A loja ainda não ligou os cupons de desconto. Quando o gestor ligar, os cupons disponíveis para divulgar aparecem aqui.</Vazio>
          : !cupons.length ? <Vazio>Nenhum cupom disponível agora.</Vazio> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 1.5 }}>
              {(cupons as Divulgar[]).map(c => (
                <Card key={c.id} variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1.5, alignContent: 'start' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.04em' }}>{c.codigo}</Typography><Etiqueta cor={COR[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta></Stack>
                  <Typography variant="body2">{c.regra}</Typography>
                  <Stack spacing={0.25} sx={{ fontSize: 14, color: 'text.secondary' }}>
                    <span>{validade(c.inicioEm, c.fimEm)}</span><span>Quem aplica: {QUEM_APLICA[c.quemAplica]}</span>
                    {c.temLimite && <span>Quantidade limitada</span>}{c.especifico && <span>Só para: {c.clientes.map(x => x.nome).join(', ')}</span>}
                  </Stack>
                  <DivulgarCupom codigo={c.codigo} regra={c.regra} link={linkDe(site, c.codigo, c.quemAplica)} />
                </Card>
              ))}
            </Box>
          )}
      </PainelLayout>
    );
  return (
    <PainelLayout>
      <Head title="Cupons" />
      <CabecalhoPagina sobre="Vendas" titulo="Cupons" acoes={<><Button href="/painel/cupons/campanhas" variant="outlined">Campanhas</Button><Button href="/painel/cupons/novo" variant="contained">+ Novo cupom</Button></>} />
      {!ligados && <Alert severity="warning" sx={{ mb: 2 }}>Os cupons estão desligados: clientes e vendedores não veem nada. Ligue em <LinkSimples href="/painel/configuracoes" sx={{ textDecoration: 'underline' }}>Configurações</LinkSimples> quando quiser começar.</Alert>}
      {!cupons.length ? <Vazio>Nenhum cupom criado ainda.</Vazio> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 1.5 }}>
          {(cupons as DoGestor[]).map(c => (
            <Card key={c.id} variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1.5, alignContent: 'start', opacity: c.situacao === 'desativado' || c.situacao === 'expirado' ? 0.7 : 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.04em' }}>{c.codigo}</Typography><Etiqueta cor={COR[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta></Stack>
              {c.origem === 'primeiraCompra' && <Box><Etiqueta cor="caramelo">Campanha de primeira compra</Etiqueta></Box>}
              {c.descricao && <Typography variant="body2" color="text.secondary">{c.descricao}</Typography>}
              <Typography variant="body2">{c.regra}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, fontSize: 14, borderTop: 1, borderBottom: 1, borderColor: 'divider', py: 1 }}>
                <Box><Typography sx={rotulo}>Usos</Typography><strong>{c.usos}{c.limiteTotal != null ? ` de ${c.limiteTotal}` : ''}</strong></Box>
                <Box><Typography sx={rotulo}>Desconto dado</Typography><strong>{c.tipo === 'freteGratis' ? '—' : brl(c.desconto)}</strong></Box>
                <Box><Typography sx={rotulo}>Validade</Typography>{validade(c.inicioEm, c.fimEm)}</Box>
              </Box>
              <Typography variant="caption" color="text.secondary">{c.beneficio} · Quem aplica: {QUEM_APLICA[c.quemAplica]}{c.clientes ? ` · ${c.clientes} cliente(s) específica(s)` : ''}</Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" variant="outlined" href={c.origem === 'manual' ? `/painel/cupons/${c.id}` : '/painel/cupons/campanhas'}>Editar</Button>
                {(c.situacao === 'ativo' || c.situacao === 'agendado') && <DivulgarCupom codigo={c.codigo} regra={c.regra} link={linkDe(site, c.codigo, c.quemAplica)} />}
              </Stack>
            </Card>
          ))}
        </Box>
      )}
    </PainelLayout>
  );
}
