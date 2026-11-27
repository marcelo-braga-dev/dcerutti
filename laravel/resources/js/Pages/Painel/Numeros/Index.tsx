import { useState, type ReactNode } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { Dialogo } from '@/Components/ui/Dialogo';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FormNumero } from '@/Components/painel/numeros/FormNumero';
import { tempoDesde } from '@/lib/atividade';
import { getJson } from '@/lib/http';
import { LIMITE_APARELHOS, ROTULO_STATUS, type StatusNumero } from '@/lib/numeros';
import { plural } from '@/lib/pedido';
import { formatarTelefone } from '@/lib/telefone';

type Vinculo = { id: number; usuarioId: string; nome: string; papel: string; conexao: 'aguardando' | 'conectado'; principal: boolean; ultimoUso: string | null };
type Numero = { id: number; telefone: string; apelido: string; status: StatusNumero; padrao: boolean; clientes: number; vinculos: Vinculo[] };
type Pessoa = { id: string; nome: string; papel: string; clientes: number; semNumero: boolean };
type Impacto = { clientes: number; pendentes: number; principal: boolean; ficaSemNumero: boolean; podeTransferir: boolean; vendedoras: { id: string; name: string }[] };
type Props = { numeros: Numero[]; equipe: Pessoa[]; pendencias: { id: number; nome: string; numero: string; telefone: string; desde: string }[] };

function Alca({ id, rotulo, nome, children }: { id: string; rotulo: string; nome: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { nome } });
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, opacity: isDragging ? 0.3 : 1 }}>
      <Box component="button" type="button" ref={setNodeRef} {...attributes} {...listeners} aria-label={rotulo} sx={{ touchAction: 'none', cursor: 'grab', border: 0, bgcolor: 'transparent', color: 'text.secondary', p: 0.5, display: 'flex' }}><DragIndicator fontSize="small" /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
    </Stack>
  );
}

function Solta({ id, rotulo, sx, children }: { id: string; rotulo: string; sx?: object; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <Card component="section" ref={setNodeRef} aria-label={rotulo} variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5, transition: 'all .15s', ...(isOver ? { outline: '2px solid', outlineColor: 'secondary.main', bgcolor: 'marca.bege' } : {}), ...sx }}>{children}</Card>;
}

