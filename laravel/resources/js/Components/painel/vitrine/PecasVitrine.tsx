import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Alert, Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward } from '@mui/icons-material';
import { Foto } from '@/Components/ui/Basicos';
import { enviarAcao } from '@/lib/acao';
import { brl } from '@/lib/dinheiro';
import { getJson } from '@/lib/http';

export type PecaVitrine = { id: number; produtoId: number; nome: string; imagem: string | null; preco: number; oferta: number | null; tamanhos: string[]; ativa: boolean };
type Achada = { id: number; nome: string; preco: number; imagem: string | null };

/** As peças da vitrine: buscar, ordenar, preço especial e tirar (porta de components/painel/vitrine-pecas.tsx). */
export function PecasVitrine({ id, pecas }: { id: string; pecas: PecaVitrine[] }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<Achada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const naVitrine = new Set(pecas.map(p => p.produtoId));

  const executar = async (fn: () => Promise<string | null>) => {
    setErro(null);
    setPendente(true);
    const r = await fn();
    setPendente(false);
    if (r) setErro(r);
  };
  const tirar = (pecaId: number) => new Promise<string | null>(resolve => {
    router.delete(`/painel/vitrines/${id}/pecas/${pecaId}`, { preserveScroll: true, onSuccess: () => resolve(null), onError: e => resolve(e.erro ?? 'Não foi possível tirar.') });
  });
  const buscar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setPendente(true);
    setAchadas(await getJson<Achada[]>(`/painel/vitrines/pecas?q=${encodeURIComponent(termo)}`).catch(() => []));
    setPendente(false);
  };

  return (
    <Stack spacing={2}>
      {erro && <Alert severity="error">{erro}</Alert>}
      {pecas.length === 0 ? (
        <Box sx={{ borderRadius: 4, border: '1px dashed', borderColor: 'marca.borda-forte', p: 3, textAlign: 'center', fontSize: 14, color: 'text.secondary' }}>Nenhuma peça ainda. Busque abaixo e adicione as peças da live ou da publicação.</Box>
      ) : (
        <Stack component="ul" spacing={1.25} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {pecas.map((p, i) => {
            const desconto = p.oferta != null && p.oferta < p.preco ? Math.round((1 - p.oferta / p.preco) * 100) : 0;
            return (
              <Box component="li" key={p.id} sx={{ display: 'grid', gridTemplateColumns: { xs: 'auto 1fr', sm: 'auto 1fr auto auto' }, alignItems: 'center', columnGap: 2, rowGap: 1.5, borderRadius: 4, border: 1, borderColor: 'marca.borda', bgcolor: 'rgba(246,239,230,.4)', p: 1.25, opacity: p.ativa ? 1 : 0.6 }}>
                <Foto src={p.imagem} largura={56} />
                <Box sx={{ minWidth: 0, fontSize: 14, display: 'grid', gap: 0.5 }}>
                  <Box sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.nome}</Box>
                  <Box sx={{ color: 'text.secondary' }}>{desconto > 0 ? <><s>{brl(p.preco)}</s> <Box component="strong" sx={{ color: 'imperdivel.main' }}>{brl(p.oferta!)}</Box> <Box component="span" sx={{ color: 'imperdivel.main', fontWeight: 600 }}>−{desconto}%</Box></> : brl(p.preco)}</Box>
                  <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {p.tamanhos.length ? p.tamanhos.map(t => <Box key={t} sx={{ height: 20, px: 0.75, borderRadius: 1, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', fontSize: 11, fontWeight: 600, display: 'grid', placeItems: 'center' }}>{t}</Box>)
                      : <Typography variant="caption" color="error">{p.ativa ? 'Sem estoque' : 'Fora do catálogo'}</Typography>}
                  </Stack>
                </Box>
                <Box component="form" key={String(p.oferta)} onSubmit={(ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const texto = String(new FormData(ev.currentTarget).get('oferta') ?? ''); executar(() => enviarAcao(`/painel/vitrines/${id}/pecas/${p.id}/oferta`, { oferta: texto })); }}
                  sx={{ gridColumn: { xs: 'span 2', sm: 'auto' }, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <TextField name="oferta" size="small" defaultValue={p.oferta == null ? '' : p.oferta.toFixed(2).replace('.', ',')} placeholder="Preço especial" slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `Preço especial de ${p.nome}` } }} sx={{ width: { xs: '100%', sm: 150 } }} />
                  <Button type="submit" variant="outlined" size="small" disabled={pendente}>Salvar</Button>
                </Box>
                <Stack direction="row" sx={{ gridColumn: { xs: 'span 2', sm: 'auto' }, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <IconButton size="small" disabled={pendente || i === 0} onClick={() => executar(() => enviarAcao(`/painel/vitrines/${id}/pecas/${p.id}/mover`, { direcao: -1 }))} aria-label={`Subir ${p.nome}`}><ArrowUpward fontSize="small" /></IconButton>
                  <IconButton size="small" disabled={pendente || i === pecas.length - 1} onClick={() => executar(() => enviarAcao(`/painel/vitrines/${id}/pecas/${p.id}/mover`, { direcao: 1 }))} aria-label={`Descer ${p.nome}`}><ArrowDownward fontSize="small" /></IconButton>
                  <Button size="small" color="error" disabled={pendente} onClick={() => executar(() => tirar(p.id))} aria-label={`Tirar ${p.nome}`}>Tirar</Button>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
      <Box sx={{ display: 'grid', gap: 1.5, borderRadius: 4, bgcolor: 'rgba(246,239,230,.6)', border: 1, borderColor: 'marca.borda', p: 1.5 }}>
        <Stack component="form" direction="row" spacing={1} onSubmit={buscar}>
          <TextField size="small" value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar peça por nome, referência ou cor" slotProps={{ htmlInput: { 'aria-label': 'Buscar peça para a vitrine' } }} sx={{ flex: 1 }} />
          <Button type="submit" variant="contained" disabled={pendente}>Buscar</Button>
        </Stack>
        {achadas && (achadas.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>Nenhuma peça com estoque encontrada.</Typography> : (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1, maxHeight: 320, overflowY: 'auto' }}>
            {achadas.map(p => (
              <Stack component="li" key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', borderRadius: 3, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', p: 1 }}>
                <Foto src={p.imagem} largura={40} />
                <Box sx={{ flex: 1, minWidth: 0, fontSize: 14 }}><Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</Box><Box sx={{ color: 'text.secondary' }}>{brl(p.preco)}</Box></Box>
                <Button size="small" variant={naVitrine.has(p.id) ? 'text' : 'outlined'} disabled={pendente || naVitrine.has(p.id)} aria-label={`Adicionar ${p.nome}`}
                  onClick={() => executar(() => enviarAcao(`/painel/vitrines/${id}/pecas`, { produtoId: p.id }))}>{naVitrine.has(p.id) ? 'Na vitrine ✓' : '+ Adicionar'}</Button>
              </Stack>
            ))}
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

/** Copia um texto: endereço da vitrine, legenda. */
export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { window.prompt('Copie:', texto); }
  };
  return <Button variant="outlined" size="small" onClick={copiar}>{copiado ? 'Copiado ✓' : rotulo}</Button>;
}
