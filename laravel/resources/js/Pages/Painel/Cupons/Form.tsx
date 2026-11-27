import { useState, type ReactNode } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, Chip, FormControlLabel, FormHelperText, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, EtiquetaStatus } from '@/Components/ui/Basicos';
import { Dialogo } from '@/Components/ui/Dialogo';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { normalizar } from '@/lib/catalogo';
import { QUEM_APLICA, ROTULO_SITUACAO, TIPOS, type SituacaoCupom, type TipoCupom } from '@/lib/cupom';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

type Opcao = { valor: string; rotulo: string; detalhe?: string };
type CupomForm = {
  id?: number; codigo: string; descricao: string; tipo: TipoCupom; valor: string; tetoDesconto: string; minimoCompra: string; inicio: string; fim: string;
  limiteTotal: string; limitePorCliente: string; quemAplica: string; somentePrimeiraCompra: boolean; valePromocao: boolean; ativo: boolean;
  categorias: string[]; marcas: string[]; clientes: string[]; referencias: string;
};
type Props = {
  opcoes: { categorias: Opcao[]; marcas: Opcao[]; clientes: Opcao[] }; usado: boolean; cupom: CupomForm | null;
  resumo: { situacao: SituacaoCupom; limiteTotal: number | null; ativo: boolean; usos: number; desconto: number } | null;
  pedidos: { id: string; codigo: string; nomeCliente: string; status: 'pendente' | 'confirmado' | 'cancelado'; criadoEm: string; descontoCupom: number; freteCupom: boolean; total: number; vendedor: string | null }[];
};

const VAZIO: CupomForm = { codigo: '', descricao: '', tipo: 'percentual', valor: '', tetoDesconto: '', minimoCompra: '', inicio: '', fim: '', limiteTotal: '', limitePorCliente: '1', quemAplica: 'ambos', somentePrimeiraCompra: false, valePromocao: false, ativo: true, categorias: [], marcas: [], clientes: [], referencias: '' };

