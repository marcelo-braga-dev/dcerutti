'use client';

import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import {
  CORES, CORES_PADRAO, contraste, coresDe, LOGO_CLARA_PADRAO, LOGO_PADRAO, lerCor, PARES_CONTRASTE,
  type Identidade, type Token,
} from '@/lib/identidade';
import { brl } from '@/lib/dinheiro';
import { NOME_PADRAO, SLOGAN_PADRAO } from '@/lib/loja';
import { salvarIdentidade } from '@/server/acoes/identidade';

type TipoArquivo = 'logo' | 'logoClara' | 'favicon';
/** Arquivo escolhido e ainda não salvo (com a prévia), ou pedido de voltar à marca de fábrica. */
type Pendente = { arquivo: File; previa: string } | 'remover' | null;

const LIMITE = 1.8 * 1024 * 1024;
const ACEITOS = 'image/png,image/svg+xml,image/webp,image/jpeg';

/**
 * Identidade visual (D-25): cores, logos e favicon, com prévia ao vivo. A prévia aplica as cores como variáveis CSS
 * só dentro dela; o site inteiro muda quando o gestor salva.
 */
export function EditorIdentidade({ inicial }: { inicial: Identidade }) {
  const router = useRouter();
  const [salva, setSalva] = useState(inicial);
  const [cores, setCores] = useState<Record<Token, string>>(() => coresDe(inicial));
  const [textos, setTextos] = useState<Record<Token, string>>(() => coresDe(inicial));
  const [nome, setNome] = useState(inicial.nome || NOME_PADRAO);
  const [slogan, setSlogan] = useState(inicial.slogan ?? SLOGAN_PADRAO);
  const [arquivos, setArquivos] = useState<Record<TipoArquivo, Pendente>>({ logo: null, logoClara: null, favicon: null });
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  // Libera as prévias dos arquivos quando trocam ou a página fecha.
  useEffect(() => () => Object.values(arquivos).forEach(a => a && a !== 'remover' && URL.revokeObjectURL(a.previa)), [arquivos]);

  const mudou = useMemo(() => {
    const base = coresDe(salva);
    return CORES.some(c => cores[c.token] !== base[c.token]) || Object.values(arquivos).some(Boolean)
      || nome.trim() !== (salva.nome || NOME_PADRAO) || slogan.trim() !== (salva.slogan ?? SLOGAN_PADRAO);
  }, [cores, salva, arquivos, nome, slogan]);

  const mudarCor = (t: Token, v: string) => {
    setTextos(x => ({ ...x, [t]: v }));
    const cor = lerCor(v);
    if (cor) setCores(x => ({ ...x, [t]: cor }));
  };
  const definir = (t: Token, cor: string) => { setTextos(x => ({ ...x, [t]: cor })); setCores(x => ({ ...x, [t]: cor })); };
  const todas = (novas: Record<Token, string>) => { setCores(novas); setTextos(novas); };

  const escolher = (tipo: TipoArquivo, arquivo: File | null) => {
    if (!arquivo) return;
    if (arquivo.size > LIMITE) return setAviso({ tipo: 'erro', texto: 'Arquivo acima de 1,8 MB. Reduza a imagem e tente de novo.' });
    setAviso(null);
    setArquivos(x => ({ ...x, [tipo]: { arquivo, previa: URL.createObjectURL(arquivo) } }));
  };

  const imagem = (tipo: TipoArquivo) => {
    const p = arquivos[tipo];
    if (p && p !== 'remover') return p.previa;
    if (p === 'remover') return tipo === 'logo' ? LOGO_PADRAO.url : tipo === 'logoClara' ? LOGO_CLARA_PADRAO.url : '/icone.svg';
    return salva[tipo]?.url ?? (tipo === 'logo' ? LOGO_PADRAO.url : tipo === 'logoClara' ? LOGO_CLARA_PADRAO.url : '/icone.svg');
  };

  const salvar = () => {
    const fd = new FormData();
    fd.set('nome', nome);
    fd.set('slogan', slogan);
    for (const c of CORES) fd.set(`cor:${c.token}`, cores[c.token]);
    for (const [tipo, p] of Object.entries(arquivos) as [TipoArquivo, Pendente][]) {
      if (p === 'remover') fd.set(`remover:${tipo}`, '1');
      else if (p) fd.set(tipo, p.arquivo);
    }
    iniciar(async () => {
      const r = await salvarIdentidade(fd).catch(() => ({ ok: false as const, erro: 'Não foi possível salvar agora. Tente de novo.' }));
      if (!r.ok) return setAviso({ tipo: 'erro', texto: r.erro });
      setSalva(r.identidade);
      setNome(r.identidade.nome || NOME_PADRAO);
      setSlogan(r.identidade.slogan ?? SLOGAN_PADRAO);
      todas(coresDe(r.identidade));
      setArquivos({ logo: null, logoClara: null, favicon: null });
      setAviso({ tipo: 'ok', texto: r.mensagem });
      router.refresh();
    });
  };

  const problemas = PARES_CONTRASTE.map(p => ({ ...p, valor: contraste(cores[p.texto], cores[p.fundo]) })).filter(p => p.valor < p.minimo);
  const estilo = Object.fromEntries(CORES.map(c => [`--color-${c.token}`, cores[c.token]])) as CSSProperties;

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_460px] gap-6 items-start pb-24">
      <div className="grid gap-6 min-w-0">
        <Bloco titulo="Nome da loja" sub="Aparece nos títulos das páginas, nas mensagens do WhatsApp, nos e-mails, no rodapé e no cartão do pedido.">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            <CampoTexto id="nome-loja" rotulo="Nome" valor={nome} mudar={setNome} padrao={NOME_PADRAO} maximo={40} ajuda="Como a loja se apresenta: “Aqui é a Ana, da …”." />
            <CampoTexto id="slogan-loja" rotulo="Assinatura (opcional)" valor={slogan} mudar={setSlogan} padrao={SLOGAN_PADRAO} maximo={60} ajuda="Vai junto do nome no título do site e no rodapé. Em branco, só o nome." />
          </div>
        </Bloco>

        <Bloco titulo="Cores" sub="Toque no quadrado para escolher, ou digite o código (#2e2520).">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            {CORES.filter(c => !c.avancada).map(c => <CampoCor key={c.token} c={c} cor={cores[c.token]} texto={textos[c.token]} mudar={v => mudarCor(c.token, v)} definir={v => definir(c.token, v)} />)}
          </div>
          <details className="mt-6 border-t border-borda pt-4 group">
            <summary className="cursor-pointer rotulo text-caramelo list-none flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span> Mais cores (bordas, textos de apoio, alertas)
            </summary>
            <div className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-5">
              {CORES.filter(c => c.avancada).map(c => <CampoCor key={c.token} c={c} cor={cores[c.token]} texto={textos[c.token]} mudar={v => mudarCor(c.token, v)} definir={v => definir(c.token, v)} />)}
            </div>
          </details>
        </Bloco>

        <Bloco titulo="Logos e favicon" sub="PNG ou SVG com fundo transparente fica melhor. Até 1,8 MB.">
          <div className="grid sm:grid-cols-3 gap-5">
            <CampoArquivo rotulo="Logo" ajuda="Para fundo claro: cabeçalho da loja e imagem do pedido." fundo="var(--color-card)"
              src={imagem('logo')} personalizada={!!salva.logo && arquivos.logo !== 'remover'} nova={!!arquivos.logo && arquivos.logo !== 'remover'}
              escolher={f => escolher('logo', f)} remover={() => setArquivos(x => ({ ...x, logo: salva.logo ? 'remover' : null }))} />
            <CampoArquivo rotulo="Logo para fundo escuro" ajuda="Tela de entrar, painel, caixa e rodapé da loja." fundo={cores['marrom-950']}
              src={imagem('logoClara')} personalizada={!!salva.logoClara && arquivos.logoClara !== 'remover'} nova={!!arquivos.logoClara && arquivos.logoClara !== 'remover'}
              escolher={f => escolher('logoClara', f)} remover={() => setArquivos(x => ({ ...x, logoClara: salva.logoClara ? 'remover' : null }))} />
            <CampoArquivo rotulo="Favicon" ajuda="Ícone da aba do navegador e do atalho no celular. Quadrado, de preferência 512 px." fundo="var(--color-card)" quadrado
              src={imagem('favicon')} personalizada={!!salva.favicon && arquivos.favicon !== 'remover'} nova={!!arquivos.favicon && arquivos.favicon !== 'remover'}
              escolher={f => escolher('favicon', f)} remover={() => setArquivos(x => ({ ...x, favicon: salva.favicon ? 'remover' : null }))} />
          </div>
        </Bloco>
      </div>

      <div id="previa" className="grid gap-4 xl:sticky xl:top-6 scroll-mt-4">
        <span className="rotulo text-suave">Prévia</span>
        <Previa estilo={estilo} logo={imagem('logo')} logoClara={imagem('logoClara')} favicon={imagem('favicon')} nome={nome} slogan={slogan} />
        {problemas.length > 0 ? (
          <Alerta tipo="aviso">
            <strong>Pode ficar difícil de ler:</strong>
            <ul className="mt-1 list-disc pl-5">{problemas.map(p => <li key={p.onde}>{p.onde} (contraste {p.valor.toFixed(1).replace('.', ',')}; o mínimo é {String(p.minimo).replace('.', ',')})</li>)}</ul>
          </Alerta>
        ) : (
          <p className="text-sm text-oliva">✓ Todas as combinações de texto e fundo estão legíveis.</p>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 lg:left-[240px] z-20 bg-card/95 backdrop-blur border-t border-borda px-4 sm:px-8 py-3 flex flex-wrap items-center gap-3">
        {aviso && <span role="status" className={`text-sm ${aviso.tipo === 'ok' ? 'text-oliva' : 'text-vermelho'}`}>{aviso.texto}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <a href="#previa" className="xl:hidden text-sm text-caramelo underline underline-offset-4">Ver prévia</a>
          <button type="button" onClick={() => { todas({ ...CORES_PADRAO }); setNome(NOME_PADRAO); setSlogan(SLOGAN_PADRAO); setArquivos({ logo: salva.logo ? 'remover' : null, logoClara: salva.logoClara ? 'remover' : null, favicon: salva.favicon ? 'remover' : null }); }}
            className="text-sm text-suave underline underline-offset-4">Voltar à marca de fábrica</button>
          {mudou && <button type="button" onClick={() => { todas(coresDe(salva)); setNome(salva.nome || NOME_PADRAO); setSlogan(salva.slogan ?? SLOGAN_PADRAO); setArquivos({ logo: null, logoClara: null, favicon: null }); setAviso(null); }} className={botao('secundario')}>Desfazer</button>}
          <button type="button" onClick={salvar} disabled={!mudou || pendente} className={botao('primario')}>{pendente ? 'Salvando…' : 'Salvar identidade'}</button>
        </div>
      </div>
    </div>
  );
}

function Bloco({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return (
    <section className="bg-card border border-borda p-5 sm:p-8">
      <h2 className="titulo text-lg">{titulo}</h2>
      <p className="text-sm text-suave mt-1 mb-6">{sub}</p>
      {children}
    </section>
  );
}

function CampoTexto({ id, rotulo, valor, mudar, padrao, maximo, ajuda }: { id: string; rotulo: string; valor: string; mudar: (v: string) => void; padrao: string; maximo: number; ajuda: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="rotulo text-marrom-950">{rotulo}</label>
        {valor.trim() !== padrao && <button type="button" onClick={() => mudar(padrao)} className="text-xs text-suave underline underline-offset-4">padrão</button>}
      </div>
      <input id={id} value={valor} onChange={e => mudar(e.target.value)} maxLength={maximo}
        className="w-full h-11 px-3 border border-borda-forte bg-creme outline-none focus:border-marrom-950" />
      <p className="text-xs text-suave">{ajuda}</p>
    </div>
  );
}

function CampoCor({ c, cor, texto, mudar, definir }: { c: (typeof CORES)[number]; cor: string; texto: string; mudar: (v: string) => void; definir: (v: string) => void }) {
  const invalida = !lerCor(texto);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`cor-${c.token}`} className="rotulo text-marrom-950">{c.rotulo}</label>
        {cor !== c.padrao && <button type="button" onClick={() => definir(c.padrao)} className="text-xs text-suave underline underline-offset-4">padrão</button>}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={cor} onChange={e => definir(e.target.value)} aria-label={`${c.rotulo}: escolher`}
          className="size-11 shrink-0 cursor-pointer border border-borda-forte bg-card p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0" />
        <input id={`cor-${c.token}`} value={texto} onChange={e => mudar(e.target.value)} onBlur={() => invalida && mudar(cor)} spellCheck={false}
          className={`w-full h-11 px-3 border bg-creme font-mono text-sm uppercase outline-none focus:border-marrom-950 ${invalida ? 'border-vermelho' : 'border-borda-forte'}`} />
      </div>
      <p className="text-xs text-suave">{c.ajuda}</p>
    </div>
  );
}

