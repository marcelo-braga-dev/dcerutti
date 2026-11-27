import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Box, Button, IconButton, InputAdornment, MenuItem, Paper, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, Close, Fullscreen, Search } from '@mui/icons-material';
import { ComTema } from '@/tema/ComTema';
import { SinalEquipe } from '@/Components/painel/SinalEquipe';
import { CardCaixa, FiltrosDoCaixa } from '@/Components/caixa/Produtos';
import { Cobrar, VendaConcluida } from '@/Components/caixa/Cobrar';
import { FotoCheia } from '@/Components/loja/Vitrine';
import { agruparModelos, calcularVenda, dentroDoLimite, FILTROS_CAIXA, filtrarCaixa, mensagemComprovante, porCodigo, type DescontoGeral, type FiltrosCaixa, type Pagamento, type ProdutoCaixa, type VarianteCaixa } from '@/lib/caixa';
import { formatarCpf } from '@/lib/cpf';
import { formatarDataHora } from '@/lib/datas';
import { brl, lerValor } from '@/lib/dinheiro';
import { getJson, postJson } from '@/lib/http';
import { formatarTelefone } from '@/lib/telefone';

type Item = { varianteId: number; quantidade: number; precoCombinado: number | null };
type ClienteCaixa = { id: string; nome: string; telefone: string; vendedor: string };
type Previa = { ok: true; codigo: string; desconto: number; regra: string } | { ok: false; erro: string };
type Concluida = { pedidoId: string; codigo: string; total: number; troco: number; comprovante: string; telefone: string | null; nomeCliente: string | null };
type Props = {
  produtos: ProdutoCaixa[]; vendedores: { id: string; name: string }[] | null; limiteDesconto: number; parcelasMax: number; cupons: boolean;
  resumo: { total: number; vendas: number };
};

const POR_VEZ = 48;
const rotulo = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/**
 * Caixa da loja física (D-23; porta de src/components/caixa/caixa.tsx). O catálogo inteiro vem do servidor e a busca e
 * os filtros rodam aqui, na hora. A venda em andamento fica guardada no navegador. O servidor confere tudo ao registrar.
 */
