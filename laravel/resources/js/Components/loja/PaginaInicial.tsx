import type { ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { Box, Stack, Typography } from '@mui/material';
import { ArrowForward, ChatBubbleOutlined, HomeOutlined, LocalShippingOutlined, VerifiedOutlined } from '@mui/icons-material';
import { brl } from '@/lib/dinheiro';
import { nomeComSlogan } from '@/lib/loja';
import { linkDe, preencher, SECOES_INICIO, textoBruto, type CampoImagem, type CampoTexto, type ConteudoInicio, type Secao } from '@/lib/conteudo-inicio';
import { FONTE_TITULO } from '@/tema/tema';
import { ImagemEditavel, LinkEditavel, SecaoEditavel, Texto, useEdicao } from './Editavel';
import { estiloRotulo, estiloTitulo, FotoCheia, TituloSecao, Vitrine, type Cartao } from './Vitrine';

/** App\Services\Loja\PaginaInicial::dados. */
export type DadosInicio = {
  novidades: Cartao[]; imperdiveis: Cartao[]; promocoes: Cartao[];
  ofertas: { imperdivel: Oferta; promocoes: Oferta; maiorDesconto: number };
  modelos: number;
  categorias: { nome: string; slug: string; n: number; foto: string | null }[];
  marcas: { slug: string; nome: string; n: number; foto: string | null }[];
  faixas: { valor: string; rotulo: string; n: number }[];
  fotos: Record<CampoImagem, string | null>;
};
type Oferta = { n: number; desconto: number; fotos: string[] };

const escuro = { color: 'marca.creme' } as const;
const pilula = { height: 52, px: 3.5, display: 'inline-flex', alignItems: 'center', gap: 1, borderRadius: 99, fontWeight: 600 } as const;

/**
 * Página inicial da loja (porta de src/components/loja/pagina-inicial.tsx). Textos, fotos do banner, links e seções vêm
 * do conteúdo editável; no editor (ProvedorEdicao) todas as seções aparecem e os textos e links ficam editáveis.
 */
export function PaginaInicial({ dados, conteudo }: { dados: DadosInicio; conteudo: ConteudoInicio }) {
  const { loja } = usePage().props;
  const editando = !!useEdicao();
  const cidade = (loja?.cidadeCondicional ?? '').split('/')[0];
  const parcelas = loja?.parcelas ?? 0;
  const vars = {
    cidade,
    frete: loja?.frete?.gratisAcima ? `Frete grátis acima de ${brl(loja.frete.gratisAcima)}.` : 'Entrega combinada com você.',
    parcelas: String(parcelas),
  };
  const t = (campo: CampoTexto) => { const bruto = textoBruto(conteudo, campo); return <Texto campo={campo} bruto={bruto} valor={preencher(bruto, vars)} />; };
  const ver = (s: Secao) => editando || !conteudo.ocultas.includes(s);
  const secao = (s: Secao, filho: ReactNode) => (ver(s) ? <SecaoEditavel key={s} secao={s} rotulo={SECOES_INICIO[s]}>{filho}</SecaoEditavel> : null);
  const l = (campo: string) => linkDe(conteudo, campo);
  const { ofertas } = dados;
  const temOfertas = ofertas.imperdivel.n + ofertas.promocoes.n > 0;
  const titulo = (tamanho: object) => ({ ...estiloTitulo, ...tamanho });

  return (
    <Box sx={{ pt: { xs: 1.5, sm: 3 }, display: 'grid', gap: { xs: 10, sm: 14 }, '& > *': { minWidth: 0 } }}>
      <Typography component="h1" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{nomeComSlogan()}, com estoque pronto em {cidade} (SC)</Typography>

      {/* Banner: mensagem da loja, chamadas, números e as entradas por gênero. */}
      <Box component="section" sx={{ display: 'grid', gridTemplateColumns: { lg: '1.05fr 1fr' }, gap: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 8, bgcolor: 'marca.marrom-950', ...escuro, p: { xs: 3.5, sm: 6, xl: 7 }, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 5, minHeight: '26rem' }}>
          <Box aria-hidden sx={{ position: 'absolute', right: -96, top: -96, width: 320, height: 320, borderRadius: '50%', bgcolor: 'rgba(109,64,42,.4)', filter: 'blur(64px)' }} />
          <Box sx={{ position: 'relative' }}>
            <Stack direction="row" spacing={1} sx={{ display: 'inline-flex', alignItems: 'center', height: 32, px: 1.75, borderRadius: 99, bgcolor: 'rgba(246,242,236,.1)', fontSize: '0.78rem', fontWeight: 500, color: 'marca.areia' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4ade80' }} />{t('banner.selo')}
            </Stack>
            <Typography sx={{ ...titulo({ fontSize: { xs: '3rem', sm: '3.75rem', xl: '4.5rem' } }), ...escuro, mt: 3, lineHeight: 0.95 }}>
              {t('banner.titulo')}<br /><Box component="em" sx={{ color: 'marca.areia' }}>{t('banner.destaque')}</Box>
            </Typography>
            <Typography sx={{ mt: 3, color: 'rgba(221,205,179,.9)', maxWidth: 440, fontSize: '1.05rem', lineHeight: 1.6 }}>{t('banner.texto')}</Typography>
            <Stack direction="row" useFlexGap sx={{ mt: 4, flexWrap: 'wrap', gap: 1.5 }}>
              <LinkEditavel campo="banner.botao1" rotulo="Botão principal do banner" href={l('banner.botao1')} sx={{ ...pilula, display: 'inline-flex', bgcolor: 'marca.creme', color: 'marca.marrom-950' }}>
                {t('banner.botao1')}<ArrowForward sx={{ fontSize: 16 }} />
              </LinkEditavel>
              {temOfertas && (
                <LinkEditavel campo="banner.botao2" rotulo="Segundo botão do banner" href={l('banner.botao2')} sx={{ ...pilula, display: 'inline-flex', border: '1px solid rgba(246,242,236,.3)', ...escuro }}>{t('banner.botao2')}</LinkEditavel>
              )}
            </Stack>
          </Box>
          <Box component="dl" sx={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, pt: 3, m: 0, borderTop: '1px solid rgba(246,242,236,.15)', maxWidth: 512 }}>
            <Numero valor={`${dados.modelos}+`} rotulo="modelos prontos" />
            <Numero valor={ofertas.maiorDesconto ? `−${ofertas.maiorDesconto}%` : '100%'} rotulo={ofertas.maiorDesconto ? 'de desconto, até' : 'peças originais'} />
            <Numero valor={parcelas > 1 ? `${parcelas}x` : 'Grátis'} rotulo={parcelas > 1 ? 'para parcelar' : 'para provar em casa'} />
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: { lg: '1fr 1fr' }, gap: { xs: 1.5, sm: 2 } }}>
          <Entrada href={l('banner.feminino')} rotulo="Card Feminino do banner" titulo={t('banner.feminino')} campo="banner.feminino" salva={conteudo.imagens['banner.feminino'] ?? null} automatica={dados.fotos['banner.feminino']} sx={{ aspectRatio: { xs: '3 / 4', lg: 'auto' }, gridRow: { lg: 'span 2' } }} />
          <Entrada href={l('banner.masculino')} rotulo="Card Masculino do banner" titulo={t('banner.masculino')} campo="banner.masculino" salva={conteudo.imagens['banner.masculino'] ?? null} automatica={dados.fotos['banner.masculino']} sx={{ aspectRatio: { xs: '3 / 4', lg: 'auto' } }} />
          <Entrada href={l('banner.novidades')} rotulo="Card Novidades do banner" titulo={t('banner.novidades')} campo="banner.novidades" salva={conteudo.imagens['banner.novidades'] ?? null} automatica={dados.fotos['banner.novidades']} sx={{ display: { xs: 'none', lg: 'block' } }} />
        </Box>
      </Box>

      {secao('confianca', (
        <Box component="ul" sx={{ mt: { xs: -6, sm: -8 }, mb: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1, sm: 1.5 } }}>
          {([['1', 'Card Prove em casa', <HomeOutlined key="i" />], ['2', 'Card Atendimento humano', <ChatBubbleOutlined key="i" />], ['3', 'Card Peças originais', <VerifiedOutlined key="i" />], ['4', 'Card Pronta-entrega', <LocalShippingOutlined key="i" />]] as const).map(([n, rotulo, icone]) => (
            <Box component="li" key={n} sx={{ minWidth: 0 }}>
              <LinkEditavel campo={`confianca.${n}`} rotulo={rotulo} posicao="dentro" href={l(`confianca.${n}`)} sx={{ height: '100%', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, p: { xs: 2, sm: 2.5 }, borderRadius: 6, bgcolor: 'marca.creme' }}>
                <Box sx={{ width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'background.paper', color: 'secondary.main' }}>{icone}</Box>
                <Box><Typography sx={{ fontSize: 14, fontWeight: 700, color: 'marca.marrom-950' }}>{t(`confianca.${n}.titulo` as CampoTexto)}</Typography><Typography sx={{ fontSize: { xs: 12, sm: '0.82rem' }, color: 'text.secondary', mt: 0.5, lineHeight: 1.35 }}>{t(`confianca.${n}.texto` as CampoTexto)}</Typography></Box>
              </LinkEditavel>
            </Box>
          ))}
        </Box>
      ))}

      {dados.categorias.length > 0 && secao('categorias', (
        <Box component="section">
          <TituloSecao sobre={t('categorias.sobre')} titulo={t('categorias.titulo')} link={l('categorias.link')} rotuloLink="Ver todas" extra={<LinkCampo campo="categorias.link" rotulo="Ver todas as categorias" />} />
          <Box sx={{ display: { xs: 'flex', lg: 'grid' }, gridTemplateColumns: 'repeat(10, 1fr)', gap: { xs: 2, sm: 3, lg: 2 }, overflowX: { xs: 'auto', lg: 'visible' }, mx: { xs: -2, sm: -4, lg: 0 }, px: { xs: 2, sm: 4, lg: 0 }, pb: 1, scrollbarWidth: 'none' }}>
            {dados.categorias.map(c => (
              <LinkEditavel key={c.slug} campo={`categoria.${c.slug}`} rotulo={`Categoria ${c.nome}`} posicao="dentro" href={l(`categoria.${c.slug}`)} sx={{ flexShrink: 0, width: { xs: 96, sm: 112, lg: 'auto' }, textAlign: 'center', '&:hover .zoom': { transform: 'scale(1.1)' } }}>
                <Box sx={{ position: 'relative', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden', bgcolor: 'marca.bege', outline: '1px solid', outlineColor: 'divider', outlineOffset: 4 }}>
                  <FotoCheia src={c.foto} className="zoom" sx={{ transition: 'transform .5s' }} />
                </Box>
                <Typography sx={{ mt: 1.5, fontSize: 14, fontWeight: 600, color: 'marca.marrom-950', lineHeight: 1.2 }}>{c.nome}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{c.n} peças</Typography>
              </LinkEditavel>
            ))}
          </Box>
        </Box>
      ))}

      {dados.novidades.length > 0 && secao('novidades', <Vitrine titulo={t('novidades.titulo')} sobre={t('novidades.sobre')} produtos={dados.novidades} parcelas={parcelas} link={l('novidades.link')} extra={<LinkCampo campo="novidades.link" rotulo="Ver tudo de Novidades" />} />)}

      {temOfertas && secao('ofertas', (
        <Box component="section" sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { md: ofertas.imperdivel.n && ofertas.promocoes.n ? '1fr 1fr' : '1fr' } }}>
          {ofertas.imperdivel.n > 0 && <FaixaOferta campo="ofertas.imperdivel" rotulo="Faixa Imperdível" href={l('ofertas.imperdivel')} vermelha sobre={t('ofertas.imperdivel.sobre')} titulo={t('ofertas.imperdivel.titulo')} botao={t('ofertas.botao')} texto={t('ofertas.imperdivel.texto')} o={ofertas.imperdivel} />}
          {ofertas.promocoes.n > 0 && <FaixaOferta campo="ofertas.promocoes" rotulo="Faixa Promoções" href={l('ofertas.promocoes')} sobre={t('ofertas.promocoes.sobre')} titulo={t('ofertas.promocoes.titulo')} botao={t('ofertas.botao')} texto={t('ofertas.promocoes.texto')} o={ofertas.promocoes} />}
        </Box>
      ))}

      {dados.imperdiveis.length > 0 && secao('imperdivel', <Vitrine titulo={t('imperdivel.titulo')} sobre={t('imperdivel.sobre')} produtos={dados.imperdiveis} parcelas={parcelas} link={l('imperdivel.link')} extra={<LinkCampo campo="imperdivel.link" rotulo="Ver tudo de Imperdível" />} />)}

      {secao('condicional', (
        <Box component="section" sx={{ borderRadius: 8, bgcolor: 'marca.bege', p: { xs: 3.5, sm: 6, xl: 8 }, display: 'grid', gridTemplateColumns: { lg: '1fr 1.5fr' }, gap: 5, alignItems: 'center' }}>
          <Box>
            <Typography sx={estiloRotulo}>{t('condicional.sobre')}</Typography>
            <Typography component="h2" sx={{ ...titulo({ fontSize: { xs: '2.25rem', sm: '3rem' } }), mt: 1, lineHeight: 1.02 }}>{t('condicional.titulo')}<br /><em>{t('condicional.destaque')}</em></Typography>
            <Typography sx={{ mt: 2, color: 'marca.marrom-900', maxWidth: 440, lineHeight: 1.6 }}>{t('condicional.texto')}</Typography>
            <LinkEditavel campo="condicional.botao" rotulo="Botão do Prove em casa" href={l('condicional.botao')} sx={{ ...pilula, display: 'inline-flex', mt: 4, bgcolor: 'marca.marrom-950', ...escuro }}>
              {t('condicional.botao')}<ArrowForward sx={{ fontSize: 16 }} />
            </LinkEditavel>
          </Box>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: { xs: 1.5, sm: 2 } }}>
            {([1, 2, 3, 4] as const).map(n => (
              <Box component="li" key={n} sx={{ bgcolor: 'background.paper', borderRadius: 6, p: { xs: 2.5, sm: 3 } }}>
                <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'marca.marrom-950', color: 'marca.creme', fontWeight: 700 }}>{n}</Box>
                <Typography sx={{ mt: 2, fontWeight: 600, color: 'marca.marrom-950' }}>{t(`condicional.${n}.titulo`)}</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 14, color: 'text.secondary', lineHeight: 1.35 }}>{t(`condicional.${n}.texto`)}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}

      {dados.promocoes.length > 0 && secao('promocoes', <Vitrine titulo={t('promocoes.titulo')} sobre={t('promocoes.sobre')} produtos={dados.promocoes} parcelas={parcelas} link={l('promocoes.link')} extra={<LinkCampo campo="promocoes.link" rotulo="Ver tudo de Promoções" />} />)}

      {dados.faixas.length > 1 && secao('precos', (
        <Box component="section">
          <TituloSecao sobre={t('precos.sobre')} titulo={t('precos.titulo')} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1.5, sm: 2 } }}>
            {dados.faixas.map(f => (
              <LinkEditavel key={f.valor} campo={`preco.${f.valor}`} rotulo={`Card de preço ${f.rotulo}`} href={l(`preco.${f.valor}`)}
                sx={{ borderRadius: 6, border: 1, borderColor: 'divider', bgcolor: 'marca.creme', p: { xs: 2.5, sm: 3.5 }, transition: 'all .2s', '&:hover': { bgcolor: 'marca.marrom-950', '& *': { color: 'marca.creme' } } }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{f.n} {f.n === 1 ? 'modelo' : 'modelos'}</Typography>
                <Typography sx={{ ...titulo({ fontSize: { xs: '1.5rem', sm: '1.875rem' } }), mt: 1 }}>{f.rotulo}</Typography>
                <ArrowForward sx={{ mt: 2, color: 'marca.marrom-950' }} />
              </LinkEditavel>
            ))}
          </Box>
        </Box>
      ))}

      {dados.marcas.length > 1 && secao('marcas', (
        <Box component="section">
          <TituloSecao sobre={t('marcas.sobre')} titulo={t('marcas.titulo')} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1.5, sm: 2 } }}>
            {dados.marcas.map(m => (
              <LinkEditavel key={m.slug} campo={`marca.${m.slug}`} rotulo={`Marca ${m.nome}`} posicao="dentro" href={l(`marca.${m.slug}`)} sx={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 6, overflow: 'hidden', bgcolor: 'marca.marrom-950', '&:hover .zoom': { transform: 'scale(1.05)', opacity: 0.85 } }}>
                <FotoCheia src={m.foto} className="zoom" sx={{ opacity: 0.7, transition: 'all .7s' }} />
                <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(46,37,32,.85), rgba(46,37,32,.2), transparent)' }} />
                <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: { xs: 2, sm: 2.5 }, ...escuro }}>
                  <Typography sx={{ fontFamily: FONTE_TITULO, fontSize: { xs: '1.25rem', sm: '1.5rem' }, ...escuro }}>{m.nome}</Typography>
                  <Typography sx={{ fontSize: 14, color: 'marca.areia' }}>{m.n} modelos</Typography>
                </Box>
              </LinkEditavel>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** No editor, o botão de trocar o destino do "Ver tudo" de uma seção (fora do editor, nada). */
