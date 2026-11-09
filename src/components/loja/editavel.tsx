'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { IconeOlho } from '@/components/ui/icones';
import { limparLink, linkDe, linkPadrao, TEXTOS_INICIO, type CampoImagem, type CampoTexto, type ConteudoInicio, type Secao } from '@/lib/conteudo-inicio';
import { Foto } from './foto';

/**
 * Edição visual da página inicial. Fora do editor, não há provedor e os componentes só mostram o conteúdo.
 * Dentro do editor (`ProvedorEdicao`), cada texto vira editável com um clique, cada foto ganha "Trocar foto" e cada
 * seção, o botão de ocultar e cada botão ou card, o de trocar o link.
 */
type Edicao = {
  conteudo: ConteudoInicio;
  mudarTexto: (campo: CampoTexto, valor: string) => void;
  trocarImagem: (campo: CampoImagem) => void;
  usarAutomatica: (campo: CampoImagem) => void;
  alternarSecao: (s: Secao) => void;
  abrirLink: (campo: string, rotulo: string) => void;
  /** Muda a cada "Desfazer": os textos recarregam o valor. */
  versao: number;
  enviando: CampoImagem | null;
};

const Ctx = createContext<Edicao | null>(null);
export const ProvedorEdicao = Ctx.Provider;
export const useEdicao = () => useContext(Ctx);

/**
 * Texto da página. `valor` é o texto pronto (com a cidade, o frete…); `bruto`, o que o gestor edita (com {cidade}).
 * No editor: edição direta na página, uma linha (Enter confirma), colando só texto.
 */
export function Texto({ campo, valor, bruto }: { campo: CampoTexto; valor: string; bruto: string }) {
  const e = useEdicao();
  const ref = useRef<HTMLSpanElement>(null);
  // No editor vale o estado dele (sem o campo, o texto de fábrica); fora dele, o texto salvo.
  const atual = e ? e.conteudo.textos[campo] ?? TEXTOS_INICIO[campo] : bruto;
  // O texto é escrito no elemento só ao montar e no "Desfazer" (o React não controla o conteúdo): reescrever a cada
  // tecla faria o cursor pular.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== atual) ref.current.textContent = atual;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.versao]);
  if (!e) return <>{valor}</>;
  return (
    <span ref={ref} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck data-editavel title="Clique para editar"
      onInput={ev => e.mudarTexto(campo, ev.currentTarget.textContent ?? '')}
      onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur(); } }}
      onClick={ev => { ev.preventDefault(); ev.stopPropagation(); }}
      className="rounded-md cursor-text outline-1 outline-dashed outline-offset-2 outline-[#e0b23a]/60 hover:outline-2 hover:outline-[#e0b23a] focus:outline-2 focus:outline-solid focus:outline-[#e0b23a] focus:bg-[#ffd86b]/20 -mx-0.5 px-0.5 min-w-[2ch] inline-block" />
  );
}

/** Foto de um espaço da página: a escolhida pelo gestor ou a automática. No editor, com "Trocar foto". */
export function ImagemEditavel({ campo, salva, automatica, sizes, prioridade, className }: {
  campo: CampoImagem; salva: string | null; automatica: string | null; sizes: string; prioridade?: boolean; className?: string;
}) {
  const e = useEdicao();
  const escolhida = e ? e.conteudo.imagens[campo] ?? null : salva;
  const foto = <Foto src={escolhida || automatica} alt="" sizes={sizes} prioridade={prioridade} className={className} />;
  if (!e) return foto;
  return (
    <>
      {foto}
      <span data-editor-ui className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5" onClick={ev => { ev.preventDefault(); ev.stopPropagation(); }}>
        <button type="button" onClick={() => e.trocarImagem(campo)} disabled={e.enviando === campo}
          className="h-9 px-3.5 rounded-full bg-card text-marrom-950 text-xs font-semibold shadow-lg ring-2 ring-[#ffd86b] hover:bg-[#ffd86b]">
          {e.enviando === campo ? 'Enviando…' : '📷 Trocar foto'}
        </button>
        {escolhida && (
          <button type="button" onClick={() => e.usarAutomatica(campo)} className="h-9 px-3.5 rounded-full bg-marrom-950/80 text-creme text-xs font-semibold shadow-lg backdrop-blur">
            Usar foto automática
          </button>
        )}
      </span>
    </>
  );
}

