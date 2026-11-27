import { useEffect, useRef, useState } from 'react';
import { Head, usePage } from '@inertiajs/react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Add, Check, DeleteOutlined, Remove, ShoppingBagOutlined, WhatsApp } from '@mui/icons-material';
import LojaLayout from '@/Layouts/LojaLayout';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { PreviaWhatsApp } from '@/Components/loja/PreviaWhatsApp';
import { estiloTitulo, FotoCheia } from '@/Components/loja/Vitrine';
import { brl } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { compartilharImagem, gerarImagemPedido } from '@/lib/imagem-pedido';
import { nomeDaLoja } from '@/lib/loja';
import { montarMensagemPedido, totaisDaMensagem } from '@/lib/mensagem-pedido';
import { maximoDo, useSacola, type Conferencia } from '@/lib/sacola';
import { formatarCep } from '@/lib/telefone';
import { linkWhatsApp, type ItemMensagem } from '@/lib/whatsapp';

type Props = {
  frete: { valor: number; gratisAcima: number } | null;
  cepsCondicional: string[];
  cepInicial: string | null;
  cuponsLigados: boolean;
  ofertasCupom: { codigo: string; regra: string; primeiraCompra: boolean }[];
  destino: { nome: string | null } | null;
};
type Previa = { ok: true; codigo: string; desconto: number; freteGratis: boolean; regra: string } | { ok: false; erro: string };
type Resposta = {
  ok: true; codigo: string; tipo: 'compra' | 'condicional'; telefone: string; destinatario: string; nomeVendedor: string | null; itens: ItemMensagem[]; nomeCliente: string;
  cep: string | null; cupom: { codigo: string; desconto: number; freteGratis: boolean } | null; frete: number | null; site: string; linkPedido: string; linkPublico: string; linkPagamento: string | null;
} | { ok: false; erro: string; cepFora?: boolean };
type Enviado = Extract<Resposta, { ok: true }> & { url: string; texto: string; total: number };

const CHAVE_CUPOM = 'dcerutti:cupom';
const lerCupom = () => { try { return localStorage.getItem(CHAVE_CUPOM) ?? ''; } catch { return ''; } };
const guardarCupom = (c: string) => { try { if (c) localStorage.setItem(CHAVE_CUPOM, c); else localStorage.removeItem(CHAVE_CUPOM); } catch { /* só não lembra */ } };