export default function Caixa({ produtos, vendedores, limiteDesconto, parcelasMax, cupons, resumo }: Props) {
  const { usuario, identidade } = usePage().props;
  const gestor = usuario?.papel === 'gestor';
  const chave = `dcerutti-caixa:${usuario?.id}`;
  const [f, setF] = useState<FiltrosCaixa>(FILTROS_CAIXA);
  const busca = useDeferredValue(f.q);
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const [itens, setItens] = useState<Item[]>([]);
  const [geral, setGeral] = useState<DescontoGeral>(null);
  const [cliente, setCliente] = useState<ClienteCaixa | null>(null);
  const [vendedorId, setVendedorId] = useState('');
  const [codigoCupom, setCodigoCupom] = useState('');
  const [cupom, setCupom] = useState<Previa | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluida, setConcluida] = useState<Concluida | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; em: number } | null>(null);
  const [verVenda, setVerVenda] = useState(false);
  const [pendente, setPendente] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const carregado = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(chave) ?? 'null');
      if (s && Array.isArray(s.itens)) { setItens(s.itens); setGeral(s.geral ?? null); setCliente(s.cliente ?? null); setVendedorId(s.vendedorId ?? ''); setCodigoCupom(s.codigoCupom ?? ''); }
    } catch { /* sem armazenamento */ }
    carregado.current = true;
  }, [chave]);
  useEffect(() => {
    if (!carregado.current) return;
    try { localStorage.setItem(chave, JSON.stringify({ itens, geral, cliente, vendedorId, codigoCupom })); } catch { /* sem armazenamento */ }
  }, [chave, itens, geral, cliente, vendedorId, codigoCupom]);

  const porVariante = useMemo(() => {
    const m = new Map<number, { p: ProdutoCaixa; v: VarianteCaixa }>();
    for (const p of produtos) for (const v of p.variantes) m.set(v.id, { p, v });
    return m;
  }, [produtos]);
  const r = useMemo(() => filtrarCaixa(produtos, { ...f, q: busca }), [produtos, f, busca]);
  const modelos = useMemo(() => agruparModelos(r.produtos), [r.produtos]);
  const semFiltro = !busca.trim() && !f.genero && !f.categoria && !f.tamanho && !f.cor && !f.preco && !f.promo;
  const naVenda = useMemo(() => new Map(itens.map(i => [i.varianteId, i.quantidade])), [itens]);
  const linhas = itens.filter(i => porVariante.has(i.varianteId));
  const calc = calcularVenda(linhas.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade, preco: porVariante.get(i.varianteId)!.p.preco, precoCombinado: i.precoCombinado })), geral);
  const descontoCupom = cupom?.ok ? cupom.desconto : 0;
  const total = Math.max(0, Math.round((calc.total - descontoCupom) * 100) / 100);
  const pecas = linhas.reduce((a, i) => a + i.quantidade, 0);
  const acimaDoLimite = !dentroDoLimite(calc.descontoParte, limiteDesconto, gestor);
  const precisaVendedor = gestor && !vendedorId && !cliente;
  const avisar = (texto: string) => setAviso({ texto, em: Date.now() });

  const adicionar = useCallback((p: ProdutoCaixa, v: VarianteCaixa) => {
    const ja = itens.find(i => i.varianteId === v.id)?.quantidade ?? 0;
    if (ja >= v.disponivel) return avisar(`Sem mais estoque de ${p.nome} · ${v.tamanho}`);
    setItens(atual => atual.some(i => i.varianteId === v.id) ? atual.map(i => (i.varianteId === v.id ? { ...i, quantidade: i.quantidade + 1 } : i)) : [...atual, { varianteId: v.id, quantidade: 1, precoCombinado: null }]);
    avisar(`+1 ${p.nome} · Tam. ${v.tamanho}`);
  }, [itens]);
  const alterar = (id: number, delta: number) => setItens(atual => atual.flatMap(i => {
    if (i.varianteId !== id) return [i];
    const q = Math.min(porVariante.get(id)?.v.disponivel ?? 0, i.quantidade + delta);
    return q > 0 ? [{ ...i, quantidade: q }] : [];
  }));
  const definirPreco = (id: number, preco: number | null) => setItens(atual => atual.map(i => (i.varianteId === id ? { ...i, precoCombinado: preco } : i)));
  const limpar = () => { setItens([]); setGeral(null); setCliente(null); setCodigoCupom(''); setCupom(null); setErro(null); };

  const chaveCupom = cupons && codigoCupom && linhas.length ? JSON.stringify([codigoCupom, cliente?.id, geral, linhas]) : '';
  useEffect(() => {
    if (!chaveCupom) return;
    let atual = true;
    const t = setTimeout(() => postJson<Previa>('/caixa/cupom', { codigo: codigoCupom, clienteId: cliente?.id ?? null, linhas, descontoGeral: geral }).then(x => { if (atual) setCupom(x); }).catch(() => {}), 300);
    return () => { atual = false; clearTimeout(t); };
  }, [chaveCupom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalhos: F2 busca, F4 cobrar.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (cobrando || concluida) return;
      if (e.key === 'F2') { e.preventDefault(); campo.current?.focus(); campo.current?.select(); }
      if (e.key === 'F4') { e.preventDefault(); if (linhas.length && !acimaDoLimite && !precisaVendedor) setCobrando(true); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [cobrando, concluida, linhas.length, acimaDoLimite, precisaVendedor]);

  const aoEnter = () => {
    const achado = porCodigo(produtos, f.q);
    if (achado) { adicionar(achado.produto, achado.variante); setF(x => ({ ...x, q: '' })); return; }
    const so = r.produtos.length === 1 ? r.produtos[0] : null;
    const tamanhos = so?.variantes.filter(v => v.disponivel > 0) ?? [];
    if (so && tamanhos.length === 1) { adicionar(so, tamanhos[0]); setF(x => ({ ...x, q: '' })); }
  };

  const confirmar = async (pagamentos: Pagamento[], observacao: string) => {
    setErro(null);
    setPendente(true);
    type Resposta = { ok: true; pedidoId: string; codigo: string; total: number; troco: number; telefone: string | null; nomeCliente: string | null; nomeVendedor: string; subtotal: number; desconto: number; itens: { nome: string; tamanho: string; quantidade: number; preco: number }[]; cupom: { codigo: string; desconto: number } | null; pagamentos: Pagamento[] } | { ok: false; erro: string };
    const res = await postJson<Resposta>('/caixa/vendas', {
      linhas: linhas.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade, precoCombinado: i.precoCombinado })),
      descontoGeral: geral, clienteId: cliente?.id ?? null, cupom: cupom?.ok ? cupom.codigo : undefined, pagamentos, vendedorId: vendedorId || undefined, observacao: observacao || undefined,
    }).catch(() => ({ ok: false as const, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.' }));
    setPendente(false);
    if (!res.ok) return setErro(res.erro);
    const comprovante = mensagemComprovante({ codigo: res.codigo, nomeCliente: res.nomeCliente, nomeVendedor: res.nomeVendedor, quando: formatarDataHora(new Date()), itens: res.itens, subtotal: res.subtotal, desconto: res.desconto, cupom: res.cupom, total: res.total, pagamentos: res.pagamentos, troco: res.troco }, brl);
    setCobrando(false);
    setConcluida({ pedidoId: res.pedidoId, codigo: res.codigo, total: res.total, troco: res.troco, comprovante, telefone: res.telefone, nomeCliente: res.nomeCliente });
    limpar();
    router.reload({ only: ['produtos', 'resumo'] }); // estoque e o total de hoje
  };
  const novaVenda = () => { setConcluida(null); setVerVenda(false); setTimeout(() => campo.current?.focus(), 50); };

  return (
    <ComTema area="painel">
      <Head title="Caixa" />
      <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'marca.creme' }}>
        <Stack component="header" direction="row" spacing={{ xs: 1.5, sm: 2 }} sx={{ flexShrink: 0, height: 56, bgcolor: 'marca.marrom-950', color: 'marca.creme', alignItems: 'center', px: { xs: 1.5, lg: 3 } }}>
          <Button href="/painel" startIcon={<ArrowBack />} variant="contained" size="small" sx={{ bgcolor: 'marca.creme', color: 'marca.marrom-950', flexShrink: 0 }}>Voltar ao painel</Button>
          <Stack direction="row" spacing={1.5} title={`${usuario?.nome} · ${gestor ? 'gestor' : 'vendedora'}`} sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', minWidth: 0 }}>
            <Box component="img" src={identidade.logoClara.url} alt={identidade.nome} sx={{ height: 32, width: 'auto' }} />
            <Typography sx={{ ...rotulo, color: 'marca.areia', borderLeft: '1px solid rgba(246,242,236,.2)', pl: 1.5 }}>Caixa</Typography>
          </Stack>
          <Button href="/caixa/vendas" variant="outlined" size="small" title={`${resumo.vendas} ${resumo.vendas === 1 ? 'venda' : 'vendas'} hoje · ver as vendas do dia e o fechamento`} sx={{ ml: 'auto !important', color: 'marca.creme', borderColor: 'rgba(246,242,236,.25)', gap: 1 }}>
            <Box component="span" sx={{ ...rotulo, color: 'marca.areia' }}>Hoje</Box><strong>{brl(resumo.total)}</strong>
          </Button>
          <IconButton aria-label="Tela cheia" title="Tela cheia" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} sx={{ display: { xs: 'none', lg: 'inline-flex' }, color: 'marca.creme' }}><Fullscreen /></IconButton>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { lg: 'minmax(0,1fr) 420px', xl: 'minmax(0,1fr) 460px' } }}>
          <Box component="section" sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack spacing={1.5} sx={{ flexShrink: 0, px: { xs: 2, lg: 3 }, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <TextField inputRef={campo} autoFocus value={f.q} onChange={e => { setF(x => ({ ...x, q: e.target.value })); setMostrar(POR_VEZ); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aoEnter(); } if (e.key === 'Escape') setF(x => ({ ...x, q: '' })); }}
                placeholder="Código da etiqueta, nome, referência ou cor…   (F2)" autoComplete="off"
                slotProps={{ htmlInput: { 'aria-label': 'Buscar peça ou digitar o código' }, input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment>, endAdornment: f.q ? <IconButton aria-label="Limpar a busca" onClick={() => { setF(x => ({ ...x, q: '' })); campo.current?.focus(); }}><Close /></IconButton> : undefined, sx: { height: 56, fontSize: 18, bgcolor: 'background.paper' } } }} />
              <FiltrosDoCaixa f={f} c={r.contagens} mudar={m => { setF(x => ({ ...x, ...m })); setMostrar(POR_VEZ); }} />
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, lg: 3 }, py: 2, pb: { xs: 14, lg: 3 } }}>
              {semFiltro ? (
                <Stack spacing={1.5} sx={{ height: '100%', minHeight: 256, alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'text.secondary', px: 2 }}>
                  <Search sx={{ fontSize: 40, color: 'marca.borda-forte' }} />
                  <Typography sx={{ color: 'marca.marrom-950', fontWeight: 700, fontSize: 18 }}>Digite o código da etiqueta e aperte Enter</Typography>
                  <Typography variant="body2" sx={{ maxWidth: 380 }}>ou busque pelo nome, referência ou cor, ou escolha um filtro acima para ver as peças.</Typography>
                </Stack>
              ) : (
                <>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1.5, fontSize: 14, color: 'text.secondary' }}>
                    <span>{modelos.length.toLocaleString('pt-BR')} {modelos.length === 1 ? 'modelo' : 'modelos'} · {r.produtos.length.toLocaleString('pt-BR')} {r.produtos.length === 1 ? 'cor' : 'cores'}</span>
                    <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>Enter com o código põe direto na venda</Box>
                  </Stack>
                  {r.produtos.length === 0 ? (
                    <Typography sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>Nenhuma peça com esses filtros. {f.disponivel && <Button size="small" onClick={() => setF(x => ({ ...x, disponivel: false }))}>Ver também as esgotadas</Button>}</Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 1, alignItems: 'start' }}>
                      {modelos.slice(0, mostrar).map(m => <CardCaixa key={m.chave} m={m} naVenda={naVenda} adicionar={adicionar} />)}
                    </Box>
                  )}
                  {modelos.length > mostrar && <Box sx={{ mt: 3, textAlign: 'center' }}><Button variant="outlined" onClick={() => setMostrar(m => m + POR_VEZ)}>Mostrar mais ({modelos.length - mostrar})</Button></Box>}
                </>
              )}
            </Box>
          </Box>

          <Box component="aside" aria-label="Venda atual" sx={{ display: { xs: verVenda ? 'flex' : 'none', lg: 'flex' }, position: { xs: 'fixed', lg: 'static' }, inset: 0, zIndex: 40, minHeight: 0, flexDirection: 'column', bgcolor: 'background.paper', borderLeft: 1, borderColor: 'divider' }}>
            <Stack direction="row" sx={{ flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', px: 2.5, height: 56, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}><Typography component="h2" sx={{ fontWeight: 700, fontSize: 18 }}>Venda atual</Typography><Typography variant="body2" color="text.secondary">{pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'vazia'}</Typography></Stack>
              <Stack direction="row">
                {linhas.length > 0 && <Button size="small" onClick={() => { if (confirm('Limpar a venda atual?')) limpar(); }} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Limpar</Button>}
                <IconButton onClick={() => setVerVenda(false)} aria-label="Voltar para as peças" sx={{ display: { lg: 'none' } }}><Close /></IconButton>
              </Stack>
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {linhas.length === 0 ? (
                <Stack spacing={1} sx={{ px: 3, py: 7, textAlign: 'center', color: 'text.secondary' }}><Box sx={{ fontSize: 36 }} aria-hidden>🛍️</Box><span>Toque no tamanho de uma peça, ou digite o código da etiqueta e aperte Enter.</span></Stack>
              ) : linhas.map(i => <LinhaVenda key={i.varianteId} item={i} info={porVariante.get(i.varianteId)!} precoFinal={calc.precos.get(i.varianteId) ?? 0} alterar={alterar} definirPreco={definirPreco} />)}
              <Stack spacing={2} sx={{ px: 2.5, py: 2, borderTop: 1, borderColor: 'divider' }}>
                <BlocoCliente cliente={cliente} escolher={c => { setCliente(c); setCupom(null); }} gestor={gestor} vendedorId={vendedorId} />
                {gestor && vendedores && (
                  <TextField select size="small" label="Vendido por" value={vendedorId} onChange={e => setVendedorId(e.target.value)} color={precisaVendedor ? 'warning' : undefined} focused={precisaVendedor && linhas.length > 0 ? true : undefined}>
                    <MenuItem value="">{cliente ? 'Quem atende a cliente' : 'Escolha a vendedora'}</MenuItem>
                    {vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
                  </TextField>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: cupons ? '1fr 1fr' : '1fr', gap: 1.5 }}>
                  <DescontoGeralCampo geral={geral} mudar={setGeral} />
                  {cupons && <TextField size="small" label="Cupom" value={codigoCupom} onChange={e => { setCodigoCupom(e.target.value.toUpperCase().trim()); setCupom(null); }} placeholder="Código" slotProps={{ htmlInput: { maxLength: 30 } }} />}
                </Box>
                {codigoCupom && cupom && <Typography variant="caption" sx={{ color: cupom.ok ? 'success.main' : 'error.main' }}>{cupom.ok ? `Cupom ${cupom.codigo}: ${cupom.regra}` : `Cupom não aplicado: ${cupom.erro}`}</Typography>}
              </Stack>
            </Box>
            <Stack spacing={1} sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', p: 2.5, bgcolor: 'marca.creme' }}>
              <Valor rotulo="Peças" valor={brl(calc.subtotal)} />
              {calc.desconto > 0 && <Valor rotulo={`Desconto (${Math.round(calc.descontoParte * 100)}%)`} valor={`−${brl(calc.desconto)}`} cor="secondary.main" />}
              {descontoCupom > 0 && <Valor rotulo={`Cupom ${cupom?.ok ? cupom.codigo : ''}`} valor={`−${brl(descontoCupom)}`} cor="success.main" />}
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', pt: 1, borderTop: 1, borderColor: 'divider' }}><Typography sx={{ fontWeight: 700, fontSize: 18 }}>Total</Typography><Typography sx={{ fontWeight: 800, fontSize: 30 }}>{brl(total)}</Typography></Stack>
              {acimaDoLimite && <Typography variant="caption" color="error.main">Desconto acima de {limiteDesconto}%: peça ao gestor para registrar.</Typography>}
              {precisaVendedor && linhas.length > 0 && <Typography variant="caption" color="secondary.main">Escolha quem fez a venda.</Typography>}
              <Button variant="contained" size="large" disabled={!linhas.length || acimaDoLimite || precisaVendedor} onClick={() => { setErro(null); setCobrando(true); }} sx={{ mt: 0.5, height: 56, fontSize: 16 }}>
                Cobrar {linhas.length ? brl(total) : ''}&nbsp;<Box component="span" sx={{ color: 'marca.areia' }}>· F4</Box>
              </Button>
            </Stack>
          </Box>
        </Box>

        {!verVenda && (
          <Button onClick={() => setVerVenda(true)} variant="contained" sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 30, height: 56, justifyContent: 'space-between', boxShadow: 6 }}>
            <span>Venda · {pecas} {pecas === 1 ? 'peça' : 'peças'}</span><Box component="span" sx={{ fontWeight: 800, fontSize: 20 }}>{brl(total)}</Box>
          </Button>
        )}
        <Snackbar open={!!aviso} key={aviso?.em} autoHideDuration={2200} onClose={() => setAviso(null)} message={aviso?.texto} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ bottom: { xs: 96, lg: 32 } }} />
        {cobrando && <Cobrar total={total} parcelasMax={parcelasMax} pendente={pendente} erro={erro} confirmar={confirmar} fechar={() => setCobrando(false)} />}
        {concluida && <VendaConcluida {...concluida} novaVenda={novaVenda} />}
        <SinalEquipe />
      </Box>
    </ComTema>
  );
}

