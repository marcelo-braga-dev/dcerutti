import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { Check, LockOutlined } from '@mui/icons-material';
import QRCode from 'qrcode';
import { PublicoLayout } from '@/Components/publico/Comum';
import { FotoCheia, estiloRotulo, estiloTitulo } from '@/Components/loja/Vitrine';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { descreverMeio, tempoRestante } from '@/lib/pagamento';

type Cobranca = { id: string; metodo: 'pix' | 'checkout'; status: string; valor: number; valorEstornado: number; meio: string | null; parcelas: number | null; expiraEm: string | null; aprovadaEm: string | null; pixCopiaECola: string | null };
type P = {
  codigo: string; tipo: 'compra' | 'condicional'; primeiroNome: string;
  itens: { id: number; nome: string; tamanho: string; cor: string | null; quantidade: number; preco: number; imagem: string | null }[];
  cupom: { codigo: string; desconto: number; freteGratis: boolean } | null; frete: number | null;
  valor: { ok: true; valor: number } | { ok: false; motivo: string; precisaFrete?: boolean };
  pago: Cobranca | null; pagoManual: boolean; estornado: boolean; pixAtivo: Cobranca | null; precisaEmail: boolean; ligado: boolean; pix: boolean; cartao: boolean;
  parcelasMax: number; parcelasSemJuros: number; minutosPix: number;
};
type Resposta = { ok: true; metodo: 'pix' } | { ok: true; metodo: 'checkout'; url: string } | { ok: false; erro: string; pedirEmail?: boolean };

