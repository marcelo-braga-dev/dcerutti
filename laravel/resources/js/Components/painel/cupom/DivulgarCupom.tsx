import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { linkCompartilharWhatsApp } from '@/lib/whatsapp';
import { nomeDaLoja } from '@/lib/loja';

/** Copiar código, copiar o link que já aplica o cupom na sacola e abrir o WhatsApp com a mensagem pronta. */
export function DivulgarCupom({ codigo, regra, link }: { codigo: string; regra: string; link: string | null }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (texto: string, qual: string) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(qual); setTimeout(() => setCopiado(null), 2000); } catch { window.prompt('Copie:', texto); }
  };
  const mensagem = link
    ? `Tenho um cupom para você na ${nomeDaLoja()}: *${codigo}*\n${regra}\n\nÉ só usar na sacola do site: ${link}`
    : `Tenho um cupom para você na ${nomeDaLoja()}: *${codigo}*\n${regra}\n\nMe chama aqui que eu aplico no seu pedido.`;
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
      <Button size="small" variant="outlined" onClick={() => copiar(codigo, 'codigo')}>{copiado === 'codigo' ? 'Copiado!' : 'Copiar código'}</Button>
      {link && <Button size="small" variant="outlined" onClick={() => copiar(link, 'link')}>{copiado === 'link' ? 'Copiado!' : 'Copiar link'}</Button>}
      <Button size="small" variant="contained" color="success" component="a" href={linkCompartilharWhatsApp(mensagem)} data-acao="cupom" target="_blank" rel="noopener">Enviar pelo WhatsApp</Button>
    </Stack>
  );
}
