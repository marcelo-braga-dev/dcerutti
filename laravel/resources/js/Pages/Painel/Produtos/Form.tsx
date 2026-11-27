import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, CardHeader, Chip, FormControlLabel, InputAdornment, LinearProgress, Link, MenuItem, Paper, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { ArrowBack, Checkroom, DeleteOutlined, History, Image, LocalOffer, OpenInNew, Paid, Straighten } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Foto } from '@/Components/ui/Basicos';
import { FotosProduto, VideosProduto, type VideoProduto } from '@/Components/painel/produto/Midia';
import { brl, descontoPct, lerValor } from '@/lib/dinheiro';
import { formatarDataHora } from '@/lib/datas';

type Variante = { id: number; tamanho: string; estoque: number; reservado: number; codigoInterno: string | null; ean: string | null; pedidos: number };
type Produto = {
  id: number; referencia: string; nome: string; marcaId: number; categoriaId: number; subcategoria: string | null; genero: string; estacao: string | null; cor: string | null;
  composicao: string | null; descricao: string | null; destaques: string[]; preco: number; precoCheio: number; custo: number | null; imperdivel: boolean; ativo: boolean;
  atualizadoEm: string | null; imagens: string[]; videos: VideoProduto[]; variantes: Variante[];
};
type Props = {
  produto: Produto | null; marcas: { id: number; nome: string }[]; categorias: { id: number; nome: string }[];
  movimentos?: { id: number; delta: number; motivo: 'entrada' | 'ajuste' | 'venda' | 'estorno'; observacao: string | null; tamanho: string; criadoEm: string; usuario: string | null }[];
};

const MOTIVOS = { entrada: 'Entrada', ajuste: 'Ajuste', venda: 'Venda', estorno: 'Venda desfeita' } as const;
const CORES = ['Preto', 'Branco', 'Off White', 'Cinza', 'Marinho', 'Azul', 'Jeans', 'Verde', 'Oliva', 'Bege', 'Caramelo', 'Marrom', 'Vinho', 'Vermelho', 'Rosa', 'Amarelo', 'Estampado'];
const SUGESTOES = ['Tecido macio', 'Não amassa', 'Toque gelado', 'Modelagem ampla', 'Cintura alta', 'Com elastano', 'Proteção UV', 'Peça básica'];
const TAMANHOS_RAPIDOS = [['PP', 'P', 'M', 'G', 'GG'], ['36', '38', '40', '42', '44', '46'], ['UNI']];
const valor = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Secao({ numero, icone, titulo, descricao, children }: { numero: number; icone: ReactNode; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader avatar={<Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: 'primary.main' }}>{numero}</Avatar>} title={<Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}><Box sx={{ color: 'secondary.main', display: 'flex' }}>{icone}</Box>{titulo}</Stack>}
        subheader={descricao} slotProps={{ title: { variant: 'subtitle1', sx: { fontWeight: 700 } }, subheader: { variant: 'caption' } }} sx={{ borderBottom: 1, borderColor: 'divider' }} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Cadastro e edição de produto (src/components/painel/form-produto.tsx e src/app/(painel)/painel/produtos/[id]/page.tsx). */
