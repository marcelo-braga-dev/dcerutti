import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { ContaCliente, rotulo, VazioConta, type ResumoConta } from '@/Components/loja/ContaCliente';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { estiloTitulo, FotoCheia } from '@/Components/loja/Vitrine';
import { Etiqueta, EtiquetaStatus, EtiquetaTipo } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { getJson } from '@/lib/http';
import { plural, textoCancelamento, valoresDoPedido } from '@/lib/pedido';
import { sacola, type ItemSacola } from '@/lib/sacola';
import { linkWhatsApp } from '@/lib/whatsapp';

type Item = { id: number; nome: string; tamanho: string; cor: string | null; imagem: string | null; quantidade: number; precoUnitario: number; descontoCupom: number; situacao: 'pendente' | 'vendido' | 'devolvido' };
type Pedido = {
  id: string; codigo: string; tipo: 'compra' | 'condicional'; status: 'pendente' | 'confirmado' | 'cancelado'; criadoEm: string; total: number; frete: number | null;
  codigoCupom: string | null; descontoCupom: number; freteCupom: boolean; motivoCancelamento: string | null; pagamentoSituacao: string | null; itens: Item[];
};

/** Meus pedidos (porta de src/app/(loja)/minha-conta/pedidos/page.tsx). */
export default function Pedidos({ conta, pedidos, vendedor }: { conta: ResumoConta; pedidos: Pedido[]; vendedor: { nome: string; telefone: string } | null }) {
  const { errors, flash } = usePage().props as unknown as { errors: Record<string, string>; flash: { sucesso: string | null } };
  const abertos = pedidos.filter(p => p.status === 'pendente').length;
  return (
    <ContaCliente conta={conta} titulo="Meus pedidos">
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, mb: 3 }}>
        <Box>
          <Typography component="h2" sx={{ ...estiloTitulo, fontSize: { xs: 24, sm: 30 } }}>Meus pedidos</Typography>
          {pedidos.length > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{plural(pedidos.length, 'pedido', 'pedidos')}{abertos > 0 && ` · ${abertos} em aberto`}</Typography>}
        </Box>
        {vendedor && <Box component="a" href={linkWhatsApp(vendedor.telefone, `Olá, ${vendedor.nome.split(' ')[0]}! Tenho uma dúvida sobre um pedido.`)} target="_blank" rel="noopener" sx={{ fontSize: 14, color: 'text.secondary' }}>Dúvidas? Fale com <strong>{vendedor.nome}</strong> no WhatsApp</Box>}
      </Stack>
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      {!pedidos.length ? <VazioConta acao={{ href: '/catalogo', rotulo: 'Ver o catálogo' }}>Você ainda não enviou pedidos.</VazioConta> : (
        <Stack spacing={2.5}>{pedidos.map(p => <CartaoPedido key={p.id} p={p} />)}</Stack>
      )}
    </ContaCliente>
  );
}