const cartao = { bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', borderRadius: 6 } as const;

/** Link de pagamento (porta de app/pagar/[chave]/page.tsx e components/pagamento/pagar.tsx): sem login, a chave autoriza. */
export default function Pagar({ chave, p, aviso, simulado }: { chave: string; p: P; aviso: string | null; simulado: boolean }) {
  const subtotal = Math.round(p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0) * 100) / 100;
  const selo = <Stack direction="row" spacing={0.75} sx={{ height: 32, px: 1.5, borderRadius: 99, bgcolor: 'marca.card', border: 1, borderColor: 'marca.borda', fontSize: 12, fontWeight: 600, color: 'marca.oliva', alignItems: 'center' }}><LockOutlined sx={{ fontSize: 14 }} /><span>Pagamento seguro</span></Stack>;

  return (
    <PublicoLayout acao={selo} logoHref="/">
      <Head title="Pagamento do pedido" />
      <Box component="header" sx={{ display: 'grid', gap: 0.5 }}>
        <Typography sx={estiloRotulo}>{p.tipo === 'condicional' ? 'Condicional' : 'Pedido'} {p.codigo}</Typography>
        <Typography component="h1" sx={{ ...estiloTitulo, fontSize: { xs: '2rem', sm: '2.25rem' } }}>{p.pago ? 'Pagamento aprovado' : `Olá${p.primeiroNome ? `, ${p.primeiroNome}` : ''}!`}</Typography>
        {!p.pago && p.valor.ok && <Typography color="text.secondary">Falta só o pagamento. Escolha Pix (aprovação na hora) ou cartão.</Typography>}
      </Box>

      {p.pago ? (
        <Box component="section" sx={{ ...cartao, borderColor: 'marca.oliva', borderRadius: 8, p: { xs: 3, sm: 4 }, display: 'grid', gap: 2, justifyItems: 'center', textAlign: 'center' }}>
          <Box aria-hidden sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'marca.oliva', color: 'marca.creme', display: 'grid', placeItems: 'center' }}><Check sx={{ fontSize: 32 }} /></Box>
          <Typography sx={{ fontSize: 18 }}>Recebemos <strong>{brl(p.pago.valor)}</strong> ({descreverMeio(p.pago)}){p.pago.aprovadaEm ? ` em ${formatarDataHora(p.pago.aprovadaEm)}` : ''}.</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 380 }}>A loja já foi avisada e combina a entrega com você pelo WhatsApp. Obrigada pela compra!</Typography>
          {p.pago.status === 'estornada_parcial' && <Typography variant="body2" color="text.secondary">Parte do valor ({brl(p.pago.valorEstornado)}) foi devolvida.</Typography>}
        </Box>
      ) : p.estornado ? (
        <Alert severity="warning">O pagamento deste pedido foi devolvido. Fale com a loja pelo WhatsApp.</Alert>
      ) : p.pagoManual ? (
        <Alert severity="success">Este pedido já consta como pago. Qualquer dúvida, fale com a loja pelo WhatsApp.</Alert>
      ) : !p.ligado ? (
        <Alert severity="warning">O pagamento online não está disponível agora. Combine o pagamento com a loja pelo WhatsApp.</Alert>
      ) : !p.valor.ok ? (
        <Alert severity="warning">{p.valor.precisaFrete ? 'A loja ainda vai informar o frete deste pedido. Assim que ela informar, este link libera o pagamento.' : p.valor.motivo}</Alert>
      ) : (
        <Box component="section" sx={{ ...cartao, borderRadius: 8, p: { xs: 2.5, sm: 3.5 }, display: 'grid', gap: 2.5, boxShadow: 6 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
            <Typography sx={{ ...estiloRotulo, color: 'marca.marrom-900' }}>Total a pagar</Typography>
            <Box sx={{ fontWeight: 800, fontSize: '1.9rem' }}>{brl(p.valor.valor)}</Box>
          </Stack>
          <Escolher chave={chave} p={p} valor={p.valor.valor} aviso={aviso} simulado={simulado} />
        </Box>
      )}

      <Box component="details" open={!p.pago} sx={{ ...cartao, p: 3 }}>
        <Box component="summary" sx={{ cursor: 'pointer', ...estiloRotulo, color: 'marca.marrom-900' }}>Peças ({p.itens.reduce((a, i) => a + i.quantidade, 0)})</Box>
        <Stack sx={{ mt: 2 }} divider={<Box sx={{ borderTop: 1, borderColor: 'marca.borda' }} />}>
          {p.itens.map(i => (
            <Box key={i.id} sx={{ py: 1.5, display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 1.5, alignItems: 'center', fontSize: 14 }}>
              <Box sx={{ position: 'relative', aspectRatio: '3 / 4', bgcolor: 'marca.bege' }}><FotoCheia src={i.imagem} alt={i.nome} /></Box>
              <Box><Box>{i.nome}</Box><Box sx={{ color: 'text.secondary' }}>Tam. {i.tamanho}{i.cor ? ` · ${i.cor}` : ''} · {i.quantidade}×</Box></Box>
              <Box sx={{ fontWeight: 600 }}>{brl(i.preco * i.quantidade)}</Box>
            </Box>
          ))}
        </Stack>
        <Stack spacing={0.5} sx={{ borderTop: 1, borderColor: 'marca.borda', pt: 1.5, fontSize: 14 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>Peças</span><span>{brl(subtotal)}</span></Stack>
          {p.cupom && p.cupom.desconto > 0 && p.tipo === 'compra' && <Stack direction="row" sx={{ justifyContent: 'space-between', color: 'marca.oliva' }}><span>Cupom {p.cupom.codigo}</span><span>−{brl(p.cupom.desconto)}</span></Stack>}
          {p.tipo === 'compra' && <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>Frete</span><span>{p.frete == null ? 'a combinar' : p.frete === 0 ? 'grátis' : brl(p.frete)}</span></Stack>}
        </Stack>
      </Box>
      {!p.pago && p.ligado && p.valor.ok && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { sm: 'repeat(3, 1fr)' }, gap: 1, fontSize: 12, color: 'text.secondary' }}>
          {[['Pagamento pelo Mercado Pago', 'Ambiente seguro e criptografado'], ['A loja não vê seu cartão', 'Os dados ficam só com o Mercado Pago'], ['Confirmação na hora', 'A loja é avisada assim que o pagamento cai']].map(([t, d]) => (
            <Stack key={t} direction="row" spacing={1} sx={{ ...cartao, borderRadius: 4, p: 1.5 }}><LockOutlined sx={{ fontSize: 14, color: 'marca.oliva', mt: 0.25 }} /><span><Box component="strong" sx={{ display: 'block', color: 'marca.marrom-950', fontSize: 13 }}>{t}</Box>{d}</span></Stack>
          ))}
        </Box>
      )}
    </PublicoLayout>
  );
}

