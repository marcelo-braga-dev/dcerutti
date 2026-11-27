import { useEffect, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, IconButton, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { AutoAwesome, Check } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Foto } from '@/Components/ui/Basicos';
import { tempoDesde } from '@/lib/atividade';
import { brl, lerValor } from '@/lib/dinheiro';
import { getJson, postJson } from '@/lib/http';
import { mensagemDaSugestao } from '@/lib/sugestoes';
import { linkWhatsApp } from '@/lib/whatsapp';

type Peca = { id: number; nome: string; marca: string; cor: string | null; categoria: string; preco: number; precoCheio: number; imagem: string | null; variantes: { id: number; tamanho: string; disponivel: number }[] };
type Item = { peca: Peca; varianteId: number | null; pct: string; nota: string };
type Historico = {
  tamanhos: string[]; maisUsados: string[];
  sacola: { atualizadoEm: string; parada: boolean; total: number; itens: { peca: Peca; varianteId: number; quantidade: number; tamanho: string }[] } | null;
  vistas: { peca: Peca; vezes: number; ultimaVez: string; tamanhos: string[]; situacao: string | null }[];
  favoritos: { peca: Peca; criadoEm: string }[];
  naoFechados: { peca: Peca; varianteId: number; codigo: string; quando: string | null; motivo: string | null }[];
  compras: { peca: Peca; varianteId: number; codigo: string; quando: string | null }[];
};
type Props = {
  clientes: { id: string; nome: string; telefone: string }[]; clienteInicial: string; iniciais: Peca[]; limiteDesconto: number | null; dias: number[]; diasPadrao: number; maxItens: number;
  cupons: boolean; duplicar: { titulo: string; mensagem: string | null; cupom: string | null; itens: { peca: Peca; pct: string; nota: string }[] } | null; loja: string;
};

