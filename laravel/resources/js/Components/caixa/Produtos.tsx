import { useState, type ReactNode } from 'react';
import { Badge, Box, Button, Chip, MenuItem, Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { FotoCheia } from '@/Components/loja/Vitrine';
import { FILTROS_CAIXA, filtrarCaixa, linhasDeCor, type FiltrosCaixa, type ModeloCaixa, type ProdutoCaixa, type VarianteCaixa } from '@/lib/caixa';
import { corClara, tomDaCor } from '@/lib/cores';
import { brl, descontoPct } from '@/lib/dinheiro';

type Contagens = ReturnType<typeof filtrarCaixa>['contagens'];
const opcao = (ativo: boolean, destaque = false) => ({
  height: 36, borderRadius: 2, fontWeight: 500, border: 1, borderColor: ativo ? 'marca.marrom-950' : 'marca.borda-forte',
  bgcolor: ativo ? 'marca.marrom-950' : 'background.paper', color: ativo ? 'marca.creme' : destaque ? 'imperdivel.main' : 'marca.marrom-900',
  '&:hover': { borderColor: 'marca.marrom-950', bgcolor: ativo ? 'marca.marrom-950' : 'background.paper' },
});

function Bolinha({ cor, tamanho = 14 }: { cor: string | null; tamanho?: number }) {
  const tom = tomDaCor(cor);
  return <Box aria-hidden sx={{ width: tamanho, height: tamanho, flexShrink: 0, borderRadius: '50%', background: tom === 'estampa' ? 'conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#c0312b)' : tom ?? undefined, bgcolor: tom ? undefined : 'marca.bege', border: !tom || corClara(tom) ? 1 : 0, borderColor: 'marca.borda-forte' }} />;
}

/** Filtros do caixa (porta de src/components/caixa/produtos.tsx): gênero, categoria e tamanho à vista; o resto em "Mais filtros". */
export function FiltrosDoCaixa({ f, c, mudar }: { f: FiltrosCaixa; c: Contagens; mudar: (m: Partial<FiltrosCaixa>) => void }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const extras = [f.cor, f.preco, f.promo, !f.disponivel].filter(Boolean).length;
  const generos = [{ valor: 'feminino', rotulo: 'Feminino' }, { valor: 'masculino', rotulo: 'Masculino' }, { valor: 'unissex', rotulo: 'Unissex' }].map(g => ({ ...g, n: c.generos.find(x => x.valor === g.valor)?.n ?? 0 }));
  type Ativo = { rotulo: string; tirar: Partial<FiltrosCaixa> };
  const ativos = ([
    f.genero && { rotulo: generos.find(g => g.valor === f.genero)?.rotulo ?? f.genero, tirar: { genero: null } },
    f.categoria && { rotulo: c.categorias.find(x => x.valor === f.categoria)?.rotulo ?? f.categoria, tirar: { categoria: null } },
    f.tamanho && { rotulo: `Tam. ${f.tamanho}`, tirar: { tamanho: null } },
    f.cor && { rotulo: f.cor, tirar: { cor: null } },
    f.preco && { rotulo: c.precos.find(p => p.valor === f.preco)?.rotulo ?? f.preco, tirar: { preco: null } },
    f.promo && { rotulo: 'Promoção', tirar: { promo: false } },
    !f.disponivel && { rotulo: 'Com esgotadas', tirar: { disponivel: true } },
  ] as (Ativo | false | null | '')[]).filter((x): x is Ativo => !!x);
  const lista = (rotulo: string, valor: string | null, opcoes: { valor: string; rotulo: string; n: number }[], todas: string, campo: 'categoria' | 'tamanho') => (
    <TextField select size="small" value={valor ?? ''} onChange={e => mudar({ [campo]: e.target.value || null })} slotProps={{ htmlInput: { 'aria-label': rotulo }, select: { displayEmpty: true } }} sx={{ width: 220, bgcolor: 'background.paper', '& fieldset': valor ? { borderColor: 'marca.marrom-950' } : {} }}>
      <MenuItem value="">{todas}</MenuItem>
      {opcoes.map(o => <MenuItem key={o.valor} value={o.valor}>{o.rotulo} ({o.n})</MenuItem>)}
    </TextField>
  );
  return (
    <Stack spacing={1}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={f.genero} onChange={(_, v) => mudar({ genero: v })} aria-label="Gênero" sx={{ bgcolor: 'background.paper', '& .MuiToggleButton-root': { textTransform: 'none', px: 1.75, height: 40 }, '& .Mui-selected': { bgcolor: 'marca.marrom-950 !important', color: 'marca.creme !important' } }}>
          {generos.map(g => <ToggleButton key={g.valor} value={g.valor}>{g.rotulo}&nbsp;<Box component="span" sx={{ fontSize: 12, opacity: 0.7 }}>{g.n}</Box></ToggleButton>)}
        </ToggleButtonGroup>
        {lista('Categoria', f.categoria, c.categorias, 'Todas as categorias', 'categoria')}
        {lista('Tamanho', f.tamanho, c.tamanhos.map(t => ({ ...t, rotulo: `Tam. ${t.rotulo}` })), 'Todos os tamanhos', 'tamanho')}
        <Button variant="outlined" onClick={e => setAncora(e.currentTarget)} endIcon={<ExpandMore />} sx={{ height: 40, bgcolor: 'background.paper', borderColor: extras ? 'marca.marrom-950' : 'marca.borda-forte', color: 'marca.marrom-950' }}>
          Mais filtros{extras > 0 && <Badge badgeContent={extras} color="secondary" sx={{ ml: 2 }} />}
        </Button>
        <Popover open={!!ancora} anchorEl={ancora} onClose={() => setAncora(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { width: 'min(92vw, 26rem)', p: 2, mt: 1 } } }}>
          <Stack spacing={2}>
            <Bloco titulo="Cor">{c.cores.map(x => <Button key={x.valor} size="small" startIcon={<Bolinha cor={x.valor} />} onClick={() => mudar({ cor: f.cor === x.valor ? null : x.valor })} aria-pressed={f.cor === x.valor} sx={opcao(f.cor === x.valor)}>{x.valor}&nbsp;<Box component="span" sx={{ fontSize: 12, opacity: 0.7 }}>{x.n}</Box></Button>)}</Bloco>
            <Bloco titulo="Preço">{c.precos.map(p => <Button key={p.valor} size="small" onClick={() => mudar({ preco: f.preco === p.valor ? null : p.valor as FiltrosCaixa['preco'] })} sx={opcao(f.preco === p.valor)}>{p.rotulo}&nbsp;<Box component="span" sx={{ fontSize: 12, opacity: 0.7 }}>{p.n}</Box></Button>)}</Bloco>
            <Bloco titulo="Mostrar">
              <Button size="small" onClick={() => mudar({ promo: !f.promo })} sx={opcao(f.promo, true)}>Só promoção&nbsp;<Box component="span" sx={{ fontSize: 12, opacity: 0.7 }}>{c.promo}</Box></Button>
              <Button size="small" onClick={() => mudar({ disponivel: !f.disponivel })} sx={opcao(!f.disponivel)}>Incluir esgotadas</Button>
            </Bloco>
            <Stack direction="row" sx={{ justifyContent: 'space-between', borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Button size="small" onClick={() => mudar({ cor: null, preco: null, promo: false, disponivel: true })} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Limpar estes</Button>
              <Button size="small" variant="contained" onClick={() => setAncora(null)}>Pronto</Button>
            </Stack>
          </Stack>
        </Popover>
      </Stack>
      {ativos.length > 0 && (
        <Stack direction="row" useFlexGap aria-label="Filtros escolhidos" sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {ativos.map(a => <Chip key={a.rotulo} size="small" label={a.rotulo} onDelete={() => mudar(a.tirar)} sx={{ bgcolor: 'marca.bege' }} />)}
          {ativos.length > 1 && <Button size="small" onClick={() => mudar({ ...FILTROS_CAIXA, q: f.q })} sx={{ color: 'secondary.main', textDecoration: 'underline' }}>Limpar tudo</Button>}
        </Stack>
      )}
    </Stack>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary' }}>{titulo}</Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>{children}</Stack>
    </Stack>
  );
}

function Preco({ p }: { p: ProdutoCaixa }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  return (
    <Box sx={{ flexShrink: 0, textAlign: 'right', lineHeight: 1.2 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 14, color: desconto ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(p.preco)}</Typography>
      {desconto > 0 && <Typography sx={{ fontSize: '0.65rem', color: 'imperdivel.main' }}>−{desconto}%</Typography>}
    </Box>
  );
}

/** Card do caixa: um por modelo, uma linha por cor com os tamanhos (como a grade da arara). O número miúdo é quanto resta. */
export function CardCaixa({ m, naVenda, adicionar }: { m: ModeloCaixa; naVenda: Map<number, number>; adicionar: (p: ProdutoCaixa, v: VarianteCaixa) => void }) {
  const [foco, setFoco] = useState(0);
  const linhas = linhasDeCor(m);
  const atual = linhas[foco]?.p ?? m.cores[0];
  const unico = new Set(m.cores.map(c => c.preco)).size === 1;
  const total = m.cores.reduce((a, c) => a + c.variantes.reduce((b, v) => b + v.disponivel, 0), 0);
  return (
    <Box component="article" sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2, p: 1, display: 'flex', gap: 1.5, opacity: total ? 1 : 0.6 }}>
      <Box sx={{ position: 'relative', flexShrink: 0, width: 56, height: 70, bgcolor: '#efebe5', overflow: 'hidden', borderRadius: 1 }}><FotoCheia src={atual.imagem} /></Box>
      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Typography title={m.nome} sx={{ minWidth: 0, flex: 1, fontSize: '0.8rem', lineHeight: 1.35, color: 'marca.marrom-950', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.nome}</Typography>
          {unico && <Preco p={m.cores[0]} />}
        </Stack>
        {linhas.map((l, i) => (
          <Stack key={l.chave} direction="row" spacing={1} onMouseEnter={() => setFoco(i)} sx={{ alignItems: 'center', borderTop: 1, borderColor: 'divider', pt: 0.75 }}>
            <Stack direction="row" spacing={0.75} title={l.cor ?? 'Cor única'} sx={{ width: 96, flexShrink: 0, alignItems: 'center', fontSize: 12 }}><Bolinha cor={l.cor} /><Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.cor ?? 'Única'}</Box></Stack>
            <Stack direction="row" useFlexGap sx={{ minWidth: 0, flex: 1, flexWrap: 'wrap', gap: 0.75 }}>
              {l.tamanhos.map(t => {
                const ja = t.opcoes.reduce((a, o) => a + (naVenda.get(o.v.id) ?? 0), 0);
                const livre = t.opcoes.reduce((a, o) => a + o.v.disponivel, 0) - ja;
                // Mesma cor e tamanho em duas referências: sai da que tem mais peças livres.
                const escolha = [...t.opcoes].sort((a, b) => (b.v.disponivel - (naVenda.get(b.v.id) ?? 0)) - (a.v.disponivel - (naVenda.get(a.v.id) ?? 0)))[0];
                const codigos = t.opcoes.map(o => o.v.codigoInterno ?? '—').join(', ');
                return (
                  <Button key={t.tamanho} variant="outlined" disabled={livre <= 0} onClick={() => adicionar(escolha.p, escolha.v)} onFocus={() => setFoco(i)}
                    title={`${l.cor ?? ''} ${t.tamanho} · Cód. ${codigos} · ${livre + ja} em estoque${ja ? ` · ${ja} na venda` : ''}`} aria-label={`${l.cor ?? ''} tamanho ${t.tamanho}, ${Math.max(0, livre)} em estoque`}
                    sx={{ minWidth: 40, height: 40, px: 1, gap: 0.5, borderRadius: 1.5, fontWeight: 700, borderColor: ja ? 'success.main' : 'marca.borda-forte', bgcolor: ja ? 'rgba(94,107,67,.1)' : 'transparent', color: ja ? 'success.main' : 'marca.marrom-950', ...(livre <= 0 ? { textDecoration: 'line-through' } : {}), '&:hover': { bgcolor: 'marca.marrom-950', color: 'marca.creme' } }}>
                    {t.tamanho}{livre > 0 && <Box component="span" sx={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 400 }}>{livre}</Box>}
                  </Button>
                );
              })}
            </Stack>
            {!unico && <Preco p={l.p} />}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