function Escolher({ chave, p, valor, aviso, simulado }: { chave: string; p: P; valor: number; aviso: string | null; simulado: boolean }) {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pedirEmail, setPedirEmail] = useState(p.precisaEmail);
  const [pendente, setPendente] = useState(false);
  const [indo, setIndo] = useState(false);

  const escolher = async (metodo: 'pix' | 'checkout') => {
    setErro(null);
    if (metodo === 'pix' && pedirEmail && !/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe seu e-mail para gerar o Pix.'); return; }
    setPendente(true);
    const r = await postJson<Resposta>(`/pagar/${encodeURIComponent(chave)}`, { metodo, email: email || undefined }).catch(() => ({ ok: false as const, erro: 'Sem conexão. Tente de novo.' }));
    setPendente(false);
    if (!r.ok) { setErro(r.erro); if ('pedirEmail' in r && r.pedirEmail) setPedirEmail(true); return; }
    if (r.metodo === 'checkout') { setIndo(true); window.location.assign(r.url); return; }
    router.reload();
  };

  if (p.pixAtivo?.pixCopiaECola) return <><PixAberto chave={chave} pix={p.pixAtivo} valor={valor} cartao={p.cartao} trocar={() => escolher('checkout')} pendente={pendente || indo} erro={erro} />{simulado && <Simular chave={chave} />}</>;

  const parcelas = p.parcelasMax > 1 ? `em até ${p.parcelasMax}×${p.parcelasSemJuros > 1 ? ` (até ${Math.min(p.parcelasSemJuros, p.parcelasMax)}× sem juros)` : ''}` : 'à vista';
  const opcao = { textAlign: 'left', border: 1, borderColor: 'marca.marrom-950', borderRadius: 3, p: 2.5, display: 'grid', gap: 0.5, cursor: 'pointer', fontFamily: 'inherit' } as const;
  return (
    <Box component="section" aria-busy={pendente || indo} sx={{ display: 'grid', gap: 2 }}>
      {aviso && <Typography variant="body2" color="error" role="status">{aviso}</Typography>}
      {p.pix && pedirEmail && <TextField type="email" label="Seu e-mail (o Mercado Pago pede para o Pix)" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="voce@email.com" />}
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5 }}>
        {p.pix && (
          <Box component="button" type="button" onClick={() => escolher('pix')} disabled={pendente || indo} sx={{ ...opcao, bgcolor: 'marca.marrom-950', color: 'marca.creme', '&:disabled': { opacity: 0.6 } }}>
            <Box component="span" sx={{ ...estiloRotulo, color: 'inherit' }}>Pagar com Pix</Box>
            <Box component="span" sx={{ fontSize: 14, opacity: 0.8 }}>Aprovação na hora. O código vale {p.minutosPix} minutos.</Box>
          </Box>
        )}
        {p.cartao && (
          <Box component="button" type="button" onClick={() => escolher('checkout')} disabled={pendente || indo} sx={{ ...opcao, bgcolor: 'transparent', color: 'marca.marrom-950', '&:hover': { bgcolor: 'marca.bege' }, '&:disabled': { opacity: 0.6 } }}>
            <Box component="span" sx={{ ...estiloRotulo, color: 'inherit' }}>Pagar com cartão</Box>
            <Box component="span" sx={{ fontSize: 14, color: 'text.secondary' }}>Crédito {parcelas}, débito ou saldo, no ambiente seguro do Mercado Pago.</Box>
          </Box>
        )}
      </Box>
      {(pendente || indo) && <Typography variant="body2" color="text.secondary" role="status">{indo ? 'Abrindo o Mercado Pago…' : 'Gerando o pagamento…'}</Typography>}
      {erro && <Alert severity="error">{erro}</Alert>}
      <Typography variant="caption" color="text.secondary">Pagamento processado pelo Mercado Pago. A loja não vê nem guarda os dados do seu cartão.</Typography>
      {simulado && <Simular chave={chave} />}
    </Box>
  );
}