function LinkCampo({ campo, rotulo }: { campo: string; rotulo: string }) {
  const e = useEdicao();
  if (!e) return null;
  return <LinkEditavel campo={campo} rotulo={rotulo} posicao="lado" href=""><Box sx={{ width: 0, height: 28 }} /></LinkEditavel>;
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <Box>
      <Box component="dt" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{rotulo}</Box>
      <Box component="dd" sx={{ m: 0, fontSize: { xs: '1.5rem', sm: '1.875rem' }, fontWeight: 800, letterSpacing: '-0.02em', color: 'marca.creme' }}>{valor}</Box>
      <Box component="dd" sx={{ m: 0, fontSize: 12, color: 'rgba(221,205,179,.8)', mt: 0.25 }}>{rotulo}</Box>
    </Box>
  );
}

function Entrada({ href, rotulo, titulo, campo, salva, automatica, sx }: { href: string; rotulo: string; titulo: ReactNode; campo: CampoImagem; salva: string | null; automatica: string | null; sx?: object }) {
  return (
    <LinkEditavel campo={campo} rotulo={rotulo} posicao="seta" href={href} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 8, bgcolor: 'marca.bege', '&:hover .zoom': { transform: 'scale(1.05)' }, ...sx }}>
      <ImagemEditavel campo={campo} salva={salva} automatica={automatica} sx={{ transition: 'transform .7s ease-out' }} />
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(46,37,32,.7), transparent 50%)', pointerEvents: 'none' }} />
      <Stack direction="row" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: { xs: 2, sm: 3 }, alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontFamily: FONTE_TITULO, fontSize: { xs: '1.5rem', sm: '2.25rem' }, color: 'marca.creme' }}>{titulo}</Typography>
        <Box sx={{ width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 }, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'background.paper', color: 'marca.marrom-950' }}><ArrowForward /></Box>
      </Stack>
    </LinkEditavel>
  );
}