function CampoArquivo({ rotulo, ajuda, fundo, src, personalizada, nova, quadrado, escolher, remover }: {
  rotulo: string; ajuda: string; fundo: string; src: string; personalizada: boolean; nova: boolean; quadrado?: boolean;
  escolher: (f: File | null) => void; remover: () => void;
}) {
  return (
    <div className="grid gap-2 content-start">
      <span className="rotulo text-marrom-950">{rotulo}</span>
      <div className="h-28 grid place-items-center border border-borda p-3" style={{ background: fundo }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) do arquivo escolhido */}
        <img src={src} alt="" className={quadrado ? 'size-16 object-contain' : 'max-h-20 max-w-full object-contain'} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className={botao('secundario', 'p', 'cursor-pointer')}>
          {personalizada || nova ? 'Trocar' : 'Enviar'}
          <input type="file" accept={ACEITOS} className="sr-only" onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>
        {(personalizada || nova) && <button type="button" onClick={remover} className="text-xs text-suave underline underline-offset-4">{nova && !personalizada ? 'Cancelar' : 'Usar a de fábrica'}</button>}
      </div>
      {nova && <span className="text-xs text-caramelo">Nova, ainda não salva</span>}
      <p className="text-xs text-suave">{ajuda}</p>
    </div>
  );
}

