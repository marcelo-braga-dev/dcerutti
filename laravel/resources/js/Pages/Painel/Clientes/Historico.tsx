import { Head } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Box, Button, Card, CardContent, Chip, Link, Stack, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, EtiquetaStatus, EtiquetaTipo, Foto, Vazio } from '@/Components/ui/Basicos';
import { agruparVisitas, descreverFiltros, duracaoEmPalavras, type FiltrosAtivos } from '@/lib/atividade';
import { formatarData, TZ } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Produto = { referencia: string; nome: string; preco: number; imagem: string | null };
type Evento = { id: string; tipo: string; caminho: string | null; termo: string | null; dados: Record<string, unknown> | null; duracaoSeg: number | null; aparelho: string | null };
type Item =
  | { tipo: 'atividade'; id: string; criadoEm: string; evento: Evento; produto: Produto | null }
  | { tipo: 'pedido'; id: string; criadoEm: string; pedido: { id: string; codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; origem: string; total: number } };
type Props = {
  cliente: { id: string; nome: string }; itens: Item[]; total: number; mostrando: number; filtro: string | null; paginas: number;
  filtros: Record<string, string>; nomes: { categorias: Record<string, string>; marcas: Record<string, string> };
};

const PAGINAS: Record<string, string> = {
  '/': 'Início', '/catalogo': 'Catálogo', '/sacola': 'Sacola', '/minha-conta': 'Minha conta', '/minha-conta/pedidos': 'Meus pedidos', '/minha-conta/cupons': 'Meus cupons', '/privacidade': 'Política de privacidade',
};
const nomeDaPagina = (c: string | null) => (c ? PAGINAS[c.split('?')[0]] ?? c : 'loja');
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const B = ({ children }: { children: ReactNode }) => <Box component="strong" sx={{ color: 'text.primary' }}>{children}</Box>;
const S = ({ children, cor = 'text.secondary' }: { children: ReactNode; cor?: string }) => <Box component="span" sx={{ color: cor }}>{children}</Box>;

