import { useState } from 'react';
import { Head } from '@inertiajs/react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { PublicoLayout, QuemAtende, SelosConfianca } from '@/Components/publico/Comum';
import { BotaoTamanho, CamposContato, Compartilhar, contatoVazio, erroDoContato, Gaveta, gravarContato, PedidoEnviado, type RespostaInteresse } from '@/Components/publico/PedidoPublico';
import { Galeria } from '@/Components/loja/Galeria';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { FotoCheia, estiloRotulo } from '@/Components/loja/Vitrine';
import { brl, descontoPct } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { linkWhatsApp } from '@/lib/whatsapp';

type Variante = { id: number; tamanho: string; ultimas: boolean };
type P = {
  produtoId: number; referencia: string; nome: string; marca: string; categoria: string | null; cor: string | null; descricao: string | null; composicao: string | null;
  preco: number; precoCheio: number; imagens: string[]; videos: { url: string; capa: string | null }[]; variantes: Variante[]; tamanhos: { tamanho: string; livre: boolean }[];
  destaques: string[]; cores: { cor: string | null; imagem: string | null; chave: string }[]; contato: { telefone: string; nome: string | null };
};

/** Link da peça (porta de app/peca/[chave]/page.tsx e components/loja/quero-peca.tsx): sem login, a chave autoriza. */
export default function PaginaPeca({ chave, p, vitrines }: { chave: string; p: P; vitrines: boolean }) {
  const desconto = descontoPct(p.preco, p.precoCheio);
  const vendedora = p.contato.nome;
  const oi = `Oi${vendedora ? `, ${vendedora}` : ''}!`;
  const duvida = linkWhatsApp(p.contato.telefone, `${oi} Vi a peça ${p.nome} e fiquei com dúvida no tamanho.`);
  const falar = linkWhatsApp(p.contato.telefone, `${oi} Vi a peça ${p.nome} e queria saber mais.`);

  return (
    <PublicoLayout largura="lg" acao={<Compartilhar titulo={p.nome} />}>
      <Head title={p.nome} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1.1fr 1fr' }, gap: { xs: 3, md: 6 }, alignItems: 'start', pb: { xs: 12, md: 0 } }}>
        <Box sx={{ position: { md: 'sticky' }, top: { md: 24 }, minWidth: 0 }}>
          <Box sx={{ position: 'relative' }}>
            <Galeria imagens={p.imagens} videos={p.videos} nome={p.nome} />
            {desconto > 0 && <Box sx={{ position: 'absolute', top: 12, left: 12, px: 1.25, height: 28, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>−{desconto}%</Box>}
          </Box>
        </Box>

        <Stack spacing={3} sx={{ minWidth: 0 }}>
          {vendedora && (
            <Stack direction="row" spacing={1} sx={{ alignSelf: 'flex-start', alignItems: 'center', height: 36, pl: 0.75, pr: 2, borderRadius: 99, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', fontSize: 14 }}>
              <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'secondary.main', color: 'marca.creme', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{vendedora[0]}</Box>
              <span><strong>{vendedora}</strong> separou esta peça para você</span>
            </Stack>
          )}
          <Stack component="header" spacing={0.75}>
            <Typography sx={estiloRotulo}>{p.marca}{p.categoria ? ` · ${p.categoria}` : ''}</Typography>
            <Typography component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.9rem' }, lineHeight: 1.2, fontWeight: 600, color: 'marca.marrom-950' }}>{p.nome}</Typography>
            {p.cor && <Typography variant="body2" color="text.secondary">Cor: {p.cor}</Typography>}
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1.5, pt: 0.5 }}>
              <Typography component="strong" sx={{ fontWeight: 800, fontSize: '1.9rem', color: desconto > 0 ? 'imperdivel.main' : 'marca.marrom-950' }}>{brl(p.preco)}</Typography>
              {desconto > 0 && <Typography component="s" color="text.secondary">{brl(p.precoCheio)}</Typography>}
              {desconto > 0 && <Typography variant="body2" sx={{ fontWeight: 600, color: 'marca.oliva' }}>Você economiza {brl(p.precoCheio - p.preco)}</Typography>}
            </Stack>
          </Stack>

          {p.cores.length > 0 && (
            <Box component="section" aria-labelledby="outras-cores" sx={{ display: 'grid', gap: 1 }}>
              <Typography id="outras-cores" component="h2" variant="body2" sx={{ fontWeight: 600 }}>Outras cores</Typography>
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
                {p.cores.map(c => (
                  <LinkSimples key={c.chave} href={`/peca/${encodeURIComponent(c.chave)}`} sx={{ width: 80, flexShrink: 0, fontSize: 12, textAlign: 'center', color: 'text.secondary' }}>
                    <Box sx={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 3, overflow: 'hidden', bgcolor: 'marca.bege', mb: 0.5, outline: 1, outlineColor: 'marca.borda' }}><FotoCheia src={c.imagem} /></Box>
                    {c.cor ?? 'Ver cor'}
                  </LinkSimples>
                ))}
              </Stack>
            </Box>
          )}

          {p.variantes.length > 0 ? (
            <QueroPeca chave={chave} p={p} duvida={duvida} />
          ) : (
            <Box sx={{ bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6, p: 2.5, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
              <Typography sx={{ fontWeight: 600 }}>Esta peça acabou de esgotar</Typography>
              <Typography variant="body2" color="text.secondary">Fale com {vendedora ?? 'a loja'}: podemos ter algo parecido ou avisar quando chegar.</Typography>
              <Button href={linkWhatsApp(p.contato.telefone, `Oi! Vi a peça ${p.nome}, mas ela esgotou. Tem algo parecido?`)} target="_blank" rel="noopener" variant="contained" color="whatsapp">Falar com {vendedora ?? 'a loja'}</Button>
            </Box>
          )}

          <Box sx={{ bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
            <QuemAtende nome={vendedora} link={falar} />
            <SelosConfianca />
          </Box>

          {(p.descricao || p.composicao || p.destaques.length > 0) && (
            <Box component="section" sx={{ display: 'grid', gap: 1.5, fontSize: 14, borderTop: 1, borderColor: 'marca.borda', pt: 2.5 }}>
              <Typography component="h2" variant="body2" sx={{ fontWeight: 600 }}>Sobre a peça</Typography>
              {p.descricao && <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>{p.descricao}</Typography>}
              {p.composicao && <Box><Typography sx={{ ...estiloRotulo, color: 'text.secondary', fontSize: '0.62rem' }}>Tecido</Typography>{p.composicao}</Box>}
              {p.destaques.length > 0 && <Box><Typography sx={{ ...estiloRotulo, color: 'text.secondary', fontSize: '0.62rem' }}>Destaques</Typography><Box component="ul" sx={{ m: 0, pl: 2 }}>{p.destaques.map(d => <li key={d}>{d}</li>)}</Box></Box>}
            </Box>
          )}
          {vitrines && <LinkSimples href="/vitrines" sx={{ fontSize: 14, textDecoration: 'underline' }}>Ver as vitrines da loja</LinkSimples>}
        </Stack>
      </Box>
    </PublicoLayout>
  );
}

/** "Quero esta peça": o tamanho a um toque, a ação fixa embaixo no celular e a gaveta com nome e WhatsApp. */
function QueroPeca({ chave, p, duvida }: { chave: string; p: P; duvida: string }) {
  const [varianteId, setVarianteId] = useState<number | null>(p.variantes.length === 1 ? p.variantes[0].id : null);
  const [gaveta, setGaveta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [contato, setContato] = useState(contatoVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ url: string; destinatario: string } | null>(null);
  const escolhida = p.variantes.find(v => v.id === varianteId);

  const quero = () => {
    if (!escolhida) { setAviso('Escolha o tamanho primeiro.'); document.getElementById('tamanhos-peca')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setAviso(null);
    setContato(contatoVazio());
    setGaveta(true);
  };
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const falta = erroDoContato(contato);
    if (falta) return setErro(falta);
    setErro(null);
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    setEnviando(true);
    const r = await postJson<RespostaInteresse>(`/peca/${encodeURIComponent(chave)}/quero`, { varianteId, ...contato }).catch(() => ({ ok: false as const, erro: 'Sem conexão. Tente de novo.' }));
    setEnviando(false);
    if (!r.ok) { aba?.close(); return setErro(r.erro); }
    gravarContato(contato.nome.trim(), contato.telefone);
    const url = linkWhatsApp(r.telefone, r.texto);
    if (aba) aba.location.href = url;
    setGaveta(false);
    setFeito({ url, destinatario: r.destinatario });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (feito) return <PedidoEnviado destinatario={feito.destinatario} url={feito.url} itens={escolhida ? [{ chave: escolhida.id, nome: p.nome, tamanho: escolhida.tamanho, preco: p.preco, imagem: p.imagens[0] ?? null }] : []} />;

  return (
    <Stack spacing={2}>
      <Box id="tamanhos-peca" sx={{ display: 'grid', gap: 1.25, scrollMarginTop: 96 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Tamanho{escolhida && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> · {escolhida.tamanho}</Box>}</Typography>
          <Box component="a" href={duvida} target="_blank" rel="noopener" sx={{ fontSize: 14, color: 'text.secondary' }}>Dúvida no tamanho?</Box>
        </Stack>
        <Stack direction="row" useFlexGap role="radiogroup" aria-label="Tamanho" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {p.tamanhos.map(t => {
            const v = p.variantes.find(x => x.tamanho === t.tamanho);
            return v ? <BotaoTamanho key={t.tamanho} tamanho={t.tamanho} grande ativo={v.id === varianteId} onClick={() => { setVarianteId(v.id); setAviso(null); }} />
              : <BotaoTamanho key={t.tamanho} tamanho={t.tamanho} grande esgotado />;
          })}
        </Stack>
        {escolhida?.ultimas && <Typography variant="body2" sx={{ color: 'secondary.main' }}>Últimas unidades neste tamanho.</Typography>}
        {aviso && <Typography role="alert" variant="body2" color="error">{aviso}</Typography>}
      </Box>

      <Box sx={{ display: { xs: 'none', md: 'grid' }, gap: 1 }}>
        <Button onClick={quero} variant="contained" color="whatsapp" size="large" fullWidth>Quero esta peça</Button>
        <Typography variant="caption" color="text.secondary">A peça só fica reservada depois da confirmação da loja. Frete e pagamento são combinados na conversa.</Typography>
      </Box>

      {/* Celular: preço e ação principal sempre à mão. */}
      <Box sx={{ display: { md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, px: 1.5, pb: 1.5, pt: 1.5, background: 'linear-gradient(to top, #f6efe6, rgba(246,239,230,.95), rgba(246,239,230,0))' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', borderRadius: 99, bgcolor: 'marca.marrom-950', color: 'marca.creme', pl: 2.5, pr: 0.75, py: 0.75, boxShadow: 6 }}>
          <Box sx={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>{brl(p.preco)}</Box>
            <Box sx={{ fontSize: 12, color: 'marca.areia' }}>{escolhida ? `Tamanho ${escolhida.tamanho}` : 'Escolha o tamanho'}</Box>
          </Box>
          <Button onClick={quero} variant="contained" color="whatsapp" sx={{ borderRadius: 99, height: 44, px: 2.5 }}>Quero esta peça</Button>
        </Stack>
      </Box>

      <Gaveta titulo="Quero esta peça" aberta={gaveta && !!escolhida} fechar={() => setGaveta(false)}>
        {escolhida && (
          <Box component="form" onSubmit={enviar} noValidate sx={{ position: 'relative', p: 2.5, display: 'grid', gap: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 4, p: 1 }}>
              <Box sx={{ position: 'relative', width: 48, aspectRatio: '3 / 4', borderRadius: 2, overflow: 'hidden', bgcolor: 'marca.bege', flexShrink: 0 }}><FotoCheia src={p.imagens[0] ?? null} /></Box>
              <Box sx={{ minWidth: 0, fontSize: 14 }}><Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</Box><Box sx={{ fontSize: 12, color: 'text.secondary' }}>Tam. <strong>{escolhida.tamanho}</strong> · {brl(p.preco)}</Box></Box>
            </Stack>
            <CamposContato valor={contato} mudar={setContato} />
            {erro && <Alert severity="error">{erro}</Alert>}
            <Button type="submit" disabled={enviando} variant="contained" color="whatsapp" size="large" fullWidth>{enviando ? 'Enviando…' : 'Enviar pelo WhatsApp'}</Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Sem cadastro. A peça só fica reservada depois da confirmação da loja.</Typography>
          </Box>
        )}
      </Gaveta>
    </Stack>
  );
}
