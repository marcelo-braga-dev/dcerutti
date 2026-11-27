import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { Dialogo } from '@/Components/ui/Dialogo';
import { Etiqueta } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';
import { COR_STATUS, descreverMeio, mensagemLinkPagamento, ROTULO_METODO, ROTULO_STATUS, type MetodoCobranca, type StatusCobranca } from '@/lib/pagamento';
import { linkWhatsApp } from '@/lib/whatsapp';

export type CobrancaTela = {
  id: string; metodo: MetodoCobranca; status: StatusCobranca; valor: number; valorEstornado: number; meio: string | null; parcelas: number | null; taxa: number | null;
  semEstoque: boolean; expiraEm: string | null; aprovadaEm: string | null; criadaEm: string; ativa: boolean; paga: boolean; mpOrderId?: string | null;
};
type Evento = { id: number; cobrancaId: string | null; origem: string; tipo: string; statusMp: string | null; erro: string | null; criadoEm: string };
export type DadosPagamento = {
  configurado: boolean; cfg: { pix: boolean; cartao: boolean }; valor: { ok: true; valor: number } | { ok: false; motivo: string; precisaFrete?: boolean };
  cobrancas: CobrancaTela[]; ativa: CobrancaTela | null; paga: CobrancaTela | null; podeEstornar: boolean; podeDefinirFrete: boolean; frete: number | null; eventos: Evento[];
};

const COR = { oliva: 'oliva', cinza: 'cinza', escuro: 'contorno', vermelho: 'vermelho', padrao: 'caramelo' } as const;
type Link = { link: string; texto: string; whatsapp: string | null };

