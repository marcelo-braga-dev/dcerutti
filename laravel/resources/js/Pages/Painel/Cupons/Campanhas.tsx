import { Head, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, FormHelperText, MenuItem, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { QUEM_APLICA, TIPOS, type TipoCupom } from '@/lib/cupom';
import { brl } from '@/lib/dinheiro';

type CampanhaForm = {
  ativo: boolean; tipo: TipoCupom; valor: string; tetoDesconto: string; minimoCompra: string; valePromocao: boolean; quemAplica: string;
  codigo?: string; diasAposCadastro?: string; minimoParaGerar?: string; diasParaComecar?: string; diasValidade?: string; geraComCupom?: boolean; acumula?: boolean;
};
type Props = {
  ligados: boolean; temPrimeira: boolean; temModelo: boolean; usosPrimeira: { usos: number; desconto: number };
  proxima: { gerados: number; usados: number; desconto: number }; primeira: CampanhaForm; proximaForm: CampanhaForm;
};

/** Campanhas de cupom: primeira compra e próxima compra (porta de painel/cupons/campanhas e form-campanha.tsx). */
export default function Campanhas({ ligados, temPrimeira, temModelo, usosPrimeira, proxima, primeira, proximaForm }: Props) {
  const { flash } = usePage().props;
  return (
    <PainelLayout>
      <Head title="Campanhas de cupom" />
      <Button href="/painel/cupons" size="small" sx={{ mb: 2 }}>← Cupons</Button>
      <CabecalhoPagina sobre="Cupons" titulo="Campanhas">Cupons automáticos: boas-vindas na primeira compra e um presente para voltar depois de cada compra.</CabecalhoPagina>
      {!ligados && <Alert severity="warning" sx={{ mb: 2 }}>Os cupons estão desligados em <LinkSimples href="/painel/configuracoes" sx={{ textDecoration: 'underline' }}>Configurações</LinkSimples>: as campanhas só funcionam com eles ligados.</Alert>}
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="h6">Primeira compra</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Para quem nunca comprou: a sacola oferece o cupom com um clique.{temPrimeira && ` Usado ${usosPrimeira.usos} ${usosPrimeira.usos === 1 ? 'vez' : 'vezes'}${primeira.tipo !== 'freteGratis' ? ` · ${brl(usosPrimeira.desconto)} de desconto dado` : ''}.`}</Typography>
          </Box>
          <FormCampanha campanha="primeiraCompra" inicial={primeira} />
        </Card>
        <Card variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="h6">Próxima compra</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Cada venda confirmada que se encaixa gera um cupom pessoal, de uso único, para a cliente voltar.{temModelo && ` ${proxima.gerados} ${proxima.gerados === 1 ? 'gerado' : 'gerados'}, ${proxima.usados} ${proxima.usados === 1 ? 'usado' : 'usados'}${proxima.desconto ? ` · ${brl(proxima.desconto)} de desconto dado` : ''}.`}</Typography>
          </Box>
          <FormCampanha campanha="proximaCompra" inicial={proximaForm} />
        </Card>
      </Box>
    </PainelLayout>
  );
}

function FormCampanha({ campanha, inicial }: { campanha: 'primeiraCompra' | 'proximaCompra'; inicial: CampanhaForm }) {
  const form = useForm({ ...inicial, campanha });
  const d = form.data;
  const e = form.errors as Record<string, string>;
  const primeira = campanha === 'primeiraCompra';
  const campo = (nome: keyof CampanhaForm, label: string, ajuda?: string, extra: object = {}) => (
    <TextField label={label} value={(d[nome] as string) ?? ''} onChange={x => form.setData(nome, x.target.value as never)} error={!!e[nome]} helperText={e[nome] ?? ajuda} {...extra} />
  );
  const marcar = (nome: keyof CampanhaForm, label: string, ajuda?: string) => (
    <Box sx={{ gridColumn: { sm: 'span 2' } }}>
      <FormControlLabel control={<Checkbox checked={!!d[nome]} onChange={x => form.setData(nome, x.target.checked as never)} />} label={label} />
      {ajuda && <FormHelperText>{ajuda}</FormHelperText>}
    </Box>
  );
  return (
    <Box component="form" noValidate onSubmit={ev => { ev.preventDefault(); form.post('/painel/cupons/campanhas', { preserveScroll: true }); }} sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 2.5 }}>
      {marcar('ativo', primeira ? 'Campanha de primeira compra ligada' : 'Campanha de próxima compra ligada', 'Só funciona com os cupons ligados em Configurações.')}
      {primeira && campo('codigo', 'Código público', 'Aparece sozinho na sacola de quem nunca comprou; pode ser divulgado fora do site.', { placeholder: 'BEMVINDA' })}
      <TextField select label="Tipo" value={d.tipo} onChange={x => form.setData('tipo', x.target.value as TipoCupom)}>{(Object.keys(TIPOS) as TipoCupom[]).map(t => <MenuItem key={t} value={t}>{TIPOS[t]}</MenuItem>)}</TextField>
      {d.tipo !== 'freteGratis' && campo('valor', d.tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)')}
      {d.tipo === 'percentual' && campo('tetoDesconto', 'Teto do desconto (R$, opcional)')}
      {campo('minimoCompra', 'Valor mínimo do pedido para usar (R$, opcional)')}
      <TextField select label="Quem pode aplicar" value={d.quemAplica} onChange={x => form.setData('quemAplica', x.target.value)}>{Object.entries(QUEM_APLICA).map(([v, r]) => <MenuItem key={v} value={v}>{r}</MenuItem>)}</TextField>
      <FormControlLabel control={<Checkbox checked={d.valePromocao} onChange={x => form.setData('valePromocao', x.target.checked)} />} label="Vale também para produtos em promoção" />
      {primeira ? campo('diasAposCadastro', 'Vale por quantos dias depois do cadastro', 'Em branco: vale até a primeira compra. Uma vez por cliente (fichas com o mesmo telefone contam juntas).', { type: 'number', placeholder: 'Sem prazo' }) : (
        <>
          {campo('minimoParaGerar', 'Gera o cupom em vendas a partir de (R$)', '0 ou vazio: toda venda gera.', { placeholder: '150,00' })}
          {campo('diasParaComecar', 'Começa a valer depois de (dias)', '1 = no dia seguinte à compra.', { type: 'number' })}
          {campo('diasValidade', 'Vale por (dias)', undefined, { type: 'number' })}
          {marcar('geraComCupom', 'Venda feita com cupom também gera', 'Desmarcado, o desconto não vira uma corrente sem fim.')}
          {marcar('acumula', 'Acumular: gerar mesmo se a cliente ainda tem um cupom de próxima compra sem usar')}
        </>
      )}
      {e.erro && <Alert severity="error" sx={{ gridColumn: { sm: 'span 2' } }}>{e.erro}</Alert>}
      <Box sx={{ gridColumn: { sm: 'span 2' } }}><Button type="submit" variant="contained" loading={form.processing}>Salvar campanha</Button></Box>
    </Box>
  );
}
