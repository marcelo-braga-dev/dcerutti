import type { ReactNode } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, FormHelperText, MenuItem, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { formatarTelefone } from '@/lib/telefone';

type Cfg = {
  whatsappLoja: string; vendedorPadraoId: string; cepsCondicional: string[]; cidadeCondicional: string; frete: { valor: number; gratisAcima: number } | null; diasExpiracao: number; parcelas: number;
  cupons: { ligados: boolean; vendedorAplica: boolean }; vitrines: { ligadas: boolean }; instagramLoja: string; atendimento: { ligado: boolean; diasPosVenda: { entrega: number; satisfacao: number; sugestao: number; reativacao: number } };
  historico: { ligado: boolean; avisarSacola: boolean; horasSacola: number }; caixa: { descontoMaxVendedor: number; parcelasMax: number }; pagamentoOnline: { ligado: boolean }; catalogoPublico: boolean;
};

const virgula = (n: number) => String(n).replace('.', ',');

/** Configurações da loja, só o gestor (porta de painel/configuracoes/page.tsx). */
export default function Configuracoes({ cfg, vendedores }: { cfg: Cfg; vendedores: { id: string; nome: string }[] }) {
  const { flash } = usePage().props as unknown as { flash: { sucesso: string | null } };
  const form = useForm({
    vendedorPadraoId: cfg.vendedorPadraoId ?? '', cepsCondicional: cfg.cepsCondicional.join(', '), cidadeCondicional: cfg.cidadeCondicional,
    cobrarFrete: !!cfg.frete, freteValor: cfg.frete ? virgula(cfg.frete.valor) : '', freteGratisAcima: cfg.frete ? virgula(cfg.frete.gratisAcima) : '',
    diasExpiracao: String(cfg.diasExpiracao), parcelas: String(cfg.parcelas), cuponsLigados: cfg.cupons.ligados, vendedorAplicaCupom: cfg.cupons.vendedorAplica,
    vitrinesLigadas: cfg.vitrines.ligadas, instagramLoja: cfg.instagramLoja ? `@${cfg.instagramLoja}` : '', atendimentoLigado: cfg.atendimento.ligado,
    diasEntrega: String(cfg.atendimento.diasPosVenda.entrega), diasSatisfacao: String(cfg.atendimento.diasPosVenda.satisfacao), diasSugestao: String(cfg.atendimento.diasPosVenda.sugestao), diasReativacao: String(cfg.atendimento.diasPosVenda.reativacao),
    historicoLigado: cfg.historico.ligado, avisarSacola: cfg.historico.avisarSacola, horasSacola: String(cfg.historico.horasSacola),
    descontoMaxVendedor: String(cfg.caixa.descontoMaxVendedor), parcelasMax: String(cfg.caixa.parcelasMax), catalogoPublico: cfg.catalogoPublico,
  });
  type Campo = keyof typeof form.data;
  const d = form.data;
  const e = form.errors as Record<string, string>;
  const texto = (k: Campo, rotulo: string, extra: { ajuda?: string; tipo?: string; placeholder?: string; linhas?: number; largo?: boolean } = {}) => (
    <TextField label={rotulo} type={extra.tipo} value={d[k] as string} onChange={x => form.setData(k, x.target.value as never)} placeholder={extra.placeholder} multiline={!!extra.linhas} minRows={extra.linhas}
      error={!!e[k]} helperText={e[k] ?? extra.ajuda} sx={extra.largo ? { gridColumn: { sm: 'span 2' } } : undefined} slotProps={{ inputLabel: { shrink: true } }} />
  );
  const marca = (k: Campo, rotulo: string, ajuda?: string, largo = true) => (
    <Box sx={largo ? { gridColumn: { sm: 'span 2' } } : undefined}>
      <FormControlLabel control={<Checkbox checked={d[k] as boolean} onChange={x => form.setData(k, x.target.checked as never)} />} label={rotulo} />
      {ajuda && <FormHelperText sx={{ mt: -0.5, ml: 4 }}>{ajuda}</FormHelperText>}
    </Box>
  );
  const secao = (children: ReactNode) => <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5, borderTop: 1, borderColor: 'divider', pt: 3 }}>{children}</Box>;

  return (
    <PainelLayout>
      <Head title="Configurações" />
      <CabecalhoPagina sobre="Loja" titulo="Configurações" />
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2, maxWidth: 768 }}>{flash.sucesso}</Alert>}
      <Card variant="outlined" component="form" onSubmit={(ev: React.FormEvent) => { ev.preventDefault(); form.put('/painel/configuracoes', { preserveScroll: true }); }} sx={{ p: { xs: 2.5, sm: 4 }, maxWidth: 768, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>WhatsApp padrão da loja</Typography>
          <Typography sx={{ fontWeight: 600 }}>{formatarTelefone(cfg.whatsappLoja)}</Typography>
          <Typography variant="body2" color="text.secondary">Atende as clientes de quem está sem número. <LinkSimples href="/painel/numeros" sx={{ textDecoration: 'underline' }}>Gerenciar em Números de WhatsApp</LinkSimples></Typography>
        </Box>
        <TextField select label="Vendedor padrão para novos clientes" value={d.vendedorPadraoId} onChange={x => form.setData('vendedorPadraoId', x.target.value)} helperText="Para quem se cadastra sem link de convite." slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">Primeiro vendedor cadastrado</MenuItem>
          {vendedores.map(v => <MenuItem key={v.id} value={v.id}>{v.nome}</MenuItem>)}
        </TextField>
        {texto('cepsCondicional', 'CEPs atendidos pelo condicional', { linhas: 2, ajuda: 'Separe por vírgula.' })}
        {texto('cidadeCondicional', 'Cidade do condicional')}
        {secao(<>
          {marca('cobrarFrete', 'Cobrar frete pelo site', 'Desmarcado, a sacola e a mensagem dizem "frete a combinar" e nada é prometido.')}
          {texto('freteValor', 'Frete (R$)', { placeholder: '24,90' })}
          {texto('freteGratisAcima', 'Frete grátis acima de (R$)', { placeholder: '299,00', ajuda: '0 ou vazio: nunca grátis.' })}
        </>)}
        {texto('diasExpiracao', 'Prazo de resposta dos pendentes (dias)', { tipo: 'number', ajuda: 'Depois do prazo, o pedido aparece como "Prazo vencido" para cancelar (a reserva volta nessa hora). 0 = sem prazo.' })}
        {texto('parcelas', 'Parcelas exibidas no produto', { tipo: 'number', ajuda: '0 ou 1 esconde o parcelamento. Só ative depois de confirmar a condição real.' })}
        {secao(<>
          {marca('cuponsLigados', 'Cupons de desconto ligados', 'Desligado, a sacola e o painel não mostram nada de cupom. Os pedidos que já têm cupom continuam como estão.')}
          {marca('vendedorAplicaCupom', 'Vendedores podem aplicar cupons nos pedidos', 'Só cupons marcados para o vendedor ou para cliente e vendedor.')}
        </>)}
        {secao(<>
          {marca('vitrinesLigadas', 'Vitrines ligadas', 'Páginas públicas com as peças de lives e publicações, em /vitrines e /live.', false)}
          {texto('instagramLoja', 'Instagram da loja', { placeholder: '@usuario' })}
          {marca('atendimentoLigado', 'Atendimento online ligado', 'Fila de atendimento, retornos e respostas prontas no painel. Desligado, o menu e as páginas somem; os dados continuam guardados.')}
          <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            {texto('diasEntrega', 'Pós-venda: entrega (dias)', { tipo: 'number' })}
            {texto('diasSatisfacao', 'Satisfação (dias)', { tipo: 'number' })}
            {texto('diasSugestao', 'Sugestão (dias)', { tipo: 'number' })}
            {texto('diasReativacao', 'Reativação (dias)', { tipo: 'number' })}
          </Box>
          {marca('historicoLigado', 'Registrar a navegação das clientes', 'Páginas, peças vistas, buscas e sacola de cada cliente logada, para a equipe ver na ficha e em Interesse. Guardado por 12 meses, sem IP.')}
          {marca('avisarSacola', 'Avisar o vendedor da sacola parada', 'Aviso para o vendedor (ou para os gestores, se ele estiver inativo) quando a cliente separa peças e não envia o pedido.')}
          {texto('horasSacola', 'Avisar depois de (horas)', { tipo: 'number', ajuda: 'De 1 a 168 (7 dias).' })}
        </>)}
        {secao(<>
          {texto('descontoMaxVendedor', 'Caixa: desconto máximo do vendedor (%)', { tipo: 'number', ajuda: 'Acima disso, só o gestor registra a venda no caixa da loja.' })}
          {texto('parcelasMax', 'Caixa: crédito em até (vezes)', { tipo: 'number', ajuda: 'De 1 a 24.' })}
        </>)}
        <Box sx={{ gridColumn: { sm: 'span 2' }, borderTop: 1, borderColor: 'divider', pt: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Pagamento online (Mercado Pago)</Typography>
            <Typography variant="body2" color="text.secondary">{cfg.pagamentoOnline.ligado ? 'Ligado' : 'Desligado'}. Pix, cartão, parcelas, conexão e estornos ficam numa página própria.</Typography>
          </Box>
          <Button href="/painel/configuracoes/pagamento">Configurar o pagamento online →</Button>
        </Box>
        <Box sx={{ gridColumn: { sm: 'span 2' }, borderTop: 1, borderColor: 'divider', pt: 3, display: 'grid', gap: 1.5 }}>
          {marca('catalogoPublico', 'Catálogo público (visitantes veem o catálogo sem entrar)')}
          <Alert severity="warning">Mesmo público, enviar pedido continua exigindo conta.</Alert>
        </Box>
        <Box sx={{ gridColumn: { sm: 'span 2' } }}><Button type="submit" variant="contained" disabled={form.processing}>Salvar configurações</Button></Box>
      </Card>
    </PainelLayout>
  );
}