/** Linha do tempo da cliente na loja (src/app/(painel)/painel/clientes/[id]/historico/page.tsx). */
export default function HistoricoCliente({ cliente, itens, total, mostrando, filtro, paginas, filtros, nomes }: Props) {
  const url = (f: string | null, mais = 1) => {
    const q = new URLSearchParams();
    if (f) q.set('filtro', f);
    if (mais > 1) q.set('mais', String(mais));
    return `/painel/clientes/${cliente.id}/historico${q.toString() ? `?${q}` : ''}`;
  };
  const visitas = agruparVisitas(itens.map(i => ({ ...i, criadoEm: new Date(i.criadoEm) })));
  const mapas = { categorias: new Map(Object.entries(nomes.categorias)), marcas: new Map(Object.entries(nomes.marcas)) };

  const texto = (i: { evento: Evento; produto: Produto | null }) => {
    const e = i.evento;
    const p = i.produto;
    const d = (e.dados ?? {}) as { filtros?: FiltrosAtivos; resultados?: number; delta?: number; ok?: boolean; erro?: string };
    const tempo = e.duracaoSeg ? <S> · {duracaoEmPalavras(e.duracaoSeg)}</S> : null;
    const nome = p ? <Link href={`/produto/${p.referencia}`} target="_blank">{p.nome}</Link> : <S>produto removido</S>;
    const fs = descreverFiltros(d.filtros, mapas);
    switch (e.tipo) {
      case 'login': return <B>Entrou com a senha</B>;
      case 'acesso': return <><B>Abriu a loja</B> em {nomeDaPagina(e.caminho)}</>;
      case 'pagina': return <>Abriu {nomeDaPagina(e.caminho)}{tempo}</>;
      case 'produto': return <>Viu {nome}{p && <S> · {brl(p.preco)}</S>}{tempo}</>;
      case 'busca': return <>Buscou <B>“{e.termo}”</B>{d.resultados != null && <S cor={d.resultados ? 'text.secondary' : 'error.main'}> · {d.resultados ? `${d.resultados} resultados` : 'nada encontrado'}</S>}{fs && <S> · {fs}</S>}{tempo}</>;
      case 'filtro': return <>Filtrou o catálogo: {fs}{tempo}</>;
      case 'tamanho': return <>Escolheu o tam. <B>{e.termo}</B> de {nome}</>;
      case 'sacola': return <>{(d.delta ?? 0) > 0 ? 'Pôs na sacola' : 'Tirou da sacola'} {Math.abs(d.delta ?? 0)}× {nome}{e.termo && <S> · tam. {e.termo}</S>}</>;
      case 'cupom': return <>Tentou o cupom <B>{e.termo}</B>{d.ok ? <S cor="success.main"> · aceito</S> : <S> · recusado{d.erro ? `: ${d.erro}` : ''}</S>}</>;
      case 'whatsapp': return <>Clicou no WhatsApp em {nomeDaPagina(e.caminho)}</>;
      default: return e.tipo;
    }
  };

  return (
    <PainelLayout titulo="Histórico na loja">
      <Head title="Histórico do cliente" />
      <Link href={`/painel/clientes/${cliente.id}`} variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}><ArrowBack fontSize="small" />Ficha do cliente</Link>
      <CabecalhoPagina sobre="Histórico na loja" titulo={cliente.nome}>Páginas, peças, buscas, sacola e pedidos, do mais novo para o mais antigo. Guardado por 12 meses.</CabecalhoPagina>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 3 }} aria-label="Filtrar">
        <Chip component="a" href={url(null)} clickable label="Tudo" color={!filtro ? 'primary' : 'default'} variant={!filtro ? 'filled' : 'outlined'} />
        {Object.entries(filtros).map(([k, r]) => <Chip key={k} component="a" href={url(k)} clickable label={r} color={filtro === k ? 'primary' : 'default'} variant={filtro === k ? 'filled' : 'outlined'} />)}
      </Stack>
      {visitas.length === 0 ? <Vazio>Nada registrado{filtro ? ' com este filtro' : ''}.</Vazio> : (
        <Stack sx={{ gap: 2, maxWidth: 900 }}>
          {visitas.map(v => {
            const tempo = v.eventos.reduce((a, i) => a + (i.tipo === 'atividade' ? i.evento.duracaoSeg ?? 0 : 0), 0);
            const aparelho = v.eventos.flatMap(i => (i.tipo === 'atividade' && i.evento.aparelho ? [i.evento.aparelho] : []))[0] ?? null;
            return (
              <Card key={v.eventos[0].id}><CardContent>
                <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 600 }}>{formatarData(v.inicio)} · {hora(v.inicio)}{v.inicio.getTime() !== v.fim.getTime() ? ` – ${hora(v.fim)}` : ''}</Typography>
                  <Typography variant="body2" color="text.secondary">{[aparelho, tempo ? duracaoEmPalavras(tempo) : null, `${v.eventos.length} ${v.eventos.length === 1 ? 'registro' : 'registros'}`].filter(Boolean).join(' · ')}</Typography>
                </Stack>
                <Stack component="ol" sx={{ m: 0, p: 0, listStyle: 'none', gap: 1 }}>
                  {v.eventos.map(i => i.tipo === 'pedido' ? (
                    <Stack component="li" key={`p-${i.id}`} direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', fontSize: 14, bgcolor: 'marca.bege', px: 1.5, py: 1, borderRadius: 1.5 }}>
                      <S><Box component="span" sx={{ width: 48, display: 'inline-block' }}>{hora(i.criadoEm)}</Box></S>
                      <Link href={`/painel/pedidos/${i.pedido.id}`} sx={{ fontWeight: 600 }}>{i.pedido.origem === 'loja' ? 'Enviou o pedido' : 'Pedido da equipe'} {i.pedido.codigo}</Link>
                      <EtiquetaTipo tipo={i.pedido.tipo} /><EtiquetaStatus status={i.pedido.status} />
                      <Box sx={{ ml: 'auto' }}>{brl(i.pedido.total)}</Box>
                    </Stack>
                  ) : (
                    <Stack component="li" key={`a-${i.id}`} direction="row" sx={{ gap: 1, alignItems: 'center', fontSize: 14 }}>
                      <S><Box component="span" sx={{ width: 48, display: 'inline-block' }}>{hora(i.criadoEm)}</Box></S>
                      {i.produto && ['produto', 'tamanho', 'sacola'].includes(i.evento.tipo) && <Foto src={i.produto.imagem} largura={28} />}
                      <Box sx={{ minWidth: 0 }}>{texto(i)}</Box>
                    </Stack>
                  ))}
                </Stack>
              </CardContent></Card>
            );
          })}
        </Stack>
      )}
      {total > mostrando && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Mostrando {mostrando} de {total} registros</Typography>
          {paginas < 10 && <Button variant="outlined" href={url(filtro, paginas + 1)}>Carregar mais</Button>}
        </Box>
      )}
    </PainelLayout>
  );
}
