import { useState, type ReactNode } from 'react';
import { Link } from '@inertiajs/react';
import { LinkSimples } from './LinkSimples';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { emEstoque, type CorModelo, type ProdutoCatalogo } from '@/lib/catalogo';
import { corClara, nomeDoModelo, tomDaCor } from '@/lib/cores';
import { brl, descontoPct } from '@/lib/dinheiro';
import { rastrear } from '@/lib/rastro';
import { sacola } from '@/lib/sacola';
import { FONTE_TITULO } from '@/tema/tema';
import { BotaoFavorito } from './Favoritos';

/** Peça como o card precisa (App\Queries\Loja::cartao). */
export type Cartao = Omit<ProdutoCatalogo, 'subcategoria' | 'estacao' | 'composicao' | 'descricao' | 'destaques' | 'videos'>;

export const estiloTitulo = { fontFamily: FONTE_TITULO, fontWeight: 500, letterSpacing: '-0.01em', color: 'marca.marrom-950' } as const;
export const estiloRotulo = { fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' } as const;
const linkSemEstilo = { color: 'inherit', textDecoration: 'none' } as const;

/** Foto 3:4 que cobre o espaço; sem foto, o fundo bege com "Sem foto". */
export function FotoCheia({ src, alt = '', sx, className }: { src?: string | null; alt?: string; sx?: object; className?: string }) {
  if (!src) return <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'marca.bege', color: 'text.secondary', fontSize: 12, ...sx }}>Sem foto</Box>;
  return <Box component="img" className={className} src={src} alt={alt} loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...sx }} />;
}

/** Bolinha de uma cor: o tom aproximado, a estampa ou, sem tom conhecido, a foto da peça. */
export function BolinhaCor({ c, tamanho = 16, atual }: { c: CorModelo; tamanho?: number; atual?: boolean }) {
  const tom = tomDaCor(c.cor);
  const anel = atual ? { outline: '2px solid', outlineColor: 'marca.marrom-950', outlineOffset: 2 } : {};
  const base = { display: 'block', width: tamanho, height: tamanho, borderRadius: '50%', overflow: 'hidden', position: 'relative', ...anel } as const;
  if (tom === 'estampa') return <Box sx={{ ...base, background: 'conic-gradient(#c0312b,#e7c447,#4f7d4c,#3f6ea8,#5f3f86,#c0312b)' }} />;
  if (tom) return <Box sx={{ ...base, background: tom, border: corClara(tom) ? 1 : 0, borderColor: 'marca.borda-forte' }} />;
  return <Box sx={{ ...base, bgcolor: 'marca.bege' }}><FotoCheia src={c.imagem} /></Box>;
}

/** Cores do card: até 5 bolinhas (cada uma abre aquela cor) e "+N". */
function CoresDoCard({ cores, atual }: { cores: CorModelo[]; atual: string }) {
  if (cores.length < 2) return null;
  const mostrar = cores.slice(0, 5);
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }} aria-label={`${cores.length} cores`}>
      {mostrar.map(c => (
        <LinkSimples key={c.referencia} href={`/produto/${encodeURIComponent(c.referencia)}`} title={c.cor ?? undefined} aria-label={c.cor ? `Cor ${c.cor}` : 'Outra cor'}
          sx={{ p: 0.5, m: -0.5, opacity: c.disponivel ? 1 : 0.4 }}>
          <BolinhaCor c={c} atual={c.referencia === atual} />
        </LinkSimples>
      ))}
      {cores.length > mostrar.length && <Typography variant="caption" color="text.secondary">+{cores.length - mostrar.length}</Typography>}
    </Stack>
  );
}

