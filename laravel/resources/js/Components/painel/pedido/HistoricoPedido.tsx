import { Box, Stack, Typography } from '@mui/material';
import { Check, Close, Edit, ShoppingBag } from '@mui/icons-material';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';

export type RegistroHistorico = {
  id: number; acao: 'criado' | 'editado' | 'confirmado' | 'cancelado'; autor: string; nomeUsuario: string | null; mudancas: string[];
  itens: { referencia: string; nome: string; cor: string | null; tamanho: string; quantidade: number; preco: number; precoTabela: number | null }[];
  total: number; frete: number | null; observacao: string | null; criadoEm: string;
};

const ACAO = { criado: 'Pedido feito', editado: 'Alterado', confirmado: 'Confirmado', cancelado: 'Cancelado' } as const;
const COR = { criado: 'primary.main', editado: 'secondary.main', confirmado: 'success.main', cancelado: 'error.main' } as const;
const ICONE = { criado: ShoppingBag, editado: Edit, confirmado: Check, cancelado: Close } as const;

/** Rastreio do pedido, do mais recente para o mais antigo (src/components/painel/historico-pedido.tsx). */
export function HistoricoPedido({ historico, nomeCliente }: { historico: RegistroHistorico[]; nomeCliente: string }) {
  if (!historico.length) return <Typography variant="body2" color="text.secondary">Sem registros. O histórico começa na próxima alteração deste pedido.</Typography>;
  const autor = (h: RegistroHistorico) => (h.autor === 'cliente' ? `${nomeCliente} (cliente)` : h.autor === 'equipe' ? h.nomeUsuario ?? 'Equipe' : 'Sistema');
  return (
    <Box component="ol" sx={{ m: 0, p: 0, pl: 3.5, ml: 1.5, borderLeft: 1, borderColor: 'divider', listStyle: 'none', display: 'grid', gap: 2 }}>
      {historico.map(h => {
        const Icone = ICONE[h.acao];
        const unidades = h.itens.reduce((a, p) => a + p.quantidade, 0);
        return (
          <Box component="li" key={h.id} sx={{ position: 'relative', fontSize: 14 }}>
            <Box sx={{ position: 'absolute', left: -41, top: 0, width: 24, height: 24, borderRadius: '50%', bgcolor: COR[h.acao], color: '#fff', display: 'grid', placeItems: 'center', outline: '4px solid', outlineColor: 'background.paper' }} aria-hidden>
              <Icone sx={{ fontSize: 14 }} />
            </Box>
            <Stack direction="row" sx={{ gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700 }}>{ACAO[h.acao]}</Typography>
              <Typography variant="caption" color="text.secondary">por {autor(h)} · {formatarDataHora(h.criadoEm)}</Typography>
            </Stack>
            {h.mudancas.length > 0 && <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>{h.mudancas.map((m, i) => <li key={i}>{m}</li>)}</Box>}
            {h.observacao && <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{h.observacao}”</Typography>}
            <Box component="details" sx={{ mt: 0.5 }}>
              <Box component="summary" sx={{ cursor: 'pointer', fontSize: 12, color: 'text.secondary' }}>
                {h.acao === 'criado' ? 'O que a cliente pediu' : 'Peças depois desta ação'} · {unidades} {unidades === 1 ? 'peça' : 'peças'} · {brl(h.total)}
              </Box>
              <Stack component="ul" sx={{ mt: 1, mb: 0, p: 1.5, gap: 0.5, borderRadius: 2, bgcolor: 'background.default', listStyle: 'none', fontSize: 13 }}>
                {h.itens.map((p, i) => (
                  <Stack component="li" key={i} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                    <span>{p.quantidade}× {p.nome}{p.cor ? ` · ${p.cor}` : ''} · tam. {p.tamanho} <Box component="span" sx={{ color: 'text.secondary' }}>· Ref. {p.referencia}</Box></span>
                    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{p.precoTabela != null && p.precoTabela > p.preco && <Box component="s" sx={{ color: 'text.secondary', mr: 0.5 }}>{brl(p.precoTabela)}</Box>}{brl(p.preco)}</Box>
                  </Stack>
                ))}
                {h.frete != null && <Stack component="li" direction="row" sx={{ justifyContent: 'space-between', color: 'text.secondary' }}><span>Frete</span><span>{h.frete ? brl(h.frete) : 'grátis'}</span></Stack>}
              </Stack>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
