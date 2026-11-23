'use client';

import { useEffect, type ReactNode } from 'react';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';

/**
 * Peças comuns das páginas públicas de pedido (vitrine, link da peça, sugestões), seguindo os critérios das páginas das
 * clientes (D-36): contato lembrado no aparelho, gaveta (bottom sheet), selos de confiança, quem atende e a tela final.
 */

/** Nome e WhatsApp lembrados só neste aparelho, para quem volta não digitar de novo. */
const CHAVE_CONTATO = 'dcerutti-contato-vitrine';
export function lerContato(): { nome: string; telefone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_CONTATO) ?? '{}');
    return { nome: typeof v.nome === 'string' ? v.nome : '', telefone: typeof v.telefone === 'string' ? v.telefone : '' };
  } catch { return { nome: '', telefone: '' }; }
}
export function gravarContato(nome: string, telefone: string) {
  try { localStorage.setItem(CHAVE_CONTATO, JSON.stringify({ nome, telefone })); } catch { /* sem armazenamento */ }
}

/** Trava a rolagem da página e fecha com Esc enquanto uma gaveta está aberta. */
export function useGaveta(fechar: () => void, foco: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    foco.current?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
  }, [fechar, foco]);
}

const IconeFechar = () => <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconeCheck = ({ className = 'size-4' }: { className?: string }) => <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

/** Gaveta: sobe de baixo no celular, janela no centro no computador, com título fixo e botão de fechar. */
export function Gaveta({ titulo, idTitulo, fechar, painel, largura = 'sm:w-[min(36rem,calc(100vw-2rem))]', children }: {
  titulo: string; idTitulo: string; fechar: () => void; painel: React.RefObject<HTMLDivElement | null>; largura?: string; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
      <button type="button" tabIndex={-1} aria-label="Fechar" className="absolute inset-0 bg-marrom-950/50 backdrop-blur-sm" onClick={fechar} />
      <div ref={painel} tabIndex={-1} className={`absolute inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 ${largura} max-h-[92dvh] overflow-y-auto bg-creme rounded-t-3xl sm:rounded-3xl shadow-2xl outline-none animate-[aparecer_.2s_ease-out] motion-reduce:animate-none`}>
        <div className="sticky top-0 z-10 bg-creme/95 backdrop-blur px-5 pt-3 pb-3 border-b border-borda">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-borda-forte sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <h2 id={idTitulo} className="titulo text-xl">{titulo}</h2>
            <button type="button" onClick={fechar} className="size-10 grid place-items-center rounded-full hover:bg-bege" aria-label={`Fechar: ${titulo}`}><IconeFechar /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** As regras sem letra miúda, em selos. */
export function SelosConfianca({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-suave ${className}`}>
      {['Sem cadastro', 'Pedido pelo WhatsApp', 'Reserva confirmada pela loja'].map(t => (
        <li key={t} className="flex items-center gap-1.5"><IconeCheck className="size-4 text-oliva" />{t}</li>
      ))}
    </ul>
  );
}

/** Quem atende, com a inicial e o ponto verde do WhatsApp: atendimento de pessoa para pessoa. */
export function QuemAtende({ nome, link, rotulo = 'Quem te atende' }: { nome: string | null; link: string; rotulo?: string }) {
  return (
    <a href={link} target="_blank" rel="noopener" className="flex items-center gap-3 group">
      <span className="relative size-11 shrink-0 rounded-full bg-caramelo text-creme font-display font-extrabold grid place-items-center">
        {(nome ?? 'L')[0]}
        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-whatsapp ring-2 ring-card" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-xs text-suave">{rotulo}</span>
        <span className="block font-semibold text-marrom-950 group-hover:underline underline-offset-4">{nome ?? 'Equipe da loja'} · WhatsApp</span>
      </span>
    </a>
  );
}

export type ItemEnviado = { chave: string | number; nome: string; tamanho: string; preco: number; imagem: string | null };

/** Tela final: o que foi pedido, o próximo passo e o botão do WhatsApp (o navegador do Instagram pode bloquear a aba). */
export function PedidoEnviado({ destinatario, url, itens, voltar, rotuloVoltar = 'Continuar vendo as peças' }: {
  destinatario: string; url: string; itens: ItemEnviado[]; voltar?: () => void; rotuloVoltar?: string;
}) {
  const total = itens.reduce((a, x) => a + x.preco, 0);
  return (
    <section className="max-w-xl w-full justify-self-center bg-card border border-borda rounded-[2rem] p-6 sm:p-8 grid gap-5">
      <div className="text-center grid gap-3 justify-items-center">
        <span className="size-16 rounded-full bg-oliva text-creme grid place-items-center shadow-lg shadow-oliva/20" aria-hidden="true"><IconeCheck className="size-8" /></span>
        <h2 className="titulo text-2xl">Pedido recebido!</h2>
        <p className="text-suave max-w-sm">Agora é só enviar a mensagem no WhatsApp para falar com {destinatario}. As peças ficam reservadas depois da confirmação da loja.</p>
      </div>
      <a href={url} target="_blank" rel="noopener" className={botao('whatsapp', 'g', 'w-full')}>Abrir o WhatsApp</a>
      {itens.length > 0 && (
        <ul className="grid gap-2 border-t border-borda pt-4">
          {itens.map(i => (
            <li key={i.chave} className="flex items-center gap-3 text-sm">
              <span className="relative w-10 aspect-[3/4] shrink-0 rounded-lg overflow-hidden bg-bege"><Foto src={i.imagem} alt="" sizes="40px" /></span>
              <span className="min-w-0 flex-1 truncate">{i.nome} · <strong>{i.tamanho}</strong></span>
              <span className="font-semibold">{brl(i.preco)}</span>
            </li>
          ))}
          {itens.length > 1 && <li className="flex justify-between font-display font-extrabold text-lg pt-1"><span>Total</span><span>{brl(total)}</span></li>}
        </ul>
      )}
      <ol className="grid gap-2 text-sm">
        {[`Envie a mensagem para ${destinatario} no WhatsApp`, 'A loja confere e separa as peças', 'Vocês combinam o frete e o pagamento'].map((t, i) => (
          <li key={t} className="flex gap-3 items-center"><span className="size-7 shrink-0 rounded-full bg-bege text-caramelo font-display font-extrabold grid place-items-center text-xs">{i + 1}</span>{t}</li>
        ))}
      </ol>
      {voltar && <button type="button" onClick={voltar} className="text-sm underline underline-offset-4 justify-self-center text-marrom-950">{rotuloVoltar}</button>}
    </section>
  );
}