/** Cadastro e edição de cupom, só gestor (porta de painel/cupons/novo, [id] e components/painel/form-cupom.tsx). */
export default function FormCupom({ opcoes, usado, cupom, resumo, pedidos }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const form = useForm<CupomForm>(cupom ?? VAZIO);
  const [apagar, setApagar] = useState(false);
  const d = form.data;
  const e = form.errors as Record<string, string>;
  const enviar = (ev: React.FormEvent) => { ev.preventDefault(); cupom?.id ? form.put(`/painel/cupons/${cupom.id}`, { preserveScroll: true }) : form.post('/painel/cupons'); };
  const campo = (nome: keyof CupomForm, label: string, extra: Record<string, unknown> = {}) => (
    <TextField label={label} value={d[nome] as string} onChange={x => form.setData(nome, x.target.value as never)} error={!!e[nome]} helperText={e[nome] ?? (extra.ajuda as string)} slotProps={{ htmlInput: { readOnly: !!extra.trava } }} {...Object.fromEntries(Object.entries(extra).filter(([k]) => !['ajuda', 'trava'].includes(k)))} />
  );
  const cor = resumo?.situacao === 'ativo' ? 'oliva' : resumo?.situacao === 'agendado' ? 'caramelo' : resumo?.situacao === 'esgotado' ? 'vermelho' : 'cinza';
  return (
    <PainelLayout>
      <Head title={cupom ? cupom.codigo : 'Novo cupom'} />
      <Button href="/painel/cupons" size="small" sx={{ mb: 2 }}>← Cupons</Button>
      <CabecalhoPagina sobre={cupom ? 'Cupom' : 'Cupons'} titulo={cupom ? cupom.codigo : 'Novo cupom'}
        acoes={cupom && resumo ? <>
          <Button variant="contained" color={resumo.ativo ? 'error' : 'success'} onClick={() => router.post(`/painel/cupons/${cupom.id}/ativo`, { ativo: !resumo.ativo }, { preserveScroll: true })}>{resumo.ativo ? 'Desativar' : 'Ativar'}</Button>
          {!pedidos.length && <Button color="error" onClick={() => setApagar(true)}>Apagar</Button>}
        </> : undefined}>
        {resumo && <Stack component="span" direction="row" spacing={1} sx={{ display: 'inline-flex', alignItems: 'center' }}><Etiqueta cor={cor}>{ROTULO_SITUACAO[resumo.situacao]}</Etiqueta><span>{resumo.usos} {resumo.usos === 1 ? 'uso' : 'usos'}{resumo.limiteTotal != null ? ` de ${resumo.limiteTotal}` : ''}{d.tipo !== 'freteGratis' && ` · ${brl(resumo.desconto)} de desconto dado`}</span></Stack>}
      </CabecalhoPagina>
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: cupom ? '1.6fr 1fr' : '1fr' }, gap: 3, alignItems: 'start', maxWidth: cupom ? undefined : 960 }}>
        <Card variant="outlined" component="form" onSubmit={enviar} noValidate sx={{ p: { xs: 2.5, sm: 4 }, display: 'grid', gap: 4 }}>
          {usado && <Alert severity="warning">Este cupom já foi usado em pedidos: código, tipo, valor, teto, promoção e abrangência estão travados. Para mudar, desative-o e crie outro.</Alert>}
          <Secao titulo="Cupom">
            {campo('codigo', 'Código', { placeholder: 'PRIMAVERA10', trava: usado, ajuda: 'De 3 a 30 letras, números ou hífen. A cliente pode digitar em maiúsculas ou minúsculas.' })}
            {campo('descricao', 'Descrição interna (opcional)', { placeholder: 'Campanha de primavera no Instagram' })}
            <TextField select label="Tipo" value={d.tipo} disabled={usado} onChange={x => form.setData('tipo', x.target.value as TipoCupom)}>
              {(Object.keys(TIPOS) as TipoCupom[]).map(t => <MenuItem key={t} value={t}>{TIPOS[t]}</MenuItem>)}
            </TextField>
            {d.tipo !== 'freteGratis' && campo('valor', d.tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)', { placeholder: d.tipo === 'percentual' ? '10' : '20,00', trava: usado })}
            {d.tipo === 'percentual' && campo('tetoDesconto', 'Teto do desconto (R$, opcional)', { placeholder: '50,00', trava: usado, ajuda: 'O desconto não passa deste valor. Em branco: sem teto.' })}
            {d.tipo === 'freteGratis' && <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { sm: 'span 2' } }}>Zera o frete do pedido de compra. Não vale para condicional nem para venda na loja.</Typography>}
          </Secao>
          <Secao titulo="Onde vale">
            {campo('minimoCompra', 'Valor mínimo do pedido (R$, opcional)', { placeholder: '150,00', ajuda: 'Soma de todas as peças do pedido, com o desconto do vendedor e sem o frete.' })}
            <FormControlLabel disabled={usado} control={<Checkbox checked={d.valePromocao} onChange={x => form.setData('valePromocao', x.target.checked)} />} label="Vale também para produtos em promoção e Imperdível" />
            <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { sm: 'span 2' } }}>Abrangência: sem nada marcado abaixo, o cupom vale para a loja toda. Marcando, vale para a peça que estiver em qualquer item escolhido.</Typography>
            <SeletorMultiplo rotulo="Categorias" opcoes={opcoes.categorias} escolhidos={d.categorias} mudar={v => form.setData('categorias', v)} travado={usado} />
            <SeletorMultiplo rotulo="Marcas" opcoes={opcoes.marcas} escolhidos={d.marcas} mudar={v => form.setData('marcas', v)} travado={usado} />
            <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'grid' }}>{campo('referencias', 'Produtos (referências)', { multiline: true, minRows: 2, placeholder: 'KG9H1DSI, 0199MD3EN', trava: usado, ajuda: 'Separe por vírgula. Cada cor é um produto.' })}</Box>
          </Secao>
          <Secao titulo="Validade e limites">
            {campo('inicio', 'Começa em', { type: 'date', slotProps: { inputLabel: { shrink: true } }, ajuda: 'Em branco: a partir de agora.' })}
            {campo('fim', 'Termina em (opcional)', { type: 'date', slotProps: { inputLabel: { shrink: true } }, ajuda: 'Vale até o fim deste dia.' })}
            {campo('limiteTotal', 'Limite total de usos (opcional)', { type: 'number', placeholder: 'Sem limite' })}
            {campo('limitePorCliente', 'Usos por cliente', { type: 'number', placeholder: 'Sem limite', ajuda: 'Em branco: sem limite por cliente.' })}
          </Secao>
          <Secao titulo="Para quem">
            <TextField select label="Quem pode aplicar" value={d.quemAplica} onChange={x => form.setData('quemAplica', x.target.value)}>
              {Object.entries(QUEM_APLICA).map(([v, r]) => <MenuItem key={v} value={v}>{r}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Checkbox checked={d.somentePrimeiraCompra} onChange={x => form.setData('somentePrimeiraCompra', x.target.checked)} />} label="Só na primeira compra da cliente" />
            <SeletorMultiplo rotulo="Só para estas clientes (opcional)" opcoes={opcoes.clientes} escolhidos={d.clientes} mudar={v => form.setData('clientes', v)} vazio="Todas as clientes" />
          </Secao>
          <Stack spacing={2} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
            <Box>
              <FormControlLabel control={<Checkbox checked={d.ativo} onChange={x => form.setData('ativo', x.target.checked)} />} label="Cupom ativo" />
              <FormHelperText>Desmarcado, ninguém consegue usar, mas o cupom continua guardado.</FormHelperText>
            </Box>
            <Box><Button type="submit" variant="contained" size="large" loading={form.processing}>{cupom ? 'Salvar cupom' : 'Criar cupom'}</Button></Box>
          </Stack>
        </Card>
        {cupom && (
          <Card variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Pedidos com este cupom</Typography>
            {!pedidos.length ? <Typography variant="body2" color="text.secondary">Nenhum pedido usou este cupom ainda.</Typography> : pedidos.map(p => (
              <Stack key={p.id} spacing={0.25} sx={{ py: 1, borderBottom: 1, borderColor: 'divider', fontSize: 14 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}><LinkSimples href={`/painel/pedidos/${p.id}`} sx={{ fontWeight: 600, textDecoration: 'underline' }}>{p.codigo}</LinkSimples><EtiquetaStatus status={p.status} /></Stack>
                <span>{p.nomeCliente} · {p.vendedor}</span>
                <Box component="span" sx={{ color: 'text.secondary' }}>{formatarDataHora(p.criadoEm)} · {p.freteCupom ? 'frete grátis' : `−${brl(p.descontoCupom)}`} · total {brl(p.total)}</Box>
              </Stack>
            ))}
          </Card>
        )}
      </Box>
      {cupom && (
        <Dialogo titulo={`Apagar ${cupom.codigo}?`} aberto={apagar} fechar={() => setApagar(false)}>
          <Typography variant="body2">O cupom some de vez. Só é possível porque ele nunca foi usado.</Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 3 }}>
            <Button onClick={() => setApagar(false)}>Voltar</Button>
            <Button variant="contained" color="error" onClick={() => router.delete(`/painel/cupons/${cupom.id}`)}>Apagar cupom</Button>
          </Stack>
        </Dialogo>
      )}
    </PainelLayout>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 3 }}>
      <Typography component="legend" variant="h6" sx={{ mb: 2 }}>{titulo}</Typography>
      {children}
    </Box>
  );
}