/** Sacola (porta de src/components/loja/sacola-pagina.tsx): confere preço e estoque, cupom, pedido ou condicional e WhatsApp. */
export default function Sacola({ frete, cepsCondicional, cepInicial, cuponsLigados, ofertasCupom, destino }: Props) {
  const { usuario, loja } = usePage().props;
  const s = useSacola();
  const cidadeCondicional = loja?.cidadeCondicional ?? '';
  const cliente = usuario?.papel === 'cliente';
  const usaCupom = cuponsLigados && cliente;
  const [codigoCupom, setCodigoCupom] = useState('');
  const [previa, setPrevia] = useState<{ chave: string; r: Previa } | null>(null);
  const [modo, setModo] = useState<'compra' | 'condicional'>('compra');
  const [cep, setCep] = useState(cepInicial ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [foraDaArea, setForaDaArea] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [abriu, setAbriu] = useState(true);
  const [imagem, setImagem] = useState<Blob | null>(null);
  const [imagemEnviada, setImagemEnviada] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [indisponiveis, setIndisponiveis] = useState<Set<number>>(new Set());
  const [avisoConferencia, setAvisoConferencia] = useState<string | null>(null);
  const [conferencias, setConferencias] = useState(0);
  const conferidoEm = useRef(-1);

  // Link de campanha (/sacola?cupom=CODIGO) ou o cupom guardado da última visita.
  useEffect(() => {
    const daUrl = new URLSearchParams(location.search).get('cupom')?.trim().toUpperCase();
    if (daUrl) { guardarCupom(daUrl); history.replaceState(null, '', location.pathname); }
    setCodigoCupom(daUrl ?? lerCupom());
  }, []);

  // Q-02/B-06: ao abrir (e depois de um envio recusado), confere preço e estoque com o catálogo atual.
  useEffect(() => {
    if (!s.pronta || !s.itens.length || conferidoEm.current === conferencias) return;
    conferidoEm.current = conferencias;
    const itens = s.itens;
    postJson<Conferencia>('/sacola/conferir', { ids: itens.map(i => i.varianteId) }).then(c => {
      setIndisponiveis(new Set(itens.filter(i => !c[i.varianteId] || c[i.varianteId]!.disponivel <= 0).map(i => i.varianteId)));
      const { precos, ajustados } = s.conferir(c);
      const partes = [precos.length ? `O preço mudou: ${precos.join(', ')}.` : '', ajustados.length ? `Quantidade ajustada ao estoque: ${ajustados.join(', ')}.` : ''].filter(Boolean);
      setAvisoConferencia(partes.length ? partes.join(' ') : null);
    }).catch(() => {});
  }, [s.pronta, s.itens, conferencias]); // eslint-disable-line react-hooks/exhaustive-deps

  // A prévia do cupom vale para esta combinação de cupom, tipo e peças; mudou, é refeita.
  const chaveCupom = usaCupom && s.pronta && codigoCupom && s.itens.length ? JSON.stringify([codigoCupom, modo, s.itens.map(i => [i.varianteId, i.quantidade])]) : '';
  useEffect(() => {
    if (!chaveCupom) return;
    let atual = true;
    const t = setTimeout(() => {
      postJson<Previa>('/sacola/cupom', { codigo: codigoCupom, tipo: modo, linhas: s.itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })) })
        .then(r => { if (atual) setPrevia({ chave: chaveCupom, r }); }).catch(() => {});
    }, 300);
    return () => { atual = false; clearTimeout(t); };
  }, [chaveCupom]); // eslint-disable-line react-hooks/exhaustive-deps
  const cupom = chaveCupom && previa?.chave === chaveCupom ? previa.r : null;
  const conferindoCupom = !!chaveCupom && previa?.chave !== chaveCupom;

  if (enviado) return <LojaLayout><Head title="Pedido registrado" /><Concluido e={enviado} abriu={abriu} imagem={imagem} gerando={gerando} imagemEnviada={imagemEnviada} aoCompartilhar={async () => { if (imagem && (await compartilharImagem(imagem, enviado.codigo))) setImagemEnviada(true); }} /></LojaLayout>;

  const equipe = !!usuario && !cliente;
  const temGratis = !!frete && frete.gratisAcima > 0;
  const semFrete = temGratis && s.subtotal >= frete!.gratisAcima;
  const cupomOk = cupom?.ok ? cupom : null;
  const descontoCupom = cupomOk?.desconto ?? 0;
  const freteGratisCupom = !!cupomOk?.freteGratis;
  const valorFrete = frete && !freteGratisCupom ? (semFrete ? 0 : frete.valor) : 0;
  const falta = temGratis ? Math.max(0, frete!.gratisAcima - s.subtotal) : 0;
  const nomeDestino = destino?.nome ? destino.nome.trim().split(/\s+/)[0] : 'a loja';
  const aplicarCupom = (codigo: string) => { const c = codigo.trim().toUpperCase(); guardarCupom(c); setCodigoCupom(c); };
  const origem = typeof window === 'undefined' ? '' : location.origin;
  const mensagem = cliente && s.pronta ? montarMensagemPedido({
    tipo: modo, codigo: modo === 'condicional' ? 'COND-······' : 'PED-······',
    itens: s.itens.map(i => ({ nome: i.nome, marca: i.marca, referencia: i.referencia, tamanho: i.tamanho, cor: i.cor, codigoInterno: i.codigoInterno, quantidade: i.quantidade, preco: i.preco, imagem: i.imagem })),
    nomeCliente: usuario!.nome, nomeVendedor: destino?.nome ?? null, cep: formatarCep(cep) || null, cidadeCondicional,
    frete: modo === 'compra' && frete ? (freteGratisCupom || semFrete ? 0 : frete.valor) : null,
    cupom: cupomOk ? { codigo: cupomOk.codigo, desconto: cupomOk.desconto, freteGratis: cupomOk.freteGratis } : null,
    site: origem, linkPedido: `${origem}/painel/pedidos/…`, linkPublico: `${origem}/p/${modo === 'condicional' ? 'COND' : 'PED'}-......`,
  }).texto : '';
  const cartao = cliente ? {
    fotos: s.itens.slice(0, 4).map(i => i.imagem), extras: Math.max(0, s.itens.length - 4), codigo: modo === 'condicional' ? 'CONDICIONAL' : 'PEDIDO',
    resumo: `${s.quantidade} ${s.quantidade === 1 ? 'peça' : 'peças'} · ${brl(modo === 'condicional' ? s.subtotal - descontoCupom : s.subtotal - descontoCupom + valorFrete)}`,
    titulo: `${modo === 'condicional' ? 'Condicional' : 'Pedido'} · ${nomeDaLoja()}`, dominio: typeof window === 'undefined' ? '' : location.host,
  } : undefined;

  const enviar = async () => {
    setErro(null);
    if (modo === 'condicional') {
      const c = formatarCep(cep);
      if (c.length !== 9) return setErro('Digite um CEP válido com 8 números.');
      if (!cepsCondicional.includes(c)) return setForaDaArea(true);
    }
    // Abre a aba já no clique (senão o navegador bloqueia) e aponta para o WhatsApp quando o pedido estiver gravado.
    const aba = window.open('', '_blank');
    setPendente(true);
    const r = await postJson<Resposta>('/sacola/enviar', { tipo: modo, linhas: s.itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })), cep, cupom: cupomOk?.codigo });
    setPendente(false);
    if (!r.ok) {
      aba?.close();
      if (r.cepFora) setForaDaArea(true); else setErro(r.erro);
      setConferencias(n => n + 1); // o estoque pode ter mudado: confere de novo
      return;
    }
    const dados = { tipo: r.tipo, codigo: r.codigo, itens: r.itens, nomeCliente: r.nomeCliente, nomeVendedor: r.nomeVendedor, cep: r.cep, cidadeCondicional, frete: r.frete, site: r.site, cupom: r.cupom, linkPedido: r.linkPedido, linkPublico: r.linkPublico };
    const { texto } = montarMensagemPedido(dados);
    const { total } = totaisDaMensagem(dados);
    const url = linkWhatsApp(r.telefone, texto);
    let abriuAba = false;
    if (aba) try { aba.location.href = url; abriuAba = true; } catch { aba.close(); }
    setAbriu(abriuAba);
    setEnviado({ ...r, url, texto, total });
    s.limpar();
    guardarCupom('');
    setGerando(true);
    gerarImagemPedido({
      selo: r.tipo === 'condicional' ? 'CONDICIONAL' : 'PEDIDO', codigo: r.codigo, titulo: r.tipo === 'condicional' ? 'Peças para provar em casa' : 'Meu pedido',
      subtitulo: `Cliente: ${r.nomeCliente}${r.cep ? `   ·   CEP ${r.cep} · ${cidadeCondicional}` : ''}`,
      rodape: r.tipo === 'condicional' ? 'PAGUE SÓ O QUE FICAR' : 'PAGAMENTO E ENTREGA A COMBINAR', itens: r.itens,
    }).then(setImagem).catch(() => {}).finally(() => setGerando(false));
  };

  return (
    <LojaLayout>
      <Head title="Sacola" />
      <Box sx={{ pt: { xs: 2, sm: 4 } }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography component="h1" sx={{ ...estiloTitulo, fontSize: { xs: '2.25rem', sm: '3rem' }, lineHeight: 1 }}>Sua sacola</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>{!s.pronta ? ' ' : s.quantidade === 0 ? 'Vazia' : `${s.quantidade} ${s.quantidade === 1 ? 'peça' : 'peças'}`}</Typography>
          </Box>
          {s.itens.length > 0 && (
            <Stack component="ol" direction="row" spacing={1} aria-label="Etapas" sx={{ m: 0, p: 0, listStyle: 'none', alignItems: 'center', fontSize: { xs: 12, sm: 14 }, fontWeight: 500 }}>
              {['Sacola', 'Enviar no WhatsApp', 'Combinar a entrega'].map((t, i) => (
                <Stack component="li" key={t} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {i > 0 && <Box sx={{ width: { xs: 16, sm: 32 }, height: '1px', bgcolor: 'marca.borda-forte' }} />}
                  <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: '50%', fontSize: '0.7rem', fontWeight: 700, bgcolor: i === 0 ? 'marca.marrom-950' : 'marca.creme', color: i === 0 ? 'marca.creme' : 'text.secondary' }}>{i + 1}</Box>
                  <Box component="span" sx={{ color: i === 0 ? 'marca.marrom-950' : 'text.secondary', display: i === 0 ? 'inline' : { xs: 'none', sm: 'inline' } }}>{t}</Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>

        {!s.pronta ? <Typography sx={{ py: 12, textAlign: 'center', color: 'text.secondary' }}>Carregando sacola…</Typography> : (
          <Box sx={{ mt: 4, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 420px' }, gap: { xs: 4, lg: 6 } }}>
            <Box component="section">
              {avisoConferencia && <Alert severity="warning" sx={{ mb: 2 }}>{avisoConferencia}</Alert>}
              {indisponiveis.size > 0 && (
                <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => { indisponiveis.forEach(id => s.remover(id)); setIndisponiveis(new Set()); }}>Remover da sacola</Button>}>
                  {indisponiveis.size === 1 ? 'Uma peça da sacola não está mais disponível.' : `${indisponiveis.size} peças da sacola não estão mais disponíveis.`}
                </Alert>
              )}
              {s.itens.length === 0 ? (
                <Stack spacing={2} sx={{ borderRadius: 8, bgcolor: 'marca.creme', p: { xs: 5, sm: 8 }, textAlign: 'center', alignItems: 'center' }}>
                  <Box sx={{ width: 64, height: 64, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'background.paper' }}><ShoppingBagOutlined sx={{ fontSize: 28 }} /></Box>
                  <Typography component="h2" sx={{ ...estiloTitulo, fontSize: 30 }}>Nada por aqui ainda</Typography>
                  <Typography color="text.secondary" sx={{ maxWidth: 380 }}>Sua sacola está vazia. Escolha suas peças no catálogo. Quando terminar, é só enviar pelo WhatsApp.</Typography>
                  <Button href="/catalogo" variant="contained" size="large" sx={{ mt: 1, px: 5, borderRadius: 99 }}>Ver o catálogo</Button>
                </Stack>
              ) : (
                <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                  {s.itens.map(i => {
                    const fora = indisponiveis.has(i.varianteId);
                    return (
                      <Box component="li" key={i.varianteId} sx={{ borderRadius: 6, border: 1, borderColor: 'divider', bgcolor: 'background.paper', p: { xs: 1.5, sm: 2 }, display: 'grid', gridTemplateColumns: { xs: '88px 1fr', sm: '104px 1fr' }, gap: 2, opacity: fora ? 0.6 : 1 }}>
                        <LinkSimples href={`/produto/${i.referencia}`} sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 4, overflow: 'hidden', bgcolor: 'marca.bege' }}><FotoCheia src={i.imagem} alt={i.nome} /></LinkSimples>
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{i.marca}</Typography>
                              <LinkSimples href={`/produto/${i.referencia}`} sx={{ display: 'block', color: 'marca.marrom-950', fontWeight: 500, lineHeight: 1.35 }}>{i.nome}</LinkSimples>
                            </Box>
                            <IconButton onClick={() => { s.remover(i.varianteId); setIndisponiveis(x => { const n = new Set(x); n.delete(i.varianteId); return n; }); }} aria-label="Remover" title="Remover da sacola" sx={{ mt: -0.5, mr: -0.5 }}><DeleteOutlined /></IconButton>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''}{i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''}</Typography>
                          {fora && <Typography variant="body2" sx={{ fontWeight: 500, color: 'error.main' }}>Indisponível agora</Typography>}
                          <Stack direction="row" sx={{ mt: 1.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
                            <Stack direction="row" aria-label="Quantidade" sx={{ alignItems: 'center', height: 40, borderRadius: 99, border: 1, borderColor: 'marca.borda-forte' }}>
                              <IconButton onClick={() => s.alterar(i.varianteId, -1)} aria-label="Diminuir"><Remove fontSize="small" /></IconButton>
                              <Box sx={{ width: 28, textAlign: 'center', fontWeight: 700 }}>{i.quantidade}</Box>
                              <IconButton onClick={() => s.alterar(i.varianteId, 1)} disabled={i.quantidade >= maximoDo(i)} aria-label="Aumentar" title={i.quantidade >= maximoDo(i) ? 'Máximo disponível' : undefined}><Add fontSize="small" /></IconButton>
                            </Stack>
                            <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{brl(i.preco * i.quantidade)}</Typography>
                          </Stack>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              )}
              {s.itens.length > 0 && <Button href="/catalogo" sx={{ mt: 3, textDecoration: 'underline' }}>← Continuar comprando</Button>}
            </Box>

            {s.itens.length > 0 && (
              <Stack component="aside" spacing={2.5} sx={{ minWidth: 0, position: { lg: 'sticky' }, top: 140, alignSelf: 'start', borderRadius: 8, bgcolor: 'marca.creme', p: { xs: 2.5, sm: 3.5 } }}>
                {equipe && <Alert severity="warning">Você está logado como {usuario!.papel}. Para montar um pedido para um cliente, use <LinkSimples href="/painel/pedidos/novo" sx={{ textDecoration: 'underline' }}>Painel → Novo pedido</LinkSimples>.</Alert>}
                {!usuario && <Alert severity="info">Para enviar o pedido, <LinkSimples href="/entrar?volta=%2Fsacola" sx={{ textDecoration: 'underline', fontWeight: 600 }}>entre na sua conta</LinkSimples>.</Alert>}
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'marca.marrom-950', mb: 1 }}>Como você quer receber?</Typography>
                  <ToggleButtonGroup exclusive fullWidth value={modo} onChange={(_, v) => { if (v) { setModo(v); setErro(null); } }} sx={{ bgcolor: 'background.paper', borderRadius: 99, p: 0.5, '& .MuiToggleButton-root': { border: 0, borderRadius: '99px !important', height: 44, fontWeight: 600, textTransform: 'none' }, '& .Mui-selected': { bgcolor: 'marca.marrom-950 !important', color: 'marca.creme !important' } }}>
                    <ToggleButton value="compra">Pedido</ToggleButton>
                    <ToggleButton value="condicional">Condicional</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{modo === 'compra' ? 'Você compra as peças e combina pagamento e entrega.' : `Receba em casa em ${cidadeCondicional}, prove e pague só o que ficar.`}</Typography>
                </Box>

                {modo === 'compra' ? (
                  <Stack spacing={1.25} sx={{ fontSize: 14 }}>
                    <Linha rotulo="Peças" valor={brl(s.subtotal)} />
                    {cupomOk && !freteGratisCupom && <Linha rotulo={`Cupom ${cupomOk.codigo}`} valor={`−${brl(descontoCupom)}`} cor="success.main" />}
                    <Linha rotulo="Frete" valor={freteGratisCupom ? `Grátis (cupom ${cupomOk!.codigo})` : frete ? (semFrete ? 'Grátis' : brl(frete.valor)) : 'A combinar'} cor={freteGratisCupom || semFrete ? 'success.main' : undefined} />
                    {temGratis && (
                      <Box sx={{ borderRadius: 4, bgcolor: 'background.paper', p: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 500, color: semFrete ? 'success.main' : 'marca.marrom-900' }}>{semFrete ? '🎉 Você ganhou frete grátis.' : `Faltam ${brl(falta)} para o frete grátis.`}</Typography>
                        <LinearProgress variant="determinate" color="success" value={Math.min(100, (s.subtotal / frete!.gratisAcima) * 100)} sx={{ mt: 1, height: 6, borderRadius: 99, bgcolor: 'marca.bege' }} />
                      </Box>
                    )}
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', borderTop: 1, borderColor: 'marca.borda-forte', pt: 2 }}>
                      <strong>Total</strong>
                      <Typography sx={{ fontSize: 24, fontWeight: 800 }}>{brl(s.subtotal - descontoCupom + valorFrete)}{!frete && !freteGratisCupom && <Box component="span" sx={{ fontSize: 14, fontWeight: 400 }}> + frete</Box>}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Pagamento e entrega você combina com seu vendedor pelo WhatsApp.</Typography>
                  </Stack>
                ) : (
                  <Stack spacing={1.5} sx={{ fontSize: 14 }}>
                    <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      {['Envie pelo WhatsApp', 'Receba em casa', 'Prove com calma', 'Pague só o que ficar'].map((t, i) => (
                        <Stack component="li" key={t} direction="row" spacing={1.25} sx={{ borderRadius: 4, bgcolor: 'background.paper', p: 1.5, alignItems: 'center' }}>
                          <Box sx={{ width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'marca.marrom-950', color: 'marca.creme', fontSize: '0.7rem', fontWeight: 700 }}>{i + 1}</Box>
                          <Box component="span" sx={{ lineHeight: 1.2 }}>{t}</Box>
                        </Stack>
                      ))}
                    </Box>
                    {cupomOk && descontoCupom > 0 && <Linha rotulo={`Cupom ${cupomOk.codigo} (sobre o que ficar)`} valor={`−${brl(descontoCupom)}`} cor="success.main" />}
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', borderTop: 1, borderColor: 'marca.borda-forte', pt: 2 }}>
                      <strong>Valor das peças</strong><Typography sx={{ fontSize: 24, fontWeight: 800 }}>{brl(s.subtotal - descontoCupom)}</Typography>
                    </Stack>
                    <TextField label="CEP de entrega" value={cep} onChange={e => { setCep(formatarCep(e.target.value)); setErro(null); }} placeholder="89874-000" slotProps={{ htmlInput: { inputMode: 'numeric' } }} helperText={`Condicional disponível em ${cidadeCondicional}.`} sx={{ bgcolor: 'background.paper' }} />
                  </Stack>
                )}

                {usaCupom && <CampoCupom codigo={codigoCupom} previa={cupom} conferindo={conferindoCupom} aplicar={aplicarCupom} ofertas={ofertasCupom} remover={() => { guardarCupom(''); setCodigoCupom(''); }} />}
                {erro && <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>{erro}</Alert>}

                <Button onClick={enviar} disabled={pendente || !cliente || indisponiveis.size > 0} variant="contained" color="whatsapp" size="large" startIcon={<WhatsApp />} loading={pendente} loadingPosition="start" sx={{ height: 56, borderRadius: 99, fontSize: 16 }}>
                  {pendente ? 'Registrando pedido…' : modo === 'condicional' ? 'Enviar condicional no WhatsApp' : 'Enviar pedido no WhatsApp'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.6 }}>
                  {destino?.nome ? <>Vai direto para <strong>{nomeDestino}</strong>, que atende você.</> : 'Vai direto para o WhatsApp da loja.'} O pedido fica registrado e a conversa abre pronta: é só tocar em enviar.
                </Typography>
                {cliente && (
                  <Accordion disableGutters elevation={0} sx={{ borderRadius: '16px !important', overflow: 'hidden', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<Add />}><Stack direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 14 }}><WhatsApp sx={{ fontSize: 18, color: 'whatsapp.main' }} /><span>Ver a mensagem para {nomeDestino}</span></Stack></AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                      <PreviaWhatsApp texto={mensagem} cartao={cartao} para={destino?.nome ? destino.nome : nomeDaLoja()} hora={new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
                    </AccordionDetails>
                  </Accordion>
                )}
              </Stack>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={foraDaArea} onClose={() => setForaDaArea(false)} slotProps={{ paper: { sx: { borderRadius: 6, maxWidth: 380 } } }}>
        <DialogTitle sx={estiloTitulo}>Ainda não chegamos aí</DialogTitle>
        <DialogContent><Typography color="text.secondary">O condicional atende somente {cidadeCondicional}. Você pode enviar como pedido normal e combinar a entrega com seu vendedor.</Typography></DialogContent>
        <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 3, pb: 3, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          <Button fullWidth variant="contained" onClick={() => { setForaDaArea(false); setModo('compra'); }} sx={{ borderRadius: 99 }}>Enviar como pedido</Button>
          <Button fullWidth onClick={() => setForaDaArea(false)}>Voltar</Button>
        </DialogActions>
      </Dialog>
    </LojaLayout>
  );
}

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', color: cor, fontWeight: cor ? 600 : 400 }}><Box component="span" sx={{ color: cor ?? 'text.secondary' }}>{rotulo}</Box><span>{valor}</span></Stack>;
}

/** "Tem um cupom?": aplicado, mostra o código e a regra; recusado, o motivo (o pedido segue sem o cupom). */
function CampoCupom({ codigo, previa, conferindo, aplicar, remover, ofertas }: { codigo: string; previa: Previa | null; conferindo: boolean; aplicar: (c: string) => void; remover: () => void; ofertas: Props['ofertasCupom'] }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  if (codigo)
    return (
      <Box sx={{ borderRadius: 4, border: 1, borderColor: previa?.ok ? 'success.main' : 'divider', bgcolor: 'background.paper', p: 1.75, fontSize: 14 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cupom <strong>{codigo}</strong>{conferindo && <Box component="span" sx={{ color: 'text.secondary' }}> · conferindo…</Box>}</span>
          <Button size="small" onClick={() => { remover(); setTexto(''); }} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Remover</Button>
        </Stack>
        {previa?.ok && <Typography variant="body2" color="success.main">{previa.regra}</Typography>}
        {previa && !previa.ok && <Typography variant="body2" color="error.main">Não aplicado: {previa.erro}</Typography>}
      </Box>
    );
  const primeira = ofertas.find(o => o.primeiraCompra);
  const outras = ofertas.filter(o => o !== primeira);
  return (
    <Stack spacing={1.5}>
      {primeira && (
        <Box sx={{ borderRadius: 4, border: 1, borderColor: 'success.main', bgcolor: 'rgba(94,107,67,.05)', p: 1.75, fontSize: 14 }}>
          <span><strong>Desconto na sua primeira compra</strong> <Box component="span" sx={{ color: 'text.secondary' }}>· {primeira.regra}</Box></span>
          <Box><Button size="small" variant="contained" color="success" onClick={() => aplicar(primeira.codigo)} sx={{ mt: 1, borderRadius: 99 }}>Usar cupom {primeira.codigo}</Button></Box>
        </Box>
      )}
      {outras.length > 0 && (
        <Stack spacing={0.75}>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary' }}>Seus cupons</Typography>
          {outras.map(o => <Button key={o.codigo} onClick={() => aplicar(o.codigo)} variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 4, bgcolor: 'background.paper', borderColor: 'divider' }}><strong>{o.codigo}</strong>&nbsp;<Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· {o.regra}</Box></Button>)}
        </Stack>
      )}
      {aberto ? (
        <Stack component="form" direction="row" spacing={1} onSubmit={e => { e.preventDefault(); if (texto.trim()) aplicar(texto); }}>
          <TextField size="small" value={texto} onChange={e => setTexto(e.target.value.toUpperCase())} placeholder="Código do cupom" autoFocus slotProps={{ htmlInput: { maxLength: 30, 'aria-label': 'Código do cupom' } }} sx={{ flex: 1, bgcolor: 'background.paper' }} />
          <Button type="submit" variant="outlined">Aplicar</Button>
        </Stack>
      ) : <Button onClick={() => setAberto(true)} sx={{ alignSelf: 'flex-start', textDecoration: 'underline' }}>{ofertas.length ? 'Tem outro cupom?' : 'Tem um cupom?'}</Button>}
    </Stack>
  );
}

function Concluido({ e, abriu, imagem, gerando, imagemEnviada, aoCompartilhar }: { e: Enviado; abriu: boolean; imagem: Blob | null; gerando: boolean; imagemEnviada: boolean; aoCompartilhar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const condicional = e.tipo === 'condicional';
  const pecas = e.itens.reduce((a, i) => a + i.quantidade, 0);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(e.texto); } catch {
      const t = document.createElement('textarea');
      t.value = e.texto; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
  const passos = [
    { t: `Toque em enviar na conversa com ${e.destinatario}`, d: 'A mensagem já está escrita, com as peças, os tamanhos e os valores.' },
    { t: condicional ? 'Combine o dia da entrega' : 'Confirme as peças com quem atende você', d: condicional ? 'As peças ficam reservadas para você.' : 'Elas ficam separadas enquanto vocês conversam.' },
    { t: condicional ? 'Prove em casa e pague só o que ficar' : 'Combine o pagamento e a entrega', d: 'Tudo pelo WhatsApp, com atendimento de pessoa para pessoa.' },
  ];
  return (
    <Stack spacing={4} sx={{ py: { xs: 5, sm: 8 }, maxWidth: 672, mx: 'auto' }}>
      <Stack spacing={1.5} sx={{ textAlign: 'center', alignItems: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'whatsapp.main', color: '#fff', display: 'grid', placeItems: 'center' }}><Check sx={{ fontSize: 34 }} /></Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'whatsapp.main' }}>{condicional ? 'Condicional registrado' : 'Pedido registrado'}</Typography>
        <Typography component="h1" sx={{ ...estiloTitulo, fontSize: { xs: '1.875rem', sm: '2.25rem' } }}>{abriu ? 'Agora é só tocar em enviar no WhatsApp' : 'Falta abrir o WhatsApp'}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 440 }}>{abriu ? `A conversa com ${e.destinatario} abriu em outra aba com o ${condicional ? 'condicional' : 'pedido'} completo.` : 'O navegador não deixou abrir o WhatsApp sozinho. Toque no botão abaixo: a mensagem já está pronta.'}</Typography>
      </Stack>
      <Stack spacing={1.5}>
        <Button component="a" href={e.url} target="_blank" rel="noopener" variant="contained" color="whatsapp" size="large" startIcon={<WhatsApp />} sx={{ height: 56, borderRadius: 99 }}>{abriu ? 'Abrir o WhatsApp de novo' : `Abrir o WhatsApp de ${e.destinatario}`}</Button>
        {e.linkPagamento && <Button component="a" href={e.linkPagamento} variant="contained" size="large" sx={{ height: 56, borderRadius: 99 }}>Pagar agora com Pix ou cartão · {brl(e.total)}</Button>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <Button variant="outlined" onClick={copiar} sx={{ borderRadius: 99 }}>{copiado ? 'Mensagem copiada ✓' : 'Copiar mensagem'}</Button>
          {imagem && !imagemEnviada ? <Button variant="outlined" onClick={aoCompartilhar} sx={{ borderRadius: 99 }}>Enviar a imagem</Button>
            : <Button disabled sx={{ borderRadius: 99 }}>{gerando ? 'Preparando imagem…' : imagemEnviada ? 'Imagem enviada ✓' : 'Imagem indisponível'}</Button>}
        </Box>
      </Stack>
      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 6, overflow: 'hidden' }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', justifyContent: 'space-between', gap: 1, px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography data-testid="codigo-pedido" sx={{ fontWeight: 800, letterSpacing: '0.04em' }}>{e.codigo}</Typography>
          <Typography variant="body2" color="text.secondary">{pecas} {pecas === 1 ? 'peça' : 'peças'} · para {e.destinatario}</Typography>
        </Stack>
        {e.itens.map((i, n) => (
          <Stack key={n} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ position: 'relative', width: 48, aspectRatio: '3 / 4', borderRadius: 2, overflow: 'hidden', bgcolor: 'marca.bege', flexShrink: 0 }}><FotoCheia src={i.imagem} /></Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 14, color: 'marca.marrom-950' }}>{i.nome}</Typography>
              <Typography variant="caption" color="text.secondary">Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''} · {i.quantidade} × {brl(i.preco)}</Typography>
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{brl(i.preco * i.quantidade)}</Typography>
          </Stack>
        ))}
        <Stack spacing={0.5} sx={{ px: 2.5, py: 2, fontSize: 14 }}>
          {e.cupom && !e.cupom.freteGratis && e.cupom.desconto > 0 && <Linha rotulo={`Cupom ${e.cupom.codigo}`} valor={`−${brl(e.cupom.desconto)}`} cor="success.main" />}
          {!condicional && <Linha rotulo="Frete" valor={e.frete == null ? 'A combinar' : e.frete === 0 ? 'Grátis' : brl(e.frete)} />}
          <Stack direction="row" sx={{ justifyContent: 'space-between', fontWeight: 800, fontSize: 18, pt: 0.5 }}>
            <span>{condicional ? 'Valor das peças' : 'Total'}</span>
            <span>{brl(e.total)}{!condicional && e.frete == null && <Box component="span" sx={{ fontSize: 14, fontWeight: 400 }}> + frete</Box>}</span>
          </Stack>
        </Stack>
      </Box>
      <Stack component="ol" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {passos.map((p, i) => (
          <Stack component="li" key={p.t} direction="row" spacing={1.5}>
            <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, bgcolor: i === 0 ? 'whatsapp.main' : 'marca.bege', color: i === 0 ? '#fff' : 'secondary.main' }}>{i + 1}</Box>
            <Box><Typography sx={{ fontWeight: 600, color: 'marca.marrom-950' }}>{p.t}</Typography><Typography variant="body2" color="text.secondary">{p.d}</Typography></Box>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={3} sx={{ justifyContent: 'center' }}>
        <Button href="/minha-conta/pedidos" sx={{ textDecoration: 'underline' }}>Meus pedidos</Button>
        <Button href="/catalogo" sx={{ textDecoration: 'underline' }}>Continuar comprando</Button>
      </Stack>
    </Stack>
  );
}
