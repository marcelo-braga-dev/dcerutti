import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { brl } from '@/lib/dinheiro';
import { CORES, CORES_PADRAO, contraste, coresDe, LOGO_CLARA_PADRAO, LOGO_PADRAO, lerCor, PARES_CONTRASTE, type Identidade, type Token } from '@/lib/identidade';

type TipoArquivo = 'logo' | 'logoClara' | 'favicon';
type Pendente = { arquivo: File; previa: string } | 'remover' | null;
const LIMITE = 1.8 * 1024 * 1024;
const ACEITOS = 'image/png,image/svg+xml,image/webp,image/jpeg';
const PADRAO_ARQ: Record<TipoArquivo, string> = { logo: LOGO_PADRAO.url, logoClara: LOGO_CLARA_PADRAO.url, favicon: '/favicon.ico' };

/** Identidade visual (porta de painel/identidade e components/painel/editor-identidade.tsx): cores, nome, logos e favicon com prévia. */
export default function EditorIdentidade({ inicial, padrao }: { inicial: Identidade; padrao: { nome: string; slogan: string } }) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const [cores, setCores] = useState<Record<Token, string>>(() => coresDe(inicial));
  const [textos, setTextos] = useState<Record<Token, string>>(() => coresDe(inicial));
  const [nome, setNome] = useState(inicial.nome || padrao.nome);
  const [slogan, setSlogan] = useState(inicial.slogan ?? padrao.slogan);
  const [arquivos, setArquivos] = useState<Record<TipoArquivo, Pendente>>({ logo: null, logoClara: null, favicon: null });
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setCores(coresDe(inicial)); setTextos(coresDe(inicial)); setNome(inicial.nome || padrao.nome); setSlogan(inicial.slogan ?? padrao.slogan); setArquivos({ logo: null, logoClara: null, favicon: null }); }, [inicial, padrao]);
  const mudou = useMemo(() => {
    const base = coresDe(inicial);
    return CORES.some(c => cores[c.token] !== base[c.token]) || Object.values(arquivos).some(Boolean) || nome.trim() !== (inicial.nome || padrao.nome) || slogan.trim() !== (inicial.slogan ?? padrao.slogan);
  }, [cores, inicial, arquivos, nome, slogan, padrao]);

  const mudarCor = (t: Token, v: string) => { setTextos(x => ({ ...x, [t]: v })); const c = lerCor(v); if (c) setCores(x => ({ ...x, [t]: c })); };
  const definir = (t: Token, c: string) => { setTextos(x => ({ ...x, [t]: c })); setCores(x => ({ ...x, [t]: c })); };
  const todas = (n: Record<Token, string>) => { setCores(n); setTextos(n); };
  const escolher = (tipo: TipoArquivo, f: File | null) => {
    if (!f) return;
    if (f.size > LIMITE) { setAviso('Arquivo acima de 1,8 MB. Reduza a imagem e tente de novo.'); return; }
    setAviso(null);
    setArquivos(x => ({ ...x, [tipo]: { arquivo: f, previa: URL.createObjectURL(f) } }));
  };
  const imagem = (tipo: TipoArquivo) => {
    const p = arquivos[tipo];
    if (p && p !== 'remover') return p.previa;
    return p === 'remover' ? PADRAO_ARQ[tipo] : inicial[tipo]?.url ?? PADRAO_ARQ[tipo];
  };
  const salvar = () => {
    const dados: Record<string, string | File> = { nome, slogan };
    for (const c of CORES) dados[`cor:${c.token}`] = cores[c.token];
    for (const [tipo, p] of Object.entries(arquivos) as [TipoArquivo, Pendente][]) {
      if (p === 'remover') dados[`remover:${tipo}`] = '1';
      else if (p) dados[tipo] = p.arquivo;
    }
    setSalvando(true);
    router.post('/painel/identidade', dados, { forceFormData: true, preserveScroll: true, onFinish: () => setSalvando(false) });
  };
  const problemas = PARES_CONTRASTE.map(p => ({ ...p, valor: contraste(cores[p.texto], cores[p.fundo]) })).filter(p => p.valor < p.minimo);

  return (
    <PainelLayout>
      <Head title="Identidade visual" />
      <CabecalhoPagina sobre="Loja" titulo="Identidade visual">Cores, logos e favicon da loja, do painel e do caixa. Veja na prévia antes de salvar.</CabecalhoPagina>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: 'minmax(0,1fr) 460px' }, gap: 3, alignItems: 'start', pb: 12 }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Bloco titulo="Nome da loja" sub="Aparece nos títulos das páginas, nas mensagens do WhatsApp, nos e-mails, no rodapé e no cartão do pedido.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
              <TextField label="Nome" value={nome} onChange={e => setNome(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} helperText="Como a loja se apresenta: “Aqui é a Ana, da …”." />
              <TextField label="Assinatura (opcional)" value={slogan} onChange={e => setSlogan(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} helperText="Vai junto do nome no título do site e no rodapé. Em branco, só o nome." />
            </Box>
          </Bloco>
          <Bloco titulo="Cores" sub="Toque no quadrado para escolher, ou digite o código (#2e2520).">
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
              {CORES.filter(c => !c.avancada).map(c => <CampoCor key={c.token} c={c} cor={cores[c.token]} texto={textos[c.token]} mudar={v => mudarCor(c.token, v)} definir={v => definir(c.token, v)} />)}
            </Box>
            <details style={{ marginTop: 24 }}>
              <summary style={{ cursor: 'pointer' }}>Mais cores (bordas, textos de apoio, alertas)</summary>
              <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
                {CORES.filter(c => c.avancada).map(c => <CampoCor key={c.token} c={c} cor={cores[c.token]} texto={textos[c.token]} mudar={v => mudarCor(c.token, v)} definir={v => definir(c.token, v)} />)}
              </Box>
            </details>
          </Bloco>
          <Bloco titulo="Logos e favicon" sub="PNG ou SVG com fundo transparente fica melhor. Até 1,8 MB.">
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
              {([['logo', 'Logo', 'Para fundo claro: cabeçalho da loja e imagem do pedido.', cores.card], ['logoClara', 'Logo para fundo escuro', 'Tela de entrar, painel, caixa e rodapé da loja.', cores['marrom-950']], ['favicon', 'Favicon', 'Ícone da aba e do atalho no celular. Quadrado, de preferência 512 px.', cores.card]] as const).map(([tipo, rotulo, ajuda, fundo]) => {
                const nova = !!arquivos[tipo] && arquivos[tipo] !== 'remover';
                const propria = !!inicial[tipo] && arquivos[tipo] !== 'remover';
                return (
                  <Box key={tipo} sx={{ display: 'grid', gap: 1, alignContent: 'start' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{rotulo}</Typography>
                    <Box sx={{ height: 112, display: 'grid', placeItems: 'center', border: 1, borderColor: 'divider', p: 1.5, bgcolor: fundo }}>
                      <Box component="img" src={imagem(tipo)} alt="" sx={tipo === 'favicon' ? { width: 64, height: 64, objectFit: 'contain' } : { maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} />
                    </Box>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Button component="label" variant="outlined" size="small">{propria || nova ? 'Trocar' : 'Enviar'}<input hidden type="file" accept={ACEITOS} onChange={e => { escolher(tipo, e.target.files?.[0] ?? null); e.target.value = ''; }} /></Button>
                      {(propria || nova) && <Button size="small" onClick={() => setArquivos(x => ({ ...x, [tipo]: inicial[tipo] ? 'remover' : null }))} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>{nova && !propria ? 'Cancelar' : 'Usar a de fábrica'}</Button>}
                    </Stack>
                    {nova && <Typography variant="caption" sx={{ color: 'secondary.main' }}>Nova, ainda não salva</Typography>}
                    <Typography variant="caption" color="text.secondary">{ajuda}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Bloco>
        </Stack>
        <Box id="previa" sx={{ display: 'grid', gap: 2, position: { xl: 'sticky' }, top: { xl: 24 } }}>
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' }}>Prévia</Typography>
          <Previa cores={cores} logo={imagem('logo')} logoClara={imagem('logoClara')} favicon={imagem('favicon')} nome={nome} slogan={slogan} />
          {problemas.length > 0
            ? <Alert severity="warning"><strong>Pode ficar difícil de ler:</strong><ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{problemas.map(p => <li key={p.onde}>{p.onde} (contraste {p.valor.toFixed(1).replace('.', ',')}; o mínimo é {String(p.minimo).replace('.', ',')})</li>)}</ul></Alert>
            : <Typography variant="body2" sx={{ color: 'success.main' }}>✓ Todas as combinações de texto e fundo estão legíveis.</Typography>}
        </Box>
      </Box>
      <Box sx={{ position: 'fixed', bottom: 0, left: { xs: 0, lg: 248 }, right: 0, zIndex: 20, bgcolor: 'rgba(255,253,249,.95)', backdropFilter: 'blur(8px)', borderTop: 1, borderColor: 'divider', px: { xs: 2, sm: 4 }, py: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        {(aviso || errors.erro) && <Typography variant="body2" color="error">{aviso ?? errors.erro}</Typography>}
        {!aviso && !errors.erro && flash.sucesso && !mudou && <Typography variant="body2" sx={{ color: 'success.main' }}>{flash.sucesso}</Typography>}
        <Stack direction="row" spacing={1.5} sx={{ ml: 'auto', alignItems: 'center' }}>
          <Button size="small" onClick={() => { todas({ ...CORES_PADRAO }); setNome(padrao.nome); setSlogan(padrao.slogan); setArquivos({ logo: inicial.logo ? 'remover' : null, logoClara: inicial.logoClara ? 'remover' : null, favicon: inicial.favicon ? 'remover' : null }); }} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Voltar à marca de fábrica</Button>
          {mudou && <Button variant="outlined" onClick={() => { todas(coresDe(inicial)); setNome(inicial.nome || padrao.nome); setSlogan(inicial.slogan ?? padrao.slogan); setArquivos({ logo: null, logoClara: null, favicon: null }); setAviso(null); }}>Desfazer</Button>}
          <Button variant="contained" onClick={salvar} disabled={!mudou || salvando}>{salvando ? 'Salvando…' : 'Salvar identidade'}</Button>
        </Stack>
      </Box>
    </PainelLayout>
  );
}

function Bloco({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}><Typography component="h2" variant="h6">{titulo}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>{sub}</Typography>{children}</Card>;
}

function CampoCor({ c, cor, texto, mudar, definir }: { c: (typeof CORES)[number]; cor: string; texto: string; mudar: (v: string) => void; definir: (v: string) => void }) {
  const invalida = !lerCor(texto);
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} component="label" htmlFor={`cor-${c.token}`}>{c.rotulo}</Typography>
        {cor !== c.padrao && <Button size="small" onClick={() => definir(c.padrao)} sx={{ minWidth: 0, p: 0, color: 'text.secondary', textDecoration: 'underline' }}>padrão</Button>}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box component="input" type="color" value={cor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => definir(e.target.value)} aria-label={`${c.rotulo}: escolher`} sx={{ width: 44, height: 44, p: 0.25, border: 1, borderColor: 'divider', bgcolor: 'background.paper', cursor: 'pointer', flexShrink: 0 }} />
        <TextField id={`cor-${c.token}`} size="small" value={texto} onChange={e => mudar(e.target.value)} onBlur={() => invalida && mudar(cor)} error={invalida} fullWidth slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', textTransform: 'uppercase' } } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{c.ajuda}</Typography>
    </Box>
  );
}

/** Miniatura do site com as cores escolhidas: aba, cabeçalho da loja, card de produto, botões e o topo do painel. */
function Previa({ cores: c, logo, logoClara, favicon, nome, slogan }: { cores: Record<Token, string>; logo: string; logoClara: string; favicon: string; nome: string; slogan: string }) {
  const rot = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' } as const;
  return (
    <Box sx={{ border: 1, borderColor: c['borda-forte'], overflow: 'hidden', color: c['marrom-900'], bgcolor: c.creme, fontSize: 13 }}>
      <Stack direction="row" sx={{ bgcolor: '#dedad4', px: 1.5, pt: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', bgcolor: '#f4f2ef', borderRadius: '6px 6px 0 0', px: 1.5, py: 0.75, maxWidth: 220 }}>
          <Box component="img" src={favicon} alt="" sx={{ width: 16, height: 16, objectFit: 'contain' }} />
          <Box sx={{ fontSize: 11, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome.trim()}{slogan.trim() ? ` — ${slogan.trim()}` : ''}</Box>
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ bgcolor: c.card, borderBottom: 1, borderColor: c.borda, px: 2, height: 56, alignItems: 'center', justifyContent: 'space-between' }}>
        <Box component="img" src={logo} alt="" sx={{ height: 32, maxWidth: 120, objectFit: 'contain', mixBlendMode: 'multiply' }} />
        <Box sx={{ color: c['marrom-950'] }}>⌕ ♡ ◯</Box>
      </Stack>
      <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 2 }}>
        <Box sx={{ bgcolor: c.card, border: 1, borderColor: c.borda }}>
          <Box sx={{ position: 'relative', aspectRatio: '4 / 5', bgcolor: c.bege, display: 'grid', placeItems: 'center', color: c.suave, ...rot }}>
            Foto<Box sx={{ position: 'absolute', left: 8, top: 8, bgcolor: c.imperdivel, color: '#fff', px: 0.75, ...rot, fontSize: '0.5rem' }}>−30%</Box>
          </Box>
          <Box sx={{ p: 1.25, display: 'grid', gap: 0.5 }}>
            <Box sx={{ color: c['marrom-950'] }}>Camiseta Básica</Box>
            <Box><Box component="strong" sx={{ color: c.imperdivel }}>{brl(69.9)}</Box> <Box component="s" sx={{ fontSize: 11, color: c.suave }}>{brl(99.9)}</Box></Box>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gap: 1.25, alignContent: 'start' }}>
          <Box sx={{ fontWeight: 700, fontSize: 16, color: c['marrom-950'] }}>Título da página</Box>
          <Box sx={{ lineHeight: 1.35 }}>Texto comum das páginas, com um <Box component="span" sx={{ color: c.caramelo, textDecoration: 'underline' }}>link de destaque</Box>.</Box>
          <Box sx={{ fontSize: 11, color: c.suave }}>Texto secundário, dicas e legendas.</Box>
          <Box sx={{ height: 36, px: 1.5, border: 1, borderColor: c['borda-forte'], bgcolor: c.card, display: 'flex', alignItems: 'center', color: c.suave }}>Campo</Box>
          <Box sx={{ height: 36, display: 'grid', placeItems: 'center', bgcolor: c['marrom-950'], color: c.creme, ...rot }}>Botão principal</Box>
          <Box sx={{ height: 36, display: 'grid', placeItems: 'center', bgcolor: c.oliva, color: c.creme, ...rot }}>Confirmar</Box>
          <Box sx={{ fontSize: 11, color: c.vermelho }}>Mensagem de erro</Box>
        </Box>
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ bgcolor: c['marrom-950'], color: c.creme, px: 2, py: 1.5, alignItems: 'center' }}>
        <Box component="img" src={logoClara} alt="" sx={{ height: 28, maxWidth: 110, objectFit: 'contain' }} />
        <Box sx={{ ...rot, fontSize: '0.55rem', color: c.areia, borderLeft: 1, borderColor: 'rgba(255,255,255,.2)', pl: 1.5 }}>Painel</Box>
        <Box sx={{ ml: 'auto', color: c.areia, fontSize: 11 }}>Topo do painel, do caixa e rodapé</Box>
      </Stack>
    </Box>
  );
}