function FaixaOferta({ campo, rotulo, href, vermelha = false, sobre, titulo, texto, botao, o }: { campo: string; rotulo: string; href: string; vermelha?: boolean; sobre: ReactNode; titulo: ReactNode; texto: ReactNode; botao: ReactNode; o: Oferta }) {
  const cor = vermelha ? '#fff' : 'marca.marrom-950';
  return (
    <LinkEditavel campo={campo} rotulo={rotulo} posicao="dentro" href={href} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 8, p: { xs: 3.5, sm: 5 }, minHeight: 256, display: 'grid', gridTemplateColumns: '1fr auto', gap: 3, alignItems: 'center', bgcolor: vermelha ? 'imperdivel.main' : 'marca.creme', border: vermelha ? 0 : 1, borderColor: 'divider', color: cor }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...estiloRotulo, color: vermelha ? 'rgba(255,255,255,.8)' : 'secondary.main' }}>{sobre}</Typography>
        <Typography sx={{ ...estiloTitulo, fontSize: { xs: '2.25rem', sm: '3rem' }, mt: 1, color: cor }}>{titulo}</Typography>
        <Typography sx={{ mt: 1, fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 800, color: cor }}>{o.desconto ? `até −${o.desconto}%` : `${o.n} peças`}</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 14, maxWidth: 320, lineHeight: 1.6, color: vermelha ? 'rgba(255,255,255,.85)' : 'text.secondary' }}>{texto}</Typography>
        <Box sx={{ mt: 3, height: 44, px: 2.5, display: 'inline-flex', alignItems: 'center', gap: 1, borderRadius: 99, fontSize: 14, fontWeight: 600, bgcolor: vermelha ? '#fff' : 'marca.marrom-950', color: vermelha ? 'imperdivel.main' : 'marca.creme' }}>{botao}<ArrowForward sx={{ fontSize: 16 }} /></Box>
      </Box>
      <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
        {o.fotos.map((f, i) => (
          <Box key={f} sx={{ position: 'relative', width: { sm: 112, xl: 144 }, aspectRatio: '3 / 4', borderRadius: 4, overflow: 'hidden', bgcolor: 'marca.bege', boxShadow: 6, ml: i ? -5 : 0, transform: `rotate(${i ? 6 : -6}deg)`, border: '4px solid', borderColor: vermelha ? 'imperdivel.main' : 'marca.creme' }}>
            <FotoCheia src={f} />
          </Box>
        ))}
      </Box>
    </LinkEditavel>
  );
}