/** Só no ambiente de teste (Mercado Pago simulado): faz o papel da cliente pagando. */
function Simular({ chave }: { chave: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const simular = async () => {
    setErro(null);
    setPendente(true);
    const r = await postJson<{ ok: boolean; erro?: string }>(`/pagar/${encodeURIComponent(chave)}/simular`, {}).catch(() => ({ ok: false, erro: 'Sem conexão.' }));
    setPendente(false);
    if (r.ok) router.reload();
    else setErro(r.erro ?? 'Não foi possível simular.');
  };
  return (
    <Box sx={{ border: '1px dashed', borderColor: 'secondary.main', borderRadius: 2, p: 1.5, display: 'grid', gap: 1, fontSize: 14 }}>
      <strong>Ambiente de teste · Mercado Pago simulado</strong>
      <Box component="span" sx={{ color: 'text.secondary' }}>Gere o Pix (ou o pagamento com cartão) e use o botão para fazer de conta que a cliente pagou.</Box>
      <Button variant="outlined" size="small" disabled={pendente} onClick={simular} sx={{ justifySelf: 'start' }}>Simular pagamento aprovado</Button>
      {erro && <Box sx={{ color: 'error.main' }}>{erro}</Box>}
    </Box>
  );
}

function PixAberto({ chave, pix, valor, cartao, trocar, pendente, erro }: { chave: string; pix: Cobranca; valor: number; cartao: boolean; trocar: () => void; pendente: boolean; erro: string | null }) {
  const codigo = pix.pixCopiaECola ?? '';
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [resta, setResta] = useState(pix.expiraEm ? tempoRestante(pix.expiraEm) : null);
  const [vencido, setVencido] = useState(false);

  useEffect(() => { QRCode.toString(codigo, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setQr, () => setQr('')); }, [codigo]);
  useEffect(() => {
    if (!pix.expiraEm) return;
    const t = setInterval(() => { setResta(tempoRestante(pix.expiraEm!)); if (new Date(pix.expiraEm!).getTime() <= Date.now()) setVencido(true); }, 1000);
    return () => clearInterval(t);
  }, [pix.expiraEm]);
  // Pergunta a situação a cada 5 s enquanto a aba está visível; pago ou vencido, recarrega.
  useEffect(() => {
    let parado = false;
    const perguntar = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/pagamentos/situacao?chave=${encodeURIComponent(chave)}`, { cache: 'no-store' });
        if (!r.ok || parado) return;
        const s = await r.json() as { pago?: boolean; aberta?: boolean };
        if (s.pago || s.aberta === false) router.reload();
      } catch { /* sem rede: tenta de novo */ }
    };
    const t = setInterval(perguntar, 5000);
    return () => { parado = true; clearInterval(t); };
  }, [chave]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setCopiado(false); }
  };

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2, justifyItems: 'center', textAlign: 'center' }}>
      <Typography sx={{ ...estiloRotulo, color: 'marca.marrom-900' }}>Pix de {brl(valor)}</Typography>
      <Box role="img" aria-label="QR Code do Pix" sx={{ width: 224, height: 224, bgcolor: '#fff', p: 1, border: 1, borderColor: 'marca.borda', '& svg': { width: '100%', height: '100%', display: 'block' } }} dangerouslySetInnerHTML={{ __html: qr }} />
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380 }}>Abra o app do seu banco, escolha <strong>Pix › Ler QR Code</strong> ou <strong>Pix Copia e Cola</strong> e cole o código abaixo.</Typography>
      <Box sx={{ width: '100%', display: 'grid', gap: 1 }}>
        <Box component="code" sx={{ display: 'block', fontSize: 12, wordBreak: 'break-all', bgcolor: 'marca.bege', p: 1.5, textAlign: 'left', userSelect: 'all' }}>{codigo}</Box>
        <Button variant="contained" size="large" onClick={copiar} fullWidth>{copiado ? 'Código copiado ✓' : 'Copiar código Pix'}</Button>
      </Box>
      <Typography variant="body2" role="status" aria-live="polite">
        {vencido ? <Box component="span" sx={{ color: 'error.main' }}>Este código venceu. Atualize a página para gerar outro.</Box>
          : <>Aguardando o pagamento{resta ? <> · vence em <strong>{resta}</strong></> : null}. Esta página atualiza sozinha.</>}
      </Typography>
      {vencido && <Button variant="outlined" onClick={() => router.reload()}>Atualizar</Button>}
      {cartao && !vencido && <Button onClick={trocar} disabled={pendente} sx={{ textDecoration: 'underline', color: 'text.secondary' }}>Prefiro pagar com cartão</Button>}
      {erro && <Alert severity="error">{erro}</Alert>}
    </Box>
  );
}