export default function FormProduto({ produto: p, marcas, categorias, movimentos = [] }: Props) {
  const { flash } = usePage().props;
  const form = useForm({
    referencia: p?.referencia ?? '', nome: p?.nome ?? '', marcaId: p?.marcaId ? String(p.marcaId) : '', categoriaId: p?.categoriaId ? String(p.categoriaId) : '', novaCategoria: '',
    subcategoria: p?.subcategoria ?? '', genero: p?.genero ?? '', estacao: p?.estacao ?? '', cor: p?.cor ?? '', composicao: p?.composicao ?? '', descricao: p?.descricao ?? '',
    destaques: p?.destaques ?? [] as string[], preco: valor(p?.preco), precoCheio: valor(p?.precoCheio), custo: valor(p?.custo), imagens: p?.imagens ?? [] as string[],
    videos: p?.videos ?? [] as VideoProduto[], ativo: p?.ativo ?? true, imperdivel: p?.imperdivel ?? false,
  });
  const d = form.data;
  const erros = form.errors as Record<string, string>;
  const [destaque, setDestaque] = useState('');
  const salvar = () => (p ? form.put(`/painel/produtos/${p.id}`, { preserveScroll: true }) : form.post('/painel/produtos'));

  const venda = lerValor(d.preco);
  const cheio = d.precoCheio.trim() ? lerValor(d.precoCheio) : venda;
  const custo = d.custo.trim() ? lerValor(d.custo) : NaN;
  const okVenda = Number.isFinite(venda) && venda > 0;
  const desconto = okVenda && Number.isFinite(cheio) ? descontoPct(venda, cheio) : 0;
  const lucro = okVenda && Number.isFinite(custo) ? venda - custo : NaN;
  const margem = Number.isFinite(lucro) ? (lucro / venda) * 100 : NaN;
  const corMargem = !Number.isFinite(margem) ? 'text.secondary' : margem < 0 ? 'error.main' : margem < 30 ? 'secondary.main' : 'success.main';
  const campo = (nome: 'referencia' | 'nome' | 'subcategoria' | 'composicao' | 'descricao' | 'novaCategoria', rotulo: string, extra: Record<string, unknown> = {}) => (
    <TextField label={rotulo} value={d[nome]} onChange={e => form.setData(nome, nome === 'referencia' ? e.target.value.toUpperCase() : e.target.value)} error={!!erros[nome]} helperText={erros[nome] ?? (extra.ajuda as ReactNode)}
      {...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'ajuda'))} />
  );
  const dinheiro = (nome: 'preco' | 'precoCheio' | 'custo', rotulo: string, fim?: ReactNode) => (
    <TextField label={rotulo} value={d[nome]} onChange={e => form.setData(nome, e.target.value)} placeholder="0,00" error={!!erros[nome]} helperText={erros[nome]}
      onBlur={e => { const v = lerValor(e.target.value); if (Number.isFinite(v)) form.setData(nome, valor(v)); }}
      slotProps={{ input: { startAdornment: <InputAdornment position="start">R$</InputAdornment>, endAdornment: fim ? <InputAdornment position="end">{fim}</InputAdornment> : undefined }, htmlInput: { inputMode: 'decimal', style: { textAlign: 'right', fontWeight: 600 } } }} />
  );
  const incluirDestaque = (t: string) => {
    const v = t.trim().slice(0, 80);
    if (v && !d.destaques.some(x => x.toLowerCase() === v.toLowerCase()) && d.destaques.length < 10) form.setData('destaques', [...d.destaques, v]);
    setDestaque('');
  };
  const avisos = [
    !d.ativo && 'Oculto: a cliente não encontra este produto na loja.',
    d.imagens.length === 0 ? 'Sem fotos: aparece “Sem foto” na vitrine.' : d.imagens.length < 3 ? 'Ideal: 3+ fotos (frente, costas, detalhe).' : null,
    d.descricao.length > 0 && d.descricao.length < 40 && 'Descrição curta: fale de caimento e tecido.',
    p && p.variantes.length === 0 && 'Sem tamanhos: a peça aparece esgotada até você adicionar tamanhos e estoque.',
    p && p.variantes.length > 0 && p.variantes.every(v => v.estoque === 0) && 'Estoque zerado em todos os tamanhos: aparece como esgotado.',
    !p && 'Tamanhos e estoque entram depois de cadastrar.',
  ].filter(Boolean) as string[];
  const criterios = [d.referencia.length >= 2, d.nome.length >= 3, !!d.marcaId, !!d.categoriaId, !!d.genero, okVenda, d.imagens.length > 0, d.imagens.length >= 3, d.descricao.length >= 40, !!d.cor, !!d.composicao, d.destaques.length > 0, d.videos.length > 0];
  const nota = Math.round((criterios.filter(Boolean).length / criterios.length) * 100);

  return (
    <PainelLayout titulo={p ? p.nome : 'Novo produto'}>
      <Head title={p ? p.nome : 'Novo produto'} />
      <Link href="/painel/produtos" variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Produtos</Link>
      <CabecalhoPagina sobre={p?.referencia ?? 'Catálogo'} titulo={p?.nome ?? 'Novo produto'} acoes={p && <>
        <Button variant="outlined" size="small" startIcon={<Image />} href={`/painel/produtos/${p.id}/midia`}>Só fotos e vídeos</Button>
        {p.ativo && <Button variant="contained" size="small" startIcon={<OpenInNew />} href={`/produto/${p.referencia}`} target="_blank">Ver na loja</Button>}
      </>}>
        {p && <Stack direction="row" component="span" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.ativo ? <Etiqueta cor="oliva">Ativo</Etiqueta> : <Etiqueta cor="cinza">Oculto</Etiqueta>}{p.imperdivel && <Etiqueta cor="vermelho">Imperdível</Etiqueta>}
          {p.atualizadoEm && <Typography component="span" variant="caption">Atualizado em {formatarDataHora(p.atualizadoEm)}</Typography>}
        </Stack>}
      </CabecalhoPagina>
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      {(flash.erro || erros.erro) && <Alert severity="error" sx={{ mb: 2 }}>{flash.erro ?? erros.erro}</Alert>}

      <Box component="form" noValidate onSubmit={e => { e.preventDefault(); salvar(); }} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 300px' }, gap: 2.5, alignItems: 'start', pb: 10 }}>
        <Stack sx={{ gap: 2, minWidth: 0 }}>
          <Secao numero={1} icone={<LocalOffer fontSize="small" />} titulo="Identificação" descricao="Código, nome, marca e categoria.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 2fr' }, gap: 2 }}>
              {campo('referencia', 'Referência', { required: true, placeholder: 'SC431GSI', slotProps: { htmlInput: { maxLength: 20, style: { fontFamily: 'monospace', letterSpacing: 1 } } } })}
              {campo('nome', 'Nome na loja', { required: true, placeholder: 'Ex.: Camiseta Gola V - Off White', ajuda: 'Termine com “ - Cor” para juntar as cores do mesmo modelo.', slotProps: { htmlInput: { maxLength: 160 } } })}
              <TextField select required label="Marca" value={d.marcaId} onChange={e => form.setData('marcaId', e.target.value)} error={!!erros.marcaId} helperText={erros.marcaId}>
                {marcas.map(m => <MenuItem key={m.id} value={String(m.id)}>{m.nome}</MenuItem>)}
              </TextField>
              <Stack sx={{ gap: 2 }}>
                <TextField select required label="Categoria" value={d.categoriaId} onChange={e => form.setData('categoriaId', e.target.value)} error={!!erros.categoriaId} helperText={erros.categoriaId}>
                  {categorias.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.nome}</MenuItem>)}
                  <MenuItem value="nova">+ Nova categoria…</MenuItem>
                </TextField>
                {d.categoriaId === 'nova' && campo('novaCategoria', 'Nova categoria', { required: true, placeholder: 'Ex.: Macacões', autoFocus: true })}
              </Stack>
              {campo('subcategoria', 'Modelagem', { placeholder: 'Slim, Oversized…' })}
            </Box>
          </Secao>

          <Secao numero={2} icone={<Image fontSize="small" />} titulo="Fotos e vídeos" descricao="A primeira foto é a capa; os vídeos entram depois dela.">
            <Stack sx={{ gap: 3 }}>
              <FotosProduto referencia={d.referencia.trim()} valor={d.imagens} mudar={v => form.setData('imagens', v)} />
              {erros.imagens && <Alert severity="error">{erros.imagens}</Alert>}
              <VideosProduto referencia={d.referencia.trim()} valor={d.videos} mudar={v => form.setData('videos', v)} />
              {erros.videos && <Alert severity="error">{erros.videos}</Alert>}
            </Stack>
          </Secao>

          <Secao numero={3} icone={<Paid fontSize="small" />} titulo="Preço" descricao="Preço cheio maior que o de venda vira promoção.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: 'repeat(3, 1fr)' }, gap: 2 }}>
              {dinheiro('preco', 'Preço de venda *')}
              {dinheiro('precoCheio', 'Preço cheio (de)', desconto > 0 ? <Chip size="small" color="imperdivel" label={`−${desconto}%`} /> : undefined)}
              {dinheiro('custo', 'Custo · só gestor')}
            </Box>
            {okVenda && Number.isFinite(cheio) && cheio < venda && <Alert severity="error" sx={{ mt: 1.5 }}>O preço cheio está menor que o de venda. Aumente o preço cheio ou deixe em branco.</Alert>}
            <Paper variant="outlined" sx={{ mt: 1.5, px: 2, py: 1.25, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', bgcolor: 'background.default' }} aria-live="polite">
              <span><Typography component="span" variant="caption" color="text.secondary">Na loja </Typography>{okVenda ? <><Box component="strong" sx={{ color: desconto ? 'imperdivel.main' : 'text.primary' }}>{brl(venda)}</Box>{desconto > 0 && <Box component="s" sx={{ ml: 0.5, fontSize: 12, color: 'text.secondary' }}>{brl(cheio)}</Box>}</> : '—'}</span>
              <span><Typography component="span" variant="caption" color="text.secondary">Lucro </Typography><Box component="strong" sx={{ color: corMargem }}>{Number.isFinite(lucro) ? brl(lucro) : '—'}</Box></span>
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}><Typography variant="caption" color="text.secondary">Margem</Typography><Box component="strong" sx={{ color: corMargem }}>{Number.isFinite(margem) ? `${Math.round(margem)}%` : '—'}</Box>
                {Number.isFinite(margem) && <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, margem))} sx={{ width: 64, height: 6, borderRadius: 1 }} />}</Stack>
            </Paper>
            {Number.isFinite(margem) && margem < 0 && <Typography variant="body2" color="error" sx={{ mt: 1 }}>Vendendo abaixo do custo: prejuízo de {brl(-lucro)} por peça.</Typography>}
          </Secao>

          <Secao numero={4} icone={<Checkroom fontSize="small" />} titulo="Detalhes" descricao="Filtros da vitrine e texto da página da peça.">
            <Stack sx={{ gap: 2.5 }}>
              <Stack direction="row" sx={{ gap: 4, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="overline" color={erros.genero ? 'error' : 'text.secondary'} sx={{ display: 'block' }}>Gênero *</Typography>
                  <ToggleButtonGroup exclusive size="small" value={d.genero} onChange={(_, v) => v && form.setData('genero', v)}>
                    <ToggleButton value="feminino">Feminino</ToggleButton><ToggleButton value="masculino">Masculino</ToggleButton><ToggleButton value="unissex">Unissex</ToggleButton>
                  </ToggleButtonGroup>
                  {erros.genero && <Typography variant="caption" color="error" sx={{ display: 'block' }}>{erros.genero}</Typography>}
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>Estação</Typography>
                  <ToggleButtonGroup exclusive size="small" value={d.estacao} onChange={(_, v) => v != null && form.setData('estacao', v)}>
                    <ToggleButton value="">Todas</ToggleButton><ToggleButton value="inverno">Inverno</ToggleButton><ToggleButton value="verao">Verão</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <TextField label="Cor" value={d.cor} onChange={e => form.setData('cor', e.target.value)} placeholder="Ex.: Azul Marinho" slotProps={{ htmlInput: { maxLength: 60 } }} />
                  <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 1 }}>{CORES.map(c => <Chip key={c} size="small" label={c} onClick={() => form.setData('cor', c)} color={d.cor.toLowerCase() === c.toLowerCase() ? 'primary' : 'default'} variant="outlined" />)}</Stack>
                </Box>
                {campo('composicao', 'Composição', { placeholder: 'Ex.: 95% algodão, 5% elastano', slotProps: { htmlInput: { maxLength: 500 } } })}
              </Box>
              {campo('descricao', 'Descrição', { multiline: true, minRows: 4, placeholder: 'Caimento, tecido, como usar e com o que combinar…', slotProps: { htmlInput: { maxLength: 4000 } } })}
              <Box>
                <TextField label="Destaques" value={destaque} onChange={e => setDestaque(e.target.value)} placeholder={d.destaques.length ? 'Mais um…' : 'Digite e tecle Enter (até 10)'}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); incluirDestaque(destaque); } }} onBlur={() => destaque && incluirDestaque(destaque)} />
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {d.destaques.map((t, i) => <Chip key={t} label={t} onDelete={() => form.setData('destaques', d.destaques.filter((_, k) => k !== i))} />)}
                  {SUGESTOES.filter(s => !d.destaques.some(x => x.toLowerCase() === s.toLowerCase())).slice(0, 4).map(s => <Chip key={s} variant="outlined" label={`+ ${s}`} onClick={() => incluirDestaque(s)} sx={{ borderStyle: 'dashed' }} />)}
                </Stack>
              </Box>
            </Stack>
          </Secao>
        </Stack>

        <Stack sx={{ gap: 2, position: { lg: 'sticky' }, top: { lg: 80 } }}>
          <Card><CardContent sx={{ py: 1 }}>
            <FormControlLabel sx={{ display: 'flex', justifyContent: 'space-between', ml: 0 }} labelPlacement="start" control={<Switch color="success" checked={d.ativo} onChange={e => form.setData('ativo', e.target.checked)} />} label={<Box><Typography variant="body2" sx={{ fontWeight: 600 }}>Ativo no catálogo</Typography><Typography variant="caption" color="text.secondary">Desligado, some da loja.</Typography></Box>} />
            <FormControlLabel sx={{ display: 'flex', justifyContent: 'space-between', ml: 0 }} labelPlacement="start" control={<Switch color="error" checked={d.imperdivel} onChange={e => form.setData('imperdivel', e.target.checked)} />} label={<Box><Typography variant="body2" sx={{ fontWeight: 600 }}>Imperdível</Typography><Typography variant="caption" color="text.secondary">Selo vermelho de destaque.</Typography></Box>} />
          </CardContent></Card>
          <Card><CardContent>
            <Stack direction="row" sx={{ gap: 1.5 }}>
              <Foto src={d.imagens[0]} largura={96} sx={{ opacity: d.ativo ? 1 : 0.6 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">{marcas.find(m => String(m.id) === d.marcaId)?.nome ?? 'Marca'}</Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{d.nome || 'Nome da peça'}</Typography>
                <Typography sx={{ fontWeight: 800, color: desconto ? 'imperdivel.main' : 'text.primary' }}>{okVenda ? brl(venda) : 'R$ —'}</Typography>
                {desconto > 0 && <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through' }}>{brl(cheio)}</Typography>}
              </Box>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Qualidade do cadastro · {nota}%</Typography>
            <LinearProgress variant="determinate" value={nota} color={nota >= 85 ? 'success' : nota >= 55 ? 'secondary' : 'error'} sx={{ height: 6, borderRadius: 1 }} />
          </CardContent></Card>
          {avisos.map(a => <Alert key={a} severity="info" variant="outlined">{a}</Alert>)}
        </Stack>

        <Paper elevation={6} sx={{ position: 'fixed', bottom: 16, left: { xs: 16, md: 'auto' }, right: 16, zIndex: 10, px: 2, py: 1.25, display: 'flex', gap: 1.5, alignItems: 'center', borderRadius: 3 }}>
          {form.isDirty && <Typography variant="caption" color="secondary">Alterações não salvas</Typography>}
          <Button type="submit" variant="contained" loading={form.processing}>{p ? 'Salvar produto' : 'Cadastrar produto'}</Button>
        </Paper>
      </Box>

      {p && <EstoqueDoProduto produto={p} movimentos={movimentos} />}
    </PainelLayout>
  );
}

/** Tamanhos, estoque, histórico e exclusão (só na edição). */
function EstoqueDoProduto({ produto: p, movimentos }: { produto: Produto; movimentos: NonNullable<Props['movimentos']> }) {
  const mov = useForm({ varianteId: '', tipo: 'entrada', quantidade: '', observacao: '' });
  const tam = useForm({ tamanho: '', estoque: '0', codigoInterno: '', ean: '' });
  const em = mov.errors as Record<string, string>;
  const et = tam.errors as Record<string, string>;
  const total = p.variantes.reduce((a, v) => a + v.estoque, 0);
  const maior = Math.max(1, ...p.variantes.map(v => v.estoque));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 340px' }, gap: 2.5, alignItems: 'start', mt: 2 }}>
      <Card id="estoque">
        <CardHeader avatar={<Straighten color="secondary" />} title="Tamanhos e estoque" subheader={`${total} em estoque · toda entrada e contagem fica no histórico`} slotProps={{ title: { variant: 'subtitle1', sx: { fontWeight: 700 } } }} sx={{ borderBottom: 1, borderColor: 'divider' }} />
        <CardContent>
          {p.variantes.length === 0 ? <Box sx={{ border: 1, borderStyle: 'dashed', borderColor: 'marca.borda-forte', borderRadius: 2, p: 2, textAlign: 'center', color: 'text.secondary', mb: 2 }}>Nenhum tamanho cadastrado. Comece pelos atalhos abaixo.</Box> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1, mb: 2 }}>
              {p.variantes.map(v => {
                const cor = v.estoque === 0 ? 'error.main' : v.estoque <= 2 ? 'secondary.main' : 'success.main';
                return (
                  <Paper key={v.id} variant="outlined" sx={{ p: 1.25, bgcolor: 'background.default' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Chip size="small" label={v.tamanho} sx={{ fontWeight: 800 }} />
                      {v.pedidos === 0 && v.reservado === 0 && <Button size="small" color="error" sx={{ minWidth: 0, p: 0.5 }} aria-label={`Remover o tamanho ${v.tamanho}`}
                        onClick={() => confirm(`Remover o tamanho ${v.tamanho}?`) && router.delete(`/painel/produtos/${p.id}/variantes/${v.id}`, { preserveScroll: true })}><DeleteOutlined fontSize="small" /></Button>}
                    </Stack>
                    <Typography sx={{ fontWeight: 800, fontSize: 18, color: cor }}>{v.estoque} <Typography component="span" variant="caption" color="text.secondary">{v.estoque === 1 ? 'peça' : 'peças'}{v.reservado ? ` · ${v.reservado} reserv.` : ''}</Typography></Typography>
                    <LinearProgress variant="determinate" value={(v.estoque / maior) * 100} sx={{ height: 5, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: cor } }} />
                    <Typography variant="caption" color="text.secondary" noWrap title={v.ean ? `EAN ${v.ean}` : undefined}>Cód. {v.codigoInterno ?? '—'}</Typography>
                  </Paper>
                );
              })}
            </Box>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 1fr' }, gap: 1.5 }}>
            {p.variantes.length > 0 && (
              <Paper variant="outlined" component="form" onSubmit={e => { e.preventDefault(); mov.post(`/painel/produtos/${p.id}/estoque`, { preserveScroll: true, onSuccess: () => mov.reset() }); }} sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="overline" color="secondary" sx={{ gridColumn: '1 / -1' }}>Movimentar estoque</Typography>
                <TextField select label="Tamanho" value={mov.data.varianteId} onChange={e => mov.setData('varianteId', e.target.value)} error={!!em.varianteId} helperText={em.varianteId}>
                  {p.variantes.map(v => <MenuItem key={v.id} value={String(v.id)}>{v.tamanho} ({v.estoque})</MenuItem>)}
                </TextField>
                <TextField select label="Tipo" value={mov.data.tipo} onChange={e => mov.setData('tipo', e.target.value)}>
                  <MenuItem value="entrada">Entrada (somar)</MenuItem><MenuItem value="ajuste">Ajuste (quantidade contada)</MenuItem>
                </TextField>
                <TextField label="Quantidade" type="number" value={mov.data.quantidade} onChange={e => mov.setData('quantidade', e.target.value)} error={!!em.quantidade} helperText={em.quantidade} />
                <TextField label="Observação" placeholder="Nota fiscal, contagem…" value={mov.data.observacao} onChange={e => mov.setData('observacao', e.target.value)} />
                {em.erro && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{em.erro}</Alert>}
                <Box><Button type="submit" variant="contained" size="small" loading={mov.processing}>Registrar</Button></Box>
              </Paper>
            )}
            <Paper variant="outlined" component="form" onSubmit={e => { e.preventDefault(); tam.post(`/painel/produtos/${p.id}/variantes`, { preserveScroll: true, onSuccess: () => tam.reset() }); }} sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, bgcolor: 'background.default' }}>
              <Typography variant="overline" color="secondary" sx={{ gridColumn: '1 / -1' }}>Adicionar tamanho</Typography>
              <Stack sx={{ gridColumn: '1 / -1', gap: 0.5 }}>{TAMANHOS_RAPIDOS.map((g, i) => (
                <Stack key={i} direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>{g.filter(t => !p.variantes.some(v => v.tamanho === t)).map(t => <Chip key={t} size="small" label={t} onClick={() => tam.setData('tamanho', t)} color={tam.data.tamanho === t ? 'primary' : 'default'} variant="outlined" />)}</Stack>
              ))}</Stack>
              <TextField label="Tamanho" placeholder="M" value={tam.data.tamanho} onChange={e => tam.setData('tamanho', e.target.value.toUpperCase())} error={!!et.tamanho} helperText={et.tamanho} />
              <TextField label="Estoque inicial" type="number" value={tam.data.estoque} onChange={e => tam.setData('estoque', e.target.value)} error={!!et.estoque} helperText={et.estoque} />
              <TextField label="Código interno" value={tam.data.codigoInterno} onChange={e => tam.setData('codigoInterno', e.target.value)} error={!!et.codigoInterno} helperText={et.codigoInterno} />
              <TextField label="EAN" placeholder="Só números" value={tam.data.ean} onChange={e => tam.setData('ean', e.target.value)} error={!!et.ean} helperText={et.ean} />
              <Box><Button type="submit" variant="outlined" size="small" loading={tam.processing}>Adicionar</Button></Box>
            </Paper>
          </Box>
        </CardContent>
      </Card>
      <Stack sx={{ gap: 2 }}>
        <Card><CardContent>
          <Typography variant="h6" sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}><History color="secondary" />Histórico de estoque</Typography>
          {movimentos.length === 0 ? <Typography variant="body2" color="text.secondary">Sem movimentações.</Typography> : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ maxHeight: 260, overflowY: 'auto' }}>
              {movimentos.map(m => (
                <Stack key={m.id} direction="row" sx={{ py: 1, justifyContent: 'space-between', gap: 1.5, fontSize: 14 }}>
                  <Stack direction="row" sx={{ gap: 1 }}>
                    <Chip size="small" label={`${m.delta > 0 ? '+' : ''}${m.delta}`} color={m.delta > 0 ? 'success' : 'error'} variant="outlined" />
                    <span>Tam. {m.tamanho} · {MOTIVOS[m.motivo]}{m.observacao && <Box component="span" sx={{ color: 'text.secondary' }}> · {m.observacao}</Box>}</span>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatarDataHora(m.criadoEm)}{m.usuario && <><br />{m.usuario.split(' ')[0]}</>}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent></Card>
        <Card sx={{ borderColor: 'error.light' }}><CardContent>
          <Typography variant="h6" color="error" sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}><DeleteOutlined />Excluir produto</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Apaga fotos, tamanhos, custo e histórico. Se já entrou em pedido, não dá: desligue &quot;Ativo no catálogo&quot;.</Typography>
          <Button variant="outlined" color="error" size="small" onClick={() => confirm(`Excluir ${p.referencia} definitivamente? Não dá para desfazer.`) && router.delete(`/painel/produtos/${p.id}`)}>Excluir produto</Button>
        </CardContent></Card>
      </Stack>
    </Box>
  );
}
