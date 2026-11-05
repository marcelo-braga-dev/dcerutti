import type { ReactNode } from 'react';
import { IconeCaminhao, IconeCasa, IconeCartao, IconeConversa } from '@/components/ui/icones';
import { brl } from '@/lib/dinheiro';

type Aviso = { icone: 'casa' | 'caminhao' | 'cartao' | 'conversa'; texto: string };

/** Os avisos da faixa a partir das configurações da loja (condicional, frete, parcelas, WhatsApp). */
export function avisosDaLoja(cfg: { cidadeCondicional: string; frete: { gratisAcima: number } | null; parcelas: number }): Aviso[] {
  const cidade = cfg.cidadeCondicional.split('/')[0];
  return [
    { icone: 'casa' as const, texto: `Prove em casa em ${cidade}: pague só o que ficar` },
    cfg.frete?.gratisAcima ? { icone: 'caminhao' as const, texto: `Frete grátis acima de ${brl(cfg.frete.gratisAcima)}` } : null,
    cfg.parcelas > 1 ? { icone: 'cartao' as const, texto: `Parcele em até ${cfg.parcelas}x` } : null,
    { icone: 'conversa' as const, texto: 'Atendimento de pessoa para pessoa no WhatsApp' },
  ].filter(a => a !== null);
}

/**
 * Faixa de avisos acima do topo: as vantagens da loja (prove em casa, frete, parcelas, atendimento).
 * No computador ficam lado a lado; no celular passam devagar, em loop (param ao tocar e com movimento reduzido).
 */
export function Avisos({ itens }: { itens: Aviso[] }) {
  if (!itens.length) return null;
  const icones: Record<string, ReactNode> = {
    casa: <IconeCasa className="size-4" />, caminhao: <IconeCaminhao className="size-4" />, cartao: <IconeCartao className="size-4" />, conversa: <IconeConversa className="size-4" />,
  };
  const lista = (oculta?: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={oculta || undefined}>
      {itens.map(i => (
        <li key={i.texto} className="flex items-center gap-2 px-6 whitespace-nowrap"><span className="text-areia/80">{icones[i.icone]}</span>{i.texto}</li>
      ))}
    </ul>
  );
  return (
    <div className="bg-marrom-950 text-creme text-[0.78rem] font-medium">
      <div className="hidden md:flex mx-auto max-w-[1440px] h-9 items-center justify-center divide-x divide-creme/15">{lista()}</div>
      <div className="md:hidden h-9 flex items-center overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-[avisos_28s_linear_infinite] active:[animation-play-state:paused]">{lista()}{lista(true)}</div>
      </div>
    </div>
  );
}
