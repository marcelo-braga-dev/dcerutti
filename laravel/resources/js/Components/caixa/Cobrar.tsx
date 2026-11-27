import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Check, Close, CreditCard, Payments, Pix, WhatsApp } from '@mui/icons-material';
import { conferirPagamentos, FORMAS, rotuloForma, type FormaPagamento, type Pagamento } from '@/lib/caixa';
import { brl, lerValor } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { linkWhatsApp } from '@/lib/whatsapp';

const ICONE: Record<FormaPagamento, React.ReactNode> = { pix: <Pix />, debito: <CreditCard />, credito: <CreditCard />, dinheiro: <Payments /> };
const centavos = (n: number) => Math.round(n * 100) / 100;
const valorTexto = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * Cobrar (porta de src/components/caixa/cobrar.tsx): escolher a forma (ou dividir), parcelas do crédito, valor recebido e
 * troco. Tocar numa forma lança o que falta pagar nela. Confirma só quando a soma bate com o total.
 */
export function Cobrar({ total, parcelasMax, pendente, erro, confirmar, fechar }: {
  total: number; parcelasMax: number; pendente: boolean; erro: string | null; confirmar: (pagamentos: Pagamento[], observacao: string) => void; fechar: () => void;
}) {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [textos, setTextos] = useState<{ valor: string; recebido: string }[]>([]);
  const [observacao, setObservacao] = useState('');
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const c = conferirPagamentos(pagamentos, total);
  const dinheiroCurto = pagamentos.some(p => p.forma === 'dinheiro' && p.recebido != null && p.recebido < p.valor);
  const motivo = !pagamentos.length ? 'Escolha a forma de pagamento' : dinheiroCurto ? 'Confira o dinheiro recebido' : c.sobra > 0 ? `Passou ${brl(c.sobra)} do total` : c.falta > 0 ? `Falta lançar ${brl(c.falta)}` : 'Confira os valores';
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && c.ok && !pendente) confirmarRef.current?.click(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [c.ok, pendente]);
  const adicionar = (forma: FormaPagamento) => {
    const valor = centavos(Math.max(c.falta, 0)) || (pagamentos.length ? 0 : total);
    if (valor <= 0) return;
    setPagamentos(ps => [...ps, { forma, valor, parcelas: forma === 'credito' ? 1 : null, recebido: forma === 'dinheiro' ? valor : null }]);
    setTextos(ts => [...ts, { valor: valorTexto(valor), recebido: valorTexto(valor) }]);
  };
  const mudar = (i: number, m: Partial<Pagamento>) => setPagamentos(ps => ps.map((p, j) => (j === i ? { ...p, ...m } : p)));
  const mudarTexto = (i: number, m: Partial<{ valor: string; recebido: string }>) => setTextos(ts => ts.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const remover = (i: number) => { setPagamentos(ps => ps.filter((_, j) => j !== i)); setTextos(ts => ts.filter((_, j) => j !== i)); };
  return (
    <Dialog open onClose={() => !pendente && fechar()} fullWidth maxWidth="md" aria-label="Cobrar" slotProps={{ paper: { sx: { bgcolor: 'marca.creme', m: { xs: 0, sm: 4 }, height: { xs: '100%', sm: 'auto' }, maxHeight: { sm: '92dvh' } } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 3, height: 64, bgcolor: 'marca.marrom-950', color: 'marca.creme', flexShrink: 0 }}>
        <Box><Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'marca.areia' }}>Cobrar</Typography><Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{brl(total)}</Typography></Box>
        <IconButton onClick={fechar} disabled={pendente} aria-label="Voltar para a venda" sx={{ color: 'marca.creme' }}><Close /></IconButton>
      </Stack>
      <Stack spacing={2.5} sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{pagamentos.length ? 'Dividir: escolha outra forma para o que falta' : 'Como a cliente vai pagar?'}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {FORMAS.map(f => (
              <Button key={f.valor} variant="outlined" onClick={() => adicionar(f.valor)} disabled={c.falta <= 0 && pagamentos.length > 0}
                sx={{ height: 80, flexDirection: 'column', gap: 0.5, bgcolor: 'background.paper', borderWidth: 2, borderColor: 'marca.borda-forte', color: 'marca.marrom-950', '& svg': { color: 'secondary.main' } }}>
                {ICONE[f.valor]}{f.rotulo}
              </Button>
            ))}
          </Box>
        </Box>
        {pagamentos.map((p, i) => {
          const t = textos[i];
          const troco = p.forma === 'dinheiro' && p.recebido != null ? Math.max(0, p.recebido - p.valor) : 0;
          return (
            <Stack key={i} spacing={1.5} sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700 }}>{rotuloForma(p.forma)}</Typography>
                <Button size="small" onClick={() => remover(i)} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Tirar</Button>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField label="Valor nesta forma" value={t.valor} slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { startAdornment: <Box component="span" sx={{ mr: 1, color: 'text.secondary' }}>R$</Box> } }}
                  onChange={e => { const v = e.target.value; mudarTexto(i, { valor: v }); const n = lerValor(v); if (n >= 0) mudar(i, { valor: centavos(n) }); }} />
                {p.forma === 'credito' && (
                  <TextField select label="Parcelas" value={p.parcelas ?? 1} onChange={e => mudar(i, { parcelas: Number(e.target.value) })}>
                    {Array.from({ length: parcelasMax }, (_, k) => k + 1).map(n => <MenuItem key={n} value={n}>{n === 1 ? 'À vista' : `${n}x de ${brl(p.valor / n)}`}</MenuItem>)}
                  </TextField>
                )}
                {p.forma === 'dinheiro' && (
                  <TextField label="Recebido" value={t.recebido} slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { startAdornment: <Box component="span" sx={{ mr: 1, color: 'text.secondary' }}>R$</Box> } }}
                    onChange={e => { const v = e.target.value; mudarTexto(i, { recebido: v }); const n = lerValor(v); if (n >= 0) mudar(i, { recebido: centavos(n) }); }} />
                )}
              </Box>
              {p.forma === 'dinheiro' && (
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  {[p.valor, ...[20, 50, 100, 200].filter(n => n > p.valor)].slice(0, 4).map(n => (
                    <Button key={n} size="small" variant="outlined" onClick={() => { mudar(i, { recebido: n }); mudarTexto(i, { recebido: valorTexto(n) }); }}>{n === p.valor ? 'Exato' : brl(n)}</Button>
                  ))}
                  {troco > 0 && <Typography sx={{ ml: 'auto', fontWeight: 800, fontSize: 18, color: 'success.main' }}>Troco {brl(troco)}</Typography>}
                  {p.recebido != null && p.recebido < p.valor && <Typography variant="body2" sx={{ ml: 'auto', color: 'error.main' }}>O recebido é menor que o valor em dinheiro</Typography>}
                </Stack>
              )}
            </Stack>
          );
        })}
        <TextField size="small" label="Observação (opcional)" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: troca combinada, presente…" slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ bgcolor: 'background.paper' }} />
        {erro && <Alert severity="error" role="alert">{erro}</Alert>}
      </Stack>
      <Stack spacing={1.5} sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', p: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center' }}>
          <Box><Typography variant="caption" color="text.secondary">Total</Typography><Typography sx={{ fontWeight: 800 }}>{brl(total)}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Pago</Typography><Typography sx={{ fontWeight: 800 }}>{brl(c.pago)}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">{c.sobra > 0 ? 'Passou' : c.troco > 0 ? 'Troco' : 'Falta'}</Typography><Typography sx={{ fontWeight: 800, color: c.sobra > 0 ? 'error.main' : c.falta > 0 ? 'secondary.main' : 'success.main' }}>{brl(c.sobra || c.falta || c.troco)}</Typography></Box>
        </Box>
        <Button ref={confirmarRef} variant="contained" color="success" size="large" disabled={!c.ok || pendente} loading={pendente} loadingPosition="start" onClick={() => confirmar(pagamentos, observacao)} sx={{ height: 56 }}>
          {pendente ? 'Registrando a venda…' : c.ok ? `Confirmar venda · ${brl(total)}` : motivo}
        </Button>
      </Stack>
    </Dialog>
  );
}