/** Quadro de arrastar e soltar (D-31; porta de components/painel/numeros-quadro.tsx). Tudo também tem menu, para celular e teclado. */
export default function Numeros({ numeros, equipe, pendencias }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [perguntaMover, setPerguntaMover] = useState<{ origem: Numero; destino: Numero; vinculo: Vinculo } | null>(null);
  const [remover, setRemover] = useState<{ numero: Numero; vinculo: Vinculo; impacto: Impacto | null } | null>(null);
  const [transferir, setTransferir] = useState('');
  const [motivo, setMotivo] = useState('');
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const postar = (url: string, dados: Record<string, unknown> = {}) => { setErro(null); router.post(url, dados as never, { preserveScroll: true }); };
  const ligar = (n: Numero, p: Pessoa) => {
    if (n.vinculos.some(v => v.usuarioId === p.id)) return setErro(`${p.nome} já está em ${n.apelido}.`);
    postar(`/painel/numeros/${n.id}/ligar`, { usuarioId: p.id });
  };
  const pedirRemocao = (numero: Numero, vinculo: Vinculo) => {
    setRemover({ numero, vinculo, impacto: null }); setTransferir(''); setMotivo('');
    getJson<Impacto>(`/painel/numeros/${numero.id}/impacto?usuarioId=${vinculo.usuarioId}`).then(impacto => setRemover(a => (a ? { ...a, impacto } : a)));
  };
  const aoSoltar = ({ active, over }: DragEndEvent) => {
    setArrastando(null);
    if (!over) return;
    const [tipo, a, b] = String(active.id).split(':');
    const destino = String(over.id);
    if (tipo === 'pessoa') {
      const n = numeros.find(x => `numero:${x.id}` === destino), p = equipe.find(x => x.id === a);
      if (n && p) ligar(n, p);
      return;
    }
    const origem = numeros.find(n => n.id === Number(a));
    const vinculo = origem?.vinculos.find(v => v.usuarioId === b);
    if (!origem || !vinculo) return;
    if (destino === 'equipe') return pedirRemocao(origem, vinculo);
    const alvo = numeros.find(n => `numero:${n.id}` === destino);
    if (!alvo || alvo.id === origem.id) return;
    if (alvo.vinculos.some(v => v.usuarioId === vinculo.usuarioId)) return setErro(`${vinculo.nome} já está em ${alvo.apelido}.`);
    setPerguntaMover({ origem, destino: alvo, vinculo });
  };
  const aoComecar = ({ active }: DragStartEvent) => setArrastando((active.data.current as { nome: string } | undefined)?.nome ?? null);
  const emUso = numeros.filter(n => n.status !== 'desativado');
  const desativados = numeros.filter(n => n.status === 'desativado');
  const semNumero = equipe.filter(p => p.semNumero);
  const link = { textDecoration: 'underline', fontSize: 12, p: 0, minWidth: 0 } as const;

  return (
    <PainelLayout>
      <Head title="Números de WhatsApp" />
      <CabecalhoPagina sobre="Equipe" titulo="Números de WhatsApp" acoes={<Button variant="contained" onClick={() => setNovo(true)}>+ Cadastrar número</Button>}>
        Os números são da loja. Arraste as pessoas para definir quem usa cada um. As clientes falam com o número principal (★) da vendedora delas.
      </CabecalhoPagina>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {(erro || errors.erro) && <Alert severity="error">{erro ?? errors.erro}</Alert>}
        {flash.sucesso && <Alert severity="warning">{flash.sucesso}</Alert>}
        {pendencias.map(p => (
          <Alert key={p.id} severity="warning" action={<Button size="small" color="inherit" onClick={() => postar(`/painel/numeros/vinculos/${p.id}/conexao`, { estado: 'desconectado' })}>Já desconectei</Button>}>
            <strong>Desconectar {p.nome}</strong> do número {p.numero}, {formatarTelefone(p.telefone)}, em Aparelhos conectados no WhatsApp. Saiu {tempoDesde(p.desde)}.
          </Alert>
        ))}
        {semNumero.length > 0 && <Alert severity="info"><strong>{semNumero.map(p => p.nome.split(' ')[0]).join(', ')}</strong> {semNumero.length === 1 ? 'está' : 'estão'} sem número em uso: as clientes falam com o número padrão da loja.</Alert>}
      </Stack>
      <DndContext id="quadro-numeros" sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '17rem 1fr' }, gap: 2, alignItems: 'start' }}>
          <Solta id="equipe" rotulo="Equipe" sx={{ position: { lg: 'sticky' }, top: 88 }}>
            <Box><Typography variant="h6">Equipe</Typography><Typography variant="caption" color="text.secondary">Arraste para um número. Solte aqui para tirar a pessoa do número.</Typography></Box>
            {equipe.map(p => (
              <Box key={p.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                <Alca id={`pessoa:${p.id}`} rotulo={`Arrastar ${p.nome}`} nome={p.nome}>
                  <Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>{p.nome} {p.semNumero && <Box component="span" title="Sem número" sx={{ color: 'secondary.main' }}>⚠</Box>}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.papel === 'gestor' ? 'Gestor' : plural(p.clientes, 'cliente', 'clientes')}</Typography>
                </Alca>
                <TextField select size="small" fullWidth value="" onChange={e => { const n = emUso.find(x => x.id === Number(e.target.value)); if (n) ligar(n, p); }} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': `Ligar ${p.nome} a um número` } }} sx={{ mt: 1 }}>
                  <MenuItem value="">Ligar a um número…</MenuItem>
                  {emUso.filter(n => !n.vinculos.some(v => v.usuarioId === p.id)).map(n => <MenuItem key={n.id} value={n.id}>{n.apelido}</MenuItem>)}
                </TextField>
              </Box>
            ))}
          </Solta>
          {emUso.length === 0 ? <Vazio>Nenhum número cadastrado.</Vazio> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2, alignItems: 'start' }}>
              {emUso.map(n => (
                <Solta key={n.id} id={`numero:${n.id}`} rotulo={`Número ${n.apelido}`} sx={{ opacity: n.status === 'pausado' ? 0.75 : 1 }}>
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <LinkSimples href={`/painel/numeros/${n.id}`} sx={{ fontWeight: 700, fontSize: 18, '&:hover': { textDecoration: 'underline' } }}>{n.apelido}</LinkSimples>
                      <Stack direction="row" spacing={0.5}>{n.padrao && <Etiqueta cor="caramelo">★ Padrão</Etiqueta>}{n.status !== 'ativo' && <Etiqueta cor="cinza">{ROTULO_STATUS[n.status]}</Etiqueta>}</Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{formatarTelefone(n.telefone)}</Typography>
                    <Typography variant="caption" color="text.secondary">{plural(n.clientes, 'cliente fala', 'clientes falam')} com este número</Typography>
                  </Box>
                  {n.vinculos.length > LIMITE_APARELHOS && <Typography variant="caption" color="secondary.main">Mais pessoas que os {LIMITE_APARELHOS} aparelhos que o WhatsApp costuma permitir: confira o limite do seu plano.</Typography>}
                  {n.vinculos.length === 0 ? <Box sx={{ border: '1px dashed', borderColor: 'marca.borda-forte', p: 2, textAlign: 'center', fontSize: 14, color: 'text.secondary' }}>Solte uma pessoa aqui</Box> : n.vinculos.map(v => (
                    <Box key={v.usuarioId} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, bgcolor: 'rgba(246,242,236,.4)', display: 'grid', gap: 1 }}>
                      <Alca id={`vinculo:${n.id}:${v.usuarioId}`} rotulo={`Arrastar ${v.nome} para outro número`} nome={v.nome}>
                        <Typography noWrap sx={{ fontWeight: 600, fontSize: 14 }}>{v.nome} {v.principal && <Box component="span" title="Número principal desta pessoa" sx={{ color: 'secondary.main' }}>★</Box>}</Typography>
                        <Typography variant="caption" color="text.secondary">{v.conexao === 'conectado' ? 'Aparelho conectado' : 'Aguardando conexão'}{v.ultimoUso ? ` · usou ${tempoDesde(v.ultimoUso)}` : ''}</Typography>
                      </Alca>
                      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, alignItems: 'center' }}>
                        {v.conexao === 'aguardando' && <Button size="small" color="success" sx={link} onClick={() => postar(`/painel/numeros/vinculos/${v.id}/conexao`, { estado: 'conectado' })}>Já conectei</Button>}
                        {!v.principal && v.papel === 'vendedor' && n.status === 'ativo' && <Button size="small" sx={link} onClick={() => postar(`/painel/numeros/${n.id}/principal`, { usuarioId: v.usuarioId })}>Tornar principal</Button>}
                        <Button size="small" color="error" sx={link} onClick={() => pedirRemocao(n, v)}>Remover</Button>
                        {emUso.length > 1 && (
                          <TextField select size="small" variant="standard" value="" onChange={e => { const alvo = emUso.find(x => x.id === Number(e.target.value)); if (alvo) setPerguntaMover({ origem: n, destino: alvo, vinculo: v }); }} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': `Mover ${v.nome} para outro número` } }} sx={{ fontSize: 12, minWidth: 90 }}>
                            <MenuItem value="">Mover…</MenuItem>
                            {emUso.filter(x => x.id !== n.id && !x.vinculos.some(y => y.usuarioId === v.usuarioId)).map(x => <MenuItem key={x.id} value={x.id}>{x.apelido}</MenuItem>)}
                          </TextField>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Solta>
              ))}
            </Box>
          )}
        </Box>
        <DragOverlay>{arrastando && <Box sx={{ bgcolor: 'marca.marrom-950', color: 'marca.creme', fontSize: 14, fontWeight: 600, px: 1.5, py: 1, boxShadow: 6, width: 'max-content', borderRadius: 1 }}>{arrastando}</Box>}</DragOverlay>
      </DndContext>
      {desativados.length > 0 && (
        <Accordion disableGutters elevation={0} sx={{ mt: 2, bgcolor: 'transparent', '&:before': { display: 'none' } }}>
          <AccordionSummary sx={{ px: 0 }}><Typography variant="body2" color="text.secondary">{plural(desativados.length, 'número desativado', 'números desativados')}</Typography></AccordionSummary>
          <AccordionDetails sx={{ px: 0 }}>{desativados.map(n => <Box key={n.id} sx={{ fontSize: 14 }}><LinkSimples href={`/painel/numeros/${n.id}`} sx={{ textDecoration: 'underline' }}>{n.apelido}</LinkSimples> <Box component="span" sx={{ color: 'text.secondary' }}>{formatarTelefone(n.telefone)}</Box></Box>)}</AccordionDetails>
        </Accordion>
      )}
      <Dialogo titulo="Cadastrar número" aberto={novo} fechar={() => setNovo(false)}><FormNumero aoConcluir={() => setNovo(false)} /></Dialogo>
      {perguntaMover && (
        <Dialogo titulo={`${perguntaMover.vinculo.nome} em ${perguntaMover.destino.apelido}`} aberto fechar={() => setPerguntaMover(null)}>
          <Typography variant="body2" color="text.secondary">Mover tira a pessoa de {perguntaMover.origem.apelido}. Adicionar deixa a pessoa nos dois números.</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" onClick={() => { const { origem, destino, vinculo } = perguntaMover; setPerguntaMover(null); postar(`/painel/numeros/${origem.id}/mover`, { usuarioId: vinculo.usuarioId, destinoId: destino.id }); }}>Mover</Button>
            <Button variant="outlined" onClick={() => { const { destino, vinculo } = perguntaMover; const p = equipe.find(x => x.id === vinculo.usuarioId); setPerguntaMover(null); if (p) ligar(destino, p); }}>Adicionar</Button>
            <Button onClick={() => setPerguntaMover(null)}>Voltar</Button>
          </Stack>
        </Dialogo>
      )}
      {remover && (
        <Dialogo titulo={`Tirar ${remover.vinculo.nome} de ${remover.numero.apelido}?`} aberto fechar={() => setRemover(null)}>
          {!remover.impacto ? <Typography variant="body2" color="text.secondary">Conferindo o que muda…</Typography> : (
            <Stack spacing={2}>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 14, display: 'grid', gap: 0.5 }}>
                {remover.impacto.principal && <li>Este é o número principal desta pessoa.</li>}
                {remover.impacto.ficaSemNumero && <li>As clientes desta pessoa passam a falar com o <strong>número padrão</strong> da loja.</li>}
                {remover.impacto.podeTransferir && <li>Na carteira: {plural(remover.impacto.clientes, 'cliente', 'clientes')} e {plural(remover.impacto.pendentes, 'pedido em aberto', 'pedidos em aberto')}. Tirar do número não muda a carteira.</li>}
                {remover.vinculo.conexao === 'conectado' && <li><strong>O aparelho continua conectado</strong> até você desconectar no WhatsApp. Fica uma pendência no topo desta página.</li>}
              </Box>
              {remover.impacto.podeTransferir && (
                <TextField select label="Carteira" value={transferir} onChange={e => setTransferir(e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                  <MenuItem value="">Manter com {remover.vinculo.nome.split(' ')[0]}</MenuItem>
                  {remover.impacto.vendedoras.map(v => <MenuItem key={v.id} value={v.id}>Transferir para {v.name}</MenuItem>)}
                </TextField>
              )}
              <TextField label="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Férias, troca de função…" slotProps={{ htmlInput: { maxLength: 200 } }} />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" color="error" onClick={() => { const { numero, vinculo } = remover; setRemover(null); postar(`/painel/numeros/${numero.id}/tirar`, { usuarioId: vinculo.usuarioId, motivo, transferirPara: transferir }); }}>Remover do número</Button>
                <Button onClick={() => setRemover(null)}>Voltar</Button>
              </Stack>
            </Stack>
          )}
        </Dialogo>
      )}
    </PainelLayout>
  );
}