/** Quadro "Pagamento online" do pedido (porta de components/painel/pagamento-pedido.tsx): link, situação, conferir, cancelar e estorno. */
export function PagamentoPedido({ pedidoId, d }: { pedidoId: string; d: DadosPagamento }) {
  const { flash } = usePage().props as unknown as { flash: { sucesso: string | null } };
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [frete, setFrete] = useState(d.frete != null ? String(d.frete).replace('.', ',') : '');
  const [estornar, setEstornar] = useState<CobrancaTela | null>(null);
  const { ativa, paga } = d;

  const acao = (url: string, dados: Record<string, string> = {}) => {
    setErro(null);
    setPendente(true);
    router.post(url, dados, { preserveScroll: true, onError: e => setErro(e.erro ?? Object.values(e)[0] ?? 'Não foi possível concluir.'), onFinish: () => setPendente(false) });
  };
  const gerar = async () => {
    setErro(null);
    setPendente(true);
    type R = { ok: true; link: string; valor: number; telefone: string | null; nomeCliente: string; nomeVendedor: string; codigo: string; pix: boolean; cartao: boolean } | { ok: false; erro: string };
    const r = await postJson<R>(`/painel/pedidos/${pedidoId}/pagamento/link`, {}).catch(() => ({ ok: false as const, erro: 'Sem conexão. Tente de novo.' }));
    setPendente(false);
    if (!r.ok) { setErro(r.erro); return; }
    const texto = mensagemLinkPagamento({ nomeCliente: r.nomeCliente, nomeVendedor: r.nomeVendedor, codigo: r.codigo, valor: r.valor, link: r.link, pix: r.pix, cartao: r.cartao, brl });
    setLink({ link: r.link, texto, whatsapp: r.telefone ? linkWhatsApp(r.telefone, texto) : null });
    router.reload({ only: ['pedido', 'pagamento'] });
  };
  const copiar = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setCopiado(false); }
  };
  const caixa = { border: 1, borderColor: 'divider', borderRadius: 2, p: 2, display: 'grid', gap: 0.5 } as const;

  return (
    <Stack spacing={2} sx={{ fontSize: 14 }}>
      <Typography variant="caption" color="text.secondary">Pix e cartão pelo Mercado Pago. A baixa é automática quando a cliente paga.</Typography>
      {!d.configurado && <Alert severity="error">As credenciais do Mercado Pago ainda não estão no servidor: nada pode ser cobrado.</Alert>}

      {paga && (
        <Box sx={{ ...caixa, borderColor: 'success.main', bgcolor: 'rgba(107,112,64,.05)' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Etiqueta cor={COR[COR_STATUS[paga.status]]}>{ROTULO_STATUS[paga.status]}</Etiqueta><Box component="strong" sx={{ fontSize: 18 }}>{brl(paga.valor)}</Box></Stack>
          <Typography variant="body2" color="text.secondary">{descreverMeio(paga)}{paga.aprovadaEm ? ` · ${formatarDataHora(paga.aprovadaEm)}` : ''}{paga.taxa != null ? ` · tarifa informada ${brl(paga.taxa)}` : ''}</Typography>
          {paga.valorEstornado > 0 && <Typography variant="body2" color="text.secondary">Estornado: {brl(paga.valorEstornado)}</Typography>}
          {paga.semEstoque && <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>Uma peça acabou antes do pagamento cair. Troque a peça com a cliente (cancele e refaça o pedido) ou estorne.</Typography>}
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
            <Button size="small" variant="outlined" disabled={pendente} onClick={() => acao(`/painel/cobrancas/${paga.id}/conferir`)}>Conferir no Mercado Pago</Button>
            {d.podeEstornar && paga.status !== 'contestada' && <Button size="small" variant="outlined" color="error" disabled={pendente} onClick={() => setEstornar(paga)}>Estornar</Button>}
          </Stack>
        </Box>
      )}

      {!paga && ativa && (
        <Box sx={caixa}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Etiqueta>{ROTULO_STATUS[ativa.status]}</Etiqueta><span>{ROTULO_METODO[ativa.metodo]} · {brl(ativa.valor)}</span></Stack>
          <Typography variant="body2" color="text.secondary">Aberta em {formatarDataHora(ativa.criadaEm)}{ativa.expiraEm ? ` · vale até ${formatarDataHora(ativa.expiraEm)}` : ''}. As peças ficam reservadas enquanto isso.</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
            <Button size="small" variant="outlined" disabled={pendente} onClick={() => acao(`/painel/cobrancas/${ativa.id}/conferir`)}>Conferir no Mercado Pago</Button>
            <Button size="small" variant="outlined" color="error" disabled={pendente} onClick={() => { if (window.confirm('Cancelar esta cobrança? A cliente não consegue mais pagar por ela e a reserva das peças volta ao estoque.')) acao(`/painel/cobrancas/${ativa.id}/cancelar`); }}>Cancelar cobrança</Button>
          </Stack>
        </Box>
      )}

      {!paga && !d.valor.ok && d.valor.precisaFrete && d.podeDefinirFrete && (
        <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); acao(`/painel/pedidos/${pedidoId}/frete`, { frete }); }} sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">O frete está a combinar. Informe o valor combinado com a cliente para liberar o pagamento.</Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Frete (R$)" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0,00" helperText="0 = retirada na loja ou frete grátis." slotProps={{ htmlInput: { inputMode: 'decimal' } }} sx={{ flex: 1 }} />
            <Button type="submit" variant="outlined" disabled={pendente} sx={{ alignSelf: 'flex-start', height: 40 }}>Salvar frete</Button>
          </Stack>
        </Box>
      )}
      {!paga && !d.valor.ok && !(d.valor.precisaFrete && d.podeDefinirFrete) && <Typography variant="body2" color="text.secondary">{d.valor.motivo}</Typography>}

      {!paga && d.valor.ok && d.configurado && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><span>Valor a cobrar</span><Box component="strong" sx={{ fontSize: 18 }}>{brl(d.valor.valor)}</Box></Stack>
          <Button variant="contained" color="success" disabled={pendente} onClick={gerar} fullWidth>{link ? 'Gerar o link de novo' : 'Gerar link de pagamento'}</Button>
          {link && (
            <Box sx={caixa}>
              <Box component="code" sx={{ fontSize: 12, wordBreak: 'break-all', userSelect: 'all' }}>{link.link}</Box>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
                {link.whatsapp && <Button component="a" href={link.whatsapp} target="_blank" rel="noopener" size="small" variant="contained" color="whatsapp">Enviar no WhatsApp</Button>}
                <Button size="small" variant="outlined" onClick={copiar}>{copiado ? 'Mensagem copiada ✓' : 'Copiar mensagem'}</Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">A cliente escolhe {d.cfg.pix && d.cfg.cartao ? 'Pix ou cartão' : d.cfg.pix ? 'Pix' : 'cartão'} no link, sem precisar entrar na conta.</Typography>
            </Box>
          )}
        </Box>
      )}

      {erro && <Alert severity="error">{erro}</Alert>}
      {!erro && flash.sucesso && <Alert severity="success">{flash.sucesso}</Alert>}

      {d.cobrancas.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>Tentativas ({d.cobrancas.length})</summary>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {d.cobrancas.map(c => <Stack key={c.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><span>{formatarDataHora(c.criadaEm)} · {ROTULO_METODO[c.metodo]}</span><Box component="span" sx={{ color: 'text.secondary' }}>{ROTULO_STATUS[c.status]} · {brl(c.valor)}</Box></Stack>)}
          </Stack>
        </details>
      )}
      {d.eventos.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>Registro do Mercado Pago</summary>
          <Stack spacing={0.5} sx={{ mt: 1, fontSize: 12 }}>
            {d.cobrancas.filter(c => c.mpOrderId).map(c => <Box key={c.id} sx={{ color: 'text.secondary' }}>{ROTULO_METODO[c.metodo]} de {formatarDataHora(c.criadaEm)}: order <code>{c.mpOrderId}</code></Box>)}
            {d.eventos.map(e => (
              <Box key={e.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
                {formatarDataHora(e.criadoEm)} · <Box component="span" sx={{ color: 'text.secondary' }}>{e.origem}</Box> · {e.tipo.replace(/_/g, ' ')}{e.statusMp && <Box component="span" sx={{ color: 'text.secondary' }}> ({e.statusMp})</Box>}
                {e.erro && <Box sx={{ color: 'error.main' }}>{e.erro}</Box>}
              </Box>
            ))}
          </Stack>
        </details>
      )}
      {estornar && <Estorno cobranca={estornar} fechar={() => setEstornar(null)} />}
    </Stack>
  );
}

