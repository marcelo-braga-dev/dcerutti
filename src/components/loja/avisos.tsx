import type { ReactNode } from 'react';
import { IconeCaminhao, IconeCasa, IconeCartao, IconeConversa } from '@/components/ui/icones';

/**
 * Faixa de avisos acima do topo: as vantagens da loja (prove em casa, frete, parcelas, atendimento).
 * No computador ficam lado a lado; no celular passam devagar, em loop (param ao tocar e com movimento reduzido).
 */
export function Avisos({ itens }: { itens: { icone: 'casa' | 'caminhao' | 'cartao' | 'conversa'; texto: string }[] }) {
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