function LinhaVenda({ item, info, precoFinal, alterar, definirPreco }: { item: Item; info: { p: ProdutoCaixa; v: VarianteCaixa }; precoFinal: number; alterar: (id: number, d: number) => void; definirPreco: (id: number, preco: number | null) => void }) {
  const { p, v } = info;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [pct, setPct] = useState('');
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');
  const porPct = (t: string) => { setPct(t); const n = lerValor(t); if (n >= 0 && n <= 100) setTexto(fmt(Math.round(p.preco * (100 - n)) / 100)); };
  const porPreco = (t: string) => { setTexto(t); const n = lerValor(t); if (n >= 0 && n <= p.preco) setPct(String(Math.round((1 - n / p.preco) * 1000) / 10).replace('.', ',')); };
  const combinado = item.precoCombinado != null && item.precoCombinado < p.preco;
  const aplicar = (preco: number | null) => { definirPreco(v.id, preco); setEditando(false); };
  const valorTexto = () => (lerValor(texto) >= 0 ? lerValor(texto) : null);
  return (
    <Stack spacing={1} sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 1.5, alignItems: 'center' }}>
        <Box sx={{ position: 'relative', aspectRatio: '3 / 4', bgcolor: 'marca.bege', borderRadius: 1, overflow: 'hidden' }}><FotoCheia src={p.imagem} /></Box>
        <Box sx={{ minWidth: 0, fontSize: 14 }}>
          <Typography noWrap sx={{ fontSize: 14, color: 'marca.marrom-950' }}>{p.nome}</Typography>
          <Typography variant="caption" color="text.secondary">Tam. <strong>{v.tamanho}</strong>{p.corNome ? ` · ${p.corNome}` : ''} · Cód. {v.codigoInterno ?? '—'}</Typography>
          <Box><Button size="small" onClick={() => { const atual = item.precoCombinado ?? p.preco; setTexto(fmt(atual)); setPct(String(Math.round((1 - atual / p.preco) * 1000) / 10).replace('.', ',')); setEditando(e => !e); }} sx={{ p: 0, minWidth: 0, fontSize: 12, color: 'secondary.main', textDecoration: 'underline' }}>
            {combinado ? <><s style={{ opacity: 0.6 }}>{brl(p.preco)}</s>&nbsp;{brl(item.precoCombinado!)} · mudar</> : `${brl(p.preco)} · dar desconto`}
          </Button></Box>
        </Box>
        <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
          <Stack direction="row" aria-label="Quantidade" sx={{ alignItems: 'center', border: 1, borderColor: 'marca.borda-forte', borderRadius: 1, bgcolor: 'marca.creme' }}>
            <IconButton size="small" onClick={() => alterar(v.id, -1)} aria-label="Diminuir">−</IconButton>
            <Box sx={{ width: 28, textAlign: 'center', fontWeight: 700 }}>{item.quantidade}</Box>
            <IconButton size="small" disabled={item.quantidade >= v.disponivel} onClick={() => alterar(v.id, 1)} aria-label="Aumentar">+</IconButton>
          </Stack>
          <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{brl(precoFinal * item.quantidade)}</Typography>
        </Stack>
      </Box>
      {editando && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1, bgcolor: 'marca.creme', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
          <TextField size="small" autoFocus label="Desconto %" value={pct} onChange={e => porPct(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicar(valorTexto())} slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Desconto da peça em %' } }} sx={{ width: 110, bgcolor: 'background.paper' }} />
          <TextField size="small" label="ou preço R$" value={texto} onChange={e => porPreco(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicar(valorTexto())} slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Novo preço por peça' } }} sx={{ width: 130, bgcolor: 'background.paper' }} />
          <Button size="small" variant="contained" onClick={() => aplicar(valorTexto())}>Aplicar</Button>
          {combinado && <Button size="small" onClick={() => aplicar(null)} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Voltar ao preço</Button>}
        </Stack>
      )}
    </Stack>
  );
}

