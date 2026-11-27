import { useEffect, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowBack, Check } from '@mui/icons-material';
import LojaLayout from '@/Layouts/LojaLayout';
import { ComTema } from '@/tema/ComTema';
import { DialogoLink, ProvedorEdicao, reduzirFoto, type GrupoDestinos } from '@/Components/loja/Editavel';
import { PaginaInicial, type DadosInicio } from '@/Components/loja/PaginaInicial';
import { CONTEUDO_INICIO_VAZIO, linkDe, normalizarConteudo, type CampoImagem, type ConteudoInicio } from '@/lib/conteudo-inicio';

/**
 * Editor visual da página inicial (porta de src/components/loja/editor-inicio.tsx): barra fixa com Desfazer, Voltar ao
 * padrão, Ver no site e Salvar; abaixo, a página como na loja. Os links não navegam durante a edição.
 */
export default function EditarInicio({ dados, conteudo: inicial, destinos }: { dados: DadosInicio; conteudo: ConteudoInicio; destinos: GrupoDestinos[] }) {
  const [salvo, setSalvo] = useState(inicial);
  const [conteudo, setConteudo] = useState(inicial);
  const [versao, setVersao] = useState(0);
  const [enviando, setEnviando] = useState<CampoImagem | null>(null);
  const [link, setLink] = useState<{ campo: string; rotulo: string } | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const alvo = useRef<CampoImagem | null>(null);
  const chave = (c: ConteudoInicio) => JSON.stringify(normalizarConteudo(c));
  const mudou = chave(conteudo) !== chave(salvo);

  useEffect(() => {
    if (!mudou) return;
    const aviso = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [mudou]);

  const mudar = (f: (c: ConteudoInicio) => ConteudoInicio) => { setAviso(null); setConteudo(f); };
  const edicao = {
    conteudo, versao, enviando,
    mudarTexto: (campo: string, valor: string) => mudar(c => ({ ...c, textos: { ...c.textos, [campo]: valor } })),
    trocarImagem: (campo: CampoImagem) => { alvo.current = campo; arquivo.current?.click(); },
    usarAutomatica: (campo: CampoImagem) => mudar(c => { const imagens = { ...c.imagens }; delete imagens[campo]; return { ...c, imagens }; }),
    abrirLink: (campo: string, rotulo: string) => setLink({ campo, rotulo }),
    alternarSecao: (s: string) => mudar(c => ({ ...c, ocultas: c.ocultas.includes(s) ? c.ocultas.filter(x => x !== s) : [...c.ocultas, s] })),
  };
  const escolherLink = (campo: string, destino: string) => {
    mudar(c => { const links = { ...c.links }; if (destino) links[campo] = destino; else delete links[campo]; return { ...c, links }; });
    setLink(null);
  };
  const aoEscolherFoto = async (f: File | undefined) => {
    const campo = alvo.current;
    if (!f || !campo) return;
    setEnviando(campo);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.set('arquivo', await reduzirFoto(f), 'foto.jpg');
      const xsrf = decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');
      const r = await fetch('/editar/inicio/imagem', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-XSRF-TOKEN': xsrf, Accept: 'application/json' } }).then(x => x.json());
      if (r.ok) mudar(c => ({ ...c, imagens: { ...c.imagens, [campo]: r.url } }));
      else setAviso({ ok: false, texto: r.erro });
    } catch {
      setAviso({ ok: false, texto: 'Não foi possível enviar a foto. Tente de novo.' });
    } finally {
      setEnviando(null);
      if (arquivo.current) arquivo.current.value = '';
    }
  };
  const recomecar = (c: ConteudoInicio) => { setConteudo(c); setVersao(v => v + 1); setAviso(null); };
  const salvar = () => {
    const novo = normalizarConteudo(conteudo);
    setSalvando(true);
    router.put('/editar/inicio', novo as never, {
      preserveScroll: true, preserveState: true,
      onSuccess: () => { setSalvo(novo); recomecar(novo); setAviso({ ok: true, texto: 'Página salva. Já está no ar.' }); },
      onError: e => setAviso({ ok: false, texto: e.erro ?? 'Não foi possível salvar. Tente de novo.' }),
      onFinish: () => setSalvando(false),
    });
  };
  const claro = { color: 'marca.creme', borderRadius: 99, '&:hover': { bgcolor: 'rgba(246,242,236,.1)' } };

  return (
    <ComTema area="loja">
    <ProvedorEdicao value={edicao}>
      <Head title="Editar página inicial" />
      <Box data-editor-ui sx={{ position: 'sticky', top: 0, zIndex: 1300, bgcolor: 'marca.marrom-950', color: 'marca.creme', boxShadow: 6 }}>
        <Stack direction="row" useFlexGap sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 1.5, sm: 3 }, minHeight: 64, py: 1, flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
          <Button href="/painel" startIcon={<ArrowBack />} sx={{ ...claro, bgcolor: 'rgba(246,242,236,.1)' }}>Painel</Button>
          <Box sx={{ minWidth: 0, mr: 'auto' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Editando a página inicial</Typography>
            <Typography sx={{ fontSize: 12, color: 'marca.areia', display: { xs: 'none', xl: 'block' } }}>Clique nos textos marcados para editar · Link muda o destino · {'{cidade}'}, {'{frete}'} e {'{parcelas}'} viram os dados da loja</Typography>
          </Box>
          {aviso && <Typography role={aviso.ok ? 'status' : 'alert'} sx={{ fontSize: 14, fontWeight: 500, color: aviso.ok ? '#86efac' : '#fca5a5', display: 'flex', gap: 0.5, alignItems: 'center' }}>{aviso.ok && <Check fontSize="small" />}{aviso.texto}</Typography>}
          {mudou && !aviso && <Typography sx={{ fontSize: 12, color: 'marca.areia' }}>Alterações não salvas</Typography>}
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button onClick={() => recomecar(salvo)} disabled={!mudou || salvando} sx={claro}>Desfazer</Button>
            <Button onClick={() => { if (confirm('Voltar todos os textos, fotos, links e seções ao padrão? Vale ao salvar.')) recomecar(CONTEUDO_INICIO_VAZIO); }} disabled={salvando} sx={claro}>Voltar ao padrão</Button>
            <Button component="a" href="/" target="_blank" rel="noopener" variant="outlined" sx={{ ...claro, borderColor: 'rgba(246,242,236,.25)' }}>Ver no site</Button>
            <Button onClick={salvar} disabled={!mudou || salvando || !!enviando} variant="contained" sx={{ borderRadius: 99, px: 3, bgcolor: '#ffd86b', color: 'marca.marrom-950', fontWeight: 700 }}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
          </Stack>
        </Stack>
      </Box>
      <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={e => aoEscolherFoto(e.target.files?.[0])} />
      {link && <DialogoLink key={link.campo} {...link} atual={linkDe(conteudo, link.campo)} destinos={destinos} aoEscolher={d => escolherLink(link.campo, d)} aoFechar={() => setLink(null)} />}
      <Box onClickCapture={e => { const el = e.target as HTMLElement; if (el.closest('a') && !el.closest('[data-editor-ui]')) { e.preventDefault(); e.stopPropagation(); } }} onSubmitCapture={e => e.preventDefault()}>
        <LojaLayout estatico>
          <PaginaInicial dados={dados} conteudo={conteudo} />
        </LojaLayout>
      </Box>
    </ProvedorEdicao>
    </ComTema>
  );
}