/** Montar a sugestão (D-27; porta de components/painel/montar-sugestao.tsx). */
export default function NovaSugestao({ clientes, clienteInicial, iniciais, limiteDesconto, dias: opcoesDias, diasPadrao, maxItens, cupons, duplicar, loja }: Props) {
  const { usuario } = usePage().props;
  const gestor = limiteDesconto === null;
  const limite = limiteDesconto ?? 100;
  const [clienteId, setClienteId] = useState(clienteInicial);
  const [titulo, setTitulo] = useState(duplicar?.titulo ?? '');
  const [mensagem, setMensagem] = useState(duplicar?.mensagem ?? '');
  const [cupom, setCupom] = useState(duplicar?.cupom ?? '');
  const [dias, setDias] = useState(diasPadrao);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Peca[]>(iniciais);
  const [itens, setItens] = useState<Item[]>(() => (duplicar?.itens ?? []).map(i => ({ ...i, varianteId: null })));
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const tamanhos = historico?.maisUsados ?? [];

  useEffect(() => {
    if (!busca) { setAchados(iniciais); return; }
    let atual = true;
    const t = setTimeout(() => getJson<Peca[]>(`/painel/sugestoes/pecas?q=${encodeURIComponent(busca)}`).then(r => { if (atual) setAchados(r); }).catch(() => {}), 250);
    return () => { atual = false; clearTimeout(t); };
  }, [busca, iniciais]);
  useEffect(() => {
    setHistorico(null);
    if (!clienteId) return;
    let atual = true;
    getJson<Historico | null>(`/painel/sugestoes/historico/${clienteId}`).then(r => { if (atual) setHistorico(r); }).catch(() => {});
    return () => { atual = false; };
  }, [clienteId]);

  const naLista = new Set(itens.map(i => i.peca.id));
  const doTamanho = (p: Peca) => p.variantes.find(v => tamanhos.includes(v.tamanho.toUpperCase()))?.id ?? null;
  const doHistorico = (p: Peca, v?: number | null) => (v && p.variantes.some(x => x.id === v) ? v : doTamanho(p));
  const adicionar = (p: Peca, varianteId: number | null) => { if (naLista.has(p.id) || itens.length >= maxItens) return; setItens(x => [...x, { peca: p, varianteId, pct: '', nota: '' }]); setErro(null); };
  const mudar = (id: number, m: Partial<Item>) => setItens(x => x.map(i => (i.peca.id === id ? { ...i, ...m } : i)));
  const preco = (i: Item) => { const pct = lerValor(i.pct); return pct > 0 && pct < 100 ? Math.round(i.peca.preco * (100 - pct)) / 100 : null; };
  const total = itens.reduce((a, i) => a + (preco(i) ?? i.peca.preco), 0);

  const sugerir = async () => {
    setSugerindo(true); setErro(null);
    try {
      const r = await getJson<{ peca: Peca; varianteId: number | null }[]>(`/painel/sugestoes/automatica/${clienteId}`);
      if (!r.length) setErro('Ainda não há histórico suficiente desta cliente para sugerir. Busque as peças abaixo.');
      setItens(x => [...x, ...r.filter(n => !x.some(i => i.peca.id === n.peca.id)).slice(0, maxItens - x.length).map(n => ({ peca: n.peca, varianteId: n.varianteId, pct: '', nota: '' }))]);
    } finally { setSugerindo(false); }
  };

  const criar = async (enviar: boolean) => {
    setErro(null);
    if (!clienteId) return setErro('Escolha a cliente.');
    if (!itens.length) return setErro('Adicione pelo menos uma peça.');
    const acima = !gestor && itens.find(i => lerValor(i.pct) > limite);
    if (acima) return setErro(`Desconto acima de ${limite}% em ${acima.peca.nome}: só o gestor dá esse desconto.`);
    // Abre a aba antes da espera: o navegador bloqueia janelas abertas depois de uma resposta do servidor.
    const aba = enviar ? window.open('about:blank', '_blank') : null;
    setPendente(true);
    type R = { ok: true; id: string; codigo: string; link: string; telefone: string; nomeCliente: string; titulo: string; mensagem: string | null; pecas: number; validaAte: string; temOferta: boolean; cupom: string | null } | { ok: false; erro: string };
    const r = await postJson<R>('/painel/sugestoes', {
      clienteId, titulo: titulo.trim() || 'Separei para você', mensagem: mensagem.trim() || undefined, dias, cupom: cupom.trim() || undefined, enviar,
      itens: itens.map(i => ({ produtoId: i.peca.id, varianteId: i.varianteId, precoOferta: preco(i), nota: i.nota.trim() || null })),
    });
    setPendente(false);
    if (!r.ok) { aba?.close(); return setErro(r.erro); }
    if (enviar) {
      const texto = mensagemDaSugestao({ nomeCliente: r.nomeCliente, nomeVendedor: usuario?.nome ?? '', loja, titulo: r.titulo, mensagem: r.mensagem, link: r.link, pecas: r.pecas, validaAte: new Date(r.validaAte), temOferta: r.temOferta, cupom: r.cupom });
      const url = linkWhatsApp(r.telefone, texto);
      if (aba) aba.location.href = url; else window.open(url, '_blank');
    }
    router.visit(`/painel/sugestoes/${r.id}`);
  };

  return (
    <PainelLayout>
      <Head title="Montar sugestão" />
      <Button href="/painel/sugestoes" size="small" sx={{ mb: 2 }}>← Sugestões enviadas</Button>
      <CabecalhoPagina sobre="Sugestões" titulo="Montar sugestão">Escolha a cliente e as peças. Ela recebe um link no WhatsApp, marca o que gostou e devolve como pedido.</CabecalhoPagina>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1.25fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2 }}>
            <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid', gap: 1 }}>
              <TextField select label="Cliente" value={clienteId} onChange={e => { setClienteId(e.target.value); setErro(null); }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">Escolha a cliente…</MenuItem>
                {clientes.map(c => <MenuItem key={c.id} value={c.id}>{c.nome} · {c.telefone}</MenuItem>)}
              </TextField>
              {clienteId && <Box><Button size="small" variant="outlined" startIcon={<AutoAwesome />} disabled={sugerindo} onClick={sugerir}>{sugerindo ? 'Escolhendo…' : 'Sugerir automaticamente'}</Button></Box>}
              {clienteId && <Typography variant="caption" color="text.secondary">{tamanhos.length ? <>Tamanhos que ela mais usa: <strong>{tamanhos.join(' · ')}</strong> (já vêm marcados ao adicionar)</> : 'Ainda sem tamanho preferido: a cliente escolhe.'}</Typography>}
            </Box>
            <TextField label="Título" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Novidades no seu tamanho" slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField select label="Vale por" value={dias} onChange={e => setDias(Number(e.target.value))}>{opcoesDias.map(d => <MenuItem key={d} value={d}>{d} dias</MenuItem>)}</TextField>
            {cupons && <TextField label="Cupom (opcional)" value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())} placeholder="Aplicado quando ela pedir" slotProps={{ htmlInput: { maxLength: 30 } }} />}
            <TextField label="Mensagem (opcional)" multiline minRows={2} value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Chegou a coleção nova e lembrei de você…" slotProps={{ htmlInput: { maxLength: 1000 } }} sx={{ gridColumn: { sm: 'span 2' } }} />
          </Card>
          <TextField label="Buscar peças (sem busca: promoções primeiro)" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência, cor ou categoria…" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1 }}>
            {achados.map(p => {
              const ja = naLista.has(p.id);
              return (
                <Card key={p.id} variant="outlined" sx={{ p: 1, display: 'flex', gap: 1.5, opacity: ja ? 0.5 : 1 }}>
                  <Foto src={p.imagem} largura={56} />
                  <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1, fontSize: 14 }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 14, lineHeight: 1.3 }}>{p.nome}</Typography><strong>{brl(p.preco)}</strong></Stack>
                    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                      {p.variantes.map(v => <Button key={v.id} size="small" variant="outlined" disabled={ja} onClick={() => adicionar(p, v.id)} title={`${v.disponivel} em estoque`} sx={{ minWidth: 36, height: 36, px: 1, fontWeight: 700, ...(tamanhos.includes(v.tamanho.toUpperCase()) ? { borderColor: 'secondary.main', color: 'secondary.main' } : {}) }}>{v.tamanho}</Button>)}
                      <Button size="small" disabled={ja} onClick={() => adicionar(p, doTamanho(p))} sx={{ textDecoration: 'underline', color: 'text.secondary' }}>{ja ? 'Na sugestão' : doTamanho(p) ? 'No tamanho dela' : 'Ela escolhe'}</Button>
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Box>
        </Stack>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography variant="h6">Sugestão · {itens.length} {itens.length === 1 ? 'peça' : 'peças'}</Typography>{itens.length > 0 && <strong>{brl(total)}</strong>}</Stack>
            {!itens.length ? <Typography variant="body2" color="text.secondary">Toque no tamanho de uma peça para adicionar, ou em “Ela escolhe” para a cliente escolher o tamanho.</Typography> : (
              <Stack spacing={1.5} sx={{ maxHeight: '60vh', overflowY: 'auto', pr: 0.5 }}>
                {itens.map(i => {
                  const especial = preco(i);
                  return (
                    <Box key={i.peca.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, display: 'grid', gridTemplateColumns: '48px 1fr', gap: 1.5 }}>
                      <Foto src={i.peca.imagem} largura={48} />
                      <Stack spacing={1} sx={{ minWidth: 0, fontSize: 14 }}>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Typography noWrap sx={{ fontSize: 14 }}>{i.peca.nome}</Typography><Button size="small" onClick={() => setItens(x => x.filter(y => y.peca.id !== i.peca.id))} sx={{ p: 0, minWidth: 0, fontSize: 12, color: 'text.secondary', textDecoration: 'underline' }}>tirar</Button></Stack>
                        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                          <TextField select size="small" value={i.varianteId ?? ''} onChange={e => mudar(i.peca.id, { varianteId: e.target.value ? Number(e.target.value) : null })} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Tamanho' } }} sx={{ minWidth: 170 }}>
                            <MenuItem value="">Ela escolhe o tamanho</MenuItem>
                            {i.peca.variantes.map(v => <MenuItem key={v.id} value={v.id}>Tam. {v.tamanho}</MenuItem>)}
                          </TextField>
                          <TextField size="small" value={i.pct} onChange={e => mudar(i.peca.id, { pct: e.target.value })} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Desconto em %' }, input: { endAdornment: <InputAdornment position="end">% off</InputAdornment> } }} sx={{ width: 110 }} />
                          <Typography variant="caption">{especial ? <><s>{brl(i.peca.preco)}</s> <Box component="strong" sx={{ color: 'imperdivel.main' }}>{brl(especial)}</Box></> : brl(i.peca.preco)}</Typography>
                        </Stack>
                        <TextField size="small" value={i.nota} onChange={e => mudar(i.peca.id, { nota: e.target.value })} placeholder="Nota para a cliente (opcional)" slotProps={{ htmlInput: { maxLength: 200 } }} />
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
            {!gestor && <Typography variant="caption" color="text.secondary">Desconto de até {limite}% por peça; acima disso, só o gestor. Os preços especiais valem até o fim da validade.</Typography>}
            {erro && <Alert severity="error">{erro}</Alert>}
            <Button variant="contained" color="success" disabled={pendente} onClick={() => criar(true)}>{pendente ? 'Criando…' : 'Criar e enviar no WhatsApp'}</Button>
            <Button variant="outlined" disabled={pendente} onClick={() => criar(false)}>Só criar (enviar depois)</Button>
          </Card>
          {clienteId && <HistoricoDaCliente h={historico} naLista={naLista} adicionar={(p, v) => adicionar(p, doHistorico(p, v))} />}
        </Stack>
      </Box>
    </PainelLayout>
  );
}

type Aba = 'sacola' | 'vistas' | 'favoritos' | 'naoFechados' | 'compras';
type Linha = { peca: Peca; varianteId?: number | null; info: string };

/** Registros da cliente: sacola, mais vistas, favoritos, não fechados e compras, cada peça com "+" para entrar na sugestão. */
function HistoricoDaCliente({ h, naLista, adicionar }: { h: Historico | null; naLista: Set<number>; adicionar: (p: Peca, varianteId?: number | null) => void }) {
  const [aba, setAba] = useState<Aba | null>(null);
  if (!h) return <Card variant="outlined" sx={{ p: 2.5, fontSize: 14, color: 'text.secondary' }}>Carregando o histórico da cliente…</Card>;
  const abas: { k: Aba; rotulo: string; linhas: Linha[] }[] = [
    { k: 'sacola', rotulo: h.sacola?.parada ? 'Sacola parada' : 'Sacola', linhas: (h.sacola?.itens ?? []).map(i => ({ peca: i.peca, varianteId: i.varianteId, info: `Tam. ${i.tamanho} · ${i.quantidade}×` })) },
    { k: 'vistas', rotulo: 'Mais vistas', linhas: h.vistas.map(v => ({ peca: v.peca, info: `Abriu ${v.vezes}× · ${tempoDesde(v.ultimaVez)}${v.tamanhos.length ? ` · tam. ${v.tamanhos.join(', ')}` : ''}${v.situacao === 'comprou' ? ' · já comprou' : ''}` })) },
    { k: 'favoritos', rotulo: 'Favoritos', linhas: h.favoritos.map(f => ({ peca: f.peca, info: `Guardou ${tempoDesde(f.criadoEm)}` })) },
    { k: 'naoFechados', rotulo: 'Não fechados', linhas: h.naoFechados.map(n => ({ peca: n.peca, varianteId: n.varianteId, info: `${n.codigo} · ${n.motivo === 'expirado' ? 'prazo vencido' : n.motivo === 'cliente' ? 'ela cancelou' : 'cancelado'}${n.quando ? ` ${tempoDesde(n.quando)}` : ''}` })) },
    { k: 'compras', rotulo: 'Compras', linhas: h.compras.map(c => ({ peca: c.peca, varianteId: c.varianteId, info: `${c.codigo}${c.quando ? ` · ${tempoDesde(c.quando)}` : ''} · para repetir ou combinar` })) },
  ];
  const atual = abas.find(a => a.k === aba) ?? abas.find(a => a.linhas.length) ?? abas[1];
  const comEstoque = (l: Linha) => l.peca.variantes.length > 0;
  const livres = atual.linhas.filter(l => comEstoque(l) && !naLista.has(l.peca.id));
  return (
    <Card variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography variant="h6">Histórico da cliente</Typography>{h.tamanhos.length > 0 && <Typography variant="caption" color="text.secondary">usa {h.tamanhos.slice(0, 3).join(' · ')}</Typography>}</Stack>
      {h.sacola && <Typography variant="caption" sx={{ color: h.sacola.parada ? 'secondary.main' : 'text.secondary' }}>{h.sacola.parada ? 'Sacola parada' : 'Sacola aberta'}: {h.sacola.itens.length} {h.sacola.itens.length === 1 ? 'peça' : 'peças'} · {brl(h.sacola.total)} · mexeu {tempoDesde(h.sacola.atualizadoEm)}</Typography>}
      <Tabs value={atual.k} onChange={(_, v) => setAba(v)} variant="scrollable" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: 12, textTransform: 'none' } }}>
        {abas.map(a => <Tab key={a.k} value={a.k} label={`${a.rotulo} ${a.linhas.length}`} />)}
      </Tabs>
      {!atual.linhas.length ? <Typography variant="body2" color="text.secondary">Nada aqui ainda.</Typography> : (
        <>
          {atual.k === 'sacola' && livres.length > 0 && <Box><Button size="small" variant="outlined" onClick={() => livres.forEach(l => adicionar(l.peca, l.varianteId))}>Pôr a sacola inteira na sugestão</Button></Box>}
          <Stack spacing={1} sx={{ maxHeight: '55vh', overflowY: 'auto', pr: 0.5 }}>
            {atual.linhas.map(l => {
              const ja = naLista.has(l.peca.id), sem = !comEstoque(l);
              return (
                <Stack key={`${atual.k}-${l.peca.id}`} direction="row" spacing={1.5} sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 1, p: 1, opacity: ja || sem ? 0.6 : 1 }}>
                  <Foto src={l.peca.imagem} largura={40} />
                  <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ fontSize: 14 }}>{l.peca.nome}</Typography><Typography noWrap variant="caption" color="text.secondary" component="div">{sem ? 'Sem estoque' : l.info}</Typography></Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(l.peca.preco)}</Typography>
                  <IconButton size="small" disabled={ja || sem} onClick={() => adicionar(l.peca, l.varianteId)} aria-label={`Adicionar ${l.peca.nome} à sugestão`} sx={{ border: 1, borderColor: ja ? 'success.main' : 'marca.marrom-950', borderRadius: 1 }}>{ja ? <Check fontSize="small" color="success" /> : '+'}</IconButton>
                </Stack>
              );
            })}
          </Stack>
        </>
      )}
    </Card>
  );
}
