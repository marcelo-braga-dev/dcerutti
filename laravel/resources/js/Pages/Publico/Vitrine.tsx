import { useCallback, useEffect, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import { Alert, Box, Button, Dialog, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Check, Close, Instagram } from '@mui/icons-material';
import { Contagem, PublicoLayout, QuemAtende, SelosConfianca } from '@/Components/publico/Comum';
import { BotaoTamanho, CamposContato, Compartilhar, contatoVazio, erroDoContato, Gaveta, gravarContato, PedidoEnviado, SeloAoVivo, type ItemEnviado, type RespostaInteresse } from '@/Components/publico/PedidoPublico';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FotoCheia, estiloRotulo, estiloTitulo } from '@/Components/loja/Vitrine';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { vitrineAtiva } from '@/lib/vitrines';
import { linkWhatsApp } from '@/lib/whatsapp';

type Variante = { id: number; tamanho: string; ultimas: boolean };
type Peca = {
  produtoId: number; nome: string; marca: string; cor: string | null; categoria: string | null; imagem: string | null; imagens: string[]; descricao: string | null; composicao: string | null;
  destaques: string[]; video: { url: string; capa: string | null } | null; preco: number; precoCheio: number; desconto: number; especial: boolean; variantes: Variante[];
  tamanhos: { tamanho: string; livre: boolean }[]; ultimas: boolean;
};
type V = {
  id: string; slug: string; tipo: string; status: string; titulo: string; descricao: string | null; urlInstagram: string | null; inicioPrevisto: string | null; ofertaAte: string | null;
  contato: { telefone: string; nome: string | null }; pedidosRecebidos: number; pecas: Peca[];
};
type Escolha = { p: Peca; v: Variante };
type Ordem = 'destaque' | 'menor' | 'maior' | 'desconto';

