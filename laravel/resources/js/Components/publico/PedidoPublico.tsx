import { useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, Dialog, FormControlLabel, IconButton, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Check, Close, IosShare } from '@mui/icons-material';
import { FotoCheia, estiloTitulo } from '@/Components/loja/Vitrine';
import { brl } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';

/**
 * Peças comuns das páginas públicas de pedido (vitrine, link da peça), porta de components/loja/pedido-publico.tsx e
 * quero-peca.tsx: contato lembrado no aparelho, gaveta, campos de contato, tela final e compartilhar.
 */

/** Resposta do servidor: o WhatsApp de quem atende e o texto pronto. */
export type RespostaInteresse = { ok: true; telefone: string; texto: string; destinatario: string } | { ok: false; erro: string };

const CHAVE_CONTATO = 'dcerutti-contato-vitrine';

/** Nome e WhatsApp lembrados só neste aparelho, para quem volta não digitar de novo. */
export function lerContato(): { nome: string; telefone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_CONTATO) ?? '{}');
    return { nome: typeof v.nome === 'string' ? v.nome : '', telefone: typeof v.telefone === 'string' ? v.telefone : '' };
  } catch { return { nome: '', telefone: '' }; }
}

export function gravarContato(nome: string, telefone: string) {
  try { localStorage.setItem(CHAVE_CONTATO, JSON.stringify({ nome, telefone })); } catch { /* sem armazenamento */ }
}

/** Gaveta: sobe de baixo no celular, janela no centro no computador, com título fixo e botão de fechar. */
export function Gaveta({ titulo, aberta, fechar, children, largura = 'sm' }: { titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; largura?: 'sm' | 'md' }) {
  const tema = useTheme();
  const celular = useMediaQuery(tema.breakpoints.down('sm'));
  return (
    <Dialog open={aberta} onClose={fechar} fullWidth maxWidth={largura} aria-label={titulo}
      slotProps={{ paper: { sx: { bgcolor: 'marca.creme', borderRadius: celular ? '24px 24px 0 0' : 6, m: celular ? 0 : 2, maxHeight: '92dvh', ...(celular ? { position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', maxWidth: '100%' } : {}) } } }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'marca.creme', px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'marca.borda', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: '1.25rem' }}>{titulo}</Typography>
        <IconButton onClick={fechar} aria-label={`Fechar: ${titulo}`}><Close /></IconButton>
      </Box>
      {children}
    </Dialog>
  );
}

type Contato = { nome: string; telefone: string; aceite: boolean; site: string; ofertas: boolean };

export const contatoVazio = (): Contato => ({ ...lerContato(), aceite: false, site: '', ofertas: false });

/** O que conferir antes de mandar ao servidor (o servidor confere de novo). */
export function erroDoContato(c: Contato): string | null {
  if (c.nome.trim().length < 2) return 'Informe seu nome.';
  if (c.telefone.replace(/\D/g, '').length !== 11) return 'Informe o WhatsApp com DDD e 9 dígitos.';
  if (!c.aceite) return 'Para continuar, aceite o contato da loja.';
  return null;
}

/** Nome, WhatsApp e consentimentos: os mesmos campos em todas as páginas públicas de pedido. */
export function CamposContato({ valor, mudar }: { valor: Contato; mudar: (c: Contato) => void }) {
  const set = <K extends keyof Contato>(k: K, v: Contato[K]) => mudar({ ...valor, [k]: v });
  return (
    <>
      <TextField label="Seu nome" value={valor.nome} onChange={e => set('nome', e.target.value)} autoComplete="name" slotProps={{ htmlInput: { maxLength: 120 } }} fullWidth />
      <TextField label="Seu WhatsApp" value={valor.telefone} onChange={e => set('telefone', formatarTelefone(e.target.value))} type="tel" autoComplete="tel" placeholder="(49) 99999-9999" slotProps={{ htmlInput: { inputMode: 'numeric' } }} fullWidth />
      {/* Armadilha para robôs: fora da tela e fora do Tab. */}
      <Box component="label" aria-hidden sx={{ position: 'absolute', left: -9999 }}>Site<input tabIndex={-1} autoComplete="off" value={valor.site} onChange={e => set('site', e.target.value)} /></Box>
      <FormControlLabel sx={{ alignItems: 'flex-start' }} control={<Checkbox checked={valor.aceite} onChange={e => set('aceite', e.target.checked)} sx={{ pt: 0.25 }} />}
        label={<Typography variant="body2">Aceito que a loja fale comigo pelo WhatsApp sobre este pedido. <Box component="a" href="/privacidade" target="_blank" sx={{ color: 'inherit' }}>Política de privacidade</Box></Typography>} />
      <FormControlLabel sx={{ alignItems: 'flex-start' }} control={<Checkbox checked={valor.ofertas} onChange={e => set('ofertas', e.target.checked)} sx={{ pt: 0.25 }} />}
        label={<Typography variant="body2">Também quero receber ofertas e novidades pelo WhatsApp (opcional).</Typography>} />
    </>
  );
}

export type ItemEnviado = { chave: string | number; nome: string; tamanho: string; preco: number; imagem: string | null };

/** Tela final: o que foi pedido, o próximo passo e o botão do WhatsApp (o navegador do Instagram pode bloquear a aba). */
export function PedidoEnviado({ destinatario, url, itens, voltar, rotuloVoltar = 'Continuar vendo as peças' }: {
  destinatario: string; url: string; itens: ItemEnviado[]; voltar?: () => void; rotuloVoltar?: string;
}) {
  const total = itens.reduce((a, x) => a + x.preco, 0);
  return (
    <Box component="section" sx={{ maxWidth: 576, width: '100%', boxSizing: 'border-box', justifySelf: 'center', bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 8, p: { xs: 3, sm: 4 }, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5 }}>
      <Stack sx={{ alignItems: 'center', textAlign: 'center' }} spacing={1.5}>
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'marca.oliva', color: 'marca.creme', display: 'grid', placeItems: 'center' }} aria-hidden><Check sx={{ fontSize: 32 }} /></Box>
        <Typography component="h2" sx={{ ...estiloTitulo, fontSize: '1.6rem' }}>Pedido recebido!</Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: 380 }}>Agora é só enviar a mensagem no WhatsApp para falar com {destinatario}. As peças ficam reservadas depois da confirmação da loja.</Typography>
      </Stack>
      <Button href={url} target="_blank" rel="noopener" variant="contained" color="whatsapp" size="large" fullWidth>Abrir o WhatsApp</Button>
      {itens.length > 0 && (
        <Stack spacing={1} sx={{ borderTop: 1, borderColor: 'marca.borda', pt: 2 }}>
          {itens.map(i => (
            <Stack key={i.chave} direction="row" spacing={1.5} sx={{ alignItems: 'center', fontSize: 14 }}>
              <Box sx={{ position: 'relative', width: 40, aspectRatio: '3 / 4', borderRadius: 2, overflow: 'hidden', bgcolor: 'marca.bege', flexShrink: 0 }}><FotoCheia src={i.imagem} /></Box>
              <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nome} · <strong>{i.tamanho}</strong></Box>
              <Box sx={{ fontWeight: 600 }}>{brl(i.preco)}</Box>
            </Stack>
          ))}
          {itens.length > 1 && <Stack direction="row" sx={{ justifyContent: 'space-between', fontWeight: 800, fontSize: 18, pt: 0.5 }}><span>Total</span><span>{brl(total)}</span></Stack>}
        </Stack>
      )}
      <Stack component="ol" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none', fontSize: 14 }}>
        {[`Envie a mensagem para ${destinatario} no WhatsApp`, 'A loja confere e separa as peças', 'Vocês combinam o frete e o pagamento'].map((t, i) => (
          <Stack key={t} component="li" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: 'marca.bege', color: 'secondary.main', fontWeight: 800, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</Box><span>{t}</span>
          </Stack>
        ))}
      </Stack>
      {voltar && <Button onClick={voltar} sx={{ justifySelf: 'center', textDecoration: 'underline' }}>{rotuloVoltar}</Button>}
    </Box>
  );
}

/** Compartilhar a página: a folha do sistema no celular (WhatsApp, Instagram, Direct); senão, copia o link. */
export function Compartilhar({ titulo }: { titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const compartilhar = async () => {
    const url = window.location.href.split('?')[0];
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: `${titulo} 🛍️`, url }); return; } catch { /* cancelou: tenta copiar */ }
    }
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  };
  return <Button variant="outlined" onClick={compartilhar} startIcon={<IosShare />} sx={{ borderRadius: 99 }}>{copiado ? 'Link copiado' : 'Compartilhar'}</Button>;
}

