import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Autocomplete, Avatar, Badge, Box, Button, Card, CardContent, CardHeader, Chip, IconButton, InputAdornment, Link, Stack, Step, StepButton, Stepper, TextField, Typography,
} from '@mui/material';
import { Add, ArrowBack, Check, Checkroom, DeleteOutlined, InfoOutlined, Inventory2, LocalOffer, Person, PointOfSaleOutlined, Remove, Search, ShoppingBag, WhatsApp } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Foto } from '@/Components/ui/Basicos';
import { avisarEnvio } from '@/Components/painel/SinalEquipe';
import { brl } from '@/lib/dinheiro';
import { getJson, postJson } from '@/lib/http';
import { linkWhatsApp, mensagemDoVendedor, type ItemMensagem } from '@/lib/whatsapp';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';

type Variante = { id: number; tamanho: string; disponivel: number; codigoInterno: string | null };
type Produto = { id: number; referencia: string; nome: string; marca: string; cor: string | null; categoria: string; preco: number; imagem: string | null; variantes: Variante[] };
type Linha = { variante: Variante; produto: Produto; quantidade: number };
type Tipo = 'compra' | 'condicional' | 'balcao';
type Cupom = { codigo: string; regra: string; clientes: string[] | null };
type Props = { clientes: { id: string; nome: string; telefone: string }[]; iniciais: Produto[]; clienteInicial: string; tipoInicial: Tipo; buscaInicial: string; cupons: Cupom[] | null };
type Resposta = { ok: true; pedidoId: string; codigo: string; tipo: 'compra' | 'condicional'; telefone: string; nomeCliente: string; itens: ItemMensagem[]; cupom: { codigo: string; desconto: number; freteGratis: boolean } | null } | { ok: false; erro: string };