const ORDENS: { valor: Ordem; rotulo: string }[] = [{ valor: 'destaque', rotulo: 'Destaques' }, { valor: 'menor', rotulo: 'Menor preço' }, { valor: 'maior', rotulo: 'Maior preço' }, { valor: 'desconto', rotulo: 'Maior desconto' }];
const ORDEM_TAMANHO = ['RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'G1', 'G2', 'G3', 'UN', 'UNI'];
const pesoTamanho = (t: string) => {
  const i = ORDEM_TAMANHO.indexOf(t.toUpperCase());
  if (i >= 0) return i;
  const n = Number(t);
  return Number.isFinite(n) ? 100 + n : 1000;
};
const plural = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;
const cartao = { bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6 } as const;

/** Vitrine pública (porta de app/vitrine/[slug]/page.tsx): só as peças escolhidas, sem login. */
export default function PaginaVitrine({ v }: { v: V }) {
  const aberta = vitrineAtiva(v.status);
  const fotos = v.pecas.flatMap(p => (p.imagem ? [p.imagem] : [])).slice(0, 3);
  const descontoMax = v.pecas.reduce((m, p) => Math.max(m, p.desconto), 0);
  const quem = v.contato.nome ?? 'a loja';
  const falar = linkWhatsApp(v.contato.telefone, `Oi! Vi a vitrine "${v.titulo}" e queria tirar uma dúvida.`);
  const tres = fotos.length >= 3;

  return (
    <PublicoLayout largura="lg" acao={<Compartilhar titulo={v.titulo} />} logoHref="/vitrines">
      <Head title={v.titulo} />
      {v.status === 'rascunho' && <Alert severity="warning">Rascunho: só a equipe vê esta página.</Alert>}

      <Box component="header" sx={{ position: 'relative', overflow: 'hidden', borderRadius: 8, bgcolor: 'marca.marrom-950', color: 'marca.creme', display: { md: 'grid' }, gridTemplateColumns: { md: '1.1fr 1fr' } }}>
        {fotos.length > 0 && (
          <Box sx={{ position: { xs: 'absolute', md: 'relative' }, inset: 0, order: { md: 2 }, minHeight: { md: 384 }, display: 'grid', gap: '2px', gridTemplateColumns: tres ? '1.4fr 1fr' : fotos.length === 2 ? '1fr 1fr' : '1fr', gridTemplateRows: tres ? '1fr 1fr' : undefined }}>
            {fotos.map((f, i) => <Box key={f + i} sx={{ position: 'relative', overflow: 'hidden', gridRow: tres && i === 0 ? 'span 2' : undefined, filter: aberta ? undefined : 'grayscale(1)' }}><FotoCheia src={f} /></Box>)}
            <Box sx={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: { xs: 'linear-gradient(to top, #2e2520, rgba(46,37,32,.75), rgba(46,37,32,.2))', md: 'linear-gradient(to right, rgba(46,37,32,.5), transparent)' } }} />
          </Box>
        )}
        <Box sx={{ position: 'relative', p: { xs: 2.5, sm: 4.5 }, display: 'grid', alignContent: { xs: 'end', md: 'center' }, gap: 1.75, minHeight: fotos.length ? { xs: 352, sm: 416, md: 0 } : undefined }}>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {v.status === 'no_ar' && <SeloAoVivo />}
            {v.status === 'agendada' && v.inicioPrevisto && <Selo claro>Live em <Contagem ate={v.inicioPrevisto} fim="instantes" /></Selo>}
            {v.status === 'encerrada' && <Selo>Encerrada</Selo>}
            {aberta && descontoMax > 0 && <Selo vermelho>Até {descontoMax}% off</Selo>}
            <Selo>{plural(v.pecas.length)}</Selo>
          </Stack>
          <Typography component="h1" sx={{ ...estiloTitulo, color: 'marca.creme', fontSize: { xs: '2rem', sm: '3rem' }, lineHeight: 1.05 }}>{v.titulo}</Typography>
          {v.descricao && <Typography sx={{ color: 'marca.areia', maxWidth: 576, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{v.descricao}</Typography>}
          {v.status === 'agendada' && v.inicioPrevisto && <Typography variant="body2" sx={{ color: 'marca.areia' }}>Live em {formatarDataHora(v.inicioPrevisto)}. As peças já estão aqui.</Typography>}
          {v.ofertaAte && aberta && <Typography variant="body2" sx={{ color: 'marca.areia' }}>Preços especiais terminam em <Box component="strong" sx={{ color: 'marca.creme' }}><Contagem ate={v.ofertaAte} fim="instantes" /></Box></Typography>}
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {v.urlInstagram && <Button href={v.urlInstagram} target="_blank" rel="noopener" startIcon={<Instagram />} sx={{ bgcolor: 'marca.creme', color: 'marca.marrom-950', borderRadius: 99, '&:hover': { bgcolor: 'marca.areia' } }}>{v.status === 'no_ar' ? 'Assistir no Instagram' : 'Ver no Instagram'}</Button>}
            {aberta && v.pedidosRecebidos >= 3 && <Typography variant="body2" sx={{ color: 'marca.areia' }}>🔥 {v.pedidosRecebidos} pedidos nesta vitrine</Typography>}
          </Stack>
        </Box>
      </Box>

      {aberta && (
        <Box sx={{ ...cartao, display: 'grid', gridTemplateColumns: { sm: 'auto 1fr' }, gap: { xs: 1.5, sm: 3 }, alignItems: 'center', p: 2, px: { sm: 3 } }}>
          <QuemAtende nome={v.contato.nome} link={falar} />
          <Box sx={{ justifySelf: { sm: 'end' } }}><SelosConfianca /></Box>
        </Box>
      )}

      {!aberta && v.status !== 'rascunho' && (
        <Box sx={{ ...cartao, p: { xs: 2.5, sm: 3 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography component="h2" sx={{ ...estiloTitulo, fontSize: '1.3rem' }}>Esta vitrine terminou</Typography>
            <Typography variant="body2" color="text.secondary">Ainda dá para ver as peças com você: fale com a gente e conferimos os tamanhos.</Typography>
          </Box>
          <Button href={linkWhatsApp(v.contato.telefone, `Oi! Vi "${v.titulo}" e queria saber das peças.`)} target="_blank" rel="noopener" variant="contained" color="whatsapp">Falar com {quem}</Button>
        </Box>
      )}

      <EscolherVitrine slug={v.slug} pecas={v.pecas} aberta={aberta} vendedora={v.contato.nome} />

      {aberta && (
        <Box component="footer" sx={{ display: 'grid', gridTemplateColumns: { sm: 'repeat(3, 1fr)' }, gap: 1.5, fontSize: 14 }}>
          {[['1', 'Escolha o tamanho', 'Toque no tamanho de cada peça que quiser.'], ['2', 'Envie pelo WhatsApp', `A conversa com ${quem} abre com a sua lista pronta.`], ['3', 'A loja confirma', 'Separamos as peças e combinamos frete e pagamento.']].map(([n, t, d]) => (
            <Stack key={n} direction="row" spacing={1.5} sx={{ ...cartao, borderRadius: 4, p: 2 }}>
              <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', bgcolor: 'marca.bege', color: 'secondary.main', fontWeight: 800, display: 'grid', placeItems: 'center' }}>{n}</Box>
              <Box><Box sx={{ fontWeight: 600 }}>{t}</Box><Box sx={{ color: 'text.secondary' }}>{d}</Box></Box>
            </Stack>
          ))}
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { sm: 'span 3' }, textAlign: 'center' }}>
            Dúvida? <Box component="a" href={falar} target="_blank" rel="noopener" sx={{ color: 'marca.marrom-950' }}>Fale com {quem} no WhatsApp</Box> · <LinkSimples href="/vitrines" sx={{ textDecoration: 'underline' }}>Mais vitrines</LinkSimples>
          </Typography>
        </Box>
      )}
    </PublicoLayout>
  );
}

function Selo({ children, claro, vermelho }: { children: React.ReactNode; claro?: boolean; vermelho?: boolean }) {
  return <Box component="span" sx={{ height: 28, px: 1.5, borderRadius: 99, fontSize: 12, fontWeight: claro || vermelho ? 700 : 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: vermelho ? 'imperdivel.main' : claro ? 'marca.card' : 'rgba(246,239,230,.15)', color: vermelho ? '#fff' : claro ? 'marca.marrom-950' : 'inherit' }}>{children}</Box>;
}

/** Filtro de tamanho e ordem fixos ao rolar, grade com o tamanho a um toque, detalhes da peça, barra fixa e gaveta do pedido. */
function EscolherVitrine({ slug, pecas, aberta, vendedora }: { slug: string; pecas: Peca[]; aberta: boolean; vendedora: string | null }) {
  const [escolhas, setEscolhas] = useState<number[]>([]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('destaque');
  const [gaveta, setGaveta] = useState(false);
  const [detalhe, setDetalhe] = useState<Peca | null>(null);
  const [feito, setFeito] = useState<{ url: string; destinatario: string; itens: ItemEnviado[] } | null>(null);

  const tamanhos = useMemo(() => [...new Set(pecas.flatMap(p => p.variantes.map(v => v.tamanho)))].sort((a, b) => pesoTamanho(a) - pesoTamanho(b) || a.localeCompare(b)), [pecas]);
  const visiveis = useMemo(() => {
    const lista = filtro ? pecas.filter(p => p.variantes.some(v => v.tamanho === filtro)) : [...pecas];
    if (ordem === 'menor') lista.sort((a, b) => a.preco - b.preco);
    if (ordem === 'maior') lista.sort((a, b) => b.preco - a.preco);
    if (ordem === 'desconto') lista.sort((a, b) => b.desconto - a.desconto);
    return lista;
  }, [pecas, filtro, ordem]);
  const escolhidas: Escolha[] = escolhas.flatMap(id => {
    for (const p of pecas) { const v = p.variantes.find(x => x.id === id); if (v) return [{ p, v }]; }
    return [];
  });
  const total = escolhidas.reduce((a, x) => a + x.p.preco, 0);
  const economia = escolhidas.reduce((a, x) => a + Math.max(0, x.p.precoCheio - x.p.preco), 0);
  const alternar = useCallback((id: number) => setEscolhas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id])), []);

  if (feito) return <PedidoEnviado destinatario={feito.destinatario} url={feito.url} itens={feito.itens} voltar={() => { setFeito(null); setEscolhas([]); }} />;

  const pilula = (ativo: boolean) => ({ flexShrink: 0, height: 36, minWidth: 44, px: 1.5, borderRadius: 99, border: 1, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', bgcolor: ativo ? 'marca.marrom-950' : 'marca.card', color: ativo ? 'marca.creme' : 'marca.marrom-950', borderColor: ativo ? 'marca.marrom-950' : 'marca.borda-forte' });

  return (
    <Box sx={{ display: 'grid', gap: 2.5, pb: aberta && escolhidas.length ? 14 : 0 }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 20, mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: 'rgba(246,239,230,.9)', backdropFilter: 'blur(12px)', borderBottom: 1, borderColor: 'marca.borda', display: 'grid', gap: 1.25 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="body2" color="text.secondary" aria-live="polite" noWrap><strong>{visiveis.length}</strong> {visiveis.length === 1 ? 'peça' : 'peças'}{filtro ? ` no ${filtro}` : ''}</Typography>
          <TextField select size="small" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar as peças" sx={{ minWidth: 160 }}>
            {ORDENS.map(o => <MenuItem key={o.valor} value={o.valor}>{o.rotulo}</MenuItem>)}
          </TextField>
        </Stack>
        {tamanhos.length > 1 && (
          <Stack direction="row" spacing={1} role="group" aria-label="Filtrar pelo seu tamanho" sx={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
            <Box component="button" type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)} sx={pilula(!filtro)}>Todos os tamanhos</Box>
            {tamanhos.map(t => <Box key={t} component="button" type="button" aria-pressed={filtro === t} aria-label={`Mostrar só o ${t}`} onClick={() => setFiltro(f => (f === t ? null : t))} sx={pilula(filtro === t)}>{t}</Box>)}
          </Stack>
        )}
      </Box>

      {visiveis.length === 0 ? (
        <Box sx={{ ...cartao, p: 4, textAlign: 'center', display: 'grid', gap: 1.5, justifyItems: 'center' }}>
          <Typography sx={{ fontWeight: 600 }}>Nenhuma peça no tamanho {filtro} nesta vitrine.</Typography>
          <Typography variant="body2" color="text.secondary">Fale com {vendedora ?? 'a loja'}: podemos ter outras peças no seu tamanho.</Typography>
          <Button variant="outlined" onClick={() => setFiltro(null)}>Ver todos os tamanhos</Button>
        </Box>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, columnGap: { xs: 1.5, sm: 2.5 }, rowGap: { xs: 3.5, sm: 4.5 } }}>
          {visiveis.map(p => <CartaoPeca key={p.produtoId} p={p} escolhas={escolhas} aberta={aberta} destaque={filtro} alternar={alternar} abrir={() => setDetalhe(p)} />)}
        </Box>
      )}

      {aberta && escolhidas.length > 0 && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, px: 1.5, pb: 1.5, pt: 1.5, pointerEvents: 'none', background: 'linear-gradient(to top, #f6efe6, rgba(246,239,230,.95), rgba(246,239,230,0))' }}>
          <Stack direction="row" spacing={1.5} sx={{ mx: 'auto', maxWidth: 576, pointerEvents: 'auto', alignItems: 'center', borderRadius: 99, bgcolor: 'marca.marrom-950', color: 'marca.creme', pl: 2.5, pr: 0.75, py: 0.75, boxShadow: 8 }}>
            <Box sx={{ flex: 1, minWidth: 0, lineHeight: 1.2 }} aria-live="polite">
              <Box sx={{ fontSize: 14, fontWeight: 600 }}>{plural(escolhidas.length)} · {brl(total)}</Box>
              {economia > 0 && <Box sx={{ fontSize: 12, color: 'marca.areia' }}>Você economiza {brl(economia)}</Box>}
            </Box>
            <Button onClick={() => setGaveta(true)} variant="contained" color="whatsapp" sx={{ borderRadius: 99, height: 44, px: 2.5, flexShrink: 0 }}>Quero estas peças</Button>
          </Stack>
        </Box>
      )}
      {detalhe && <DetalhesPeca p={detalhe} escolhas={escolhas} aberta={aberta} alternar={alternar} fechar={() => setDetalhe(null)} escolhidas={escolhidas.length} pedir={() => { setDetalhe(null); setGaveta(true); }} />}
      {aberta && (
        <GavetaPedido slug={slug} aberta={gaveta} escolhidas={escolhidas} total={total} economia={economia} fechar={() => setGaveta(false)} tirar={alternar}
          concluir={(url, destinatario) => { setFeito({ url, destinatario, itens: escolhidas.map(({ p, v }) => ({ chave: v.id, nome: p.nome, tamanho: v.tamanho, preco: p.preco, imagem: p.imagem })) }); setGaveta(false); }} />
      )}
    </Box>
  );
}