/** Miniatura do site com as cores escolhidas: aba, cabeçalho da loja, card de produto, botões, aviso e o topo do painel. */
function Previa({ estilo, logo, logoClara, favicon, nome, slogan }: { estilo: CSSProperties; logo: string; logoClara: string; favicon: string; nome: string; slogan: string }) {
  /* eslint-disable @next/next/no-img-element -- prévias locais (blob:) dos arquivos escolhidos */
  return (
    <div style={estilo} className="border border-borda-forte shadow-sm overflow-hidden text-marrom-900 bg-creme text-[13px]">
      <div className="flex items-center gap-2 bg-[#dedad4] px-3 pt-2">
        <div className="flex items-center gap-2 bg-[#f4f2ef] rounded-t-md px-3 py-1.5 max-w-[220px]">
          <img src={favicon} alt="" className="size-4 object-contain" />
          <span className="truncate text-[11px] text-[#333]">{nome.trim() || NOME_PADRAO}{slogan.trim() ? ` — ${slogan.trim()}` : ''}</span>
        </div>
      </div>
      <div className="bg-card border-b border-borda px-4 h-14 flex items-center justify-between">
        <img src={logo} alt="" className="h-8 w-auto max-w-[120px] object-contain mix-blend-multiply" />
        <div className="flex gap-3 text-marrom-950"><span>⌕</span><span>♡</span><span>◯</span></div>
      </div>
      <div className="p-4 grid grid-cols-[1fr_1.2fr] gap-4">
        <div className="bg-card border border-borda">
          <div className="relative aspect-[4/5] bg-bege grid place-items-center text-suave rotulo !text-[0.55rem]">
            Foto
            <span className="absolute left-2 top-2 bg-imperdivel text-white rotulo !text-[0.5rem] px-1.5 py-0.5">−30%</span>
          </div>
          <div className="p-2.5 grid gap-1">
            <span className="leading-snug text-marrom-950">Camiseta Básica</span>
            <span className="flex items-baseline gap-1.5"><strong className="font-display text-imperdivel">{brl(69.9)}</strong><s className="text-[11px] text-suave">{brl(99.9)}</s></span>
          </div>
        </div>
        <div className="grid gap-2.5 content-start">
          <span className="titulo text-base">Título da página</span>
          <p className="text-marrom-900 leading-snug">Texto comum das páginas, com um <a className="text-caramelo underline">link de destaque</a>.</p>
          <p className="text-[11px] text-suave">Texto secundário, dicas e legendas.</p>
          <div className="h-9 px-3 border border-borda-forte bg-card flex items-center text-suave">Campo</div>
          <span className="h-9 grid place-items-center bg-marrom-950 text-creme rotulo !text-[0.6rem]">Botão principal</span>
          <span className="h-9 grid place-items-center bg-oliva text-creme rotulo !text-[0.6rem]">Confirmar</span>
          <span className="text-[11px] text-vermelho">Mensagem de erro</span>
        </div>
      </div>
      <div className="bg-marrom-950 text-creme px-4 py-3 flex items-center gap-3">
        <img src={logoClara} alt="" className="h-7 w-auto max-w-[110px] object-contain" />
        <span className="rotulo !text-[0.55rem] text-areia border-l border-creme/20 pl-3">Painel</span>
        <span className="ml-auto text-areia text-[11px]">Topo do painel, do caixa e rodapé</span>
      </div>
    </div>
  );
  /* eslint-enable @next/next/no-img-element */
}
