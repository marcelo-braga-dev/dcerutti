'use client';

import Link from 'next/link';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { enviarImagemInicio, salvarInicio } from '@/server/acoes/inicio';
import { CONTEUDO_INICIO_VAZIO, normalizarConteudo, type CampoImagem, type ConteudoInicio } from '@/lib/conteudo-inicio';
import { IconeCheck, IconeSeta } from '@/components/ui/icones';
import { ProvedorEdicao, reduzirFoto, useAvisoAoSair } from './editavel';

/**
 * Editor visual da página inicial (o gestor edita a própria página): barra fixa com Desfazer, Voltar ao padrão,
 * Ver no site e Salvar; abaixo, a página como na loja. Os links não navegam durante a edição.
 */
export function EditorInicio({ inicial, children }: { inicial: ConteudoInicio; children: ReactNode }) {
  const [salvo, setSalvo] = useState(inicial);
  const [conteudo, setConteudo] = useState(inicial);
  const [versao, setVersao] = useState(0);
  const [enviando, setEnviando] = useState<CampoImagem | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);
  const alvo = useRef<CampoImagem | null>(null);

  const chave = (c: ConteudoInicio) => JSON.stringify(normalizarConteudo(c));
  const mudou = chave(conteudo) !== chave(salvo);
  useAvisoAoSair(mudou);

  const mudar = (f: (c: ConteudoInicio) => ConteudoInicio) => { setAviso(null); setConteudo(f); };
  const edicao = {
    conteudo, versao, enviando,
    mudarTexto: (campo: string, valor: string) => mudar(c => ({ ...c, textos: { ...c.textos, [campo]: valor } })),
    trocarImagem: (campo: CampoImagem) => { alvo.current = campo; arquivo.current?.click(); },
    usarAutomatica: (campo: CampoImagem) => mudar(c => { const imagens = { ...c.imagens }; delete imagens[campo]; return { ...c, imagens }; }),
    alternarSecao: (s: string) => mudar(c => ({ ...c, ocultas: c.ocultas.includes(s) ? c.ocultas.filter(x => x !== s) : [...c.ocultas, s] })),
  };

  const aoEscolherFoto = async (f: File | undefined) => {
    const campo = alvo.current;
    if (!f || !campo) return;
    setEnviando(campo);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.set('arquivo', await reduzirFoto(f), 'foto.jpg');
      const r = await enviarImagemInicio(fd);
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
  const salvar = () => iniciar(async () => {
    const r = await salvarInicio(normalizarConteudo(conteudo)).catch(() => ({ ok: false as const, erro: 'Não foi possível salvar. Tente de novo.' }));
    if (!r.ok) return setAviso({ ok: false, texto: r.erro });
    setSalvo(r.conteudo);
    recomecar(r.conteudo);
    setAviso({ ok: true, texto: 'Página salva. Já está no ar.' });
  });

  return (
    <ProvedorEdicao value={edicao}>
      <div data-editor-ui className="sticky top-0 z-50 bg-marrom-950 text-creme shadow-xl">
        <div className="mx-auto max-w-[1440px] px-3 sm:px-6 min-h-16 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/painel" className="h-10 pl-2 pr-4 inline-flex items-center gap-1 rounded-full bg-creme/10 text-sm font-semibold hover:bg-creme/20">
            <IconeSeta className="size-4 rotate-180" />Painel
          </Link>
          <div className="min-w-0 mr-auto">
            <div className="text-sm font-semibold">Editando a página inicial</div>
            <div className="text-xs text-areia hidden xl:block" title="Nos textos, {cidade} vira a cidade do condicional, {frete} a regra de frete e {parcelas} o número de parcelas.">
              Clique nos textos marcados para editar · {'{cidade}'}, {'{frete}'} e {'{parcelas}'} viram os dados da loja
            </div>
          </div>
          {aviso && (
            <span role={aviso.ok ? 'status' : 'alert'} className={`text-sm font-medium inline-flex items-center gap-1.5 ${aviso.ok ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>
              {aviso.ok && <IconeCheck className="size-4" />}{aviso.texto}
            </span>
          )}
          {mudou && !aviso && <span className="text-xs text-areia">Alterações não salvas</span>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => recomecar(salvo)} disabled={!mudou || salvando} className="h-10 px-4 rounded-full text-sm font-semibold hover:bg-creme/10 disabled:opacity-40">Desfazer</button>
            <button type="button" onClick={() => { if (confirm('Voltar todos os textos, fotos e seções ao padrão? Vale ao salvar.')) recomecar(CONTEUDO_INICIO_VAZIO); }} disabled={salvando}
              className="h-10 px-4 rounded-full text-sm font-semibold hover:bg-creme/10 disabled:opacity-40">Voltar ao padrão</button>
            <a href="/" target="_blank" rel="noopener" className="h-10 px-4 inline-flex items-center rounded-full border border-creme/25 text-sm font-semibold hover:bg-creme/10">Ver no site</a>
            <button type="button" onClick={salvar} disabled={!mudou || salvando || !!enviando}
              className="h-10 px-6 rounded-full bg-[#ffd86b] text-marrom-950 text-sm font-bold hover:brightness-105 disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
      <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={e => aoEscolherFoto(e.target.files?.[0])} />
      {/* A página como na loja; links e formulários não funcionam durante a edição. */}
      <div onClickCapture={e => { const el = e.target as HTMLElement; if (el.closest('a') && !el.closest('[data-editor-ui]')) e.preventDefault(); }}
        onSubmitCapture={e => e.preventDefault()}>
        {children}
      </div>
    </ProvedorEdicao>
  );
}