function Tamanhos({ p, escolhas, alternar, destaque, grande }: { p: Peca; escolhas: number[]; alternar: (id: number) => void; destaque?: string | null; grande?: boolean }) {
  return (
    <Stack direction="row" useFlexGap role="group" aria-label={`Tamanhos de ${p.nome}`} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
      {p.tamanhos.map(t => {
        const v = p.variantes.find(x => x.tamanho === t.tamanho);
        return v ? <BotaoTamanho key={t.tamanho} tamanho={t.tamanho} grande={grande} ativo={escolhas.includes(v.id)} destaque={destaque === v.tamanho} rotulo={`${p.nome}, tamanho ${v.tamanho}`} onClick={() => alternar(v.id)} />
          : <BotaoTamanho key={t.tamanho} tamanho={t.tamanho} grande={grande} esgotado />;
      })}
    </Stack>
  );
}

function Preco({ p, grande }: { p: Peca; grande?: boolean }) {
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1 }}>
      <Box component="strong" sx={{ fontWeight: 800, fontSize: grande ? '1.5rem' : '1.05rem', color: p.desconto > 0 ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(p.preco)}</Box>
      {p.desconto > 0 && <Box component="s" sx={{ fontSize: grande ? 14 : 12, color: 'text.secondary' }}>{brl(p.precoCheio)}</Box>}
      {p.desconto > 0 && grande && <Box component="span" sx={{ height: 24, px: 1, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>−{p.desconto}%</Box>}
    </Stack>
  );
}

function CartaoPeca({ p, escolhas, aberta, destaque, alternar, abrir }: { p: Peca; escolhas: number[]; aberta: boolean; destaque: string | null; alternar: (id: number) => void; abrir: () => void }) {
  const [foto, setFoto] = useState(0);
  const esgotada = !p.variantes.length;
  const minhas = p.variantes.filter(v => escolhas.includes(v.id));
  const imagens = p.imagens.length ? p.imagens.slice(0, 4) : [p.imagem];
  const selo = { height: 24, px: 1, borderRadius: 99, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' } as const;
  return (
    <Box component="li" sx={{ minWidth: 0, display: 'grid', alignContent: 'start', gap: 1.25 }}>
      <Box sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 4, overflow: 'hidden', bgcolor: 'marca.bege', outline: minhas.length ? '2px solid' : 'none', outlineColor: 'marca.marrom-950', outlineOffset: 2 }}>
        <Box onScroll={e => { const el = e.currentTarget; setFoto(Math.round(el.scrollLeft / el.clientWidth)); }} sx={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
          {imagens.map((src, i) => (
            <Box key={i} component="button" type="button" onClick={abrir} tabIndex={i === 0 ? 0 : -1} aria-label={i === 0 ? `Ver detalhes de ${p.nome}` : undefined} aria-hidden={i === 0 ? undefined : true}
              sx={{ position: 'relative', flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start', p: 0, border: 0, cursor: 'zoom-in', filter: esgotada ? 'grayscale(1)' : undefined, opacity: esgotada ? 0.7 : 1 }}>
              <FotoCheia src={src} alt={i === 0 ? p.nome : ''} />
            </Box>
          ))}
        </Box>
        <Stack direction="row" useFlexGap sx={{ pointerEvents: 'none', position: 'absolute', top: 8, left: 8, right: 8, flexWrap: 'wrap', gap: 0.75 }}>
          {p.desconto > 0 && <Box sx={{ ...selo, bgcolor: 'imperdivel.main', color: '#fff' }}>−{p.desconto}%</Box>}
          {p.ultimas && !esgotada && <Box sx={{ ...selo, bgcolor: 'rgba(255,255,255,.95)', color: 'secondary.main' }}>Últimas</Box>}
          {p.video && <Box sx={{ ...selo, bgcolor: 'rgba(46,37,32,.75)', color: 'marca.creme' }}>▶ Vídeo</Box>}
        </Stack>
        {minhas.length > 0 && (
          <Stack direction="row" spacing={0.5} aria-hidden sx={{ pointerEvents: 'none', position: 'absolute', top: 8, right: 8, height: 28, pl: 0.75, pr: 1.25, borderRadius: 99, bgcolor: 'marca.marrom-950', color: 'marca.creme', fontSize: 12, fontWeight: 600, alignItems: 'center' }}>
            <Check sx={{ fontSize: 16 }} />{minhas.map(v => v.tamanho).join(' · ')}
          </Stack>
        )}
        {esgotada && <Box sx={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: 0, py: 1, bgcolor: 'rgba(46,37,32,.8)', color: 'marca.creme', textAlign: 'center', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Esgotada</Box>}
        {imagens.length > 1 && !esgotada && (
          <Stack direction="row" spacing={0.5} aria-hidden sx={{ pointerEvents: 'none', position: 'absolute', bottom: 8, left: 0, right: 0, justifyContent: 'center' }}>
            {imagens.map((_, i) => <Box key={i} sx={{ height: 6, width: i === foto ? 16 : 6, borderRadius: 99, bgcolor: i === foto ? '#fff' : 'rgba(255,255,255,.6)', transition: 'all .2s' }} />)}
          </Stack>
        )}
      </Box>
      <Box component="button" type="button" onClick={abrir} sx={{ display: 'grid', gap: 0.5, px: 0.25, textAlign: 'left', bgcolor: 'transparent', border: 0, p: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Box component="span" sx={{ fontSize: '0.92rem', lineHeight: 1.35, color: 'marca.marrom-950', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.nome}</Box>
        {p.cor && <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>{p.cor}</Box>}
        <Preco p={p} />
      </Box>
      {aberta && !esgotada && <Tamanhos p={p} escolhas={escolhas} alternar={alternar} destaque={destaque} />}
      {minhas.some(v => v.ultimas) && <Typography variant="caption" sx={{ color: 'secondary.main' }}>Últimas unidades no {minhas.filter(v => v.ultimas).map(v => v.tamanho).join(' e ')}.</Typography>}
    </Box>
  );
}

/** Detalhes da peça: fotos e vídeo grandes, descrição, tecido, destaques e os tamanhos, sem sair da vitrine. */
function DetalhesPeca({ p, escolhas, aberta, alternar, fechar, escolhidas, pedir }: { p: Peca; escolhas: number[]; aberta: boolean; alternar: (id: number) => void; fechar: () => void; escolhidas: number; pedir: () => void }) {
  const [foto, setFoto] = useState(0);
  const midias = [
    ...(p.imagens.length ? p.imagens.slice(0, 1) : [p.imagem]).map(src => ({ tipo: 'foto' as const, src, capa: null as string | null })),
    ...(p.video ? [{ tipo: 'video' as const, src: p.video.url, capa: p.video.capa }] : []),
    ...p.imagens.slice(1).map(src => ({ tipo: 'foto' as const, src, capa: null as string | null })),
  ];
  const minhas = p.variantes.filter(v => escolhas.includes(v.id));
  const rotulo = { ...estiloRotulo, fontSize: '0.62rem', color: 'text.secondary' };
  return (
    <Dialog open onClose={fechar} maxWidth="md" fullWidth aria-label={p.nome} slotProps={{ paper: { sx: { bgcolor: 'marca.creme', borderRadius: 6, m: { xs: 1, sm: 2 }, maxHeight: '94dvh', display: { sm: 'grid' }, gridTemplateColumns: { sm: '1fr 1fr' } } } }}>
      <Box sx={{ position: 'relative', bgcolor: 'marca.bege', aspectRatio: { xs: '4 / 5', sm: 'auto' }, minHeight: { sm: 544 } }}>
        <Box onScroll={e => { const el = e.currentTarget; setFoto(Math.round(el.scrollLeft / el.clientWidth)); }} sx={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
          {midias.map((m, i) => (
            <Box key={i} sx={{ position: 'relative', flex: '0 0 100%', height: '100%', scrollSnapAlign: 'start' }}>
              {m.tipo === 'foto' ? <FotoCheia src={m.src} alt={i === 0 ? p.nome : ''} />
                : <Box component="video" src={m.src} poster={m.capa ?? undefined} muted loop playsInline autoPlay controls aria-label={`Vídeo de ${p.nome}`} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </Box>
          ))}
        </Box>
        {midias.length > 1 && <Stack direction="row" spacing={0.75} aria-hidden sx={{ pointerEvents: 'none', position: 'absolute', bottom: 12, left: 0, right: 0, justifyContent: 'center' }}>{midias.map((_, i) => <Box key={i} sx={{ height: 6, width: i === foto ? 20 : 6, borderRadius: 99, bgcolor: i === foto ? '#fff' : 'rgba(255,255,255,.6)' }} />)}</Stack>}
        <IconButton onClick={fechar} aria-label="Fechar os detalhes" sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(255,255,255,.95)', '&:hover': { bgcolor: '#fff' } }}><Close /></IconButton>
      </Box>
      <Box sx={{ p: { xs: 2.5, sm: 3.5 }, display: 'grid', alignContent: 'start', gap: 2, overflowY: 'auto' }}>
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {p.marca && <Typography sx={rotulo}>{p.marca}</Typography>}
          <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3 }}>{p.nome}</Typography>
          {p.cor && <Typography variant="body2" color="text.secondary">Cor: {p.cor}</Typography>}
        </Box>
        <Preco p={p} grande />
        {aberta && p.variantes.length > 0 && (
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Escolha o tamanho {minhas.length > 0 && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>· {minhas.map(v => v.tamanho).join(', ')}</Box>}</Typography>
            <Tamanhos p={p} escolhas={escolhas} alternar={alternar} grande />
            {minhas.some(v => v.ultimas) && <Typography variant="caption" sx={{ color: 'secondary.main' }}>Últimas unidades neste tamanho.</Typography>}
          </Box>
        )}
        {!p.variantes.length && <Typography variant="body2" color="text.secondary">Esgotada nesta vitrine.</Typography>}
        {p.descricao && <Typography variant="body2" sx={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>{p.descricao}</Typography>}
        {(p.composicao || p.destaques.length > 0) && (
          <Box sx={{ display: 'grid', gap: 1, fontSize: 14, borderTop: 1, borderColor: 'marca.borda', pt: 1.5 }}>
            {p.composicao && <Box><Typography sx={rotulo}>Tecido</Typography>{p.composicao}</Box>}
            {p.destaques.length > 0 && <Box><Typography sx={rotulo}>Destaques</Typography><Box component="ul" sx={{ m: 0, pl: 2 }}>{p.destaques.map(d => <li key={d}>{d}</li>)}</Box></Box>}
          </Box>
        )}
        <Box sx={{ position: 'sticky', bottom: 0, mx: { xs: -2.5, sm: -3.5 }, px: { xs: 2.5, sm: 3.5 }, py: 1.5, bgcolor: 'rgba(246,239,230,.95)', borderTop: 1, borderColor: 'marca.borda' }}>
          {aberta && escolhidas > 0
            ? <Button onClick={pedir} variant="contained" color="whatsapp" size="large" fullWidth>Ver meu pedido ({escolhidas})</Button>
            : <Button onClick={fechar} variant="contained" size="large" fullWidth>Voltar às peças</Button>}
        </Box>
      </Box>
    </Dialog>
  );
}

function GavetaPedido({ slug, aberta, escolhidas, total, economia, fechar, tirar, concluir }: {
  slug: string; aberta: boolean; escolhidas: Escolha[]; total: number; economia: number; fechar: () => void; tirar: (id: number) => void; concluir: (url: string, destinatario: string) => void;
}) {
  const [contato, setContato] = useState(contatoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (aberta && !escolhidas.length) fechar(); }, [aberta, escolhidas.length, fechar]);

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!escolhidas.length) return setErro('Escolha pelo menos uma peça e o tamanho.');
    const falta = erroDoContato(contato);
    if (falta) return setErro(falta);
    setErro(null);
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    setEnviando(true);
    const r = await postJson<RespostaInteresse>(`/vitrine/${encodeURIComponent(slug)}/interesse`, { variantes: escolhidas.map(x => x.v.id), ...contato }).catch(() => ({ ok: false as const, erro: 'Sem conexão. Tente de novo.' }));
    setEnviando(false);
    if (!r.ok) { aba?.close(); return setErro(r.erro); }
    gravarContato(contato.nome.trim(), contato.telefone);
    const url = linkWhatsApp(r.telefone, r.texto);
    if (aba) aba.location.href = url;
    concluir(url, r.destinatario);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Gaveta titulo="Seu pedido" aberta={aberta} fechar={fechar}>
      <Box component="form" onSubmit={enviar} noValidate sx={{ position: 'relative', p: 2.5, display: 'grid', gap: 2 }}>
        <Stack spacing={1.25}>
          {escolhidas.map(({ p, v }) => (
            <Stack key={v.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', ...cartao, borderRadius: 4, p: 1, pr: 1.5 }}>
              <Box sx={{ position: 'relative', width: 48, aspectRatio: '3 / 4', borderRadius: 2, overflow: 'hidden', bgcolor: 'marca.bege', flexShrink: 0 }}><FotoCheia src={p.imagem} /></Box>
              <Box sx={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>Tam. <strong>{v.tamanho}</strong> · {brl(p.preco)}{p.desconto > 0 && <Box component="s" sx={{ ml: 0.5 }}>{brl(p.precoCheio)}</Box>}</Box>
              </Box>
              <Button size="small" onClick={() => tirar(v.id)} aria-label={`Tirar ${p.nome} tamanho ${v.tamanho}`} sx={{ textDecoration: 'underline', color: 'text.secondary' }}>Tirar</Button>
            </Stack>
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gap: 0.5, borderTop: 1, borderColor: 'marca.borda', pt: 1.5 }}>
          {economia > 0 && <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14, color: 'marca.oliva' }}><span>Você economiza</span><span>{brl(economia)}</span></Stack>}
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography variant="body2" color="text.secondary">{plural(escolhidas.length)}</Typography><Box component="strong" sx={{ fontSize: 20, fontWeight: 800 }}>{brl(total)}</Box></Stack>
        </Box>
        <CamposContato valor={contato} mudar={setContato} />
        {erro && <Alert severity="error">{erro}</Alert>}
        <Button type="submit" disabled={enviando} variant="contained" color="whatsapp" size="large" fullWidth>{enviando ? 'Enviando…' : 'Enviar pedido pelo WhatsApp'}</Button>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Sem cadastro. As peças só ficam reservadas depois da confirmação da loja; frete e pagamento são combinados na conversa.</Typography>
      </Box>
    </Gaveta>
  );
}