/** Compra rápida no card (computador): os tamanhos aparecem ao passar o mouse e um clique põe na sacola. */
function AdicaoRapida({ p }: { p: Cartao }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const disponiveis = p.variantes.filter(v => v.disponivel > 0);
  if (!disponiveis.length) return null;
  const por = (id: number) => {
    const v = disponiveis.find(x => x.id === id)!;
    rastrear({ tipo: 'tamanho', varianteId: v.id });
    const ok = sacola.adicionar({ varianteId: v.id, referencia: p.referencia, nome: p.nome, marca: p.marca, cor: p.cor, tamanho: v.tamanho, codigoInterno: v.codigoInterno, preco: p.preco, imagem: p.imagens[0] ?? null, maximo: v.disponivel });
    setAviso(ok ? null : `Todas as unidades do ${v.tamanho} já estão na sacola`);
  };
  return (
    <Box className="rapida" sx={{ display: { xs: 'none', lg: 'block' }, position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 2, opacity: 0, transform: 'translateY(12px)', transition: 'all .3s', '&:focus-within': { opacity: 1, transform: 'none' } }}>
      <Box sx={{ borderRadius: 4, bgcolor: 'rgba(255,253,249,.95)', p: 1.25, boxShadow: 3 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', textAlign: 'center', mb: 1 }}>{aviso ?? 'Adicionar rápido · escolha o tamanho'}</Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 0.75 }}>
          {disponiveis.slice(0, 8).map(v => (
            <Button key={v.id} size="small" variant="outlined" onClick={() => por(v.id)} aria-label={`Pôr ${p.nome} tamanho ${v.tamanho} na sacola`}
              sx={{ minWidth: 36, height: 32, px: 1, borderRadius: 99, fontSize: 12, fontWeight: 700, borderColor: 'marca.borda-forte', color: 'marca.marrom-950', '&:hover': { bgcolor: 'marca.marrom-950', color: 'marca.creme' } }}>
              {v.tamanho}
            </Button>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

/** Card da vitrine: foto 3:4 (a segunda aparece ao passar o mouse), selos, compra rápida, nome, preço com parcelas e cores. */
export function CartaoProduto({ p, parcelas }: { p: Cartao; parcelas: number }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  const esgotado = !emEstoque(p as ProdutoCatalogo);
  const restam = p.variantes.reduce((a, v) => a + v.disponivel, 0);
  const tamanhos = p.variantes.filter(v => v.disponivel > 0).map(v => v.tamanho);
  const href = `/produto/${encodeURIComponent(p.referencia)}`;
  const vermelho = p.imperdivel || desconto > 0;
  return (
    <Box component="article" sx={{ position: 'relative', '&:hover .rapida': { opacity: 1, transform: 'none' }, '&:hover .foto1': { transform: 'scale(1.04)', opacity: { lg: p.imagens[1] ? 0 : 1 } }, '&:hover .foto2': { opacity: 1, transform: 'scale(1.04)' } }}>
      <Box sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 4, overflow: 'hidden', bgcolor: '#efebe5' }}>
        <Link href={href} tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <FotoCheia className="foto1" src={p.imagens[0]} sx={{ transition: 'all .7s ease-out', ...(esgotado ? { filter: 'grayscale(60%)', opacity: 0.75 } : {}) }} />
          {p.imagens[1] && <Box className="foto2" sx={{ display: { xs: 'none', lg: 'block' }, position: 'absolute', inset: 0, opacity: 0, transition: 'all .7s ease-out' }}><FotoCheia src={p.imagens[1]} /></Box>}
        </Link>
        <Stack spacing={0.75} sx={{ position: 'absolute', left: 10, top: 10, alignItems: 'flex-start', pointerEvents: 'none' }}>
          {p.imperdivel && <Chip size="small" label="Imperdível" color="imperdivel" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />}
          {desconto > 0 && <Chip size="small" label={`−${desconto}%`} sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: p.imperdivel ? 'background.paper' : 'marca.marrom-950', color: p.imperdivel ? 'imperdivel.main' : 'marca.creme' }} />}
          {!esgotado && restam === 1 && <Chip size="small" label="Última peça" sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: 'background.paper', color: 'secondary.main' }} />}
        </Stack>
        {esgotado && <Box sx={{ position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 99, bgcolor: 'rgba(46,37,32,.85)', color: 'marca.creme', textAlign: 'center', py: 1, fontSize: 12, fontWeight: 600 }}>Esgotado</Box>}
        <AdicaoRapida p={p} />
      </Box>
      <BotaoFavorito produtoId={p.id} nome={p.nome} sx={{ position: 'absolute', right: 10, top: 10, zIndex: 3 }} />
      <Box sx={{ pt: 1.5, px: 0.25 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
          <Typography noWrap sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{p.marca}</Typography>
          {!esgotado && tamanhos.length > 0 && <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }} aria-label={`Tamanhos disponíveis: ${tamanhos.join(', ')}`}>{tamanhos.slice(0, 5).join(' · ')}{tamanhos.length > 5 ? ' +' : ''}</Typography>}
        </Stack>
        <Typography component="h3" sx={{ mt: 0.5, fontSize: '0.92rem', lineHeight: 1.35, color: 'marca.marrom-950', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          <LinkSimples href={href} sx={{ ...linkSemEstilo, '&:hover': { textDecoration: 'underline' } }}>{(p.cores?.length ?? 0) > 1 ? nomeDoModelo(p.nome) : p.nome}</LinkSimples>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Typography data-preco sx={{ fontWeight: 800, letterSpacing: '-0.01em', color: vermelho ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(p.preco)}</Typography>
          {desconto > 0 && <Typography component="s" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{brl(p.precoCheio)}</Typography>}
        </Stack>
        {parcelas > 1 && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>ou {parcelas}x de {brl(p.preco / parcelas)}</Typography>}
        <CoresDoCard cores={p.cores ?? []} atual={p.referencia} />
      </Box>
    </Box>
  );
}

/** Título de seção: chamada pequena, título em serifa e o link "Ver tudo" em pílula. */
export function TituloSecao({ titulo, sobre, link, rotuloLink = 'Ver tudo', extra }: { titulo: ReactNode; sobre?: ReactNode; link?: string | null; rotuloLink?: string; extra?: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mb: { xs: 3, sm: 4 } }}>
      <Box sx={{ minWidth: 0 }}>
        {sobre && <Typography sx={estiloRotulo}>{sobre}</Typography>}
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: { xs: '1.75rem', sm: '2.25rem' }, lineHeight: 1, mt: 0.75 }}>{titulo}</Typography>
      </Box>
      {link && (
        <Button href={link} variant="outlined" endIcon={<ArrowForward />} sx={{ flexShrink: 0, borderRadius: 99, borderColor: 'marca.borda-forte', color: 'marca.marrom-950', '&:hover': { bgcolor: 'marca.marrom-950', color: 'marca.creme' } }}>
          {rotuloLink}
        </Button>
      )}
      {extra}
    </Stack>
  );
}