/** Um tamanho: botão quando há estoque; riscado quando esgotado. */
export function BotaoTamanho({ tamanho, ativo, esgotado, destaque, grande, rotulo, onClick }: { tamanho: string; ativo?: boolean; esgotado?: boolean; destaque?: boolean; grande?: boolean; rotulo?: string; onClick?: () => void }) {
  const sx = { minWidth: grande ? 48 : 36, height: grande ? 48 : 36, px: 0.75, borderRadius: grande ? 3 : 2, fontSize: grande ? 14 : 12, fontWeight: 600, border: 1 };
  if (esgotado) return <Box component="span" title="Esgotado" sx={{ ...sx, display: 'grid', placeItems: 'center', borderColor: 'marca.borda', color: 'marca.borda-forte', textDecoration: 'line-through' }}><span aria-hidden>{tamanho}</span><Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{tamanho} esgotado</Box></Box>;
  return (
    <Box component="button" type="button" aria-pressed={ativo} aria-label={rotulo} onClick={onClick}
      sx={{ ...sx, cursor: 'pointer', fontFamily: 'inherit', bgcolor: ativo ? 'marca.marrom-950' : 'marca.card', color: ativo ? 'marca.creme' : 'marca.marrom-950', borderColor: ativo || destaque ? 'marca.marrom-950' : 'marca.borda-forte', '&:hover': { borderColor: 'marca.marrom-950' } }}>
      {tamanho}
    </Box>
  );
}

/** "Ao vivo agora", com o ponto piscando (parado para quem pede menos movimento). */
export function SeloAoVivo() {
  return (
    <Box component="span" sx={{ height: 28, pl: 1.25, pr: 1.5, borderRadius: 99, bgcolor: 'imperdivel.main', color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff', animation: 'pulsar 1.2s ease-in-out infinite', '@keyframes pulsar': { '50%': { opacity: 0.3 } }, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
      Ao vivo agora
    </Box>
  );
}
