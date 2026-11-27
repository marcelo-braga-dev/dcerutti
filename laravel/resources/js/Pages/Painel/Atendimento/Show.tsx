import { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, MenuItem, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Foto } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { PainelContato } from '@/Components/painel/atendimento/Contato';
import type { LinhaAtendimento } from './Index';
import { CANAIS, ETAPAS, MOTIVOS_PERDA } from '@/lib/atendimento';
import { diaDe, formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { getJson, postJson } from '@/lib/http';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp, mensagemDoVendedor, type ItemMensagem } from '@/lib/whatsapp';

type Peca = { id: number; varianteId: number; quantidade: number; nome: string; referencia: string; tamanho: string; preco: number; imagem: string | null; disponivel: number; tamanhos: string[] };
type Props = {
  atendimento: LinhaAtendimento & { numeroId: number | null; registros: { id: string; tipo: string; texto: string | null; criadoEm: string; usuario: string | null }[]; pecas: Peca[] };
  pedido: { id: string; codigo: string; status: string; total: string } | null; meuNumero: { apelido: string; telefone: string } | null;
  respostas: { id: number; titulo: string; texto: string }[]; vendedores: { id: string; name: string }[] | null; loja: string;
};
const ROTULO_REGISTRO: Record<string, string> = { nota: 'Nota', contato_whatsapp: 'Chamou no WhatsApp', contato_direct: 'Chamou no Direct', etapa: 'Etapa', transferencia: 'Transferência', pedido: 'Pedido', envio_peca: 'Enviou peça' };

