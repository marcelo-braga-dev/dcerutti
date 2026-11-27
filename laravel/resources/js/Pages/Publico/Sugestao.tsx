import { useEffect, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import { Alert, Box, Button, Card, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Check, Favorite } from '@mui/icons-material';
import { Contagem, PublicoLayout, QuemAtende, SelosConfianca } from '@/Components/publico/Comum';
import { FotoCheia, estiloTitulo } from '@/Components/loja/Vitrine';
import { corClara, tomDaCor } from '@/lib/cores';
import { brl, descontoPct } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { montarMensagemPedido } from '@/lib/mensagem-pedido';
import { aberta, ESCOLHAS, totaisEscolhidos, type Escolha, type Situacao } from '@/lib/sugestoes';
import { formatarCep } from '@/lib/telefone';
import { linkWhatsApp, type ItemMensagem } from '@/lib/whatsapp';

type Cor = { produtoId: number; cor: string | null; imagem: string | null; preco: number; precoCheio: number; variantes: { id: number; tamanho: string; disponivel: number }[] };
type Item = { id: number; produtoId: number; nome: string; marca: string; nota: string | null; cores: Cor[]; corInicial: number; varianteInicial: number | null; escolha: Escolha; quantidade: number; precoCatalogo: number; precoCheio: number; oferta: number | null; preco: number };
type S = {
  id: string; codigo: string; titulo: string; mensagem: string | null; situacao: Situacao; validaAte: string; nomeCliente: string; nomeVendedor: string; telefoneContato: string;
  condicionalNoCep: boolean; cidadeCondicional: string; cupom: string | null; itens: Item[]; maisParaVoce: { produtoId: number; nome: string; preco: number; precoCheio: number; imagem: string | null }[];
};
type Estado = { escolha: Escolha; produtoId: number; varianteId: number | null; quantidade: number };
type Resposta = { ok: false; erro: string } | { ok: true; telefone: string; destinatario: string; codigo: string | null; sugestao?: string; tipo?: 'compra' | 'condicional'; itens?: ItemMensagem[]; nomeCliente?: string; nomeVendedor?: string | null; cep?: string | null; cidadeCondicional?: string; frete?: number | null; cupom?: { codigo: string; desconto: number; freteGratis: boolean } | null; site?: string; linkPedido?: string; linkPublico?: string };

/** Sugestões para você (D-27; porta de app/s/[chave]/page.tsx e components/loja/escolher-sugestao.tsx). */
export default function PaginaSugestao({ chave, s }: { chave: string; s: S }) {
  const contato = linkWhatsApp(s.telefoneContato, `Oi, ${s.nomeVendedor}! É sobre as sugestões ${s.codigo}.`);
  const ofertas = s.itens.some(i => i.preco < i.precoCatalogo);
  const economia = s.itens.reduce((a, i) => a + Math.max(0, Math.max(i.precoCatalogo, i.precoCheio) - i.preco), 0);
  const fotos = s.itens.map(i => i.cores.find(c => c.produtoId === i.corInicial)?.imagem ?? i.cores[0]?.imagem).filter((x): x is string => !!x).slice(0, 4);
  const plural = s.itens.length === 1 ? 'peça' : 'peças';
  return (
    <PublicoLayout>
      <Head title={`${s.nomeVendedor} separou ${s.itens.length} ${plural} para você`} />
      <Box component="header" sx={{ borderRadius: 8, bgcolor: 'marca.marrom-950', color: 'marca.creme', p: { xs: 2.5, sm: 3.5 }, display: 'grid', gap: 2, overflow: 'hidden', position: 'relative' }}>
        {fotos.length > 0 && <Stack direction="row" spacing={1} aria-hidden sx={{ position: 'absolute', right: -24, top: -24, transform: 'rotate(6deg)', opacity: 0.25, pointerEvents: 'none' }}>{fotos.map((f, i) => <Box key={f + i} sx={{ position: 'relative', width: 80, aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden' }}><FotoCheia src={f} /></Box>)}</Stack>}
        <Stack direction="row" spacing={1.5} sx={{ position: 'relative', alignItems: 'center' }}>
          <Box sx={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', bgcolor: 'secondary.main', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>{s.nomeVendedor[0]}<Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', bgcolor: 'whatsapp.main', border: '2px solid', borderColor: 'marca.marrom-950' }} /></Box>
          <Box sx={{ lineHeight: 1.2 }}><Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'marca.areia' }}>Sugestões para você</Typography><Typography sx={{ fontWeight: 600 }}>{s.nomeVendedor}</Typography></Box>
        </Stack>
        <Typography component="h1" sx={{ ...estiloTitulo, color: 'marca.creme', position: 'relative', fontSize: { xs: '1.9rem', sm: '2.25rem' }, lineHeight: 1.08 }}>Oi, {s.nomeCliente}! {s.nomeVendedor} separou {s.itens.length} {plural} para você</Typography>
        <Box sx={{ position: 'relative', maxWidth: 440, borderRadius: 4, borderTopLeftRadius: 6, bgcolor: 'marca.creme', color: 'marca.marrom-950', px: 2, py: 1.5 }}>
          <strong>{s.titulo}</strong>{s.mensagem && <Box sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>{s.mensagem}</Box>}
        </Box>
        {aberta(s.situacao) && (
          <Stack direction="row" useFlexGap sx={{ position: 'relative', flexWrap: 'wrap', gap: 1, fontSize: 14 }}>
            <Box sx={{ height: 32, px: 1.5, borderRadius: 99, bgcolor: 'rgba(246,242,236,.15)', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{ofertas ? 'Preços especiais por mais' : 'Vale por mais'} <strong><Contagem ate={s.validaAte} fim="pouco tempo" /></strong></Box>
            {economia > 0 && <Box sx={{ height: 32, px: 1.5, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Até {brl(economia)} de economia</Box>}
          </Stack>
        )}
      </Box>
      {aberta(s.situacao) && (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">Marque <Box component="strong" sx={{ color: 'success.main' }}>♥ Quero</Box> no que gostou, escolha cor e tamanho e toque em <strong>Quero comprar</strong> ou <strong>Quero provar em casa</strong>. Suas marcações ficam salvas neste link.</Typography>
          {s.cupom && <Alert severity="success" icon={false}>Cupom <strong>{s.cupom}</strong> já vai aplicado no seu pedido.</Alert>}
        </Stack>
      )}
      {aberta(s.situacao) ? <Escolher chave={chave} s={s} /> : (
        <Card variant="outlined" sx={{ borderRadius: 8, p: { xs: 3, sm: 4 }, display: 'grid', gap: 2, textAlign: 'center', justifyItems: 'center' }}>
          <Box sx={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 24, bgcolor: s.situacao === 'convertida' ? 'success.main' : 'marca.bege', color: s.situacao === 'convertida' ? 'marca.creme' : 'secondary.main' }}>{s.situacao === 'convertida' ? '✓' : '⏳'}</Box>
          <Typography variant="h6">{s.situacao === 'convertida' ? 'Você já respondeu estas sugestões 💛' : s.situacao === 'vencida' ? 'Estas sugestões venceram' : 'Estas sugestões não estão mais disponíveis'}</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 380 }}>{s.situacao === 'convertida' ? `${s.nomeVendedor} recebeu o seu pedido e vai falar com você pelo WhatsApp.` : `Fale com ${s.nomeVendedor}: ela separa novas peças para você.`}</Typography>
          <Button component="a" href={contato} target="_blank" rel="noopener" variant="contained" color="whatsapp">Falar com {s.nomeVendedor}</Button>
          {fotos.length > 0 && <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, width: '100%', maxWidth: 380 }}>{fotos.map((f, i) => <Box key={f + i} sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden', filter: s.situacao === 'convertida' ? 'none' : 'grayscale(1)' }}><FotoCheia src={f} /></Box>)}</Box>}
        </Card>
      )}
      {aberta(s.situacao) && <Card variant="outlined" sx={{ borderRadius: 6, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, mb: 22 }}><QuemAtende nome={s.nomeVendedor} link={contato} /><SelosConfianca /></Card>}
    </PublicoLayout>
  );
}

function Escolher({ chave, s }: { chave: string; s: S }) {
  const [estado, setEstado] = useState<Record<number, Estado>>(() => Object.fromEntries(s.itens.map(i => [i.id, { escolha: i.escolha, produtoId: i.corInicial, varianteId: i.varianteInicial, quantidade: i.quantidade }])));
  const [extras, setExtras] = useState<Item[]>([]);
  const [mais, setMais] = useState(s.maisParaVoce);
  const [pondo, setPondo] = useState<number | null>(null);
  const todos = [...s.itens, ...extras];
  const [cep, setCep] = useState('');
  const [pedirCep, setPedirCep] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ codigo: string | null; url: string; destinatario: string } | null>(null);
  const [pendente, setPendente] = useState(false);
  const primeiro = useRef(true);
  const escolhas = () => todos.map(i => ({ id: i.id, escolha: estado[i.id].escolha, varianteId: estado[i.id].varianteId, quantidade: estado[i.id].quantidade }));
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    const t = setTimeout(() => { postJson(`/s/${chave}/escolhas`, { escolhas: escolhas() }).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = (id: number, m: Partial<Estado>) => { setErro(null); setEstado(x => ({ ...x, [id]: { ...x[id], ...m } })); };
  const economia = todos.reduce((a, i) => a + (estado[i.id].escolha === 'quero' ? Math.max(0, Math.max(i.precoCatalogo, i.precoCheio) - i.preco) * estado[i.id].quantidade : 0), 0);
  const totais = totaisEscolhidos(todos.map(i => ({ escolha: estado[i.id].escolha, preco: i.preco, quantidade: estado[i.id].quantidade, temTamanho: !!estado[i.id].varianteId })));

  const responder = async (modo: 'pensando' | 'compra' | 'condicional') => {
    setErro(null);
    if (modo !== 'pensando') {
      if (!totais.pecas) return setErro('Marque "Quero" nas peças que você quer.');
      if (totais.semTamanho) return setErro('Escolha o tamanho das peças marcadas como "Quero".');
      if (modo === 'condicional' && !s.condicionalNoCep && !pedirCep) return setPedirCep(true);
    }
    const aba = window.open('about:blank', '_blank');
    setPendente(true);
    const r = await postJson<Resposta>(`/s/${chave}/responder`, { modo, escolhas: escolhas(), cep: modo === 'condicional' ? cep : undefined });
    setPendente(false);
    if (!r.ok) { aba?.close(); return setErro(r.erro); }
    const texto = r.codigo && r.itens
      ? montarMensagemPedido({ tipo: r.tipo!, codigo: r.codigo, itens: r.itens, nomeCliente: r.nomeCliente!, nomeVendedor: r.nomeVendedor ?? null, cep: r.cep ?? null, cidadeCondicional: r.cidadeCondicional!, frete: r.frete ?? null, site: r.site!, cupom: r.cupom ?? null, linkPedido: r.linkPedido!, linkPublico: r.linkPublico! }).texto
      : `Oi, ${r.destinatario}! Vi as sugestões (${r.sugestao}) e marquei o que gostei. Ainda estou pensando, depois te falo. 😊`;
    const url = linkWhatsApp(r.telefone, texto);
    if (aba) aba.location.href = url; else window.open(url, '_blank');
    setFeito({ codigo: r.codigo, url, destinatario: r.destinatario });
  };

  if (feito)
    return (
      <Card variant="outlined" sx={{ borderRadius: 8, p: { xs: 3, sm: 4 }, textAlign: 'center', display: 'grid', gap: 2, justifyItems: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'success.main', color: 'marca.creme', display: 'grid', placeItems: 'center' }}><Check sx={{ fontSize: 32 }} /></Box>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: 24 }}>{feito.codigo ? `Pedido ${feito.codigo} enviado!` : 'Escolhas guardadas!'}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 380 }}>{feito.codigo ? `${feito.destinatario === 'a loja' ? 'A loja' : feito.destinatario} recebeu as peças que você escolheu e vai combinar pagamento e entrega com você pelo WhatsApp.` : `Avisamos ${feito.destinatario}. Quando decidir, é só voltar neste link: suas marcações ficam salvas.`}</Typography>
        <Button component="a" href={feito.url} target="_blank" rel="noopener" variant="contained" color="whatsapp" size="large" sx={{ width: '100%', maxWidth: 380 }}>Abrir o WhatsApp</Button>
      </Card>
    );

  return (
    <Stack spacing={2}>
      {todos.map(i => {
        const e = estado[i.id];
        const cor = i.cores.find(c => c.produtoId === e.produtoId) ?? i.cores[0];
        const oferta = i.preco < i.precoCatalogo;
        const d = descontoPct(i.preco, Math.max(i.precoCatalogo, i.precoCheio));
        return (
          <Card key={i.id} component="article" variant="outlined" sx={{ borderRadius: 6, p: { xs: 1.5, sm: 2 }, display: 'grid', gridTemplateColumns: { xs: '96px minmax(0,1fr)', sm: '120px minmax(0,1fr)' }, gap: 2, borderColor: e.escolha === 'quero' ? 'success.main' : 'divider', opacity: e.escolha === 'nao' ? 0.6 : 1 }}>
            <Box sx={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 4, overflow: 'hidden', bgcolor: 'marca.bege' }}>
              <FotoCheia src={cor?.imagem} alt={i.nome} />
              {d > 0 && <Box sx={{ position: 'absolute', top: 6, left: 6, height: 20, px: 0.75, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontSize: '0.65rem', fontWeight: 700, display: 'grid', placeItems: 'center' }}>−{d}%</Box>}
              {e.escolha === 'quero' && <Box sx={{ position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: '50%', bgcolor: 'success.main', color: 'marca.creme', display: 'grid', placeItems: 'center' }}><Favorite sx={{ fontSize: 16 }} /></Box>}
            </Box>
            <Stack spacing={1.25} sx={{ minWidth: 0 }}>
              <Box>
                <Typography sx={{ color: 'marca.marrom-950', lineHeight: 1.3 }}>{i.nome}</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 0.25 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 18, color: oferta ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(i.preco)}</Typography>
                  {(oferta || i.precoCheio > i.preco) && <Typography component="s" variant="caption" color="text.secondary">{brl(oferta ? i.precoCatalogo : i.precoCheio)}</Typography>}
                  {oferta && <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'imperdivel.main' }}>Preço especial</Typography>}
                </Stack>
                {i.nota && <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', mt: 0.5 }}>“{i.nota}”</Typography>}
              </Box>
              {i.cores.length > 1 && (
                <Stack direction="row" useFlexGap role="group" aria-label="Cor" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {i.cores.map(c => {
                    const tom = tomDaCor(c.cor);
                    const ativa = c.produtoId === e.produtoId;
                    return (
                      <Button key={c.produtoId} size="small" disabled={!c.variantes.some(v => v.disponivel > 0)} onClick={() => mudar(i.id, { produtoId: c.produtoId, varianteId: null })} aria-pressed={ativa}
                        sx={{ height: 44, pl: 0.5, pr: 1.5, borderRadius: 99, border: 1, gap: 0.75, fontSize: 12, borderColor: ativa ? 'marca.marrom-950' : 'marca.borda-forte', bgcolor: ativa ? 'marca.marrom-950' : 'transparent', color: ativa ? 'marca.creme' : 'marca.marrom-950' }}>
                        {c.imagem ? <Box sx={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}><FotoCheia src={c.imagem} /></Box>
                          : <Box sx={{ width: 16, height: 16, borderRadius: '50%', background: tom && tom !== 'estampa' ? tom : undefined, bgcolor: tom ? undefined : 'marca.bege', border: corClara(tom) || !tom ? 1 : 0, borderColor: 'marca.borda-forte' }} />}
                        {c.cor ?? 'Única'}
                      </Button>
                    );
                  })}
                </Stack>
              )}
              <Stack direction="row" useFlexGap role="group" aria-label="Tamanho" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {cor?.variantes.map(v => (
                  <Button key={v.id} size="small" disabled={v.disponivel <= 0} aria-pressed={e.varianteId === v.id} onClick={() => mudar(i.id, { varianteId: v.id, escolha: e.escolha === 'pendente' || e.escolha === 'nao' ? 'quero' : e.escolha })}
                    variant={e.varianteId === v.id ? 'contained' : 'outlined'} sx={{ minWidth: 40, height: 40, px: 1, borderRadius: 3, fontWeight: 700, ...(v.disponivel <= 0 ? { textDecoration: 'line-through' } : {}) }}>{v.tamanho}</Button>
                ))}
              </Stack>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                {(Object.keys(ESCOLHAS) as (keyof typeof ESCOLHAS)[]).map(k => {
                  const ativo = e.escolha === k;
                  const cor = k === 'quero' ? 'success.main' : k === 'talvez' ? 'secondary.main' : 'text.secondary';
                  return <Button key={k} size="small" aria-pressed={ativo} onClick={() => mudar(i.id, { escolha: ativo ? 'pendente' : k })} sx={{ height: 40, px: 2, borderRadius: 99, border: 1, fontWeight: 600, borderColor: ativo ? cor : 'marca.borda-forte', bgcolor: ativo ? cor : 'transparent', color: ativo ? 'marca.creme' : 'marca.marrom-950', '&:hover': { bgcolor: ativo ? cor : 'marca.creme' } }}>{k === 'quero' ? '♥ ' : ''}{ESCOLHAS[k]}</Button>;
                })}
                {e.escolha === 'quero' && (
                  <Stack direction="row" sx={{ ml: 'auto', alignItems: 'center', border: 1, borderColor: 'marca.borda-forte', borderRadius: 99, height: 40 }}>
                    <IconButton size="small" onClick={() => mudar(i.id, { quantidade: Math.max(1, e.quantidade - 1) })} aria-label="Menos">−</IconButton>
                    <Box sx={{ width: 24, textAlign: 'center', fontWeight: 700 }}>{e.quantidade}</Box>
                    <IconButton size="small" onClick={() => mudar(i.id, { quantidade: Math.min(10, e.quantidade + 1) })} aria-label="Mais">+</IconButton>
                  </Stack>
                )}
              </Stack>
              {e.escolha === 'quero' && !e.varianteId && <Typography variant="caption" color="error.main">Escolha o tamanho.</Typography>}
            </Stack>
          </Card>
        );
      })}
      {mais.length > 0 && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Typography component="h2" variant="h6">Mais para você</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: '-4px !important' }}>Combina com o que {s.nomeVendedor} separou. Toque para incluir.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            {mais.map(m => (
              <Card key={m.produtoId} variant="outlined" sx={{ borderRadius: 6, overflow: 'hidden', display: 'grid' }}>
                <Box sx={{ position: 'relative', aspectRatio: '4 / 5', bgcolor: 'marca.bege' }}><FotoCheia src={m.imagem} alt={m.nome} /></Box>
                <Stack spacing={0.75} sx={{ p: 1.25 }}>
                  <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{m.nome}</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}><Typography sx={{ fontWeight: 800, color: m.preco < m.precoCheio ? 'imperdivel.main' : undefined }}>{brl(m.preco)}</Typography>{m.preco < m.precoCheio && <Typography component="s" variant="caption" color="text.secondary">{brl(m.precoCheio)}</Typography>}</Stack>
                  <Button size="small" variant="outlined" disabled={pondo === m.produtoId} onClick={async () => {
                    setPondo(m.produtoId); setErro(null);
                    const r = await postJson<{ ok: true; item: Item } | { ok: false; erro: string }>(`/s/${chave}/adicionar`, { produtoId: m.produtoId }).catch(() => ({ ok: false as const, erro: 'Não foi possível pôr a peça.' }));
                    setPondo(null);
                    if (!r.ok) return setErro(r.erro);
                    setExtras(x => [...x, r.item]);
                    setEstado(x => ({ ...x, [r.item.id]: { escolha: 'quero', produtoId: r.item.corInicial, varianteId: null, quantidade: 1 } }));
                    setMais(x => x.filter(y => y.produtoId !== m.produtoId));
                  }}>{pondo === m.produtoId ? 'Incluindo…' : '+ Incluir'}</Button>
                </Stack>
              </Card>
            ))}
          </Box>
        </Stack>
      )}
      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, bgcolor: 'rgba(255,253,249,.95)', backdropFilter: 'blur(16px)', borderTop: 1, borderColor: 'divider', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -12px 32px -16px rgba(46,37,32,.35)' }}>
        <Stack spacing={1} sx={{ mx: 'auto', maxWidth: 600, px: 2, py: 1.5 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          {pedirCep && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 14 }}>
              <span>CEP para o condicional</span>
              <TextField size="small" value={cep} onChange={ev => setCep(formatarCep(ev.target.value))} placeholder="89874-000" slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ width: 130 }} />
              <Typography variant="caption" color="text.secondary">Atendemos {s.cidadeCondicional}</Typography>
            </Stack>
          )}
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14 }}>
            <span>{totais.pecas ? `${totais.pecas} ${totais.pecas === 1 ? 'peça escolhida' : 'peças escolhidas'}` : 'Marque "Quero" nas peças que gostou'}</span>
            <Box sx={{ textAlign: 'right', lineHeight: 1.1 }}><Typography sx={{ fontWeight: 800, fontSize: 18 }}>{brl(totais.total)}</Typography>{economia > 0 && <Typography variant="caption" color="success.main">Você economiza {brl(economia)}</Typography>}</Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Button variant="contained" disabled={pendente} onClick={() => responder('compra')} sx={{ borderRadius: 99, height: 46 }}>{pendente ? 'Enviando…' : 'Quero comprar'}</Button>
            <Button variant="contained" color="success" disabled={pendente} onClick={() => responder('condicional')} sx={{ borderRadius: 99, height: 46 }}>{pedirCep ? 'Confirmar o CEP' : 'Quero provar em casa'}</Button>
          </Box>
          <Button size="small" disabled={pendente} onClick={() => responder('pensando')} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Ainda estou pensando · falar com {s.nomeVendedor}</Button>
        </Stack>
      </Box>
    </Stack>
  );
}
