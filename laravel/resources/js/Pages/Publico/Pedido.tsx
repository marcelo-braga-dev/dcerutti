import { useEffect, useState } from 'react';
import { Head } from '@inertiajs/react';
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { PublicoLayout } from '@/Components/publico/Comum';
import { FotoCheia, estiloRotulo, estiloTitulo } from '@/Components/loja/Vitrine';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Item = { id: number; nome: string; marca: string; referencia: string; cor: string | null; tamanho: string; codigoInterno: string | null; quantidade: number; preco: number; imagem: string | null; situacao: string };
type P = {
  codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; criadoEm: string; itens: Item[]; pecas: number; subtotal: number;
  desconto: number; cupom: string | null; freteCupom: boolean; frete: number | null; total: number;
};

const cartao = { bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6 } as const;
const selo = (bg: string, t: string) => <Box component="span" sx={{ height: 28, px: 1.5, borderRadius: 99, bgcolor: bg, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center' }}>{t}</Box>;

/** Página pública do pedido (porta de app/p/[chave]/page.tsx): o link da mensagem do WhatsApp, para separar as peças. */
export default function PedidoPublico({ p }: { p: P }) {
  const cond = p.tipo === 'condicional';
  return (
    <PublicoLayout largura="md" logoHref="/" acao={<Button href={`/painel/pedidos?q=${encodeURIComponent(p.codigo)}`} variant="contained" sx={{ borderRadius: 99 }}>Abrir no painel</Button>}>
      <Head title={`${cond ? 'Condicional' : 'Pedido'} ${p.codigo}`} />
      <Box component="header" sx={{ borderRadius: 8, bgcolor: 'marca.marrom-950', color: 'marca.creme', p: { xs: 2.5, sm: 3.5 }, display: 'grid', gap: 1 }}>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          {selo('rgba(246,242,236,.15)', cond ? 'Condicional' : 'Pedido')}
          {p.status === 'pendente' && selo('secondary.main', 'Em aberto')}
          {p.status === 'confirmado' && selo('marca.oliva', 'Confirmado')}
          {p.status === 'cancelado' && selo('rgba(246,242,236,.15)', 'Cancelado')}
        </Stack>
        <Typography component="h1" sx={{ ...estiloTitulo, color: 'marca.creme', fontSize: { xs: '2.25rem', sm: '3rem' } }}>{p.codigo}</Typography>
        <Typography sx={{ color: 'marca.areia' }}>{p.pecas} {p.pecas === 1 ? 'peça' : 'peças'} · {brl(p.total)}{!cond && p.frete == null ? ' + frete' : ''} · feito em {formatarDataHora(p.criadoEm)}</Typography>
      </Box>

      <Separacao codigo={p.codigo} itens={p.itens} separavel={p.status !== 'cancelado'} />

      <Box component="section" sx={{ ...cartao, p: { xs: 2.5, sm: 3 }, display: 'grid', gap: 1, fontSize: 14 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>Peças</span><span>{brl(p.subtotal)}</span></Stack>
        {p.cupom && p.desconto > 0 && <Stack direction="row" sx={{ justifyContent: 'space-between', color: 'marca.oliva' }}><span>Cupom {p.cupom}</span><span>−{brl(p.desconto)}</span></Stack>}
        {!cond && <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>Frete</span><span>{p.frete == null ? 'A combinar' : p.frete === 0 ? `Grátis${p.freteCupom && p.cupom ? ` (cupom ${p.cupom})` : ''}` : brl(p.frete)}</span></Stack>}
        <Stack direction="row" sx={{ justifyContent: 'space-between', borderTop: 1, borderColor: 'marca.borda', pt: 1.5, mt: 0.5, fontWeight: 800, fontSize: 18 }}>
          <span>{cond ? 'Valor das peças' : 'Total'}</span>
          <span>{brl(p.total)}{!cond && p.frete == null && <Box component="span" sx={{ fontSize: 14, fontWeight: 400 }}> + frete</Box>}</span>
        </Stack>
        <Typography variant="body2" color="text.secondary">{cond ? 'Condicional: a cliente prova em casa e paga só o que ficar.' : 'Pagamento e entrega combinados pelo WhatsApp.'}</Typography>
      </Box>
    </PublicoLayout>
  );
}

const chave = (codigo: string) => `dcerutti-separacao-${codigo}`;
function lerMarcadas(codigo: string): number[] {
  try { const v = JSON.parse(localStorage.getItem(chave(codigo)) ?? '[]'); return Array.isArray(v) ? v.filter(n => typeof n === 'number') : []; } catch { return []; }
}

/** Lista de separação: peças grandes com tamanho, referência e código; tocar marca como separada (lembrado no aparelho). */
function Separacao({ codigo, itens, separavel }: { codigo: string; itens: Item[]; separavel: boolean }) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { setMarcadas(lerMarcadas(codigo)); }, [codigo]);
  const ativos = itens.filter(i => i.situacao !== 'devolvido');
  const pecas = ativos.reduce((a, i) => a + i.quantidade, 0);
  const feitas = ativos.filter(i => marcadas.includes(i.id)).reduce((a, i) => a + i.quantidade, 0);
  const alternar = (id: number) => setMarcadas(m => {
    const n = m.includes(id) ? m.filter(x => x !== id) : [...m, id];
    try { localStorage.setItem(chave(codigo), JSON.stringify(n)); } catch { /* sem armazenamento */ }
    return n;
  });
  const copiar = async () => {
    const texto = [`${codigo} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'}`, ...ativos.map(i => `• ${i.quantidade}× ${i.nome}${i.cor ? ` (${i.cor})` : ''} · tam. ${i.tamanho} · Ref. ${i.referencia}${i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  };
  const chip = { height: 24, px: 1, borderRadius: 1.5, bgcolor: 'marca.creme', border: 1, borderColor: 'marca.borda', fontSize: 12, display: 'inline-flex', alignItems: 'center' } as const;

  return (
    <Box component="section" aria-label="Peças do pedido" sx={{ display: 'grid', gap: 2 }}>
      {separavel && (
        <Stack direction="row" spacing={1.5} sx={{ position: 'sticky', top: 0, zIndex: 10, py: 1.5, bgcolor: 'rgba(246,242,236,.9)', backdropFilter: 'blur(12px)', alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.75 }}>
            <Typography variant="body2"><strong>{feitas} de {pecas}</strong> <Box component="span" sx={{ color: 'text.secondary' }}>{pecas === 1 ? 'peça separada' : 'peças separadas'}</Box></Typography>
            <LinearProgress variant="determinate" color="success" value={pecas ? (feitas / pecas) * 100 : 0} sx={{ height: 6, borderRadius: 99, bgcolor: 'marca.bege' }} />
          </Box>
          <Button variant="outlined" onClick={copiar} sx={{ borderRadius: 99, flexShrink: 0 }}>{copiado ? 'Lista copiada ✓' : 'Copiar lista'}</Button>
        </Stack>
      )}
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2 }}>
        {itens.map(i => {
          const feita = marcadas.includes(i.id);
          const devolvida = i.situacao === 'devolvido';
          return (
            <Box component="li" key={i.id} sx={{ ...cartao, overflow: 'hidden', display: 'grid', gridTemplateColumns: { xs: '7.5rem 1fr', sm: '1fr' }, borderColor: feita ? 'marca.oliva' : 'marca.borda', outline: feita ? '1px solid' : 'none', outlineColor: 'marca.oliva', opacity: devolvida ? 0.5 : 1 }}>
              <Box sx={{ position: 'relative', aspectRatio: '3 / 4', bgcolor: 'marca.bege' }}>
                <FotoCheia src={i.imagem} alt={i.nome} />
                <Box sx={{ position: 'absolute', top: 8, left: 8, height: 32, minWidth: 32, px: 1.25, borderRadius: 99, bgcolor: 'marca.marrom-950', color: 'marca.creme', fontWeight: 800, fontSize: 14, display: 'grid', placeItems: 'center' }}>{i.tamanho}</Box>
                {i.quantidade > 1 && <Box sx={{ position: 'absolute', top: 8, right: 8, height: 32, px: 1.25, borderRadius: 99, bgcolor: 'marca.card', fontWeight: 700, fontSize: 14, display: 'grid', placeItems: 'center' }}>{i.quantidade}×</Box>}
              </Box>
              <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gap: 0.75, alignContent: 'start' }}>
                <Typography sx={{ ...estiloRotulo, fontSize: '0.6rem', color: 'text.secondary' }}>{i.marca}</Typography>
                <Box sx={{ lineHeight: 1.35 }}>{i.nome}</Box>
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {i.cor && <Box sx={chip}>{i.cor}</Box>}
                  <Box sx={chip}>Ref. {i.referencia}</Box>
                  {i.codigoInterno && <Box sx={chip}>Cód. {i.codigoInterno}</Box>}
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Typography variant="body2" color="text.secondary">{i.quantidade} × {brl(i.preco)}</Typography>
                  <Box sx={{ fontWeight: 800 }}>{brl(i.preco * i.quantidade)}</Box>
                </Stack>
                {devolvida && <Typography variant="body2" color="text.secondary">Devolvida</Typography>}
                {separavel && !devolvida && (
                  <Button onClick={() => alternar(i.id)} aria-pressed={feita} variant={feita ? 'contained' : 'outlined'} color={feita ? 'success' : 'primary'} sx={{ borderRadius: 99, mt: 0.5 }}>{feita ? '✓ Separada' : 'Marcar como separada'}</Button>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