/** O atendimento: falar com a cliente, as peças, o histórico, o próximo passo e a gestão (porta de painel/atendimento/[id]). */
export default function Atendimento({ atendimento: a, pedido, meuNumero, respostas, vendedores, loja }: Props) {
  const { usuario, flash, errors } = usePage().props as unknown as { usuario: { nome: string; papel: string }; flash: { sucesso: string | null }; errors: Record<string, string> };
  const gestor = usuario.papel === 'gestor';
  const aberto = !a.fechadoEm;
  const emAndamento = aberto && !a.pedidoId;
  const peca = a.pecas[0];
  const etapa = useForm({ etapa: a.etapa === 'novo' || a.etapa === 'perdido' ? 'em_conversa' : a.etapa, proximoContato: a.proximoContatoEm ? diaDe(new Date(a.proximoContatoEm)) : '', motivoPerda: a.motivoPerda ?? '' });
  const nota = useForm({ texto: '' });
  const contato = useForm({ telefone: a.telefone ? formatarTelefone(a.telefone) : '', instagram: '' });
  const passar = useForm({ para: '' });
  return (
    <PainelLayout>
      <Head title={`Atendimento ${a.codigo}`} />
      <Button href="/painel/atendimento" size="small" sx={{ mb: 2 }}>← Hoje</Button>
      <CabecalhoPagina sobre={`Atendimento ${a.codigo}`} titulo={a.nome} acoes={a.clienteId ? <Button variant="outlined" href={`/painel/clientes/${a.clienteId}`}>Ver a ficha</Button> : undefined}>
        <Stack component="span" direction="row" spacing={1} sx={{ display: 'inline-flex', alignItems: 'center' }}><Etiqueta cor={a.etapa === 'ganho' ? 'oliva' : a.etapa === 'perdido' ? 'cinza' : 'caramelo'}>{ETAPAS[a.etapa]}</Etiqueta><Etiqueta>{CANAIS[a.canal]}</Etiqueta></Stack>
        <Box component="span" sx={{ display: 'block', fontSize: 14, mt: 0.5 }}>
          {[a.telefone && formatarTelefone(a.telefone), a.instagram && `@${a.instagram}`].filter(Boolean).join(' · ') || 'Sem contato'} · {a.responsavel ?? 'Sem responsável'}
          {a.proximoContatoEm && ` · retorno em ${formatarData(a.proximoContatoEm)}`}{a.motivoPerda && ` · ${MOTIVOS_PERDA[a.motivoPerda] ?? a.motivoPerda}`}
          {a.vitrine && <> · Vitrine: <LinkSimples href={`/painel/vitrines/${a.vitrine.id}`} sx={{ textDecoration: 'underline' }}>{a.vitrine.titulo}</LinkSimples></>}
        </Box>
      </CabecalhoPagina>
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 22rem' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Falar com a cliente</Typography>
            <PainelContato id={a.id} telefone={a.telefone} instagram={a.instagram} respostas={respostas} meuNumero={meuNumero}
              variaveis={{ nome: a.nome.split(' ')[0], vendedora: (a.responsavel ?? usuario.nome).split(' ')[0], loja, peca: peca?.nome, preco: peca ? brl(peca.preco) : undefined, tamanhos: peca?.tamanhos.join(', ') }} />
          </Card>
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Peças</Typography>
            <Pecas id={a.id} pecas={a.pecas} podeEditar={emAndamento} temFicha={!!a.clienteId} pedido={pedido} />
          </Card>
          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1.5 }}>
            <Typography variant="h6">Histórico</Typography>
            <Stack component="form" spacing={1} onSubmit={(e: React.FormEvent) => { e.preventDefault(); nota.post(`/painel/atendimento/${a.id}/nota`, { preserveScroll: true, onSuccess: () => nota.reset() }); }}>
              <TextField label="Nova nota" multiline minRows={2} value={nota.data.texto} onChange={e => nota.setData('texto', e.target.value)} error={!!nota.errors.texto} helperText={nota.errors.texto ?? 'Não registre dados sensíveis, como saúde ou documentos.'} />
              <Box><Button type="submit" variant="outlined" loading={nota.processing}>Salvar nota</Button></Box>
            </Stack>
            <Stack spacing={1.5} sx={{ fontSize: 14, borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Box sx={{ color: 'text.secondary' }}>Criado em {formatarDataHora(a.criadoEm)}.</Box>
              {a.registros.map(r => <Box key={r.id}><strong>{ROTULO_REGISTRO[r.tipo] ?? r.tipo}</strong>{r.usuario ? ` · ${r.usuario}` : ''} <Box component="span" sx={{ color: 'text.secondary' }}>· {formatarDataHora(r.criadoEm)}</Box>{r.texto && <Box sx={{ whiteSpace: 'pre-line' }}>{r.texto}</Box>}</Box>)}
            </Stack>
          </Card>
        </Stack>
        <Stack spacing={3}>
          {!a.pedidoId && a.etapa !== 'ganho' && (
            <Card variant="outlined" component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); etapa.post(`/painel/atendimento/${a.id}/etapa`, { preserveScroll: true }); }} sx={{ p: 2.5, display: 'grid', gap: 2 }}>
              <Typography variant="h6">Próximo passo</Typography>
              <TextField select label="Etapa" value={etapa.data.etapa} onChange={e => etapa.setData('etapa', e.target.value as never)}>{['em_conversa', 'proposta', 'perdido'].map(v => <MenuItem key={v} value={v}>{ETAPAS[v as keyof typeof ETAPAS]}</MenuItem>)}</TextField>
              <TextField type="date" label="Próximo contato" value={etapa.data.proximoContato} onChange={e => etapa.setData('proximoContato', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} error={!!etapa.errors.proximoContato} helperText={etapa.errors.proximoContato ?? 'Obrigatório enquanto a conversa estiver aberta.'} />
              <TextField select label="Motivo, se perdido" value={etapa.data.motivoPerda} onChange={e => etapa.setData('motivoPerda', e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} error={!!etapa.errors.motivoPerda} helperText={etapa.errors.motivoPerda}>
                <MenuItem value="">—</MenuItem>{Object.entries(MOTIVOS_PERDA).map(([v, r]) => <MenuItem key={v} value={v}>{r}</MenuItem>)}
              </TextField>
              <Box><Button type="submit" variant="contained" loading={etapa.processing}>Salvar</Button></Box>
            </Card>
          )}
          {(!a.clienteId || !a.instagram) && (
            <Card variant="outlined" component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); contato.post(`/painel/atendimento/${a.id}/contato`, { preserveScroll: true }); }} sx={{ p: 2.5, display: 'grid', gap: 2 }}>
              <Typography variant="h6">Completar o contato</Typography>
              {!a.telefone && <Typography variant="body2" color="secondary.main">Peça o WhatsApp: sem ele não há ficha nem pedido, e o Direct limita a retomada da conversa.</Typography>}
              {a.telefone && !a.clienteId && <Typography variant="body2" color="secondary.main">Número informado pela própria pessoa. Confirme na conversa e salve para criar a ficha.</Typography>}
              {!a.clienteId && <TextField label="WhatsApp" type="tel" placeholder="(49) 99999-9999" value={contato.data.telefone} onChange={e => contato.setData('telefone', formatarTelefone(e.target.value))} error={!!contato.errors.telefone} helperText={contato.errors.telefone} />}
              {!a.instagram && <TextField label="Instagram" placeholder="@usuario" value={contato.data.instagram} onChange={e => contato.setData('instagram', e.target.value)} error={!!contato.errors.instagram} helperText={contato.errors.instagram} />}
              <Box><Button type="submit" variant="outlined" loading={contato.processing}>Salvar contato</Button></Box>
            </Card>
          )}
          {gestor && (
            <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 2 }}>
              <Typography variant="h6">Gestão</Typography>
              {aberto && vendedores && (
                <Stack component="form" spacing={1.5} onSubmit={(e: React.FormEvent) => { e.preventDefault(); passar.post(`/painel/atendimento/${a.id}/transferir`, { preserveScroll: true }); }}>
                  <TextField select label="Passar para" value={passar.data.para} onChange={e => passar.setData('para', e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} error={!!passar.errors.para} helperText={passar.errors.para ?? 'A carteira não muda: para isso, edite a ficha.'}>
                    <MenuItem value="">Escolha…</MenuItem>{vendedores.filter(v => v.id !== a.responsavelId).map(v => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
                  </TextField>
                  <Box><Button type="submit" variant="outlined">Passar</Button></Box>
                </Stack>
              )}
              {!a.clienteId && <Box><Button variant="contained" color="error" size="small" onClick={() => { if (confirm('Apagar este contato e todo o histórico dele? Use quando a pessoa pedir a exclusão dos dados.')) router.delete(`/painel/atendimento/${a.id}`); }}>Apagar dados do contato</Button></Box>}
            </Card>
          )}
        </Stack>
      </Box>
    </PainelLayout>
  );
}