function BlocoCliente({ cliente, escolher, gestor, vendedorId }: { cliente: ClienteCaixa | null; escolher: (c: ClienteCaixa | null) => void; gestor: boolean; vendedorId: string }) {
  const [q, setQ] = useState('');
  const [achados, setAchados] = useState<ClienteCaixa[]>([]);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [cpf, setCpf] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return;
    let atual = true;
    const t = setTimeout(() => getJson<ClienteCaixa[]>(`/caixa/clientes?q=${encodeURIComponent(q)}`).then(r => { if (atual) setAchados(r); }).catch(() => {}), 250);
    return () => { atual = false; clearTimeout(t); };
  }, [q]);
  if (cliente)
    return (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(94,107,67,.1)', border: 1, borderColor: 'rgba(94,107,67,.4)', borderRadius: 1, px: 1.5, py: 1 }}>
        <Box sx={{ minWidth: 0 }}><Typography sx={{ ...rotulo, color: 'success.main' }}>Cliente</Typography><Typography noWrap sx={{ fontSize: 14 }}>{cliente.nome}</Typography><Typography variant="caption" color="text.secondary">{cliente.telefone}</Typography></Box>
        <Button size="small" onClick={() => escolher(null)} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Trocar</Button>
      </Stack>
    );
  if (novo)
    return (
      <Paper component="form" variant="outlined" sx={{ p: 1.5, display: 'grid', gap: 1, bgcolor: 'marca.creme' }} onSubmit={async (e: React.FormEvent) => {
        e.preventDefault();
        setErro(null);
        setPendente(true);
        const r = await postJson<{ ok: true; cliente: ClienteCaixa } | { ok: false; erro: string }>('/caixa/clientes', { nome, telefone: fone, cpf, vendedorId: gestor ? vendedorId || undefined : undefined });
        setPendente(false);
        if (!r.ok) return setErro(r.erro);
        escolher(r.cliente);
        setNovo(false); setNome(''); setFone(''); setCpf('');
      }}>
        <Typography sx={rotulo}>Cadastro rápido</Typography>
        <TextField size="small" autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" sx={{ bgcolor: 'background.paper' }} />
        <TextField size="small" value={fone} onChange={e => setFone(formatarTelefone(e.target.value))} placeholder="WhatsApp (49) 99999-9999" slotProps={{ htmlInput: { inputMode: 'tel' } }} sx={{ bgcolor: 'background.paper' }} />
        <TextField size="small" value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} placeholder="CPF (opcional) 000.000.000-00" slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'CPF (opcional)' } }} sx={{ bgcolor: 'background.paper' }} />
        {erro && <Typography variant="caption" color="error.main">{erro}</Typography>}
        <Stack direction="row" spacing={1}><Button type="submit" variant="contained" disabled={pendente} sx={{ flex: 1 }}>{pendente ? 'Salvando…' : 'Cadastrar e usar'}</Button><Button onClick={() => setNovo(false)}>Cancelar</Button></Stack>
      </Paper>
    );
  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography sx={rotulo}>Cliente</Typography><Typography variant="caption" color="text.secondary">Sem escolher: consumidor final</Typography></Stack>
      <Box sx={{ position: 'relative' }}>
        <TextField size="small" fullWidth value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, WhatsApp ou CPF" />
        {q.trim().length >= 2 && (
          <Paper elevation={6} sx={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: '100%', mt: 0.5, maxHeight: 256, overflowY: 'auto' }}>
            {achados.map(c => (
              <Box key={c.id} component="button" type="button" onClick={() => { escolher(c); setQ(''); setAchados([]); }} sx={{ display: 'block', width: '100%', textAlign: 'left', px: 1.5, py: 1, border: 0, bgcolor: 'transparent', cursor: 'pointer', '&:hover': { bgcolor: 'marca.creme' } }}>
                <Typography sx={{ fontSize: 14 }}>{c.nome}</Typography><Typography variant="caption" color="text.secondary">{c.telefone}{gestor ? ` · ${c.vendedor}` : ''}</Typography>
              </Box>
            ))}
            <Button fullWidth onClick={() => { setNovo(true); setNome(/\d/.test(q) ? '' : q); setFone(/\d/.test(q) ? formatarTelefone(q) : ''); setQ(''); }} sx={{ justifyContent: 'flex-start', px: 1.5, py: 1.5, borderTop: 1, borderColor: 'divider', borderRadius: 0, color: 'secondary.main' }}>+ Cadastrar “{q.trim()}”</Button>
          </Paper>
        )}
      </Box>
      <Button size="small" onClick={() => setNovo(true)} sx={{ alignSelf: 'flex-start', p: 0, textDecoration: 'underline' }}>+ Cadastrar cliente nova</Button>
    </Stack>
  );
}

function DescontoGeralCampo({ geral, mudar }: { geral: DescontoGeral; mudar: (g: DescontoGeral) => void }) {
  const [tipo, setTipo] = useState<'percentual' | 'valor'>(geral?.tipo ?? 'percentual');
  const [texto, setTexto] = useState(geral ? String(geral.valor).replace('.', ',') : '');
  const aplicar = (t: string, ti = tipo) => { setTexto(t); const n = lerValor(t); mudar(n > 0 ? { tipo: ti, valor: n } : null); };
  return (
    <TextField size="small" label="Desconto" value={texto} onChange={e => aplicar(e.target.value)} placeholder="0"
      slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Valor do desconto' }, input: { endAdornment: <Button size="small" onClick={() => { const t = tipo === 'percentual' ? 'valor' : 'percentual'; setTipo(t); aplicar(texto, t); }} aria-label="Trocar entre % e R$" sx={{ minWidth: 40, fontWeight: 700 }}>{tipo === 'percentual' ? '%' : 'R$'}</Button> } }} />
  );
}

function Valor({ rotulo: r, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14, color: cor }}><span>{r}</span><span>{valor}</span></Stack>;
}