/** Vitrine: carrossel com deslize no celular e no tablet, grade de 4 no computador. */
export function Vitrine({ titulo, sobre, produtos, parcelas, link, rotuloLink, extra }: { titulo: ReactNode; sobre?: ReactNode; produtos: Cartao[]; parcelas: number; link?: string | null; rotuloLink?: string; extra?: ReactNode }) {
  if (!produtos.length) return null;
  return (
    <Box component="section" sx={{ minWidth: 0 }}>
      <TituloSecao titulo={titulo} sobre={sobre} link={link} rotuloLink={rotuloLink} extra={extra} />
      <GradeProdutos produtos={produtos} parcelas={parcelas} carrossel />
    </Box>
  );
}

export function GradeProdutos({ produtos, parcelas, carrossel = false }: { produtos: Cartao[]; parcelas: number; carrossel?: boolean }) {
  if (carrossel)
    return (
      <Box sx={{ display: { xs: 'flex', lg: 'grid' }, gridTemplateColumns: 'repeat(4, 1fr)', gap: { xs: 1.5, sm: 2, lg: 2.5 }, rowGap: { lg: 5 }, overflowX: { xs: 'auto', lg: 'visible' }, scrollSnapType: 'x mandatory', mx: { xs: -2, sm: -4, lg: 0 }, px: { xs: 2, sm: 4, lg: 0 }, scrollbarWidth: 'none' }}>
        {produtos.map(p => <Box key={p.id} sx={{ flexShrink: 0, width: { xs: '46%', sm: '31%', lg: 'auto' }, scrollSnapAlign: 'start' }}><CartaoProduto p={p} parcelas={parcelas} /></Box>)}
      </Box>
    );
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, columnGap: { xs: 1.5, sm: 2.5 }, rowGap: 5 }}>
      {produtos.map(p => <CartaoProduto key={p.id} p={p} parcelas={parcelas} />)}
    </Box>
  );
}
