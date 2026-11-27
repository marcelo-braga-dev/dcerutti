import { useRef, useState, type ReactNode } from 'react';
import { Head, usePage } from '@inertiajs/react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { Add, Check, ChatBubbleOutlined, Close, HomeOutlined, LocalOfferOutlined, LocalShippingOutlined, ShoppingBagOutlined, VerifiedOutlined, WhatsApp } from '@mui/icons-material';
import LojaLayout from '@/Layouts/LojaLayout';
import { BotaoFavorito } from '@/Components/loja/Favoritos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { BolinhaCor, estiloTitulo, FotoCheia, Vitrine, type Cartao } from '@/Components/loja/Vitrine';
import { ESTACOES, GENEROS, type ProdutoCatalogo } from '@/lib/catalogo';
import { nomeDoModelo } from '@/lib/cores';
import { brl, descontoPct } from '@/lib/dinheiro';
import { rastrear } from '@/lib/rastro';
import { sacola } from '@/lib/sacola';
import { linkWhatsApp } from '@/lib/whatsapp';

type Props = { produto: ProdutoCatalogo; atendimento: { nome: string; telefone: string }; combina: Cartao[]; mais: Cartao[] };

/** Página da peça (porta de src/app/(loja)/produto/[referencia]/page.tsx). */
export default function Produto({ produto: p, atendimento, combina, mais }: Props) {
  const { loja } = usePage().props;
  const desconto = descontoPct(p.preco, p.precoCheio);
  const cores = p.cores ?? [];
  const titulo = cores.length > 1 ? nomeDoModelo(p.nome) : p.nome;
  const parcelas = loja?.parcelas ?? 0;
  const frete = loja?.frete;
  const detalhes = ([
    ['Marca', p.marca], ['Categoria', [p.categoria, p.subcategoria].filter(Boolean).join(' · ')], ['Cor', p.corNome ?? p.cor],
    ['Gênero', GENEROS.find(g => g.valor === p.genero)?.rotulo], ['Estação', p.estacao ? ESTACOES.find(e => e.valor === p.estacao)?.rotulo : null],
    ['Composição', p.composicao], ['Referência', p.referencia],
  ] as [string, string | null | undefined][]).filter((d): d is [string, string] => !!d[1]);
  const vermelho = p.imperdivel || desconto > 0;

  return (
    <LojaLayout>
      <Head title={p.nome} />
      <Box sx={{ pt: { xs: 1.5, sm: 3 }, pb: { xs: 16, lg: 5 } }}>
        <Stack component="nav" direction="row" spacing={0.75} aria-label="Caminho" sx={{ fontSize: 14, color: 'text.secondary', mb: { xs: 2, sm: 3 }, flexWrap: 'wrap' }}>
          <LinkSimples href="/">Início</LinkSimples><span aria-hidden>/</span>
          <LinkSimples href={`/catalogo?genero=${p.genero}`} sx={{ textTransform: 'capitalize' }}>{p.genero}</LinkSimples><span aria-hidden>/</span>
          <LinkSimples href={`/catalogo?categoria=${p.categoriaSlug}`}>{p.categoria}</LinkSimples>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1.2fr 1fr' }, gap: { xs: 3, lg: 7, xl: 10 } }}>
          <Galeria imagens={p.imagens} videos={p.videos} nome={p.nome} />
          <Stack spacing={3.5} sx={{ position: { lg: 'sticky' }, top: 140, alignSelf: 'start' }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{p.marca}</Typography>
                {p.imperdivel && <Chip size="small" label="Imperdível" color="imperdivel" sx={{ fontWeight: 700 }} />}
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mt: 1, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h1" sx={{ ...estiloTitulo, fontSize: { xs: '1.875rem', sm: '2.25rem' }, lineHeight: 1.15 }}>{titulo}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{p.corNome ? `${p.corNome} · ` : ''}Ref. {p.referencia}</Typography>
                </Box>
                <BotaoFavorito produtoId={p.id} nome={p.nome} grande />
              </Stack>
            </Box>

            <Box sx={{ borderRadius: 6, bgcolor: 'marca.creme', p: 2.5 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: { xs: '1.875rem', sm: '2.25rem' }, fontWeight: 800, letterSpacing: '-0.02em', color: vermelho ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(p.preco)}</Typography>
                {desconto > 0 && <><Typography component="s" color="text.secondary">{brl(p.precoCheio)}</Typography><Chip size="small" label={`−${desconto}%`} sx={{ fontWeight: 700, bgcolor: p.imperdivel ? 'imperdivel.main' : 'marca.marrom-950', color: p.imperdivel ? '#fff' : 'marca.creme' }} /></>}
              </Stack>
              {parcelas > 1 && <Typography variant="body2" sx={{ mt: 0.75 }}>ou <strong>{parcelas}x de {brl(p.preco / parcelas)}</strong></Typography>}
              {desconto > 0 && <Typography variant="body2" sx={{ mt: 1.5, display: 'flex', gap: 0.75, alignItems: 'center', fontWeight: 600, color: 'success.main' }}><LocalOfferOutlined fontSize="small" />Você economiza {brl(p.precoCheio - p.preco)}</Typography>}
            </Box>

            {cores.length > 1 && (
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'marca.marrom-950', mb: 1.5 }}>Cor <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>· {p.corNome ?? '—'} ({cores.length} cores)</Box></Typography>
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1.25 }}>
                  {cores.map(c => {
                    const atual = c.referencia === p.referencia;
                    return (
                      <LinkSimples key={c.referencia} href={`/produto/${encodeURIComponent(c.referencia)}`} preserveScroll title={c.cor ?? undefined} aria-label={`Cor ${c.cor ?? c.referencia}${c.disponivel ? '' : ' (esgotada)'}`} aria-current={atual ? 'true' : undefined}
                        sx={{ position: 'relative', width: 56, aspectRatio: '3 / 4', borderRadius: 3, bgcolor: 'marca.bege', opacity: c.disponivel ? 1 : 0.4, outline: atual ? '2px solid' : 'none', outlineColor: 'marca.marrom-950', outlineOffset: 2 }}>
                        <Box sx={{ position: 'absolute', inset: 0, borderRadius: 3, overflow: 'hidden' }}><FotoCheia src={c.imagem} /></Box>
                        <Box sx={{ position: 'absolute', bottom: -6, right: -6, p: '2px', bgcolor: 'background.paper', borderRadius: '50%' }}><BolinhaCor c={c} tamanho={14} /></Box>
                      </LinkSimples>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Comprar p={p} atendimento={atendimento} />

            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Vantagem icone={<HomeOutlined />} titulo="Prove em casa">Em {loja?.cidadeCondicional}, pague só o que ficar.</Vantagem>
              <Vantagem icone={<LocalShippingOutlined />} titulo="Entrega">{frete ? (frete.gratisAcima > 0 ? `Frete grátis acima de ${brl(frete.gratisAcima)}.` : `${brl(frete.valor)} por pedido.`) : 'Combinada pelo WhatsApp.'}</Vantagem>
              <Vantagem icone={<ChatBubbleOutlined />} titulo="Atendimento">Seu pedido vai para {atendimento.nome === 'a loja' ? 'a loja' : atendimento.nome.split(' ')[0]}.</Vantagem>
              <Vantagem icone={<VerifiedOutlined />} titulo="Original">{p.marca}, com estoque em Maravilha (SC).</Vantagem>
            </Box>

            <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
              {p.descricao && <Dobra titulo="Descrição" aberta><Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{p.descricao}</Typography></Dobra>}
              {p.destaques.length > 0 && <Dobra titulo="Destaques" aberta={!p.descricao}><Stack spacing={1}>{p.destaques.map(d => <Stack key={d} direction="row" spacing={1}><Check fontSize="small" color="success" />{d}</Stack>)}</Stack></Dobra>}
              <Dobra titulo="Detalhes da peça" aberta={!p.descricao && !p.destaques.length}>
                <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1.25, fontSize: 14 }}>
                  {detalhes.map(([k, v]) => <Box key={k} sx={{ display: 'contents' }}><Box component="dt" sx={{ color: 'text.secondary' }}>{k}</Box><Box component="dd" sx={{ m: 0, color: 'marca.marrom-950' }}>{v}</Box></Box>)}
                </Box>
              </Dobra>
            </Box>
          </Stack>
        </Box>
        <Box sx={{ display: 'grid', gap: 10, mt: { xs: 10, sm: 14 }, '& > *': { minWidth: 0 } }}>
          <Vitrine titulo="Combine com" sobre="Para completar o look" produtos={combina} parcelas={parcelas} />
          <Vitrine titulo={`Mais ${p.categoria.toLowerCase()}`} sobre="Você também pode gostar" produtos={mais} parcelas={parcelas} link={`/catalogo?categoria=${p.categoriaSlug}`} />
        </Box>
      </Box>
    </LojaLayout>
  );
}

/** Fotos e vídeos: a principal grande com miniaturas; no celular, deslize. Um toque abre em tela cheia. */
function Galeria({ imagens, videos, nome }: { imagens: string[]; videos: ProdutoCatalogo['videos']; nome: string }) {
  const itens = [...imagens.map(src => ({ tipo: 'foto' as const, src, capa: src })), ...videos.map(v => ({ tipo: 'video' as const, src: v.url, capa: v.capa }))];
  const [atual, setAtual] = useState(0);
  const [cheia, setCheia] = useState(false);
  const trilho = useRef<HTMLDivElement>(null);
  if (!itens.length) return <Box sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 6, overflow: 'hidden' }}><FotoCheia src={null} /></Box>;
  const midia = (i: (typeof itens)[number], inteira = false) => i.tipo === 'video'
    ? <Box component="video" src={i.src} poster={i.capa ?? undefined} controls playsInline muted loop sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: inteira ? 'contain' : 'cover', bgcolor: '#000' }} />
    : <FotoCheia src={i.src} alt={nome} sx={inteira ? { objectFit: 'contain' } : undefined} />;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { lg: itens.length > 1 ? '84px 1fr' : '1fr' }, gap: 1.5, minWidth: 0 }}>
      {itens.length > 1 && (
        <Stack spacing={1} sx={{ display: { xs: 'none', lg: 'flex' }, maxHeight: '80vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
          {itens.map((i, n) => (
            <Box key={i.src} component="button" type="button" onClick={() => setAtual(n)} aria-label={`Ver ${i.tipo === 'video' ? 'vídeo' : 'foto'} ${n + 1}`}
              sx={{ position: 'relative', p: 0, border: 0, cursor: 'pointer', aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden', bgcolor: 'marca.bege', outline: n === atual ? '2px solid' : 'none', outlineColor: 'marca.marrom-950', outlineOffset: 2, flexShrink: 0 }}>
              <FotoCheia src={i.capa} />
              {i.tipo === 'video' && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22, bgcolor: 'rgba(0,0,0,.25)' }}>▶</Box>}
            </Box>
          ))}
        </Stack>
      )}
      <Box sx={{ position: 'relative', minWidth: 0 }}>
        <Box ref={trilho} onScroll={e => { const el = e.currentTarget; setAtual(Math.round(el.scrollLeft / el.clientWidth)); }}
          sx={{ display: { xs: 'flex', lg: 'none' }, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', borderRadius: 6, mx: { xs: -2, sm: 0 } }}>
          {itens.map(i => <Box key={i.src} onClick={() => i.tipo === 'foto' && setCheia(true)} sx={{ position: 'relative', flex: '0 0 100%', aspectRatio: '3 / 4', scrollSnapAlign: 'start', bgcolor: 'marca.bege' }}>{midia(i)}</Box>)}
        </Box>
        <Box onClick={() => itens[atual].tipo === 'foto' && setCheia(true)} sx={{ display: { xs: 'none', lg: 'block' }, position: 'relative', aspectRatio: '3 / 4', borderRadius: 6, overflow: 'hidden', bgcolor: 'marca.bege', cursor: itens[atual].tipo === 'foto' ? 'zoom-in' : 'default' }}>
          {midia(itens[atual])}
        </Box>
        {itens.length > 1 && (
          <Stack direction="row" spacing={0.75} sx={{ display: { lg: 'none' }, justifyContent: 'center', mt: 1.5 }}>
            {itens.map((i, n) => <Box key={i.src} sx={{ width: n === atual ? 20 : 6, height: 6, borderRadius: 99, bgcolor: n === atual ? 'marca.marrom-950' : 'marca.borda-forte', transition: 'all .2s' }} />)}
          </Stack>
        )}
      </Box>
      <Dialog fullScreen open={cheia} onClose={() => setCheia(false)} slotProps={{ paper: { sx: { bgcolor: '#111' } } }}>
        <IconButton onClick={() => setCheia(false)} aria-label="Fechar" sx={{ position: 'absolute', right: 12, top: 12, zIndex: 2, color: '#fff', bgcolor: 'rgba(255,255,255,.12)' }}><Close /></IconButton>
        <Box sx={{ position: 'relative', flex: 1 }}>{midia(itens[atual], true)}</Box>
      </Dialog>
    </Box>
  );
}

/** Tamanho e "Adicionar à sacola"; no celular, barra fixa com o preço e o botão. */
function Comprar({ p, atendimento }: { p: ProdutoCatalogo; atendimento: { nome: string; telefone: string } }) {
  const [tamanho, setTamanho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [destacar, setDestacar] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const esgotado = !p.variantes.some(v => v.disponivel > 0);
  const escolhida = p.variantes.find(v => v.tamanho === tamanho);
  const primeiroNome = atendimento.nome.split(' ')[0];
  const duvida = linkWhatsApp(atendimento.telefone, `Olá, ${primeiroNome}! Estou vendo a peça ${p.nome} (Ref. ${p.referencia})${escolhida ? `, tamanho ${escolhida.tamanho}` : ''} e tenho uma dúvida.`);
  const adicionar = () => {
    if (!escolhida) {
      caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setDestacar(true);
      setTimeout(() => setDestacar(false), 1200);
      return;
    }
    const ok = sacola.adicionar({ varianteId: escolhida.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: escolhida.tamanho, codigoInterno: escolhida.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: escolhida.disponivel });
    setAviso(ok ? { ok, texto: `Tam. ${escolhida.tamanho} adicionado à sacola.` }
      : { ok, texto: `Você já tem na sacola todas as ${escolhida.disponivel} unidade${escolhida.disponivel === 1 ? '' : 's'} disponíveis do tam. ${escolhida.tamanho}.` });
  };
  return (
    <Stack spacing={2.5}>
      <Box ref={caixa} sx={{ borderRadius: 4, transition: 'all .2s', ...(destacar ? { bgcolor: 'marca.bege', mx: -1.5, px: 1.5, py: 1.5, outline: '2px solid rgba(109,64,42,.4)' } : {}) }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'marca.marrom-950' }}>Tamanho{escolhida && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> · {escolhida.tamanho}</Box>}</Typography>
          {escolhida && <Typography sx={{ fontSize: 14, fontWeight: 500, color: escolhida.disponivel <= 2 ? 'imperdivel.main' : 'success.main' }}>{escolhida.disponivel <= 2 ? 'Corra! Só ' : ''}{escolhida.disponivel} em estoque</Typography>}
        </Stack>
        <Stack direction="row" useFlexGap role="radiogroup" aria-label="Tamanho" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {p.variantes.map(v => {
            const off = v.disponivel <= 0;
            const ativo = v.tamanho === tamanho;
            return (
              <Button key={v.id} role="radio" aria-checked={ativo} disabled={off} title={off ? 'Esgotado' : undefined} variant={ativo ? 'contained' : 'outlined'}
                onClick={() => { setTamanho(v.tamanho); setAviso(null); if (v.tamanho !== tamanho) rastrear({ tipo: 'tamanho', varianteId: v.id }); }}
                sx={{ position: 'relative', minWidth: 56, height: 48, px: 1.5, borderRadius: 3, fontSize: '0.95rem', fontWeight: 700, ...(off ? { textDecoration: 'line-through' } : {}), ...(!ativo ? { borderColor: 'marca.borda-forte', color: 'marca.marrom-950', bgcolor: 'background.paper' } : {}) }}>
                {v.tamanho}
                {!off && v.disponivel === 1 && !ativo && <Box title="Última peça" sx={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', bgcolor: 'imperdivel.main', border: '2px solid', borderColor: 'background.paper' }} />}
              </Button>
            );
          })}
        </Stack>
        {escolhida?.codigoInterno && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Cód. {escolhida.codigoInterno}</Typography>}
        <Box component="a" href={duvida} target="_blank" rel="noopener" sx={{ mt: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 14, color: 'marca.marrom-950' }}>
          <WhatsApp sx={{ fontSize: 18, color: 'whatsapp.main' }} />Dúvida no tamanho? Pergunte a {primeiroNome}
        </Box>
      </Box>
      <Button onClick={adicionar} disabled={esgotado} variant="contained" size="large" startIcon={!esgotado && <ShoppingBagOutlined />} sx={{ height: 56, borderRadius: 99, fontSize: 16 }}>
        {esgotado ? 'Esgotado' : escolhida ? 'Adicionar à sacola' : 'Escolha o tamanho'}
      </Button>
      {aviso && (
        <Alert severity={aviso.ok ? 'success' : 'warning'} icon={aviso.ok ? <Check /> : undefined} action={<Button href="/sacola" size="small" color="inherit">Ver sacola</Button>} sx={{ borderRadius: 4 }}>{aviso.texto}</Alert>
      )}
      {!esgotado && (
        <Stack direction="row" spacing={1.5} sx={{ display: { lg: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, bgcolor: 'rgba(255,253,249,.95)', backdropFilter: 'blur(16px)', borderTop: 1, borderColor: 'divider', px: 2, pt: 1.5, pb: 'max(0.75rem, env(safe-area-inset-bottom))', alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -12px 32px -16px rgba(46,37,32,.35)' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{brl(p.preco)}</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{escolhida ? `Tam. ${escolhida.tamanho}` : 'Escolha o tamanho'}</Typography>
          </Box>
          <Button onClick={adicionar} variant="contained" startIcon={escolhida ? <ShoppingBagOutlined /> : <Add />} sx={{ flex: 1, height: 48, borderRadius: 99 }}>{escolhida ? 'Adicionar' : 'Escolher tamanho'}</Button>
        </Stack>
      )}
    </Stack>
  );
}

function Vantagem({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <Stack component="li" direction="row" spacing={1.5} sx={{ borderRadius: 4, border: 1, borderColor: 'divider', p: 1.75 }}>
      <Box sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'marca.creme', color: 'secondary.main', '& svg': { fontSize: 19 } }}>{icone}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, color: 'marca.marrom-950', fontSize: '0.82rem' }}>{titulo}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12, lineHeight: 1.35, mt: 0.25 }}>{children}</Typography>
      </Box>
    </Stack>
  );
}

function Dobra({ titulo, aberta, children }: { titulo: string; aberta?: boolean; children: ReactNode }) {
  return (
    <Accordion defaultExpanded={aberta} disableGutters elevation={0} sx={{ bgcolor: 'transparent', borderBottom: 1, borderColor: 'divider', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Add />} sx={{ px: 0, minHeight: 56, '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(45deg)' } }}>
        <Typography sx={{ fontWeight: 700, color: 'marca.marrom-950', fontSize: '0.95rem' }}>{titulo}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0, pb: 2.5, color: 'marca.marrom-900', fontSize: 14, lineHeight: 1.6 }}>{children}</AccordionDetails>
    </Accordion>
  );
}
