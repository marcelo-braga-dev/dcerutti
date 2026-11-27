import { useState } from 'react';
import { Alert, Box, Button, Chip, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography, TextField } from '@mui/material';
import { Check, Close, InfoOutlined } from '@mui/icons-material';
import { Foto } from '@/Components/ui/Basicos';
import { Dialogo, Rodape } from '@/Components/ui/Dialogo';
import { brl } from '@/lib/dinheiro';
import { enviarAcao } from '@/lib/acao';

type Item = { id: number; nome: string; tamanho: string; quantidade: number; preco: number; imagem?: string | null };

/** Confirmação do pedido. No condicional, marca quantas unidades de cada peça ficaram (RN-08; B-13: pode ser parte). */
export function FecharPedido({ pedidoId, codigo, condicional, itens, cupom, vencido = false }: { pedidoId: string; codigo: string; condicional: boolean; itens: Item[]; cupom?: { codigo: string; desconto: number } | null; vencido?: boolean }) {
  const [ficaram, setFicaram] = useState<Record<number, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const faltam = condicional ? itens.filter(i => ficaram[i.id] == null).length : 0;
  // Compra: o cupom já está calculado. Condicional: é refeito no fechamento sobre o que ficar.
  const total = itens.reduce((a, i) => a + i.preco * (condicional ? (ficaram[i.id] ?? 0) : i.quantidade), 0) - (!condicional && cupom ? cupom.desconto : 0);
  const marcarTodos = (ficou: boolean) => setFicaram(Object.fromEntries(itens.map(i => [i.id, ficou ? i.quantidade : 0])));
  const marcar = (id: number, n: number) => setFicaram(x => ({ ...x, [id]: n }));
  const confirmar = async () => {
    setErro(null);
    setSalvando(true);
    setErro(await enviarAcao(`/painel/pedidos/${pedidoId}/confirmar`, { ficaram }));
    setSalvando(false);
  };

  return (
    <Stack sx={{ gap: 1.5 }}>
      {condicional && (
        <Stack sx={{ gap: 1 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>O que ficou com o cliente?</Typography>
            <Stack direction="row" sx={{ gap: 0.5 }}>
              <Chip size="small" variant="outlined" label="Ficou tudo" onClick={() => marcarTodos(true)} />
              <Chip size="small" variant="outlined" label="Voltou tudo" onClick={() => marcarTodos(false)} />
            </Stack>
          </Stack>
          <Stack sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5 }} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
            {itens.map(i => (
              <Stack key={i.id} direction="row" sx={{ py: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', minWidth: 0 }}>
                  {i.imagem !== undefined && <Foto src={i.imagem} largura={32} />}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{i.nome}</Typography>
                    <Typography variant="caption" color="text.secondary">Tam. {i.tamanho}{i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}</Typography>
                  </Box>
                </Stack>
                {i.quantidade > 1 ? (
                  <Select size="small" value={ficaram[i.id] ?? ''} displayEmpty onChange={e => marcar(i.id, Number(e.target.value))} inputProps={{ 'aria-label': `Unidades de ${i.nome} que ficaram` }}>
                    <MenuItem value="" disabled>Ficaram…</MenuItem>
                    {Array.from({ length: i.quantidade + 1 }, (_, n) => <MenuItem key={n} value={n}>{n} de {i.quantidade}</MenuItem>)}
                  </Select>
                ) : (
                  <ToggleButtonGroup size="small" exclusive value={ficaram[i.id] ?? null} onChange={(_, v) => v != null && marcar(i.id, v)} aria-label={`Situação de ${i.nome}`}>
                    <ToggleButton value={1} color="success">Ficou</ToggleButton>
                    <ToggleButton value={0}>Voltou</ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}
      {erro && <Alert severity="error">{erro}</Alert>}
      <Button variant="contained" color="success" size="large" startIcon={<Check />} disabled={salvando || faltam > 0} loading={salvando} onClick={confirmar} fullWidth>
        {condicional ? `Fechar condicional · venda de ${brl(total)}` : `Confirmar venda · ${brl(total)}`}
      </Button>
      <Button variant="outlined" color="error" startIcon={<Close />} disabled={salvando} onClick={() => { setErro(null); setCancelando(true); }} fullWidth>Cancelar pedido</Button>
      {faltam > 0 && <Typography variant="caption" color="secondary" align="center" sx={{ fontWeight: 600 }}>{faltam === 1 ? 'Marque a peça restante para fechar.' : `Marque as ${faltam} peças restantes para fechar.`}</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.5 }}>
        <InfoOutlined sx={{ fontSize: 14, mt: '2px' }} />
        <span>{condicional ? 'O que ficou sai do estoque e vira venda; o que voltou é liberado.' : 'As peças saem do estoque e a venda entra na meta do vendedor.'}
          {condicional && cupom && ` O cupom ${cupom.codigo} é recalculado sobre o que ficar (o valor acima é antes dele).`}</span>
      </Typography>
      <CancelarPedido aberto={cancelando} pedidoId={pedidoId} codigo={codigo} condicional={condicional} vencido={vencido} fechar={() => setCancelando(false)} />
    </Stack>
  );
}

const MOTIVOS_RAPIDOS = ['Cliente desistiu', 'Cliente não respondeu', 'Peça sem estoque', 'Pedido em duplicidade', 'Cliente vai fazer outro pedido'];
const MOTIVO_VENCIDO = 'Prazo vencido sem resposta';
const MOTIVOS_VENDA = ['Cliente devolveu as peças', 'Venda registrada por engano', 'Cliente desistiu da compra', 'Troca por outro pedido'];

/** Cancelamento com motivo obrigatório (fica no histórico). `confirmado`: desfaz a venda. */
export function CancelarPedido({ aberto, pedidoId, codigo, condicional, vencido = false, confirmado = false, fechar }: {
  aberto: boolean; pedidoId: string; codigo: string; condicional: boolean; vencido?: boolean; confirmado?: boolean; fechar: () => void;
}) {
  const [motivo, setMotivo] = useState(vencido ? MOTIVO_VENCIDO : '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const rapidos = confirmado ? MOTIVOS_VENDA : vencido ? [MOTIVO_VENCIDO, ...MOTIVOS_RAPIDOS] : MOTIVOS_RAPIDOS;
  const confirmar = async () => {
    setErro(null);
    setSalvando(true);
    const e = await enviarAcao(`/painel/pedidos/${pedidoId}/cancelar`, { motivo, expirado: vencido && motivo === MOTIVO_VENCIDO });
    setSalvando(false);
    if (e) setErro(e);
    else fechar();
  };
  return (
    <Dialogo aberto={aberto} titulo={confirmado ? `Cancelar a venda ${codigo}` : `Cancelar ${codigo}`} fechar={() => !salvando && fechar()}>
      <Typography variant="body2" color="text.secondary">
        {confirmado ? 'As peças vendidas voltam ao estoque, a venda sai das metas e dos relatórios e o uso do cupom é liberado.' : condicional ? 'As peças reservadas voltam para o estoque.' : 'O pedido sai da lista de pendentes.'} O cancelamento não pode ser desfeito.
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} aria-label="Motivos rápidos">
        {rapidos.map(m => <Chip key={m} label={m} onClick={() => setMotivo(m)} color={motivo === m ? 'primary' : 'default'} variant={motivo === m ? 'filled' : 'outlined'} />)}
      </Stack>
      <TextField label="Motivo do cancelamento" value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 500))} multiline rows={3} autoFocus placeholder="Escreva o motivo ou escolha um acima" />
      <Rodape erro={erro} salvando={salvando} podeSalvar={motivo.trim().length >= 3} salvar={confirmar} cancelar={fechar} rotulo={confirmado ? 'Cancelar venda' : 'Cancelar pedido'} perigo />
    </Dialogo>
  );
}

export function CancelarVenda({ pedidoId, codigo, condicional }: { pedidoId: string; codigo: string; condicional: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outlined" color="error" size="small" onClick={() => setAberto(true)}>Cancelar venda</Button>
      <CancelarPedido aberto={aberto} pedidoId={pedidoId} codigo={codigo} condicional={condicional} confirmado fechar={() => setAberto(false)} />
    </>
  );
}
