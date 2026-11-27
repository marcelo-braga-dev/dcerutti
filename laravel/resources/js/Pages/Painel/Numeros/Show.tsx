import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Vazio } from '@/Components/ui/Basicos';
import { FormNumero } from '@/Components/painel/numeros/FormNumero';
import { formatarDataHora } from '@/lib/datas';
import { ACOES, type Acao } from '@/lib/equipe';
import { ROTULO_STATUS, situacaoVinculo, type StatusNumero } from '@/lib/numeros';
import { formatarTelefone } from '@/lib/telefone';

type Vinculo = { id: number; nome: string; conexao: string; inicioEm: string; fimEm: string | null; conectadoEm: string | null; desconectadoEm: string | null; motivoFim: string | null; vinculadoPor: string | null; encerradoPor: string | null };
type Props = {
  numero: { id: number; telefone: string; apelido: string; observacao: string | null; status: StatusNumero; padrao: boolean };
  pedidos: number; atendendo: number; vinculos: Vinculo[]; usos: { id: string; quem: string | null; tipo: string; descricao: string | null; criadoEm: string }[];
};

/** A página de um número: dados, quem teve acesso e o uso registrado (porta de painel/numeros/[id]). */
export default function Numero({ numero: n, pedidos, atendendo, vinculos, usos }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const abertos = vinculos.filter(v => !v.fimEm).length;
  const status = (s: StatusNumero, pergunta?: string) => { if (!pergunta || confirm(pergunta)) router.post(`/painel/numeros/${n.id}/status`, { status: s }, { preserveScroll: true }); };
  return (
    <PainelLayout>
      <Head title={n.apelido} />
      <CabecalhoPagina sobre="Números de WhatsApp" titulo={n.apelido} acoes={<Button href="/painel/numeros" variant="outlined">Voltar ao quadro</Button>}>
        <Stack component="span" direction="row" spacing={1} sx={{ display: 'inline-flex', alignItems: 'center' }}><span>{formatarTelefone(n.telefone)}</span><Etiqueta cor={n.status === 'ativo' ? 'oliva' : 'cinza'}>{ROTULO_STATUS[n.status]}</Etiqueta>{n.padrao && <Etiqueta cor="caramelo">★ Padrão da loja</Etiqueta>}</Stack>
        <Box component="span" sx={{ display: 'block', fontSize: 14, mt: 0.5 }}>{atendendo} clientes falam com este número · {pedidos} pedidos · {abertos} {abertos === 1 ? 'pessoa ligada' : 'pessoas ligadas'}</Box>
      </CabecalhoPagina>
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 22rem' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Quem teve acesso</Typography>
            {!vinculos.length ? <Vazio>Ninguém foi ligado a este número ainda.</Vazio> : vinculos.map(v => (
              <Box key={v.id} sx={{ borderBottom: 1, borderColor: 'divider', py: 1.5, fontSize: 14, '&:last-child': { borderBottom: 0 } }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}><strong>{v.nome}</strong><Etiqueta cor={v.fimEm ? (v.desconectadoEm ? 'cinza' : 'vermelho') : 'oliva'}>{situacaoVinculo(v)}</Etiqueta></Stack>
                <Box sx={{ color: 'text.secondary' }}>De {formatarDataHora(v.inicioEm)}{v.vinculadoPor ? ` (por ${v.vinculadoPor})` : ''}{v.fimEm ? ` até ${formatarDataHora(v.fimEm)}${v.encerradoPor ? ` (por ${v.encerradoPor})` : ''}` : ' até agora'}</Box>
                {v.conectadoEm && <Box sx={{ color: 'text.secondary' }}>Conexão confirmada em {formatarDataHora(v.conectadoEm)}{v.desconectadoEm && v.fimEm ? ` · desconexão em ${formatarDataHora(v.desconectadoEm)}` : ''}</Box>}
                {v.motivoFim && <Box sx={{ color: 'text.secondary' }}>Motivo: {v.motivoFim}</Box>}
              </Box>
            ))}
          </Card>
          <Card variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6">Uso registrado</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Cliques no WhatsApp pelo painel e mudanças neste número. Sem a integração, o que acontece dentro do WhatsApp não aparece aqui.</Typography>
            {!usos.length ? <Vazio>Nada registrado ainda.</Vazio> : <Stack spacing={1} sx={{ fontSize: 14 }}>{usos.map(a => <Box key={a.id}><strong>{a.quem}</strong> · {ACOES[a.tipo as Acao]?.rotulo ?? a.tipo}{a.descricao ? ` · ${a.descricao}` : ''} <Box component="span" sx={{ color: 'text.secondary' }}>· {formatarDataHora(a.criadoEm)}</Box></Box>)}</Stack>}
          </Card>
        </Stack>
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ mb: 1.5 }}>Dados</Typography><FormNumero numero={n} /></Card>
          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1, justifyItems: 'start' }}>
            <Typography variant="h6">Situação</Typography>
            {n.status === 'ativo' && !n.padrao && <Button variant="outlined" size="small" onClick={() => router.post(`/painel/numeros/${n.id}/padrao`, {}, { preserveScroll: true })}>Definir como padrão</Button>}
            {n.status !== 'ativo' && <Button variant="contained" color="success" size="small" onClick={() => status('ativo')}>Reativar</Button>}
            {n.status === 'ativo' && !n.padrao && <Button variant="outlined" size="small" onClick={() => status('pausado', 'Pausar este número? As clientes de quem o usa como principal falarão com outro número dela ou com o padrão.')}>Pausar</Button>}
            {n.status !== 'desativado' && !n.padrao && <Button variant="contained" color="error" size="small" onClick={() => status('desativado', 'Desativar este número? Todas as pessoas saem dele e ficam as pendências de desconectar os aparelhos.')}>Desativar</Button>}
            {n.padrao && <Typography variant="body2" color="text.secondary">O número padrão atende as clientes de quem está sem número. Para pausar ou desativar, defina outro como padrão.</Typography>}
          </Card>
        </Stack>
      </Box>
    </PainelLayout>
  );
}