type Achada = { id: number; referencia: string; nome: string; preco: number; variantes: { id: number; tamanho: string }[] };

/** As peças de interesse e a conversão em pedido. Com o pedido criado, oferece avisar a cliente. */
function Pecas({ id, pecas, podeEditar, temFicha, pedido }: { id: string; pecas: Peca[]; podeEditar: boolean; temFicha: boolean; pedido: Props['pedido'] }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<Achada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ pedidoId: string; codigo: string; url: string } | null>(null);
  const [pendente, setPendente] = useState(false);
  const total = pecas.reduce((a, p) => a + p.preco * p.quantidade, 0);
  const acao = (fn: () => void) => { setErro(null); fn(); };
  const criar = async (tipo: 'compra' | 'condicional') => {
    setErro(null); setPendente(true);
    type R = { ok: true; pedidoId: string; codigo: string; itens: ItemMensagem[]; cupom: { codigo: string; desconto: number; freteGratis: boolean } | null; telefone: string; nomeCliente: string; nomeVendedor: string } | { ok: false; erro: string };
    const r = await postJson<R>(`/painel/atendimento/${id}/pedido`, { tipo });
    setPendente(false);
    if (!r.ok) return setErro(r.erro);
    setCriado({ pedidoId: r.pedidoId, codigo: r.codigo, url: linkWhatsApp(r.telefone, mensagemDoVendedor({ codigo: r.codigo, itens: r.itens, nomeCliente: r.nomeCliente, nomeVendedor: r.nomeVendedor, condicional: tipo === 'condicional', cupom: r.cupom })) });
    router.reload();
  };
  return (
    <Stack spacing={1.5}>
      {erro && <Alert severity="error">{erro}</Alert>}
      {!pecas.length ? <Typography variant="body2" color="text.secondary">Nenhuma peça ainda.</Typography> : pecas.map(p => (
        <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', fontSize: 14 }}>
          <Foto src={p.imagem} largura={44} />
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</Typography><Typography variant="body2" color="text.secondary">Tam. {p.tamanho} · {p.quantidade} × {brl(p.preco)}{p.disponivel < p.quantidade && <Box component="strong" sx={{ color: 'error.main' }}> · {p.disponivel} disponível(is)</Box>}</Typography></Box>
          {podeEditar && <Button size="small" color="error" onClick={() => acao(() => router.delete(`/painel/atendimento/${id}/pecas/${p.id}`, { preserveScroll: true }))}>Tirar</Button>}
        </Stack>
      ))}
      {pecas.length > 0 && <Typography variant="body2" sx={{ textAlign: 'right' }}>Total das peças: <strong>{brl(total)}</strong></Typography>}
      {pedido && <Typography variant="body2">Pedido: <LinkSimples href={`/painel/pedidos/${pedido.id}`} sx={{ fontWeight: 600, textDecoration: 'underline' }}>{pedido.codigo}</LinkSimples></Typography>}
      {criado && <Alert severity="success">Pedido {criado.codigo} criado. <a href={criado.url} target="_blank" rel="noopener">Enviar no WhatsApp</a> · <LinkSimples href={`/painel/pedidos/${criado.pedidoId}`} sx={{ textDecoration: 'underline' }}>Ver o pedido</LinkSimples></Alert>}
      {podeEditar && (
        <>
          <Stack component="form" direction="row" spacing={1} onSubmit={async (e: React.FormEvent) => { e.preventDefault(); setAchadas(await getJson<Achada[]>(`/painel/pecas/busca?q=${encodeURIComponent(termo)}`)); }}>
            <TextField size="small" fullWidth value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça por nome ou referência" slotProps={{ htmlInput: { 'aria-label': 'Buscar peça' } }} />
            <Button type="submit" variant="outlined">Buscar</Button>
          </Stack>
          {achadas && (!achadas.length ? <Typography variant="body2" color="text.secondary">Nenhuma peça com estoque encontrada.</Typography> : (
            <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {achadas.map(p => (
                <Box key={p.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, fontSize: 14 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{p.nome} <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>· {brl(p.preco)}</Box></Typography>
                  <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {p.variantes.map(v => <Button key={v.id} size="small" variant="outlined" aria-label={`Adicionar ${p.nome} tamanho ${v.tamanho}`} onClick={() => acao(() => router.post(`/painel/atendimento/${id}/pecas`, { varianteId: v.id }, { preserveScroll: true }))}>{v.tamanho}</Button>)}
                  </Stack>
                </Box>
              ))}
            </Stack>
          ))}
          {pecas.length > 0 && (temFicha ? (
            <Stack direction="row" spacing={1} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Button variant="contained" disabled={pendente} onClick={() => criar('compra')}>Criar pedido</Button>
              <Button variant="outlined" disabled={pendente} onClick={() => criar('condicional')}>Criar condicional</Button>
            </Stack>
          ) : <Typography variant="body2" color="secondary.main" sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>Informe o WhatsApp da cliente para criar o pedido.</Typography>)}
        </>
      )}
    </Stack>
  );
}
