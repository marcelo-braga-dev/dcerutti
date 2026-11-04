'use client';

import { usePathname } from 'next/navigation';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeWhatsApp } from './previa-whatsapp';
import { nomeDaLoja } from '@/lib/loja';

/** Botão do WhatsApp da loja no canto da tela. Some na sacola e na peça, que já têm os botões de WhatsApp e de compra. */
export function WhatsAppFlutuante({ telefone }: { telefone: string }) {
  const caminho = usePathname();
  if (caminho.startsWith('/sacola') || caminho.startsWith('/produto/') || caminho.startsWith('/minha-conta')) return null;
  return (
    <a href={linkWhatsApp(telefone, `Olá! Vim pelo catálogo da ${nomeDaLoja()}.`)} target="_blank" rel="noopener" aria-label="Falar com a loja no WhatsApp"
      className={`group fixed z-30 right-4 h-14 min-w-14 rounded-full bg-whatsapp text-white flex items-center justify-center shadow-lg shadow-black/20 hover:bg-whatsapp-escuro hover:scale-105 transition ${caminho === '/catalogo' ? 'bottom-20 lg:bottom-6' : 'bottom-5 sm:bottom-6'}`}>
      <IconeWhatsApp className="size-7" />
      <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-[#4ade80] ring-2 ring-card" aria-hidden="true" />
    </a>
  );
}