/** Venda registrada: troco em destaque, comprovante pelo WhatsApp (sem impressora na loja) e nova venda. */
export function VendaConcluida({ codigo, total, troco, comprovante, telefone, nomeCliente, pedidoId, novaVenda }: {
  codigo: string; total: number; troco: number; comprovante: string; telefone: string | null; nomeCliente: string | null; pedidoId: string; novaVenda: () => void;
}) {
  const [fone, setFone] = useState(telefone ? formatarTelefone(telefone) : '');
  const [copiado, setCopiado] = useState(false);
  const valido = fone.replace(/\D/g, '').length >= 10;
  return (
    <Dialog open onClose={novaVenda} fullWidth maxWidth="xs" aria-label="Venda registrada" slotProps={{ paper: { sx: { bgcolor: 'marca.creme', p: { xs: 3, sm: 4 }, textAlign: 'center' } } }}>
      <Stack spacing={3}>
        <Box sx={{ mx: 'auto', width: 64, height: 64, borderRadius: '50%', bgcolor: 'success.main', color: 'marca.creme', display: 'grid', placeItems: 'center' }}><Check sx={{ fontSize: 34 }} /></Box>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'success.main' }}>Venda registrada · {codigo}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 36, mt: 1 }}>{brl(total)}</Typography>
          {nomeCliente && <Typography color="text.secondary">{nomeCliente}</Typography>}
        </Box>
        {troco > 0 && <Box sx={{ bgcolor: 'success.main', color: 'marca.creme', py: 2, borderRadius: 2 }}><Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Troco</Typography><Typography sx={{ fontWeight: 800, fontSize: 36 }}>{brl(troco)}</Typography></Box>}
        <Stack spacing={1.5} sx={{ textAlign: 'left' }}>
          <Typography variant="body2" color="text.secondary">Comprovante para a cliente</Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" value={fone} onChange={e => setFone(formatarTelefone(e.target.value))} placeholder="WhatsApp da cliente" slotProps={{ htmlInput: { inputMode: 'tel', 'aria-label': 'WhatsApp da cliente' } }} sx={{ flex: 1, bgcolor: 'background.paper' }} />
            <Button data-acao="comprovante" component="a" href={valido ? linkWhatsApp(fone, comprovante) : undefined} target="_blank" rel="noopener" disabled={!valido} variant="contained" color="whatsapp" startIcon={<WhatsApp />}>Enviar</Button>
          </Stack>
          <Button size="small" onClick={() => { navigator.clipboard?.writeText(comprovante).then(() => setCopiado(true), () => {}); }} sx={{ alignSelf: 'flex-start', textDecoration: 'underline' }}>{copiado ? 'Comprovante copiado ✓' : 'Copiar o comprovante'}</Button>
        </Stack>
        <Stack spacing={1}>
          <Button autoFocus variant="contained" size="large" onClick={novaVenda} sx={{ height: 56 }}>Nova venda</Button>
          <Button href={`/painel/pedidos/${pedidoId}`} size="small" sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Ver a venda no painel</Button>
        </Stack>
      </Stack>
    </Dialog>
  );
}
