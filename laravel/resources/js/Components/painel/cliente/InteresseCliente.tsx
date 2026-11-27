import type { ReactNode } from 'react';
import { Box, Button, Card, CardContent, Chip, LinearProgress, Link, Stack, Typography } from '@mui/material';
import { Etiqueta, Foto } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { duracaoEmPalavras, tempoDesde } from '@/lib/atividade';

type Produto = { id: number; referencia: string; nome: string; preco: number; ativo: boolean; imagem: string | null; disponivel: number };
type Ranking = { valor: string; parte: number }[];
export type Interesse = {
  resumo: { ultimoLoginEm: string | null; ultimoAcessoEm: string | null; visitas7: number; visitas30: number; paginas30: number; tempo30: number; aparelho: string | null };
  pecas: { produto: Produto; vezes: number; ultimaVez: string; tempo: number; tamanhos: string[]; naSacola: number; situacao: 'comprou' | 'pediu' | null }[];
  favoritos: { produto: Produto; criadoEm: string }[]; totalPecasVistas: number;
  sacola: { atualizadoEm: string | null; avisadoEm: string | null; total: number; linhas: { varianteId: number; quantidade: number; tamanho: string; disponivel: number; produto: Produto }[] } | null;
  preferencias: { categorias: Ranking; marcas: Ranking; tamanhos: Ranking; promocao: number | null };
  buscas: { termo: string; resultados: number | null; criadoEm: string }[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const Rotulo = ({ children }: { children: ReactNode }) => <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.6, display: 'block' }}>{children}</Typography>;