function CartaoPedido({ p }: { p: Pedido }) {
  const v = valoresDoPedido(p);
  const fechado = p.tipo === 'condicional' && p.status === 'confirmado';
  const cancelamento = p.status === 'cancelado' ? textoCancelamento(p.motivoCancelamento, true) : null;
  const cancelar = () => {
    if (confirm(`Cancelar ${p.codigo}? As peças voltam a ficar disponíveis.`)) router.post(`/minha-conta/pedidos/${p.id}/cancelar`, {}, { preserveScroll: true });
  };
  return (
    <Box component="article" sx={{ minWidth: 0, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 6, overflow: 'hidden' }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{p.codigo}</Typography>
          <EtiquetaTipo tipo={p.tipo} /><EtiquetaStatus status={p.status} />
          {p.pagamentoSituacao === 'pago' && <Etiqueta cor="oliva">Pago</Etiqueta>}
          {p.pagamentoSituacao === 'estornado' && <Etiqueta cor="cinza">Pagamento devolvido</Etiqueta>}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>{formatarDataHora(p.criadoEm)}{cancelamento && <><br />{cancelamento}</>}</Typography>
      </Stack>
      {p.itens.map(i => (
        <Stack key={i.id} direction="row" spacing={2} sx={{ alignItems: 'center', px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', opacity: i.situacao === 'devolvido' ? 0.5 : 1 }}>
          <Box sx={{ position: 'relative', width: 48, flexShrink: 0, aspectRatio: '3 / 4', borderRadius: 2, overflow: 'hidden', bgcolor: 'marca.bege' }}><FotoCheia src={i.imagem} alt={i.nome} /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 500 }}>{i.nome}</Typography>
            <Typography variant="body2" color="text.secondary">
              Tam. {i.tamanho}{i.cor && ` · ${i.cor}`}{i.quantidade > 1 && ` · ${i.quantidade} un.`}
              {fechado && <> · <Box component="span" sx={i.situacao === 'vendido' ? { color: 'success.main', fontWeight: 600 } : undefined}>{i.situacao === 'vendido' ? 'Ficou' : 'Voltou'}</Box></>}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{brl(i.precoUnitario * i.quantidade)}</Typography>
        </Stack>
      ))}
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, px: 2.5, py: 2, bgcolor: 'marca.creme' }}>
        <Typography variant="body2" color="text.secondary">
          {plural(v.unidades, 'peça', 'peças')}
          {v.ficaram != null && ` · ${v.ficaram ? plural(v.ficaram, 'ficou', 'ficaram') : 'nenhuma ficou'}`}
          {v.codigoCupom && <> · cupom <Box component="strong" sx={{ color: 'success.main' }}>{v.codigoCupom}</Box> {v.freteCupom ? '(frete grátis)' : `(−${brl(v.cupom)})`}</>}
          {v.frete != null && !v.freteCupom && ` · frete ${v.frete ? brl(v.frete) : 'grátis'}`}
          {v.freteACombinar && ' · frete a combinar'}
        </Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', columnGap: 2.5, rowGap: 1, ml: 'auto' }}>
          {p.status === 'pendente' && p.pagamentoSituacao !== 'pago' && <Button size="small" onClick={cancelar} sx={{ color: 'text.secondary', textDecoration: 'underline' }}>Cancelar {p.tipo === 'condicional' ? 'condicional' : 'pedido'}</Button>}
          {p.status !== 'pendente' && <ComprarDeNovo pedidoId={p.id} />}
          <span><Box component="span" sx={{ ...rotulo, mr: 1 }}>Total</Box><Box component="span" sx={{ fontWeight: 800, fontSize: 18 }}>{brl(v.total)}</Box></span>
        </Stack>
      </Stack>
    </Box>
  );
}

/** "Comprar de novo": põe na sacola as peças que ainda têm estoque e abre a sacola (ou avisa o que acabou). */
function ComprarDeNovo({ pedidoId }: { pedidoId: string }) {
  const [pendente, setPendente] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const comprar = async () => {
    setPendente(true);
    const r = await getJson<{ itens: ItemSacola[]; indisponiveis: string[] } | null>(`/minha-conta/pedidos/${pedidoId}/recomprar`).catch(() => null);
    setPendente(false);
    if (!r) return setAviso('Não deu para buscar as peças agora. Tente de novo.');
    if (!r.itens.length) return setAviso('Nenhuma peça deste pedido está disponível agora.');
    sacola.juntar(r.itens);
    if (r.indisponiveis.length) setAviso(`Na sacola! Não estão mais disponíveis: ${r.indisponiveis.join(', ')}.`);
    else router.visit('/sacola');
  };
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
      <Button size="small" variant="contained" onClick={comprar} disabled={pendente} sx={{ borderRadius: 99 }}>{pendente ? 'Separando…' : 'Comprar de novo'}</Button>
      {aviso && <Typography role="status" variant="caption" color="text.secondary" sx={{ maxWidth: 320, textAlign: 'right' }}>{aviso} {aviso.startsWith('Na sacola') && <LinkSimples href="/sacola" sx={{ textDecoration: 'underline' }}>Ver sacola</LinkSimples>}</Typography>}
    </Stack>
  );
}
