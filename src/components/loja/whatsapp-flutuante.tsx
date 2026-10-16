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
      className={`fixed z-30 right-4 size-14 rounded-full bg-whatsapp text-white grid place-items-center shadow-lg shadow-black/20 hover:bg-whatsapp-escuro transition-colors ${caminho === '/catalogo' ? 'bottom-20 lg:bottom-6' : 'bottom-5 sm:bottom-6'}`}>
      <IconeWhatsApp className="size-7" />
    </a>
  );
}