const POSICAO_LINK = {
  fora: '-top-3 -right-2',
  dentro: 'top-2 right-2 sm:top-3 sm:right-3',
  seta: 'right-3 sm:right-6 bottom-16 sm:bottom-20',
  lado: 'right-full mr-2 top-1/2 -translate-y-1/2',
};

/**
 * Botão ou card com destino editável. Sem destino, é só um bloco (ex.: as vantagens da loja, até o gestor pôr um link).
 * Endereço de fora abre em outra aba. No editor, sem `campo` não há o que trocar; com ele, ganha o botão "Link".
 */
export function LinkEditavel({ campo, rotulo = '', href, posicao = 'fora', className = '', children }: {
  campo?: string; rotulo?: string; href: string; posicao?: keyof typeof POSICAO_LINK; className?: string; children: ReactNode;
}) {
  const e = useEdicao();
  const destino = e && campo ? linkDe(e.conteudo, campo) : href;
  const editar = e && campo ? (
    <span data-editor-ui className={`absolute z-20 ${POSICAO_LINK[posicao]}`} onClick={ev => { ev.preventDefault(); ev.stopPropagation(); }}>
      <button type="button" onClick={() => e.abrirLink(campo, rotulo)} title={destino ? `Leva para: ${destino}` : 'Sem link'}
        className={`h-7 px-2.5 whitespace-nowrap rounded-full text-[0.7rem] font-semibold shadow-lg ring-2 ring-[#ffd86b] text-marrom-950 hover:bg-[#ffd86b] ${e.conteudo.links[campo] ? 'bg-[#ffd86b]' : 'bg-card'}`}>
        🔗 Link
      </button>
    </span>
  ) : null;
  const classes = `${className}${editar ? ' relative' : ''}`;
  if (!destino) return <div className={classes}>{children}{editar}</div>;
  const fora = /^https?:/i.test(destino) ? { target: '_blank', rel: 'noopener' } : {};
  return <Link href={destino} className={classes} {...fora}>{children}{editar}</Link>;
}

export type DestinoLoja = { rotulo: string; href: string };
export type GrupoDestinos = { grupo: string; itens: DestinoLoja[] };