function Estorno({ cobranca, fechar }: { cobranca: CobrancaTela; fechar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const resta = Math.round((cobranca.valor - cobranca.valorEstornado) * 100) / 100;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setPendente(true);
    router.post(`/painel/cobrancas/${cobranca.id}/estornar`, { motivo, valor }, { preserveScroll: true, onSuccess: fechar, onError: x => setErro(x.erro ?? x.motivo ?? 'Não foi possível estornar.'), onFinish: () => setPendente(false) });
  };
  return (
    <Dialogo titulo="Estornar pagamento" aberto fechar={fechar}>
      <Box component="form" onSubmit={enviar} sx={{ display: 'grid', gap: 2, fontSize: 14 }}>
        <Typography variant="body2">O valor volta para a cliente pelo mesmo meio ({descreverMeio(cobranca)}). Disponível para estorno: <strong>{brl(resta)}</strong>.</Typography>
        <TextField label="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} multiline minRows={2} required slotProps={{ htmlInput: { maxLength: 300 } }} />
        <TextField label="Valor (R$)" value={valor} onChange={e => setValor(e.target.value)} placeholder={`Em branco = tudo (${brl(resta)})`} slotProps={{ htmlInput: { inputMode: 'decimal' }, inputLabel: { shrink: true } }} />
        <Typography variant="caption" color="text.secondary">Depois do estorno total, o pedido pode ser cancelado ou a venda desfeita normalmente.</Typography>
        {erro && <Alert severity="error">{erro}</Alert>}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={fechar}>Voltar</Button>
          <Button type="submit" variant="contained" color="error" disabled={pendente}>{pendente ? 'Estornando…' : 'Estornar'}</Button>
        </Stack>
      </Box>
    </Dialogo>
  );
}