/** Ficha do cliente: acesso, peças mais vistas, sacola, preferências e buscas (docs/21; src/components/painel/interesse-cliente.tsx). */
export function InteresseCliente({ clienteId, dados: d, temAcesso }: { clienteId: string; dados: Interesse; temAcesso: boolean }) {
  const r = d.resumo;
  const semNada = !r.ultimoAcessoEm && !d.pecas.length && !d.sacola && !d.favoritos.length;
  const oferecer = (ref: string) => `/painel/pedidos/novo?cliente=${clienteId}&busca=${encodeURIComponent(ref)}`;
  return (
    <Card><CardContent sx={{ display: 'grid', gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">Interesse e acesso</Typography>
        <Link href={`/painel/clientes/${clienteId}/historico`} variant="body2" color="secondary">Histórico completo</Link>
      </Stack>
      {!temAcesso && !r.ultimoAcessoEm ? (
        <Typography variant="body2" color="text.secondary">Este cliente ainda não tem acesso à loja. Com o acesso criado, aqui aparecem as peças que ele vê e o que separa na sacola.</Typography>
      ) : semNada ? <Typography variant="body2" color="text.secondary">Ainda não há navegação registrada.</Typography> : (
        <>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, fontSize: 14 }}>
            {[
              ['Último acesso', tempoDesde(r.ultimoAcessoEm), r.ultimoAcessoEm ? formatarDataHora(r.ultimoAcessoEm) : undefined],
              ['Último login', r.ultimoLoginEm ? formatarDataHora(r.ultimoLoginEm) : '—'],
              ['Aparelho', r.aparelho ? r.aparelho.charAt(0).toUpperCase() + r.aparelho.slice(1) : '—'],
              ['Visitas', `${r.visitas7} em 7 dias · ${r.visitas30} em 30`],
              ['Páginas (30 dias)', String(r.paginas30)],
              ['Tempo na loja (30 dias)', duracaoEmPalavras(r.tempo30)],
            ].map(([rotulo, valor, titulo]) => <Box key={rotulo}><Box component="dt"><Rotulo>{rotulo}</Rotulo></Box><Box component="dd" sx={{ m: 0 }} title={titulo}>{valor}</Box></Box>)}
          </Box>
          {d.sacola && d.sacola.linhas.length > 0 && (
            <Box sx={{ bgcolor: 'marca.bege', p: 2, borderRadius: 2, display: 'grid', gap: 1.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="overline">Na sacola agora · {brl(d.sacola.total)}</Typography>
                <Typography variant="caption" color="text.secondary">Mexeu {tempoDesde(d.sacola.atualizadoEm)}{d.sacola.avisadoEm ? ' · aviso enviado' : ''}</Typography>
              </Stack>
              {d.sacola.linhas.map(l => (
                <Stack key={l.varianteId} direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                  <Foto src={l.produto.imagem} largura={36} />
                  <Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{l.quantidade}× {l.produto.nome}</Typography><Typography variant="caption" color="text.secondary">Tam. {l.tamanho} · {brl(l.produto.preco)} · {l.disponivel ? `${l.disponivel} em estoque` : 'esgotado'}</Typography></Box>
                </Stack>
              ))}
              <Box><Button size="small" variant="contained" color="success" href={oferecer(d.sacola.linhas[0].produto.referencia)}>Montar pedido</Button></Box>
            </Box>
          )}
          {d.favoritos.length > 0 && (
            <Box>
              <Typography variant="overline">Favoritos ({d.favoritos.length})</Typography>
              <Stack direction="row" sx={{ gap: 1, overflowX: 'auto', pb: 0.5 }}>
                {d.favoritos.map(f => (
                  <Link key={f.produto.id} href={oferecer(f.produto.referencia)} underline="none" color="inherit" title={`${f.produto.nome} · guardado ${tempoDesde(f.criadoEm)} · oferecer`} sx={{ width: 80, flexShrink: 0 }}>
                    <Foto src={f.produto.imagem} largura={80} sx={{ opacity: f.produto.disponivel ? 1 : 0.4 }} />
                    <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, mt: 0.5 }}>{f.produto.nome}</Typography>
                    <Typography variant="caption" color="text.secondary">{f.produto.disponivel ? brl(f.produto.preco) : 'esgotado'}</Typography>
                  </Link>
                ))}
              </Stack>
            </Box>
          )}
          {d.pecas.length > 0 && (
            <Box>
              <Typography variant="overline">Peças mais vistas ({d.totalPecasVistas})</Typography>
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {d.pecas.map(x => (
                  <Stack key={x.produto.id} direction="row" sx={{ py: 1, gap: 1.5, alignItems: 'center' }}>
                    <Foto src={x.produto.imagem} largura={40} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Link href={`/produto/${x.produto.referencia}`} target="_blank" variant="body2">{x.produto.nome}</Link>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{x.vezes}× · {duracaoEmPalavras(x.tempo)} · {tempoDesde(x.ultimaVez)}{x.tamanhos.length > 0 && ` · tam. ${x.tamanhos.join(', ')}`} · {brl(x.produto.preco)}</Typography>
                      <Stack direction="row" sx={{ gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {x.situacao === 'comprou' && <Etiqueta cor="oliva">Comprou</Etiqueta>}
                        {x.situacao === 'pediu' && <Etiqueta cor="caramelo">Pediu</Etiqueta>}
                        {!x.situacao && x.naSacola > 0 && <Etiqueta>Pôs na sacola</Etiqueta>}
                        {!x.produto.ativo ? <Etiqueta cor="cinza">Fora do catálogo</Etiqueta> : !x.produto.disponivel && <Etiqueta cor="cinza">Esgotado</Etiqueta>}
                      </Stack>
                    </Box>
                    {x.produto.ativo && x.produto.disponivel > 0 && !x.situacao && <Link href={oferecer(x.produto.referencia)} variant="caption" color="secondary">Oferecer</Link>}
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
          {(d.preferencias.categorias.length > 0 || d.preferencias.tamanhos.length > 0) && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2 }}>
              {([['Categorias que mais vê', d.preferencias.categorias], ['Marcas', d.preferencias.marcas], ['Tamanhos que escolhe', d.preferencias.tamanhos]] as const).filter(([, i]) => i.length).map(([titulo, itens]) => (
                <Box key={titulo}>
                  <Rotulo>{titulo}</Rotulo>
                  <Stack sx={{ gap: 1 }}>{itens.map(i => (
                    <Box key={i.valor}>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14 }}><span>{i.valor}</span><Typography variant="caption" color="text.secondary">{pct(i.parte)}</Typography></Stack>
                      <LinearProgress variant="determinate" value={Math.max(3, i.parte * 100)} color="secondary" sx={{ height: 6, borderRadius: 1, bgcolor: 'marca.bege' }} />
                    </Box>
                  ))}</Stack>
                </Box>
              ))}
              {d.preferencias.promocao != null && <Box><Rotulo>Promoções</Rotulo><Typography variant="body2">{pct(d.preferencias.promocao)} das peças vistas estão em promoção ou imperdível.</Typography></Box>}
            </Box>
          )}
          {d.buscas.length > 0 && (
            <Box>
              <Rotulo>Buscas recentes</Rotulo>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                {d.buscas.map((b, i) => <Chip key={i} size="small" variant="outlined" color={b.resultados === 0 ? 'error' : 'default'} title={formatarDataHora(b.criadoEm)} label={`“${b.termo}”${b.resultados === 0 ? ' · nada encontrado' : b.resultados != null ? ` · ${b.resultados}` : ''}`} />)}
              </Stack>
            </Box>
          )}
        </>
      )}
    </CardContent></Card>
  );
}
