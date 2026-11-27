import { useState, type ReactNode } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Accordion, AccordionDetails, AccordionSummary, Badge, Box, Button, Chip, Drawer, Fab, IconButton, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Close, ExpandMore, Tune, WhatsApp } from '@mui/icons-material';
import LojaLayout from '@/Layouts/LojaLayout';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { estiloTitulo, GradeProdutos, type Cartao } from '@/Components/loja/Vitrine';
import { contarFiltros, FAIXAS_PRECO, FILTROS_VAZIOS, GRUPOS_CATEGORIA, grupoTamanho, ORDENS, urlCatalogo, type Contagem, type Filtros, type ResultadoCatalogo } from '@/lib/catalogo';
import { linkWhatsApp } from '@/lib/whatsapp';

type Contagens = ResultadoCatalogo['contagens'];
type Props = { filtros: Filtros; produtos: Cartao[]; total: number; temMais: boolean; contagens: Contagens; sugestoes: (Contagem & { grupo: string })[] };

/** Catálogo com filtros, ordem e "Carregar mais" (porta de src/app/(loja)/catalogo/page.tsx). */
export default function Catalogo({ filtros: f, produtos, total, temMais, contagens: c, sugestoes }: Props) {
  const { loja } = usePage().props;
  const [gaveta, setGaveta] = useState(false);
  const nome = (l: Contagem[], v: string | null) => (v ? l.find(x => x.valor === v)?.rotulo ?? null : null);
  const titulo = f.imperdivel ? 'Imperdível' : f.promo ? 'Promoções' : f.q ? `Busca: “${f.q}”`
    : nome(c.categorias, f.categoria) ?? nome(c.generos, f.genero) ?? nome(c.marcas, f.marca) ?? 'Todas as peças';
  const nomeGenero = nome(c.generos, f.genero) ?? '';
  const rapidas = [...c.categorias].sort((a, b) => b.n - a.n).slice(0, 10);
  const nFiltros = contarFiltros(f);
  const parcelas = loja?.parcelas ?? 0;
  const ordem = (
    <TextField select size="small" label="Ordenar por" value={f.ordem} onChange={e => router.visit(urlCatalogo(f, { ordem: e.target.value as Filtros['ordem'] }), { preserveScroll: true })} sx={{ minWidth: 200 }}>
      {ORDENS.map(o => <MenuItem key={o.valor} value={o.valor}>{o.rotulo}</MenuItem>)}
    </TextField>
  );

  return (
    <LojaLayout>
      <Head title="Catálogo" />
      <Box sx={{ pt: { xs: 2, sm: 4 }, pb: { xs: 14, lg: 4 } }}>
        <Stack component="nav" direction="row" spacing={0.75} aria-label="Caminho" sx={{ fontSize: 14, color: 'text.secondary', flexWrap: 'wrap' }}>
          <LinkSimples href="/">Início</LinkSimples><span aria-hidden>/</span>
          {f.genero && titulo !== nomeGenero && <><LinkSimples href={urlCatalogo({ ...FILTROS_VAZIOS, genero: f.genero })}>{nomeGenero}</LinkSimples><span aria-hidden>/</span></>}
          <Box component="span" sx={{ color: 'marca.marrom-950' }}>{titulo}</Box>
        </Stack>
        <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography component="h1" sx={{ ...estiloTitulo, fontSize: { xs: '2.25rem', sm: '3rem' }, lineHeight: 1 }}>{titulo}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>{total.toLocaleString('pt-BR')} {total === 1 ? 'peça' : 'peças'}{parcelas > 1 ? ` · em até ${parcelas}x` : ''}</Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>{ordem}</Box>
        </Stack>

        {rapidas.length > 1 && (
          <Stack direction="row" spacing={1} aria-label="Categorias" sx={{ mt: 3, mx: { xs: -2, sm: -4, lg: 0 }, px: { xs: 2, sm: 4, lg: 0 }, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {rapidas.map(x => {
              const ativa = f.categoria === x.valor;
              return (
                <Chip key={x.valor} clickable onClick={() => router.visit(urlCatalogo(f, { categoria: ativa ? null : x.valor }), { preserveScroll: true })} aria-current={ativa ? 'true' : undefined}
                  label={<>{x.rotulo} <Box component="span" sx={{ fontSize: 12, opacity: 0.7, ml: 0.5 }}>{x.n}</Box></>}
                  sx={{ height: 40, px: 1, flexShrink: 0, borderRadius: 99, fontWeight: 500, border: 1, borderColor: ativa ? 'marca.marrom-950' : 'marca.borda-forte', bgcolor: ativa ? 'marca.marrom-950' : 'background.paper', color: ativa ? 'marca.creme' : 'marca.marrom-950' }} />
              );
            })}
          </Stack>
        )}

        <Box sx={{ mt: 4, display: 'grid', gridTemplateColumns: { lg: '272px 1fr' }, gap: { xs: 4, xl: 6 } }}>
          <Box component="aside" aria-label="Filtros" sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: 140, alignSelf: 'start', maxHeight: 'calc(100dvh - 10rem)', overflowY: 'auto', pr: 1.5, scrollbarWidth: 'thin' }}>
            <PainelFiltros f={f} c={c} cabecalho />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <FiltrosAtivos f={f} c={c} />
            {produtos.length === 0 ? <SemResultado f={f} sugestoes={sugestoes} whatsapp={loja?.whatsapp ?? ''} /> : <GradeProdutos produtos={produtos} parcelas={parcelas} />}
            {produtos.length > 0 && (
              <Stack spacing={1.5} sx={{ mt: 7, alignItems: 'center', textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Você viu {produtos.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} peças</Typography>
                <LinearProgress variant="determinate" value={(produtos.length / total) * 100} sx={{ width: 224, height: 4, borderRadius: 99, bgcolor: 'marca.bege' }} />
                {temMais && <Button href={urlCatalogo(f, { pagina: f.pagina + 1 })} variant="outlined" size="large" sx={{ mt: 1.5, px: 5, borderRadius: 99 }} {...{ preserveScroll: true }}>Carregar mais peças</Button>}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>

      {/* Celular: botão "Filtrar · Ordenar" e a gaveta; cada filtro é um link e a gaveta fica aberta até "Ver N peças". */}
      <Fab variant="extended" color="primary" onClick={() => setGaveta(true)} sx={{ display: { lg: 'none' }, position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 25 }}>
        <Tune sx={{ mr: 1 }} />Filtrar · Ordenar{nFiltros > 0 && <Badge badgeContent={nFiltros} color="secondary" sx={{ ml: 2 }} />}
      </Fab>
      <Drawer anchor="bottom" open={gaveta} onClose={() => setGaveta(false)} slotProps={{ paper: { sx: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88dvh' } } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2 }}>
          <Typography sx={{ ...estiloTitulo, fontSize: 24 }}>Filtrar e ordenar</Typography>
          <IconButton onClick={() => setGaveta(false)} aria-label="Fechar"><Close /></IconButton>
        </Stack>
        <Box sx={{ px: 2.5, py: 2, overflowY: 'auto', display: 'grid', gap: 3 }}>
          {ordem}
          <PainelFiltros f={f} c={c} />
        </Box>
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button fullWidth variant="contained" size="large" onClick={() => setGaveta(false)} sx={{ borderRadius: 99, height: 52 }}>Ver {total.toLocaleString('pt-BR')} {total === 1 ? 'peça' : 'peças'}</Button>
        </Box>
      </Drawer>
    </LojaLayout>
  );
}

function Opcao({ href, ativo, n, children }: { href: string; ativo: boolean; n?: number; children: ReactNode }) {
  return (
    <LinkSimples href={href} preserveScroll preserveState aria-current={ativo ? 'true' : undefined}
      sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.75, px: 1, borderRadius: 2, fontSize: 14, fontWeight: ativo ? 700 : 400, color: 'marca.marrom-950', bgcolor: ativo ? 'marca.bege' : 'transparent', '&:hover': { bgcolor: 'marca.creme' } }}>
      <span>{children}</span>{n != null && <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>{n}</Box>}
    </LinkSimples>
  );
}

function Secao({ titulo, valor, aberta = true, children }: { titulo: string; valor?: string | null; aberta?: boolean; children: ReactNode }) {
  return (
    <Accordion defaultExpanded={aberta || !!valor} disableGutters elevation={0} sx={{ bgcolor: 'transparent', borderBottom: 1, borderColor: 'divider', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 0 }}>
        <Typography sx={{ fontWeight: 700, color: 'marca.marrom-950', fontSize: 15 }}>{titulo}{valor && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> · {valor}</Box>}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

function PainelFiltros({ f, c, cabecalho = false }: { f: Filtros; c: Contagens; cabecalho?: boolean }) {
  const ativos = contarFiltros(f) - (f.q ? 1 : 0);
  const nome = (l: Contagem[], v: string | null) => (v ? l.find(x => x.valor === v)?.rotulo ?? v : null);
  const grupos = [...GRUPOS_CATEGORIA.map(g => g.rotulo), 'Outros'].map(rotulo => ({ rotulo, itens: c.categorias.filter(x => x.grupo === rotulo) })).filter(g => g.itens.length);
  const letras = c.tamanhos.filter(t => grupoTamanho(t.valor) === 'letras');
  const numeros = c.tamanhos.filter(t => grupoTamanho(t.valor) === 'numeracao');
  const ofertas = [f.promo && 'Em promoção', f.imperdivel && 'Imperdível'].filter(Boolean).join(', ') || null;
  const tamanhos = (rotulo: string, itens: Contagem[]) => itens.length > 0 && (
    <Box>
      <Typography variant="caption" color="text.secondary">{rotulo}</Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
        {itens.map(t => {
          const ativo = f.tamanho === t.valor;
          return (
            <LinkSimples key={t.valor} href={urlCatalogo(f, { tamanho: ativo ? null : t.valor })} preserveScroll preserveState aria-current={ativo ? 'true' : undefined} title={`${t.n} peças`}
              sx={{ minWidth: 44, height: 40, px: 1, display: 'grid', placeItems: 'center', borderRadius: 2.5, border: 1, fontSize: 14, fontWeight: 700, borderColor: ativo ? 'marca.marrom-950' : 'marca.borda-forte', bgcolor: ativo ? 'marca.marrom-950' : 'background.paper', color: ativo ? 'marca.creme' : 'marca.marrom-950', opacity: t.n ? 1 : 0.5 }}>
              {t.valor}
            </LinkSimples>
          );
        })}
      </Stack>
    </Box>
  );
  return (
    <Box>
      {cabecalho && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <Typography sx={{ ...estiloTitulo, fontSize: 22 }}>Filtros</Typography>
          {ativos > 0 && <LinkSimples href={urlCatalogo({ ...FILTROS_VAZIOS, q: f.q, ordem: f.ordem })} sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary', textDecoration: 'underline' }}>Limpar</LinkSimples>}
        </Stack>
      )}
      {c.generos.length > 0 && (
        <Secao titulo="Gênero" valor={nome(c.generos, f.genero)}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
            {c.generos.map(g => {
              const ativo = f.genero === g.valor;
              return (
                <LinkSimples key={g.valor} href={urlCatalogo(f, { genero: ativo ? null : g.valor as Filtros['genero'] })} preserveScroll preserveState aria-current={ativo ? 'true' : undefined}
                  sx={{ textAlign: 'center', py: 1, borderRadius: 3, border: 1, fontSize: 14, fontWeight: 600, borderColor: ativo ? 'marca.marrom-950' : 'marca.borda-forte', bgcolor: ativo ? 'marca.marrom-950' : 'background.paper', color: ativo ? 'marca.creme' : 'marca.marrom-950' }}>
                  {g.rotulo}<Box sx={{ fontSize: '0.68rem', opacity: 0.7 }}>{g.n}</Box>
                </LinkSimples>
              );
            })}
          </Box>
        </Secao>
      )}
      {grupos.length > 0 && (
        <Secao titulo="Categoria" valor={nome(c.categorias, f.categoria)}>
          {grupos.map(g => (
            <Box key={g.rotulo} sx={{ mb: 1 }}>
              {grupos.length > 1 && <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', px: 1, mt: 1 }}>{g.rotulo}</Typography>}
              {g.itens.map(x => <Opcao key={x.valor} href={urlCatalogo(f, { categoria: f.categoria === x.valor ? null : x.valor })} ativo={f.categoria === x.valor} n={x.n}>{x.rotulo}</Opcao>)}
            </Box>
          ))}
        </Secao>
      )}
      {c.tamanhos.length > 0 && <Secao titulo="Tamanho" valor={f.tamanho}><Stack spacing={1.5}>{tamanhos('Roupas', letras)}{tamanhos('Numeração', numeros)}</Stack></Secao>}
      {c.precos.length > 0 && (
        <Secao titulo="Preço" valor={f.preco ? FAIXAS_PRECO.find(x => x.valor === f.preco)?.rotulo ?? null : null}>
          {c.precos.map(x => <Opcao key={x.valor} href={urlCatalogo(f, { preco: f.preco === x.valor ? null : x.valor as Filtros['preco'] })} ativo={f.preco === x.valor} n={x.n}>{x.rotulo}</Opcao>)}
        </Secao>
      )}
      {(c.promo > 0 || c.imperdivel > 0 || f.promo || f.imperdivel) && (
        <Secao titulo="Ofertas" valor={ofertas}>
          {(c.promo > 0 || f.promo) && <Opcao href={urlCatalogo(f, { promo: !f.promo })} ativo={f.promo} n={c.promo}>Em promoção</Opcao>}
          {(c.imperdivel > 0 || f.imperdivel) && <Opcao href={urlCatalogo(f, { imperdivel: !f.imperdivel })} ativo={f.imperdivel} n={c.imperdivel}>Imperdível</Opcao>}
        </Secao>
      )}
      {c.marcas.length > 1 && <Secao titulo="Marca" valor={nome(c.marcas, f.marca)} aberta={!!f.marca}>{c.marcas.map(m => <Opcao key={m.valor} href={urlCatalogo(f, { marca: f.marca === m.valor ? null : m.valor })} ativo={f.marca === m.valor} n={m.n}>{m.rotulo}</Opcao>)}</Secao>}
      {c.estacoes.length > 0 && <Secao titulo="Estação" valor={nome(c.estacoes, f.estacao)} aberta={!!f.estacao}>{c.estacoes.map(e => <Opcao key={e.valor} href={urlCatalogo(f, { estacao: f.estacao === e.valor ? null : e.valor as Filtros['estacao'] })} ativo={f.estacao === e.valor} n={e.n}>{e.rotulo}</Opcao>)}</Secao>}
      <Secao titulo="Estoque" valor={f.estoque === 'disponiveis' ? 'Só disponíveis' : f.estoque === 'esgotados' ? 'Esgotados' : null} aberta={f.estoque !== 'todos'}>
        <Opcao href={urlCatalogo(f, { estoque: f.estoque === 'disponiveis' ? 'todos' : 'disponiveis' })} ativo={f.estoque === 'disponiveis'} n={c.disponiveis}>Só disponíveis</Opcao>
        {c.esgotados > 0 && <Opcao href={urlCatalogo(f, { estoque: f.estoque === 'esgotados' ? 'todos' : 'esgotados' })} ativo={f.estoque === 'esgotados'} n={c.esgotados}>Esgotados</Opcao>}
      </Secao>
    </Box>
  );
}

/** Filtros escolhidos, cada um com o "×" para tirar, e "Limpar tudo". */
function FiltrosAtivos({ f, c }: { f: Filtros; c: Contagens }) {
  const nome = (l: Contagem[], v: string | null) => l.find(x => x.valor === v)?.rotulo ?? v ?? '';
  const ativos = [
    f.q && { rotulo: `“${f.q}”`, href: urlCatalogo(f, { q: '' }) },
    f.genero && { rotulo: nome(c.generos, f.genero), href: urlCatalogo(f, { genero: null }) },
    f.categoria && { rotulo: nome(c.categorias, f.categoria), href: urlCatalogo(f, { categoria: null }) },
    f.tamanho && { rotulo: `Tam. ${f.tamanho}`, href: urlCatalogo(f, { tamanho: null }) },
    f.preco && { rotulo: FAIXAS_PRECO.find(x => x.valor === f.preco)?.rotulo ?? f.preco, href: urlCatalogo(f, { preco: null }) },
    f.promo && { rotulo: 'Em promoção', href: urlCatalogo(f, { promo: false }) },
    f.imperdivel && { rotulo: 'Imperdível', href: urlCatalogo(f, { imperdivel: false }) },
    f.marca && { rotulo: nome(c.marcas, f.marca), href: urlCatalogo(f, { marca: null }) },
    f.estacao && { rotulo: nome(c.estacoes, f.estacao), href: urlCatalogo(f, { estacao: null }) },
    f.estoque !== 'todos' && { rotulo: f.estoque === 'disponiveis' ? 'Só disponíveis' : 'Esgotados', href: urlCatalogo(f, { estoque: 'todos' }) },
  ].filter((x): x is { rotulo: string; href: string } => !!x);
  if (!ativos.length) return null;
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 3, alignItems: 'center' }}>
      {ativos.map(a => <Chip key={a.href} onClick={() => router.visit(a.href, { preserveScroll: true })} clickable label={a.rotulo} onDelete={() => router.visit(a.href)} aria-label={`Tirar o filtro ${a.rotulo}`} sx={{ bgcolor: 'marca.marrom-950', color: 'marca.creme', '& .MuiChip-deleteIcon': { color: 'marca.areia' } }} />)}
      {ativos.length > 1 && <LinkSimples href={urlCatalogo({ ...FILTROS_VAZIOS, ordem: f.ordem })} sx={{ fontSize: 14, fontWeight: 600, color: 'text.secondary', textDecoration: 'underline', px: 1 }}>Limpar tudo</LinkSimples>}
    </Stack>
  );
}

/** Nenhuma peça: sugere afrouxar os filtros, mostra categorias e oferece ajuda da loja pelo WhatsApp. */
function SemResultado({ f, sugestoes, whatsapp }: { f: Filtros; sugestoes: Contagem[]; whatsapp: string }) {
  const pedido = f.q ? `Olá! Procurei “${f.q}” no catálogo e não encontrei. Vocês têm?` : 'Olá! Não encontrei no catálogo o que procuro. Pode me ajudar?';
  return (
    <Stack spacing={3} sx={{ borderRadius: 8, bgcolor: 'marca.creme', p: { xs: 4, sm: 7 }, alignItems: 'center', textAlign: 'center' }}>
      <Box>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: 30 }}>Nenhuma peça encontrada</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 440, mt: 1 }}>{f.q ? 'Confira a grafia ou use uma palavra mais simples (ex.: “camiseta”, “bermuda”, a cor ou a referência).' : 'Tire algum filtro para ver mais peças.'}</Typography>
      </Box>
      {sugestoes.length > 0 && (
        <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Veja também</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
            {sugestoes.map(x => <Chip key={x.valor} clickable onClick={() => router.visit(urlCatalogo({ ...FILTROS_VAZIOS, genero: f.genero }, { categoria: x.valor }))} label={x.rotulo} variant="outlined" sx={{ height: 40, borderRadius: 99, bgcolor: 'background.paper' }} />)}
          </Stack>
        </Stack>
      )}
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1.5 }}>
        <Button href={urlCatalogo(FILTROS_VAZIOS)} variant="outlined" sx={{ borderRadius: 99 }}>Ver todas as peças</Button>
        <Button component="a" href={linkWhatsApp(whatsapp, pedido)} target="_blank" rel="noopener" variant="contained" color="whatsapp" startIcon={<WhatsApp />} sx={{ borderRadius: 99 }}>Pedir para a loja procurar</Button>
      </Stack>
    </Stack>
  );
}
