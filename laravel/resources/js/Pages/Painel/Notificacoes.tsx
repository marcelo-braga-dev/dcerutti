import { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Vazio } from '@/Components/ui/Basicos';
import { LinhaFiltro, PainelFiltros } from '@/Components/ui/Filtros';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { tempoDesde } from '@/lib/atividade';
import { formatarDataHora } from '@/lib/datas';
import { quer, TIPOS_NOTIFICACAO, type Preferencias, type TipoNotificacao } from '@/lib/notificacoes';
import { comFiltros } from '@/lib/url';

type Item = { id: string; tipo: TipoNotificacao; titulo: string; texto: string | null; link: string | null; lidaEm: string | null; criadaEm: string };
type Props = { lista: Item[]; total: number; naoLidas: number; filtros: { tipo: TipoNotificacao | null; naoLidas: boolean; pagina: number }; preferencias: Preferencias };

/** Notificações da equipe (porta de painel/notificacoes): lista com filtros, marcar como lidas e as preferências. */
export default function Notificacoes({ lista, total, naoLidas: n, filtros, preferencias }: Props) {
  const { usuario } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const tipos = (Object.keys(TIPOS_NOTIFICACAO) as TipoNotificacao[]).filter(t => gestor || !TIPOS_NOTIFICACAO[t].soGestor);
  const url = (m: Record<string, string | null>) => comFiltros('/painel/notificacoes', { tipo: filtros.tipo, ver: filtros.naoLidas ? 'nao-lidas' : null }, m);
  const lidas = (id?: string) => router.post('/painel/notificacoes/lidas', id ? { id } : {}, { preserveScroll: true });

  return (
    <PainelLayout>
      <Head title="Notificações" />
      <CabecalhoPagina sobre={`${n} não ${n === 1 ? 'lida' : 'lidas'}`} titulo="Notificações" acoes={n > 0 ? <Button variant="outlined" onClick={() => lidas()}>Marcar todas como lidas</Button> : undefined} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1.4fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Box>
          <PainelFiltros limpar={filtros.tipo || filtros.naoLidas ? '/painel/notificacoes' : null}>
            <LinhaFiltro rotulo="Mostrar" opcoes={[{ rotulo: 'Todas', href: url({ ver: null }), ativo: !filtros.naoLidas }, { rotulo: 'Só não lidas', href: url({ ver: 'nao-lidas' }), ativo: filtros.naoLidas }]} />
            <LinhaFiltro rotulo="Tipo" opcoes={[{ rotulo: 'Todos os tipos', href: url({ tipo: null }), ativo: !filtros.tipo }, ...tipos.map(t => ({ rotulo: TIPOS_NOTIFICACAO[t].rotulo, href: url({ tipo: t }), ativo: filtros.tipo === t }))]} />
          </PainelFiltros>
          {lista.length === 0 ? <Vazio>Nenhuma notificação {filtros.naoLidas ? 'não lida' : ''}.</Vazio> : (
            <Card variant="outlined">
              {lista.map((x, i) => (
                <Stack key={x.id} direction="row" spacing={1.5} sx={{ px: 2.5, py: 1.75, fontSize: 14, borderTop: i ? 1 : 0, borderColor: 'divider', bgcolor: x.lidaEm ? undefined : 'rgba(109,64,42,.05)' }}>
                  <Box aria-label={x.lidaEm ? undefined : 'Não lida'} sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: x.lidaEm ? 'transparent' : 'secondary.main' }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    {x.link ? <LinkSimples href={x.link} sx={{ fontWeight: x.lidaEm ? 400 : 600 }}>{x.titulo}</LinkSimples> : <Box component="span" sx={{ fontWeight: 600 }}>{x.titulo}</Box>}
                    {x.texto && <Box sx={{ color: 'text.secondary' }}>{x.texto}</Box>}
                    <Typography variant="caption" color="text.secondary" title={formatarDataHora(x.criadaEm)}>{TIPOS_NOTIFICACAO[x.tipo]?.rotulo ?? x.tipo} · {tempoDesde(x.criadaEm)}</Typography>
                  </Box>
                  {!x.lidaEm && <Button size="small" onClick={() => lidas(x.id)} sx={{ alignSelf: 'flex-start', flexShrink: 0, color: 'text.secondary', textDecoration: 'underline' }}>Marcar como lida</Button>}
                </Stack>
              ))}
            </Card>
          )}
          {total > lista.length && <Box sx={{ mt: 3, textAlign: 'center' }}><Button variant="outlined" onClick={() => router.visit(url({ pagina: String(filtros.pagina + 1) }), { preserveScroll: true })}>Carregar mais</Button></Box>}
        </Box>
        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography component="h2" variant="h6">Preferências</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Escolha o que aparece no sino do painel e o que chega por e-mail.</Typography>
          <PreferenciasNotificacao inicial={preferencias} tipos={tipos} />
        </Card>
      </Box>
    </PainelLayout>
  );
}

function PreferenciasNotificacao({ inicial, tipos }: { inicial: Preferencias; tipos: TipoNotificacao[] }) {
  const { flash } = usePage().props as unknown as { flash: { sucesso: string | null } };
  const [p, setP] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const alternar = (canal: 'painel' | 'email', t: TipoNotificacao) => setP(x => ({ ...x, [canal]: x[canal].includes(t) ? x[canal].filter(y => y !== t) : [...x[canal], t] }));
  const salvar = () => { setSalvando(true); router.post('/painel/notificacoes/preferencias', p, { preserveScroll: true, onFinish: () => setSalvando(false) }); };
  return (
    <Stack spacing={2}>
      <Table size="small">
        <TableHead><TableRow><TableCell>Aviso</TableCell><TableCell align="center">No painel</TableCell><TableCell align="center">E-mail</TableCell></TableRow></TableHead>
        <TableBody>
          {tipos.map(t => (
            <TableRow key={t}>
              <TableCell><Box sx={{ fontWeight: 600 }}>{TIPOS_NOTIFICACAO[t].rotulo}</Box><Typography variant="caption" color="text.secondary">{TIPOS_NOTIFICACAO[t].descricao}</Typography></TableCell>
              <TableCell align="center"><Checkbox checked={quer(p, t, 'painel')} onChange={() => alternar('painel', t)} slotProps={{ input: { 'aria-label': `${TIPOS_NOTIFICACAO[t].rotulo} no painel` } }} /></TableCell>
              <TableCell align="center"><Checkbox checked={quer(p, t, 'email')} onChange={() => alternar('email', t)} slotProps={{ input: { 'aria-label': `${TIPOS_NOTIFICACAO[t].rotulo} por e-mail` } }} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Button variant="contained" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar preferências'}</Button>
        {flash.sucesso && <Alert severity="success" sx={{ py: 0 }}>{flash.sucesso}</Alert>}
      </Stack>
    </Stack>
  );
}
