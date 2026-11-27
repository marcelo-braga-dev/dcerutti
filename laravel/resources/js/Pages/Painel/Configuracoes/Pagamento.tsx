import { useState, type ReactNode } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, FormHelperText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { postJson } from '@/lib/http';

type Cfg = { ligado: boolean; pix: boolean; cartao: boolean; pagarNaSacola: boolean; confirmarAoPagar: boolean; minutosPix: number; minutosCheckout: number; parcelasMax: number; parcelasSemJuros: number; quemEstorna: 'gestor' | 'equipe' };
type Saude = {
  modo: 'mercadopago' | 'simulado' | 'bloqueado'; ambiente: 'producao' | 'teste' | null; credenciais: { token: string | null; segredo: string | null; segredoAnterior: string | null };
  urlAviso: string; urlAvisoHttps: boolean; ultimoAviso: { criadoEm: string; tipo: string; erro: string | null; processadoEm: string | null } | null;
  avisos24h: number; avisosComErro: number; falhas24h: number; pendentes: number; abertas: number; totalCobrancas: number;
};

const MODO = { mercadopago: 'Mercado Pago', simulado: 'Simulado (ambiente de teste)', bloqueado: 'Bloqueado' } as const;

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '12rem 1fr' }, gap: { xs: 0.5, sm: 2 }, py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', pt: 0.25 }}>{rotulo}</Typography>
      <Box sx={{ fontSize: 14, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

const Tem = ({ v, falta }: { v: string | null; falta: string }) => v ? <span><Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>✓ Definido</Box> <code>{v}</code></span> : <Box component="span" sx={{ color: 'error.main' }}>✗ {falta}</Box>;

/** Configuração do pagamento online (porta de painel/configuracoes/pagamento): conexão, como a loja recebe e o passo a passo. */
export default function ConfigPagamento({ cfg, saude: s, pronto }: { cfg: Cfg; saude: Saude; pronto: boolean }) {
  const { flash } = usePage().props as unknown as { flash: { sucesso: string | null } };
  const form = useForm<Cfg>(cfg);
  const d = form.data;
  const e = form.errors as Record<string, string>;
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);
  const testar = async () => {
    setTeste(null);
    const r = await postJson<{ ok: true; mensagem: string } | { ok: false; erro: string }>('/painel/configuracoes/pagamento/testar', {}).catch(() => ({ ok: false as const, erro: 'Sem conexão.' }));
    setTeste(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
  };
  const situacao =
    s.modo === 'bloqueado' ? { cor: 'vermelho' as const, texto: 'Bloqueado', detalhe: 'O modo simulado foi pedido no banco de produção. Retire PAGAMENTO_GATEWAY do .env e recarregue o app.' }
    : !pronto ? { cor: 'cinza' as const, texto: 'Sem credenciais', detalhe: 'Falta o Access Token do Mercado Pago no servidor. Dá para deixar tudo configurado; nada é cobrado até ele existir.' }
    : !cfg.ligado ? { cor: 'cinza' as const, texto: 'Desligado', detalhe: 'A conexão está pronta. Ligue em "Como a loja recebe" para a equipe gerar links de pagamento.' }
    : s.modo === 'simulado' ? { cor: 'caramelo' as const, texto: 'Ligado em modo simulado', detalhe: 'Ambiente de teste: nada é cobrado de verdade; a página de pagamento mostra "Simular pagamento aprovado".' }
    : { cor: 'oliva' as const, texto: s.ambiente === 'teste' ? 'Ligado (credenciais de teste)' : 'Ligado e cobrando', detalhe: s.ambiente === 'teste' ? 'Pagamentos de teste do Mercado Pago: nada cai na conta.' : 'As clientes pagam pelo link com Pix ou cartão.' };
  const passos = [
    { feito: pronto && s.modo !== 'simulado', titulo: 'Conta e aplicação no Mercado Pago', texto: 'Conta PJ no CNPJ da loja → Suas integrações → criar a aplicação (pagamentos online, API Orders).' },
    { feito: !!s.credenciais.token && !!s.credenciais.segredo, titulo: 'Credenciais no servidor', texto: 'MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET no .env (quem cuida do servidor faz; nunca por mensagem ou e-mail). Depois, recarregar o app.' },
    { feito: !!s.ultimoAviso, titulo: 'Aviso de pagamento cadastrado', texto: 'No Mercado Pago: Webhooks → Configurar notificações → evento "Order", com o endereço ao lado. Fica marcado quando o primeiro aviso chega.' },
    { feito: !!s.ambiente, titulo: 'Ambiente definido', texto: 'MP_AMBIENTE=teste com as credenciais de teste; MP_AMBIENTE=producao com as de produção.' },
    { feito: null, titulo: 'Conferência automática', texto: 'O agendador do Laravel (php artisan schedule:run a cada minuto no cron) roda pagamentos:conciliar a cada 10 minutos.' },
    { feito: cfg.ligado, titulo: 'Ligar o pagamento online', texto: 'Em "Como a loja recebe".' },
    { feito: s.totalCobrancas > 0 && s.modo === 'mercadopago', titulo: 'Primeiro pagamento real', texto: 'Um pedido de R$ 1 pago com Pix e estornado, do link ao painel, antes de mandar para as clientes.' },
  ];
  const marcar = (k: keyof Cfg, rotulo: string, ajuda: string) => (
    <Box sx={{ gridColumn: k === 'pix' || k === 'cartao' ? undefined : { sm: 'span 2' } }}>
      <FormControlLabel control={<Checkbox checked={d[k] as boolean} onChange={x => form.setData(k, x.target.checked as never)} />} label={rotulo} />
      <FormHelperText error={!!e[k]} sx={{ mt: -0.5, ml: 4 }}>{e[k] ?? ajuda}</FormHelperText>
    </Box>
  );
  const numero = (k: keyof Cfg, rotulo: string, ajuda: string) => <TextField type="number" label={rotulo} value={d[k]} onChange={x => form.setData(k, x.target.value as never)} error={!!e[k]} helperText={e[k] ?? ajuda} />;
  const titulo = (t: string) => <Typography sx={{ gridColumn: { sm: 'span 2' }, borderTop: 1, borderColor: 'divider', pt: 2, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t}</Typography>;

  return (
    <PainelLayout>
      <Head title="Pagamento online" />
      <CabecalhoPagina sobre="Mercado Pago" titulo="Pagamento online" acoes={<Button href="/painel/pagamentos">Ver pagamentos recebidos</Button>}>
        <Stack component="span" direction="row" useFlexGap sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}><Etiqueta cor={situacao.cor}>{situacao.texto}</Etiqueta><span>{situacao.detalhe}</span></Stack>
      </CabecalhoPagina>
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1.25fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, display: 'grid', gap: 2 }}>
            <Box>
              <Typography component="h2" variant="h6">Conexão com o Mercado Pago</Typography>
              <Typography variant="caption" color="text.secondary">As credenciais ficam só no servidor. Aqui aparece se existem e os 4 últimos caracteres, para conferir qual está em uso.</Typography>
            </Box>
            {s.modo === 'bloqueado' && <Alert severity="error">Pagamento bloqueado: PAGAMENTO_GATEWAY=falso no banco de produção. Retire a linha do .env e recarregue o app.</Alert>}
            <Box>
              <Linha rotulo="Modo">{MODO[s.modo]}</Linha>
              <Linha rotulo="Ambiente">{s.ambiente === 'producao' ? 'Produção' : s.ambiente === 'teste' ? 'Teste' : <Box component="span" sx={{ color: 'text.secondary' }}>Não definido (MP_AMBIENTE)</Box>}</Linha>
              {s.modo !== 'simulado' && <>
                <Linha rotulo="Access Token"><Tem v={s.credenciais.token} falta="Falta MP_ACCESS_TOKEN" /></Linha>
                <Linha rotulo="Chave dos avisos"><Tem v={s.credenciais.segredo} falta="Falta MP_WEBHOOK_SECRET (os avisos são recusados)" /></Linha>
                {s.credenciais.segredoAnterior && <Linha rotulo="Chave anterior">Em uso durante a troca <code>{s.credenciais.segredoAnterior}</code>. Apague quando o Mercado Pago passar a usar a nova.</Linha>}
              </>}
              <Linha rotulo="Endereço do aviso">
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}><Box component="code" sx={{ wordBreak: 'break-all' }}>{s.urlAviso}</Box><Button size="small" onClick={() => navigator.clipboard?.writeText(s.urlAviso)}>Copiar</Button></Stack>
                <Typography variant="caption" color="text.secondary">Cadastre no Mercado Pago com o evento "Order".{!s.urlAvisoHttps && <Box component="span" sx={{ color: 'error.main' }}> O Mercado Pago só chama endereços https.</Box>}</Typography>
              </Linha>
              <Linha rotulo="Último aviso">
                {s.ultimoAviso ? <span>{formatarDataHora(s.ultimoAviso.criadoEm)} · {s.ultimoAviso.tipo.replace(/^aviso_/, '').replace(/_/g, ' ')}{s.ultimoAviso.erro ? <Box component="span" sx={{ color: 'error.main' }}> · {s.ultimoAviso.erro}</Box> : s.ultimoAviso.processadoEm ? <Box component="span" sx={{ color: 'success.main' }}> · processado</Box> : ' · aguardando'}</span>
                  : <Box component="span" sx={{ color: 'text.secondary' }}>Nenhum aviso recebido ainda.</Box>}
              </Linha>
              <Linha rotulo="Últimas 24 horas">
                {s.avisos24h} {s.avisos24h === 1 ? 'aviso' : 'avisos'}{s.avisosComErro ? ` (${s.avisosComErro} com erro)` : ''} · {s.falhas24h ? `${s.falhas24h} ${s.falhas24h === 1 ? 'falha' : 'falhas'} ao falar com o Mercado Pago` : 'nenhuma falha'}{s.pendentes ? ` · ${s.pendentes} a reprocessar` : ''} · {s.abertas} {s.abertas === 1 ? 'cobrança aberta' : 'cobranças abertas'}
              </Linha>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Button variant="outlined" onClick={testar} disabled={!pronto}>Testar conexão</Button>
              {teste && <Typography variant="body2" sx={{ color: teste.ok ? 'success.main' : 'error.main' }}>{teste.texto}</Typography>}
            </Stack>
          </Card>

          <Card variant="outlined" component="form" onSubmit={(ev: React.FormEvent) => { ev.preventDefault(); form.put('/painel/configuracoes/pagamento', { preserveScroll: true }); }} sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography component="h2" variant="h6">Como a loja recebe</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Vale para o link de pagamento que a equipe gera no pedido e para o "Pagar agora" da cliente.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, columnGap: 3, rowGap: 2 }}>
              {marcar('ligado', 'Pagamento online ligado', 'Desligado, nada de pagamento aparece para a equipe nem para as clientes. As cobranças já feitas continuam visíveis.')}
              {titulo('Meios')}
              {marcar('pix', 'Pix', 'QR e copia e cola na página da loja; aprovação na hora.')}
              {marcar('cartao', 'Cartão (checkout do Mercado Pago)', 'Crédito parcelado, débito e saldo Mercado Pago. A loja nunca vê o cartão.')}
              {numero('minutosPix', 'Validade do Pix (minutos)', 'As peças ficam reservadas durante esse tempo. De 10 a 1440.')}
              {numero('minutosCheckout', 'Tempo para pagar no cartão (minutos)', 'De 15 a 1440.')}
              {titulo('Parcelamento no cartão')}
              {numero('parcelasMax', 'Em até (vezes)', 'De 1 a 12.')}
              {numero('parcelasSemJuros', 'Sem juros até (vezes)', '1 = juros por conta da cliente. Acima de 1, a loja paga os juros dessas parcelas ao Mercado Pago.')}
              {titulo('Pedido e equipe')}
              {marcar('confirmarAoPagar', 'Confirmar a venda sozinho quando a compra é paga', 'Baixa o estoque e conta na meta da vendedora da cliente na hora do pagamento. Desmarcado, o pedido fica pago e a vendedora confirma.')}
              {marcar('pagarNaSacola', 'Mostrar "Pagar agora" para a cliente', 'Depois de enviar a sacola e em Minha conta, quando o pedido já tem frete definido. Desmarcado, só pelo link da vendedora.')}
              <TextField select label="Quem pode estornar" value={d.quemEstorna} onChange={x => form.setData('quemEstorna', x.target.value as Cfg['quemEstorna'])} error={!!e.quemEstorna} helperText={e.quemEstorna}>
                <MenuItem value="gestor">Só o gestor</MenuItem>
                <MenuItem value="equipe">Gestor e vendedores (dos próprios pedidos)</MenuItem>
              </TextField>
              <Box sx={{ gridColumn: { sm: 'span 2' } }}><Button type="submit" variant="contained" disabled={form.processing}>Salvar</Button></Box>
            </Box>
          </Card>
        </Stack>

        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, display: 'grid', gap: 2 }}>
          <Typography component="h2" variant="h6">Passo a passo para ligar</Typography>
          <Stack component="ol" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {passos.map((x, i) => (
              <Box component="li" key={x.titulo} sx={{ display: 'grid', gridTemplateColumns: '2rem 1fr', gap: 1.5, alignItems: 'start' }}>
                <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, bgcolor: x.feito ? 'marca.oliva' : 'marca.bege', color: x.feito ? 'marca.creme' : 'secondary.main' }}>{x.feito ? '✓' : i + 1}</Box>
                <Box><Box sx={{ fontWeight: 600 }}>{x.titulo}</Box><Typography variant="body2" color="text.secondary">{x.texto}</Typography></Box>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>Taxas, prazo de recebimento e dados bancários são definidos na conta do Mercado Pago, não aqui.</Typography>
        </Card>
      </Box>
    </PainelLayout>
  );
}
