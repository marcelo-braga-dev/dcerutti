'use client';

import { useState } from 'react';
import { botao } from '@/components/ui/botao';
import { linkCompartilharWhatsApp, mensagemConvite } from '@/lib/whatsapp';

export function Convite({ link, nome }: { link: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); } catch { prompt('Copie seu link:', link); }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };
  return (
    <div className="bg-bege p-5 grid gap-3">
      <div className="rotulo text-caramelo">Seu link de convite</div>
      <p className="text-sm text-suave">Quem se cadastrar por este link fica vinculado a você e os pedidos chegam no seu WhatsApp.</p>
      <code className="text-sm bg-card px-3 py-2 break-all">{link}</code>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copiar} className={botao('primario', 'p')}>{copiado ? 'Link copiado ✓' : 'Copiar link'}</button>
        <a href={linkCompartilharWhatsApp(mensagemConvite(nome, link))} data-acao="convite" target="_blank" rel="noopener" className={botao('oliva', 'p')}>Enviar no WhatsApp</a>
      </div>
    </div>
  );
}
