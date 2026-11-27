import { Head, router, usePage } from '@inertiajs/react';
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta, Foto } from '@/Components/ui/Basicos';
import { LinkSimples } from '@/Components/loja/LinkSimples';
import { BotaoEnviarSugestao, BotaoLembrar } from '@/Components/painel/sugestao/Botoes';
import type { ResumoSugestao } from './Index';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { aberta, ATENCAO, ESCOLHAS, mensagemDaSugestao, mensagemLembrete, precoQueVale, SITUACOES, type Escolha } from '@/lib/sugestoes';
import { linkWhatsApp } from '@/lib/whatsapp';

type VarianteInfo = { id: number; tamanho: string; produto: { id: number; nome: string; corNome: string | null; imagem: string | null } };
type Item = { id: number; escolha: Escolha; quantidade: number; nota: string | null; precoOferta: number | null; adicionadoPelaCliente: boolean; produto: { id: number; nome: string; preco: number; imagem: string | null } | null; sugerida: VarianteInfo | null; escolhida: VarianteInfo | null };
type Props = { sugestao: ResumoSugestao & { itens: Item[] }; link: string; loja: string };

const COR_ESCOLHA = { quero: 'oliva', talvez: 'caramelo', nao: 'cinza', pendente: 'contorno' } as const;
const COR = { bege: 'contorno', caramelo: 'caramelo', oliva: 'oliva', escuro: 'contorno', cinza: 'cinza' } as const;