/** Janela para escolher o destino de um botão ou card: uma página da loja ou um endereço digitado. Vale ao salvar a página. */
export function DialogoLink({ campo, rotulo, atual, destinos, aoEscolher, aoFechar }: {
  campo: string; rotulo: string; atual: string; destinos: GrupoDestinos[]; aoEscolher: (link: string) => void; aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const [valor, setValor] = useState(atual);
  const [erro, setErro] = useState(false);
  const padrao = linkPadrao(campo) ?? '';
  useEffect(() => { janela.current?.showModal(); }, []);
  const mudar = (v: string) => { setValor(v); setErro(false); };
  const aplicar = (ev: FormEvent) => {
    ev.preventDefault();
    const limpo = limparLink(valor);
    if (limpo === null) return setErro(true);
    // Endereço copiado da própria loja vira caminho, para não abrir em outra aba.
    const url = URL.canParse(limpo) ? new URL(limpo) : null;
    aoEscolher(url?.origin === location.origin ? url.pathname + url.search + url.hash : limpo);
  };
  const conhecido = destinos.some(g => g.itens.some(d => d.href === valor));
  return (
    <dialog ref={janela} onClose={aoFechar} aria-labelledby="titulo-link" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl bg-card p-6 text-marrom-950 shadow-2xl backdrop:bg-marrom-950/60">
      <form onSubmit={aplicar} noValidate className="grid gap-4">
        <div>
          <h2 id="titulo-link" className="text-lg font-bold">Para onde este link leva?</h2>
          <p className="text-sm text-suave">{rotulo}</p>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Página da loja
          <select value={conhecido ? valor : ''} onChange={ev => { if (ev.target.value) mudar(ev.target.value); }} className="h-11 w-full rounded-xl border border-borda-forte bg-creme px-3 font-normal">
            <option value="">Escolher uma página…</option>
            {destinos.map(g => (
              <optgroup key={g.grupo} label={g.grupo}>
                {g.itens.map(d => <option key={d.href} value={d.href}>{d.rotulo}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Ou digite o endereço
          <input value={valor} onChange={ev => mudar(ev.target.value)} autoComplete="off" spellCheck={false} inputMode="url" placeholder="/catalogo ou https://site.com.br"
            aria-invalid={erro} aria-describedby={erro ? 'erro-link' : undefined} className="h-11 w-full rounded-xl border border-borda-forte bg-creme px-3 font-normal" />
        </label>
        {erro && <p id="erro-link" role="alert" className="text-sm font-medium text-imperdivel">Endereço inválido. Use um caminho da loja (/catalogo) ou um endereço completo (https://site.com.br).</p>}
        <p className="text-xs text-suave">{padrao ? <>Padrão: <code>{padrao}</code>. Deixe vazio para voltar a ele.</> : 'Deixe vazio para ficar sem link.'} Endereços de fora abrem em outra aba.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => janela.current?.close()} className="h-10 px-4 rounded-full text-sm font-semibold hover:bg-bege">Cancelar</button>
          <button type="submit" className="h-10 px-6 rounded-full bg-marrom-950 text-creme text-sm font-bold hover:bg-marrom-700">Aplicar</button>
        </div>
      </form>
    </dialog>
  );
}

/** Seção da página. No editor, com o botão de ocultar; oculta, fica apagada (e fora do site ao salvar). */
export function SecaoEditavel({ secao, rotulo, children }: { secao: Secao; rotulo: string; children: ReactNode }) {
  const e = useEdicao();
  if (!e) return <>{children}</>;
  const oculta = e.conteudo.ocultas.includes(secao);
  return (
    <div className="relative group/secao min-w-0 rounded-[2.25rem] outline-2 outline-dashed outline-offset-8 outline-transparent hover:outline-[#e0b23a]/70 transition-[outline-color]">
      <div data-editor-ui className="absolute -top-5 right-2 z-20 flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover/secao:opacity-100 transition-opacity">
        <span className="h-8 px-3 grid place-items-center rounded-full bg-[#ffd86b] text-marrom-950 text-xs font-bold shadow">{rotulo}</span>
        <button type="button" onClick={() => e.alternarSecao(secao)}
          className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold shadow ${oculta ? 'bg-oliva text-creme' : 'bg-marrom-950 text-creme'}`}>
          <IconeOlho className="size-3.5" />{oculta ? 'Mostrar seção' : 'Ocultar seção'}
        </button>
      </div>
      {oculta && <div className="absolute inset-0 z-10 grid place-items-center rounded-[2rem] bg-card/70 backdrop-blur-[2px] pointer-events-none"><span className="h-9 px-4 grid place-items-center rounded-full bg-marrom-950 text-creme text-sm font-semibold">Seção oculta no site</span></div>}
      <div className={oculta ? 'opacity-40' : ''}>{children}</div>
    </div>
  );
}

/** Reduz a foto no navegador (até 2000 px, JPEG) para caber no limite de envio. */
export async function reduzirFoto(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return arquivo;
  const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && arquivo.size < 1.5 * 1024 * 1024) return arquivo;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(r => canvas.toBlob(b => r(b ?? arquivo), 'image/jpeg', 0.88));
}

/** Estado simples de "algo mudou" para avisar antes de sair sem salvar. */
export function useAvisoAoSair(ativo: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const aviso = (ev: BeforeUnloadEvent) => { ev.preventDefault(); set(n => n + 1); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [ativo]);
}