function Secao({ id, icone, titulo, extra, children, sx }: { id: string; icone: ReactNode; titulo: string; extra?: ReactNode; children: ReactNode; sx?: object }) {
  return (
    <Card id={id} sx={{ scrollMarginTop: 80, ...sx }}>
      <CardHeader avatar={icone} title={titulo} action={extra} slotProps={{ title: { variant: 'subtitle1', sx: { fontWeight: 700 } } }} sx={{ pb: 0, '& .MuiCardHeader-avatar': { color: 'secondary.main' }, '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const TIPOS: { valor: Tipo; rotulo: string; legenda: string; icone: ReactNode }[] = [
  { valor: 'compra', rotulo: 'Pedido', legenda: 'Cliente confirma e paga', icone: <ShoppingBag /> },
  { valor: 'condicional', rotulo: 'Condicional', legenda: 'Leva para provar; reserva', icone: <Inventory2 /> },
  { valor: 'balcao', rotulo: 'Venda na loja', legenda: 'Já pago: baixa o estoque', icone: <PointOfSaleOutlined /> },
];

/** Porta de src/components/painel/montador.tsx: cliente, peças e envio pelo WhatsApp com a imagem da seleção. */
export default function NovoPedido({ clientes, iniciais, clienteInicial, tipoInicial, buscaInicial, cupons }: Props) {
  const vendedor = usePage().props.usuario?.nome ?? '';
  const [clienteId, setClienteId] = useState(clienteInicial);
  const [busca, setBusca] = useState(buscaInicial);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cupom, setCupom] = useState('');
  const [etapa, setEtapa] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Produto[]>(iniciais);
  const cuponsDaCliente = (cupons ?? []).filter(c => !c.clientes || c.clientes.includes(clienteId));

  // Busca no servidor (o catálogo inteiro não vem para o navegador), 250 ms depois da última tecla.
  useEffect(() => {
    let atual = true;
    const t = setTimeout(() => getJson<Produto[]>(`/painel/pecas/busca?q=${encodeURIComponent(busca)}`).then(r => { if (atual) setResultados(r); }).catch(() => {}), busca ? 250 : 0);
    return () => { atual = false; clearTimeout(t); };
  }, [busca]);

  const adicionar = (produto: Produto, variante: Variante) => {
    setErro(null);
    setLinhas(ls => {
      const ex = ls.find(l => l.variante.id === variante.id);
      if (ex) return ls.map(l => (l.variante.id === variante.id ? { ...l, quantidade: Math.min(variante.disponivel, l.quantidade + 1) } : l));
      return [...ls, { produto, variante, quantidade: 1 }];
    });
  };
  const alterar = (id: number, d: number) => setLinhas(ls => ls.map(l => (l.variante.id === id ? { ...l, quantidade: Math.min(l.variante.disponivel, l.quantidade + d) } : l)).filter(l => l.quantidade > 0));
  const total = linhas.reduce((a, l) => a + l.produto.preco * l.quantidade, 0);
  const pecas = linhas.reduce((a, l) => a + l.quantidade, 0);
  const cliente = clientes.find(c => c.id === clienteId) ?? null;
  const naSelecao = (id: number) => linhas.filter(l => l.produto.id === id).reduce((a, l) => a + l.quantidade, 0);

  const salvar = async (enviar: boolean) => {
    if (!clienteId) return setErro('Escolha o cliente.');
    if (!linhas.length) return setErro('Adicione pelo menos uma peça.');
    if (tipo === 'balcao') enviar = false; // venda na loja: registra e baixa o estoque, sem WhatsApp
    const aba = enviar && !navigator.canShare ? window.open('', '_blank') : null;
    setEtapa(tipo === 'balcao' ? 'Registrando venda…' : 'Salvando pedido…');
    const r = await postJson<Resposta>('/painel/pedidos', { clienteId, tipo, cupom: cupom.trim() || null, linhas: linhas.map(l => ({ varianteId: l.variante.id, quantidade: l.quantidade })) });
    if (!r.ok) { aba?.close(); setEtapa(null); return setErro(r.erro); }
    if (enviar) {
      setEtapa('Gerando imagem…');
      const texto = mensagemDoVendedor({ codigo: r.codigo, itens: r.itens, nomeCliente: r.nomeCliente, nomeVendedor: vendedor, condicional: r.tipo === 'condicional', cupom: r.cupom });
      const url = linkWhatsApp(r.telefone, texto);
      const imagem = await gerarImagemPedido({
        selo: r.tipo === 'condicional' ? 'CONDICIONAL' : 'SELEÇÃO PARA VOCÊ', codigo: r.codigo, titulo: `Olá, ${r.nomeCliente.split(' ')[0]}`,
        subtitulo: `${vendedor.split(' ')[0]} separou estas peças para você`, rodape: 'PAGAMENTO E ENTREGA A COMBINAR', itens: r.itens,
      });
      const podeCompartilhar = imagem && navigator.canShare?.({ files: [new File([imagem], `${r.codigo}.png`, { type: 'image/png' })] });
      if (imagem && podeCompartilhar) {
        // Celular: compartilha imagem + texto de uma vez; a pessoa escolhe o contato no WhatsApp.
        if (!(await compartilharImagem(imagem, r.codigo, texto))) window.open(url, '_blank');
      } else {
        // Computador: baixa a imagem e abre o WhatsApp Web com o texto.
        if (imagem) await compartilharImagem(imagem, r.codigo);
        if (aba) aba.location.href = url; else window.open(url, '_blank');
      }
      avisarEnvio({ acao: 'oferta', pedidoId: r.pedidoId }); // D-26: a seleção enviada entra no acompanhamento
    }
    router.visit(`/painel/pedidos/${r.pedidoId}`);
  };

  const etapas = [
    { id: 'm-cliente', titulo: 'Cliente e tipo', ok: !!clienteId, info: cliente?.nome.split(' ')[0] ?? 'escolher' },
    { id: 'm-pecas', titulo: 'Peças', ok: pecas > 0, info: pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'adicionar' },
    { id: 'm-enviar', titulo: tipo === 'balcao' ? 'Registrar' : 'Enviar', ok: false, info: brl(total) },
  ];
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <PainelLayout titulo="Novo pedido">
      <Head title="Novo pedido" />
      <Link href="/painel/pedidos" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Pedidos</Link>
      <CabecalhoPagina sobre="Seleção para o cliente" titulo="Novo pedido">Cliente, peças e envio pelo WhatsApp com a imagem da seleção.</CabecalhoPagina>
      <Stepper nonLinear sx={{ mb: 2, overflowX: 'auto' }} aria-label="Etapas">
        {etapas.map(e => (
          <Step key={e.id} completed={e.ok}><StepButton onClick={() => ir(e.id)} optional={<Typography variant="caption" color="text.secondary">{e.info}</Typography>}>{e.titulo}</StepButton></Step>
        ))}
      </Stepper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 360px' }, gap: 2, alignItems: 'start' }}>
        <Stack sx={{ gap: 2, minWidth: 0 }}>
          <Secao id="m-cliente" icone={<Person />} titulo="1 · Cliente e tipo">
            <Stack sx={{ gap: 2 }}>
              <Autocomplete options={clientes} value={cliente} onChange={(_, c) => { setClienteId(c?.id ?? ''); setErro(null); }}
                getOptionLabel={c => `${c.nome} · ${c.telefone}`} isOptionEqualToValue={(a, b) => a.id === b.id} noOptionsText="Nenhum cliente"
                renderInput={params => <TextField {...params} label="Cliente" required placeholder="Escolha o cliente…" />} />
              <Box role="group" aria-label="Tipo" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                {TIPOS.map(t => (
                  <Button key={t.valor} aria-pressed={tipo === t.valor} aria-label={t.rotulo} onClick={() => setTipo(t.valor)} variant={tipo === t.valor ? 'contained' : 'outlined'}
                    sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: 1, py: 1.25, justifyContent: { sm: 'flex-start' }, textAlign: { sm: 'left' } }}>
                    {t.icone}
                    <Box><Box sx={{ fontWeight: 600, lineHeight: 1.2 }}>{t.rotulo}</Box><Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, fontWeight: 400, opacity: 0.8 }}>{t.legenda}</Box></Box>
                  </Button>
                ))}
              </Box>
            </Stack>
          </Secao>

          <Secao id="m-pecas" icone={<Checkroom />} titulo="2 · Peças" extra={<Typography variant="caption">{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}</Typography>}>
            <Stack sx={{ gap: 1.5 }}>
              <TextField value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, referência ou categoria…" aria-label="Buscar peça"
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
              <Typography variant="caption" color="text.secondary">Toque no tamanho para pôr na seleção. Passe o mouse no tamanho para ver o estoque.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 1 }}>
                {resultados.map(p => {
                  const qtd = naSelecao(p.id);
                  return (
                    <Card key={p.id} sx={{ p: 1.25, display: 'flex', gap: 1.5, borderColor: qtd ? 'success.light' : 'divider' }}>
                      <Badge badgeContent={qtd} color="success" invisible={!qtd}><Foto src={p.imagem} alt={p.nome} largura={64} /></Badge>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{p.nome}</Typography>
                        <Typography variant="caption" color="text.secondary">Ref. {p.referencia} · <Box component="strong" sx={{ color: 'text.primary' }}>{brl(p.preco)}</Box></Typography>
                        <Stack direction="row" sx={{ mt: 0.75, gap: 0.5, flexWrap: 'wrap' }}>
                          {p.variantes.map(v => (
                            <Badge key={v.id} variant="dot" color="secondary" invisible={v.disponivel !== 1}>
                              <Button size="small" variant={linhas.some(l => l.variante.id === v.id) ? 'contained' : 'outlined'} onClick={() => adicionar(p, v)}
                                title={`Cód. ${v.codigoInterno ?? '—'} · ${v.disponivel} em estoque`} aria-label={`Adicionar ${p.nome} tamanho ${v.tamanho}`} sx={{ minWidth: 40, px: 1, fontWeight: 700 }}>{v.tamanho}</Button>
                            </Badge>
                          ))}
                        </Stack>
                      </Box>
                    </Card>
                  );
                })}
                {!resultados.length && <Typography variant="body2" color="text.secondary">Nenhuma peça encontrada.</Typography>}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main' }} />última unidade do tamanho</Typography>
            </Stack>
          </Secao>
        </Stack>

        <Secao id="m-enviar" icone={<ShoppingBag />} titulo={`3 · ${tipo === 'balcao' ? 'Registrar' : 'Revisar e enviar'}`} sx={{ position: { lg: 'sticky' }, top: { lg: 80 } }}
          extra={<Typography variant="caption">{pecas ? `${pecas} ${pecas === 1 ? 'peça' : 'peças'}` : 'Vazia'}</Typography>}>
          <Stack sx={{ gap: 1.5 }}>
            {linhas.length === 0 ? (
              <Box sx={{ border: 1, borderStyle: 'dashed', borderColor: 'marca.borda-forte', borderRadius: 3, py: 3, textAlign: 'center', color: 'text.secondary' }}>
                <ShoppingBag sx={{ opacity: 0.5 }} /><Typography variant="body2">Toque no tamanho de uma peça para adicionar.</Typography>
              </Box>
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ maxHeight: '45vh', overflowY: 'auto' }}>
                {linhas.map(l => (
                  <Stack key={l.variante.id} direction="row" sx={{ py: 1, gap: 1.25, alignItems: 'center' }}>
                    <Foto src={l.produto.imagem} largura={40} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{l.produto.nome}</Typography>
                      <Typography variant="caption" color="text.secondary">Tam. {l.variante.tamanho}{l.variante.codigoInterno ? ` · Cód. ${l.variante.codigoInterno}` : ''} · {brl(l.produto.preco * l.quantidade)}</Typography>
                    </Box>
                    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 99 }}>
                      <IconButton size="small" onClick={() => alterar(l.variante.id, -1)} aria-label="Diminuir">{l.quantidade === 1 ? <DeleteOutlined fontSize="small" color="error" /> : <Remove fontSize="small" />}</IconButton>
                      <Typography variant="body2" sx={{ width: 20, textAlign: 'center', fontWeight: 700 }}>{l.quantidade}</Typography>
                      <IconButton size="small" disabled={l.quantidade >= l.variante.disponivel} onClick={() => alterar(l.variante.id, 1)} aria-label="Aumentar"><Add fontSize="small" /></IconButton>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Total</Typography><Typography sx={{ fontWeight: 800, fontSize: 20 }}>{brl(total)}</Typography>
            </Stack>
            {cupons && (
              <Stack sx={{ gap: 1 }}>
                <TextField value={cupom} onChange={e => { setCupom(e.target.value.toUpperCase()); setErro(null); }} placeholder="Cupom (opcional)" aria-label="Cupom (opcional)"
                  slotProps={{ htmlInput: { maxLength: 30 }, input: { startAdornment: <InputAdornment position="start"><LocalOffer fontSize="small" /></InputAdornment> } }} />
                {cuponsDaCliente.length > 0 && (
                  <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                    {cuponsDaCliente.map(c => <Chip key={c.codigo} size="small" title={c.regra} label={c.codigo} onClick={() => setCupom(cupom === c.codigo ? '' : c.codigo)} color={cupom === c.codigo ? 'primary' : 'default'} variant={cupom === c.codigo ? 'filled' : 'outlined'} />)}
                  </Stack>
                )}
                {cupom && <Typography variant="caption" color="text.secondary">{cuponsDaCliente.find(c => c.codigo === cupom)?.regra ?? 'O cupom é conferido ao salvar.'}</Typography>}
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.5 }}>
              <InfoOutlined sx={{ fontSize: 14, mt: '2px' }} />
              {tipo === 'condicional' ? 'As peças ficam reservadas até você fechar o condicional.' : tipo === 'balcao' ? 'Entra confirmada: as peças saem do estoque e o valor conta na meta.' : 'Vai pelo WhatsApp com uma imagem da seleção. Reserva só na confirmação.'}
            </Typography>
            {erro && <Alert severity="error">{erro}</Alert>}
            {tipo === 'balcao' ? (
              <Button variant="contained" color="success" size="large" startIcon={<Check />} disabled={!!etapa} onClick={() => salvar(false)}>{etapa ?? `Registrar venda · ${brl(total)}`}</Button>
            ) : (
              <Stack direction="row" sx={{ gap: 1 }}>
                <Button variant="contained" color="whatsapp" startIcon={<WhatsApp />} disabled={!!etapa} onClick={() => salvar(true)} sx={{ flex: 1 }}>{etapa ?? 'Salvar e enviar ao cliente'}</Button>
                <Button variant="outlined" disabled={!!etapa} onClick={() => salvar(false)}>Só salvar</Button>
              </Stack>
            )}
            {cliente && <Stack direction="row" sx={{ gap: 1, alignItems: 'center', color: 'text.secondary' }}><Avatar sx={{ width: 24, height: 24, fontSize: 12, bgcolor: 'primary.main' }}>{cliente.nome[0]}</Avatar><Typography variant="caption">{cliente.nome} · {cliente.telefone}</Typography></Stack>}
          </Stack>
        </Secao>
      </Box>
    </PainelLayout>
  );
}
