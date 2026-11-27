import type { ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';

/** Janela padrão do painel: título, conteúdo, erro e os botões (porta do Popup e do Rodape). */
export function Dialogo({ titulo, aberto, fechar, children, largura = 'sm' }: { titulo: string; aberto: boolean; fechar: () => void; children: ReactNode; largura?: 'xs' | 'sm' | 'md' }) {
  return (
    <Dialog open={aberto} onClose={fechar} fullWidth maxWidth={largura}>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent><Stack sx={{ gap: 2, pt: 0.5 }}>{children}</Stack></DialogContent>
    </Dialog>
  );
}

export function Rodape({ erro, salvando, podeSalvar, salvar, cancelar, rotulo = 'Salvar', perigo = false }: {
  erro?: string | null; salvando: boolean; podeSalvar: boolean; salvar: () => void; cancelar: () => void; rotulo?: string; perigo?: boolean;
}) {
  return (
    <>
      {erro && <Alert severity="error">{erro}</Alert>}
      <DialogActions sx={{ px: 0, borderTop: 1, borderColor: 'divider', pt: 2 }}>
        <Button disabled={salvando} onClick={cancelar}>Cancelar</Button>
        <Button variant="contained" color={perigo ? 'error' : 'primary'} disabled={salvando || !podeSalvar} loading={salvando} onClick={salvar}>{rotulo}</Button>
      </DialogActions>
    </>
  );
}