/** Lista pesquisável com caixas de marcar. */
function SeletorMultiplo({ rotulo, opcoes, escolhidos, mudar, travado = false, vazio = 'Nenhum' }: { rotulo: string; opcoes: Opcao[]; escolhidos: string[]; mudar: (v: string[]) => void; travado?: boolean; vazio?: string }) {
  const [busca, setBusca] = useState('');
  const termos = normalizar(busca);
  const visiveis = opcoes.filter(o => !termos || normalizar(`${o.rotulo} ${o.detalhe ?? ''}`).includes(termos)).slice(0, 200);
  const alternar = (v: string) => mudar(escolhidos.includes(v) ? escolhidos.filter(x => x !== v) : [...escolhidos, v]);
  const nomeDe = (v: string) => opcoes.find(o => o.valor === v)?.rotulo ?? v;
  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5, minHeight: 32 }}>
        {!escolhidos.length && <Typography variant="body2" color="text.secondary">{vazio}</Typography>}
        {escolhidos.map(v => <Chip key={v} size="small" label={nomeDe(v)} onDelete={travado ? undefined : () => alternar(v)} />)}
      </Stack>
      {!travado && (
        <>
          {opcoes.length > 8 && <TextField size="small" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" slotProps={{ htmlInput: { 'aria-label': `Buscar em ${rotulo}` } }} />}
          <Paper variant="outlined" sx={{ maxHeight: 176, overflowY: 'auto' }}>
            <List dense disablePadding>
              {visiveis.map(o => (
                <ListItemButton key={o.valor} onClick={() => alternar(o.valor)} dense>
                  <ListItemIcon sx={{ minWidth: 32 }}><Checkbox edge="start" size="small" checked={escolhidos.includes(o.valor)} tabIndex={-1} disableRipple /></ListItemIcon>
                  <ListItemText primary={o.rotulo} secondary={o.detalhe} />
                </ListItemButton>
              ))}
              {!visiveis.length && <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>Nada encontrado.</Typography>}
            </List>
          </Paper>
        </>
      )}
    </Stack>
  );
}