/** Detalhe da sugestão: o que foi sugerido, o que a cliente marcou, reenviar, lembrar, renovar e cancelar. */
export default function Sugestao({ sugestao: s, link, loja }: Props) {
  const { flash, errors } = usePage().props as unknown as { flash: { sucesso: string | null }; errors: Record<string, string> };
  const vencida = s.situacao === 'vencida';
  const temOferta = s.itens.some(i => i.precoOferta != null);
  const cliente = s.cliente!;
  const texto = mensagemDaSugestao({ nomeCliente: cliente.nome, nomeVendedor: s.vendedor ?? '', loja, titulo: s.titulo, mensagem: s.mensagem, link, pecas: s.itens.length, validaAte: new Date(s.validaAte), temOferta, cupom: s.cupomCodigo });
  const lembrete = mensagemLembrete({ nomeCliente: cliente.nome, nomeVendedor: s.vendedor ?? '', situacao: s.situacao, link, validaAte: new Date(s.validaAte), temOferta });
  const marcadas = s.itens.filter(i => i.escolha !== 'pendente').length;
  const podeLembrar = aberta(s.situacao) && !!s.enviadaEm;
  return (
    <PainelLayout>
      <Head title={`Sugestão ${s.codigo}`} />
      <Button href="/painel/sugestoes" size="small" sx={{ mb: 2 }}>← Sugestões enviadas</Button>
      <CabecalhoPagina sobre={`Sugestão ${s.codigo}`} titulo={s.titulo} acoes={<>
        {podeLembrar && <BotaoLembrar id={s.id} url={linkWhatsApp(cliente.telefone, lembrete)} lembretes={s.lembretes} />}
        {aberta(s.situacao) && <BotaoEnviarSugestao id={s.id} url={linkWhatsApp(cliente.telefone, texto)} enviada={!!s.enviadaEm} />}
        {s.pedidoId && <Button variant="contained" href={`/painel/pedidos/${s.pedidoId}`}>Ver o pedido</Button>}
        <Button variant="outlined" href={`/painel/sugestoes/nova?de=${s.id}`}>Duplicar</Button>
      </>}>
        <Stack component="span" direction="row" spacing={1} sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <Etiqueta cor={COR[SITUACOES[s.situacao].cor]}>{SITUACOES[s.situacao].rotulo}</Etiqueta>
          <span>Para <LinkSimples href={`/painel/clientes/${cliente.id}`} sx={{ textDecoration: 'underline' }}>{cliente.nome}</LinkSimples> · por {s.vendedor?.split(' ')[0]} · {formatarData(s.criadaEm)}</span>
        </Stack>
      </CabecalhoPagina>
      {errors.erro && <Alert severity="error" sx={{ mb: 2 }}>{errors.erro}</Alert>}
      {flash.sucesso && <Alert severity="success" sx={{ mb: 2 }}>{flash.sucesso}</Alert>}
      {s.atencao && <Alert severity="warning" sx={{ mb: 3 }}><strong>Agora:</strong> {ATENCAO[s.atencao]}. {s.atencao === 'enviar' ? 'Toque em Enviar no WhatsApp.' : s.atencao === 'vencendo' ? 'Lembre a cliente ou renove por mais 7 dias.' : 'Um lembrete no WhatsApp costuma destravar.'}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xl: '1.5fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Card variant="outlined">
          {s.itens.map(i => {
            const p = i.produto;
            const preco = p ? precoQueVale(p.preco, i.precoOferta, vencida) : 0;
            const trocouCor = i.escolhida && p && i.escolhida.produto.id !== p.id;
            return (
              <Box key={i.id} sx={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) auto', gap: 2, p: 2, alignItems: 'start', fontSize: 14, borderBottom: 1, borderColor: 'divider' }}>
                <Foto src={(trocouCor ? i.escolhida!.produto.imagem : p?.imagem) ?? null} largura={56} />
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{p?.nome ?? 'Peça fora do catálogo'}{i.adicionadoPelaCliente && <Box component="span" sx={{ ml: 1, fontSize: 12, color: 'secondary.main' }}>(ela adicionou)</Box>}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Sugerido: {i.sugerida ? `Tam. ${i.sugerida.tamanho}` : 'ela escolhe o tamanho'}
                    {i.precoOferta != null && p && <> · <s>{brl(p.preco)}</s> <Box component="strong" sx={{ color: vencida ? 'text.secondary' : 'imperdivel.main' }}>{brl(i.precoOferta)}</Box>{vencida && ' (venceu)'}</>}
                  </Typography>
                  {i.nota && <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>“{i.nota}”</Typography>}
                  {i.escolha !== 'pendente' && <Typography variant="caption">Ela escolheu: {i.escolhida ? <strong>Tam. {i.escolhida.tamanho}{trocouCor ? ` · ${i.escolhida.produto.corNome ?? 'outra cor'}` : ''}</strong> : 'sem tamanho'} · {i.quantidade} {i.quantidade === 1 ? 'peça' : 'peças'}</Typography>}
                </Stack>
                <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                  <Etiqueta cor={COR_ESCOLHA[i.escolha]}>{i.escolha === 'pendente' ? 'Sem resposta' : ESCOLHAS[i.escolha]}</Etiqueta>
                  <strong>{brl(preco)}</strong>
                </Stack>
              </Box>
            );
          })}
        </Card>
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1, fontSize: 14 }}>
            <Typography variant="h6">Acompanhamento</Typography>
            <Box><Box component="span" sx={{ color: 'text.secondary' }}>Vale até:</Box> {formatarDataHora(s.validaAte)}{vencida && <Box component="span" sx={{ color: 'error.main' }}> · venceu</Box>}</Box>
            <Box><Box component="span" sx={{ color: 'text.secondary' }}>Vista:</Box> {s.vistaEm ? <>{formatarDataHora(s.vistaEm)} ({tempoDesde(s.vistaEm)}) · aberta {s.vezesVista}×</> : 'a cliente ainda não abriu o link'}</Box>
            <Box><Box component="span" sx={{ color: 'text.secondary' }}>Marcadas:</Box> {marcadas} de {s.itens.length}</Box>
            {s.respondidaEm && <Box><Box component="span" sx={{ color: 'text.secondary' }}>Respondida:</Box> {formatarDataHora(s.respondidaEm)}</Box>}
            {s.cupomCodigo && <Box><Box component="span" sx={{ color: 'text.secondary' }}>Cupom:</Box> <strong>{s.cupomCodigo}</strong> (aplicado quando ela pedir)</Box>}
            {s.lembretes > 0 && s.lembradoEm && <Box><Box component="span" sx={{ color: 'text.secondary' }}>Lembrada:</Box> {s.lembretes}× · a última {formatarDataHora(s.lembradoEm)}</Box>}
            {(aberta(s.situacao) || vencida) && <Box><Button variant="outlined" size="small" sx={{ mt: 1 }} onClick={() => router.post(`/painel/sugestoes/${s.id}/renovar`, { dias: 7 }, { preserveScroll: true })}>{vencida ? 'Reabrir por mais 7 dias' : 'Renovar por mais 7 dias'}</Button></Box>}
            {s.mensagem && <Box sx={{ mt: 1, bgcolor: 'marca.bege', px: 1.5, py: 1, fontStyle: 'italic' }}>{s.mensagem}</Box>}
          </Card>
          <Card variant="outlined" sx={{ p: 2.5, display: 'grid', gap: 1.5, fontSize: 14 }}>
            <Typography variant="h6">Link da cliente</Typography>
            <TextField size="small" value={link} slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'Link da sugestão' } }} />
            <Box component="a" href={link} target="_blank" rel="noopener" sx={{ color: 'secondary.main' }}>Abrir como a cliente vê</Box>
            {aberta(s.situacao) && <Box><Button variant="contained" color="error" size="small" onClick={() => { if (confirm('Cancelar esta sugestão? O link deixa de aceitar respostas.')) router.post(`/painel/sugestoes/${s.id}/cancelar`, {}, { preserveScroll: true }); }}>Cancelar a sugestão</Button></Box>}
          </Card>
        </Stack>
      </Box>
    </PainelLayout>
  );
}
