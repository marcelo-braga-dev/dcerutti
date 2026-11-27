import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, IconButton, InputAdornment, Link, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Add, Edit, LocalOffer, Paid, Remove } from '@mui/icons-material';
import { Etiqueta, Foto } from '@/Components/ui/Basicos';
import { Dialogo, Rodape } from '@/Components/ui/Dialogo';
import { brl, lerValor } from '@/lib/dinheiro';
import { enviarAcao } from '@/lib/acao';

export type ItemEdicao = {
  id: number; varianteId: number; produtoId: number; referencia: string; nome: string; marca: string; cor: string | null; imagem: string | null;
  tamanho: string; codigoInterno: string | null; quantidade: number; preco: number; precoTabela: number | null; linkProduto: string | null;
};
export type VarianteCat = { id: number; tamanho: string; disponivel: number; codigoInterno: string | null };
export type CorDoModelo = { id: number; referencia: string; nome: string; cor: string | null; preco: number; imagem: string | null; variantes: VarianteCat[] };
export type CupomDoPedido = { atual: { codigo: string; beneficio: string; desconto: number; freteGratis: boolean } | null; disponiveis: { codigo: string; regra: string }[]; podeAplicar: boolean };
type Linha = { itemId?: number; varianteId: number; quantidade: number; preco: number };
type PecaBusca = { id: number; referencia: string; nome: string; cor: string | null; preco: number; imagem: string | null; variantes: VarianteCat[] };
type Salvar = (linhas: Linha[], observacao?: string) => Promise<string | null>;

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Desconto em % sobre o preço do catálogo (até 2 casas); '' sem desconto. */
const pctDe = (preco: number, tabela: number) => (tabela > 0 && preco < tabela ? String(Math.round((1 - preco / tabela) * 10000) / 100).replace('.', ',') : '');
/** % digitado entre 0 e 99,99 (vazio = 0), ou null se inválido. */
const lerPct = (t: string) => { const n = t.trim() ? lerValor(t) : 0; return Number.isFinite(n) && n >= 0 && n < 100 ? n : null; };
const comDesconto = (tabela: number, pct: number) => centavos(tabela * (1 - pct / 100));
const tabelaDe = (i: ItemEdicao) => i.precoTabela ?? i.preco;
const linhaDe = (i: ItemEdicao): Linha => ({ itemId: i.id, varianteId: i.varianteId, quantidade: i.quantidade, preco: i.preco });

/**
 * U-08: peças de um pedido pendente (src/components/painel/editar-pedido.tsx). Cada card mostra cor, tamanho,
 * quantidade e desconto; Editar abre a janela da peça. Cada alteração vai para o histórico do pedido.
 */
export function PecasDoPedido({ pedidoId, itens, cores, cupom }: { pedidoId: string; itens: ItemEdicao[]; cores: Record<number, CorDoModelo[]>; cupom?: CupomDoPedido | null }) {
  const [editando, setEditando] = useState<number | 'geral' | 'incluir' | 'cupom' | null>(null);
  const salvar: Salvar = async (linhas, observacao) => {
    const e = await enviarAcao(`/painel/pedidos/${pedidoId}/itens`, { linhas, observacao: observacao || null });
    if (!e) setEditando(null);
    return e;
  };
  const item = typeof editando === 'number' ? itens.find(i => i.id === editando) : undefined;

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {itens.map(i => <CardPeca key={i.id} item={i} editar={() => setEditando(i.id)} />)}
      </Stack>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => setEditando('incluir')}>Incluir peça</Button>
        <Button size="small" startIcon={<Paid />} onClick={() => setEditando('geral')}>Desconto geral</Button>
        {cupom && (cupom.podeAplicar || cupom.atual) && <Button size="small" startIcon={<LocalOffer />} onClick={() => setEditando('cupom')}>{cupom.atual ? `Cupom ${cupom.atual.codigo}` : 'Cupom'}</Button>}
      </Stack>

      {item && (
        <Dialogo aberto titulo="Editar peça" fechar={() => setEditando(null)}>
          <EditorPeca key={item.id} item={item} cores={cores[item.produtoId] ?? []} sozinha={itens.length === 1} cancelar={() => setEditando(null)}
            ocupadas={new Set(itens.filter(o => o.id !== item.id).map(o => o.varianteId))}
            salvar={(linha, obs) => salvar(itens.flatMap(o => (o.id !== item.id ? [linhaDe(o)] : linha ? [linha] : [])), obs)} />
        </Dialogo>
      )}
      <Dialogo aberto={editando === 'geral'} titulo="Desconto geral" fechar={() => setEditando(null)}>
        <EditorDescontoGeral itens={itens} salvar={salvar} cancelar={() => setEditando(null)} />
      </Dialogo>
      {cupom && (
        <Dialogo aberto={editando === 'cupom'} titulo="Cupom do pedido" fechar={() => setEditando(null)}>
          <EditorCupom cupom={cupom} cancelar={() => setEditando(null)} salvar={async (codigo, obs) => {
            const e = await enviarAcao(`/painel/pedidos/${pedidoId}/cupom`, { codigo, observacao: obs ?? null });
            if (!e) setEditando(null);
            return e;
          }} />
        </Dialogo>
      )}
      <Dialogo aberto={editando === 'incluir'} titulo="Incluir peça" fechar={() => setEditando(null)} largura="md">
        {editando === 'incluir' && <Incluir itens={itens} salvar={salvar} cancelar={() => setEditando(null)} />}
      </Dialogo>
    </Stack>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'baseline' }}>
      <Typography component="span" variant="overline" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1 }}>{rotulo}</Typography>
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>{children}</Typography>
    </Box>
  );
}

function Preco({ quantidade, preco, tabela }: { quantidade: number; preco: number; tabela: number }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        <Typography variant="body2">{quantidade} x {preco < tabela && <Box component="s" sx={{ color: 'text.secondary', mr: 0.5 }}>{brl(tabela)}</Box>}<strong>{brl(preco)}</strong></Typography>
        {preco < tabela && <Etiqueta cor="oliva">−{brl(centavos((tabela - preco) * quantidade))}</Etiqueta>}
      </Stack>
      <Typography sx={{ fontWeight: 800 }}>{brl(centavos(preco * quantidade))}</Typography>
    </Stack>
  );
}

function CardPeca({ item, editar }: { item: ItemEdicao; editar: () => void }) {
  const tabela = tabelaDe(item);
  const pct = pctDe(item.preco, tabela);
  return (
    <Stack direction="row" sx={{ py: 1.5, gap: 1.5, alignItems: 'flex-start' }}>
      <Foto src={item.imagem} alt={item.nome} largura={48} />
      <Stack sx={{ gap: 0.75, minWidth: 0, flex: 1 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            {item.linkProduto ? <Link href={item.linkProduto} sx={{ fontWeight: 600 }}>{item.nome}</Link> : <Typography sx={{ fontWeight: 600 }}>{item.nome}</Typography>}
            <Typography variant="body2" color="text.secondary">{item.marca} · Ref. {item.referencia}{item.codigoInterno ? ` · Cód. ${item.codigoInterno}` : ''}</Typography>
          </Box>
          <Button variant="outlined" size="small" startIcon={<Edit />} onClick={editar} aria-label={`Editar ${item.nome}`} sx={{ flexShrink: 0, alignSelf: 'flex-start' }}>Editar</Button>
        </Stack>
        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Info rotulo="Cor">{item.cor ?? '—'}</Info>
          <Info rotulo="Tamanho">{item.tamanho}</Info>
          <Info rotulo="Qtd.">{item.quantidade}</Info>
          <Info rotulo="Desconto">{pct ? `${pct}%` : '—'}</Info>
        </Stack>
        <Preco quantidade={item.quantidade} preco={item.preco} tabela={tabela} />
      </Stack>
    </Stack>
  );
}

function CampoPct({ valor, mudar, rotulo }: { valor: string; mudar: (v: string) => void; rotulo: string }) {
  return (
    <TextField label={rotulo} value={valor} onChange={e => mudar(e.target.value)} placeholder="0" error={lerPct(valor) == null} sx={{ width: 140 }}
      slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal', style: { textAlign: 'right' } } }} />
  );
}

/** Janela de uma peça: cor, tamanho, quantidade e desconto, com o preço final na hora; também retira a peça. */
function EditorPeca({ item, cores, sozinha, ocupadas, salvar, cancelar }: {
  item: ItemEdicao; cores: CorDoModelo[]; sozinha: boolean; ocupadas: Set<number>; salvar: (linha: Linha | null, observacao?: string) => Promise<string | null>; cancelar: () => void;
}) {
  const tabelaOriginal = tabelaDe(item);
  // A cor da linha pode ter saído do catálogo: nesse caso ela aparece só com o tamanho atual.
  const opcoes: CorDoModelo[] = cores.some(c => c.id === item.produtoId)
    ? cores
    : [{ id: item.produtoId, referencia: item.referencia, nome: item.nome, cor: item.cor, preco: tabelaOriginal, imagem: item.imagem, variantes: [{ id: item.varianteId, tamanho: item.tamanho, disponivel: 0, codigoInterno: item.codigoInterno }] }, ...cores];
  const [produtoId, setProdutoId] = useState(item.produtoId);
  const [varianteId, setVarianteId] = useState(item.varianteId);
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const [pct, setPct] = useState(pctDe(item.preco, tabelaOriginal));
  const [pctMexido, setPctMexido] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [retirando, setRetirando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const cor = opcoes.find(c => c.id === produtoId)!;
  const variante = cor.variantes.find(v => v.id === varianteId);
  const tabela = produtoId === item.produtoId ? tabelaOriginal : cor.preco;
  const p = lerPct(pct);
  const preco = !pctMexido && produtoId === item.produtoId ? item.preco : p != null ? comDesconto(tabela, p) : item.preco;
  const mudou = varianteId !== item.varianteId || quantidade !== item.quantidade || preco !== item.preco;

  const trocarCor = (id: number) => {
    const nova = opcoes.find(c => c.id === id)!;
    const mesmoTam = nova.variantes.find(v => v.tamanho === variante?.tamanho) ?? nova.variantes.find(v => v.disponivel > 0) ?? nova.variantes[0];
    setProdutoId(id);
    if (mesmoTam) setVarianteId(mesmoTam.id);
    setPctMexido(true);
  };
  const confirmar = async () => {
    setErro(null);
    if (!retirando && ocupadas.has(varianteId)) return setErro('Essa cor e tamanho já estão em outra peça do pedido: ajuste a quantidade lá.');
    if (p == null) return setErro('Desconto entre 0 e 99%.');
    setSalvando(true);
    const e = await salvar(retirando ? null : { itemId: item.id, varianteId, quantidade, preco }, observacao);
    setSalvando(false);
    if (e) setErro(e);
  };
  const motivo = <TextField value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 500))} placeholder="Motivo (opcional, fica no histórico)" aria-label="Motivo da alteração" />;

  if (retirando)
    return (
      <>
        <Typography variant="body2">Retirar <strong>{item.nome}</strong> (tam. {item.tamanho}, {item.quantidade} un.) do pedido? No condicional, a reserva volta para o estoque.</Typography>
        {motivo}
        <Rodape erro={erro} salvando={salvando} podeSalvar salvar={confirmar} cancelar={() => setRetirando(false)} rotulo="Retirar peça" perigo />
      </>
    );

  return (
    <>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
        <Foto src={cor.imagem} alt={cor.nome} largura={56} />
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{cor.nome}</Typography>
          <Typography variant="body2" color="text.secondary">Ref. {cor.referencia}{variante?.codigoInterno ? ` · Cód. ${variante.codigoInterno}` : ''}</Typography>
        </Box>
      </Stack>
      {opcoes.length > 1 && (
        <Box>
          <Typography variant="overline" color="text.secondary">Cor {cor.cor && `· ${cor.cor}`}</Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {opcoes.map(c => (
              <Box key={c.id} component="button" type="button" onClick={() => trocarCor(c.id)} aria-pressed={c.id === produtoId} aria-label={`Cor ${c.cor ?? c.referencia}`} title={`${c.cor ?? c.nome} · Ref. ${c.referencia} · ${brl(c.preco)}`}
                sx={{ p: 0, border: 2, borderColor: c.id === produtoId ? 'primary.main' : 'transparent', borderRadius: 1.5, bgcolor: 'transparent', cursor: 'pointer', opacity: c.id === produtoId ? 1 : 0.7 }}>
                <Foto src={c.imagem} largura={40} />
              </Box>
            ))}
          </Stack>
        </Box>
      )}
      <Box>
        <Typography variant="overline" color="text.secondary">Tamanho · riscado = sem estoque</Typography>
        <ToggleButtonGroup exclusive size="small" value={varianteId} onChange={(_, v) => v && setVarianteId(v)} sx={{ flexWrap: 'wrap' }}>
          {cor.variantes.map(v => (
            <ToggleButton key={v.id} value={v.id} title={`${v.disponivel} disponível(is)`} sx={{ minWidth: 44, fontWeight: 700, textDecoration: v.disponivel > 0 || v.id === item.varianteId ? 'none' : 'line-through' }}>{v.tamanho}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Stack direction="row" sx={{ gap: 3, alignItems: 'flex-end' }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>Quantidade</Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
            <IconButton aria-label="Menos uma unidade" disabled={quantidade <= 1} onClick={() => setQuantidade(q => q - 1)} sx={{ border: 1, borderColor: 'divider' }}><Remove fontSize="small" /></IconButton>
            <Typography sx={{ width: 32, textAlign: 'center' }} aria-label="Quantidade">{quantidade}</Typography>
            <IconButton aria-label="Mais uma unidade" disabled={quantidade >= 20} onClick={() => setQuantidade(q => q + 1)} sx={{ border: 1, borderColor: 'divider' }}><Add fontSize="small" /></IconButton>
          </Stack>
        </Box>
        <CampoPct rotulo="Desconto" valor={pct} mudar={v => { setPct(v); setPctMexido(true); }} />
      </Stack>
      <Preco quantidade={quantidade} preco={preco} tabela={tabela} />
      {motivo}
      {!sozinha && <Button color="error" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => { setErro(null); setRetirando(true); }}>Retirar peça do pedido</Button>}
      <Rodape erro={erro} salvando={salvando} podeSalvar={mudou && p != null} salvar={confirmar} cancelar={cancelar} />
    </>
  );
}

/** Desconto geral: o mesmo % em todas as peças, sobre o preço do catálogo de cada uma. */
function EditorDescontoGeral({ itens, salvar, cancelar }: { itens: ItemEdicao[]; salvar: Salvar; cancelar: () => void }) {
  const tabela = centavos(itens.reduce((a, i) => a + tabelaDe(i) * i.quantidade, 0));
  const atual = centavos(itens.reduce((a, i) => a + i.preco * i.quantidade, 0));
  const [pct, setPct] = useState(pctDe(atual, tabela));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const p = lerPct(pct);
  const novo = p == null ? atual : centavos(itens.reduce((a, i) => a + comDesconto(tabelaDe(i), p) * i.quantidade, 0));
  const confirmar = async () => {
    if (p == null) return setErro('Desconto entre 0 e 99%.');
    setErro(null);
    setSalvando(true);
    const e = await salvar(itens.map(i => ({ ...linhaDe(i), preco: comDesconto(tabelaDe(i), p) })), p ? `Desconto geral de ${pct.trim()}%` : 'Desconto geral retirado');
    setSalvando(false);
    if (e) setErro(e);
  };
  return (
    <>
      <CampoPct rotulo="Desconto em todas as peças" valor={pct} mudar={setPct} />
      <Stack sx={{ gap: 0.5 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', color: 'text.secondary' }}><span>Peças pelo preço do catálogo</span><span>{brl(tabela)}</span></Stack>
        {novo < tabela && <Stack direction="row" sx={{ justifyContent: 'space-between', color: 'success.main' }}><span>Desconto</span><span>−{brl(centavos(tabela - novo))}</span></Stack>}
        <Stack direction="row" sx={{ justifyContent: 'space-between', fontWeight: 800, fontSize: 18, borderTop: 1, borderColor: 'divider', pt: 1 }}><span>Total das peças</span><span>{brl(novo)}</span></Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary">Substitui o desconto de cada peça. Para uma peça só, use o Editar dela.</Typography>
      <Rodape erro={erro} salvando={salvando} podeSalvar={p != null && novo !== atual} salvar={confirmar} cancelar={cancelar} />
    </>
  );
}

/** Incluir peça: busca no catálogo; a peça entra pelo preço do catálogo. */
function Incluir({ itens, salvar, cancelar }: { itens: ItemEdicao[]; salvar: Salvar; cancelar: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<PecaBusca[]>([]);
  const [escolhida, setEscolhida] = useState<{ p: PecaBusca; v: VarianteCat } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    let atual = true;
    const t = setTimeout(() => {
      fetch(`/painel/pecas/busca?q=${encodeURIComponent(busca)}`, { headers: { Accept: 'application/json' } }).then(r => r.json()).then(r => { if (atual) setResultados(r); }).catch(() => {});
    }, busca ? 250 : 0);
    return () => { atual = false; clearTimeout(t); };
  }, [busca]);
  const confirmar = async () => {
    if (!escolhida) return;
    if (itens.some(i => i.varianteId === escolhida.v.id)) return setErro('Essa peça e tamanho já estão no pedido: aumente a quantidade no Editar dela.');
    setErro(null);
    setSalvando(true);
    const e = await salvar([...itens.map(linhaDe), { varianteId: escolhida.v.id, quantidade: 1, preco: escolhida.p.preco }]);
    setSalvando(false);
    if (e) setErro(e);
  };
  return (
    <>
      <TextField value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar peça: nome, referência ou categoria…" aria-label="Buscar peça para incluir" autoFocus />
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5, maxHeight: '50dvh', overflowY: 'auto' }}>
        {resultados.map(p => (
          <Card key={p.id} sx={{ p: 1, display: 'flex', gap: 1.5 }}>
            <Foto src={p.imagem} alt={p.nome} largura={48} />
            <Stack sx={{ gap: 0.5, minWidth: 0 }}>
              <Typography variant="body2">{p.nome}</Typography>
              <Typography variant="caption" color="text.secondary">Ref. {p.referencia}{p.cor ? ` · ${p.cor}` : ''} · {brl(p.preco)}</Typography>
              <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                {p.variantes.map(v => (
                  <Button key={v.id} size="small" variant={escolhida?.v.id === v.id ? 'contained' : 'outlined'} onClick={() => setEscolhida({ p, v })} title={`${v.disponivel} disponível(is)`} sx={{ minWidth: 40, px: 1 }}>{v.tamanho}</Button>
                ))}
              </Stack>
            </Stack>
          </Card>
        ))}
        {!resultados.length && <Typography variant="body2" color="text.secondary">Nenhuma peça encontrada.</Typography>}
      </Box>
      {escolhida && <Typography variant="body2">Incluir <strong>{escolhida.p.nome}</strong> · tam. {escolhida.v.tamanho} · {brl(escolhida.p.preco)}</Typography>}
      <Rodape erro={erro} salvando={salvando} podeSalvar={!!escolhida} salvar={confirmar} cancelar={cancelar} rotulo="Incluir peça" />
    </>
  );
}

/** Cupom: aplicar (digitando ou escolhendo um disponível), trocar ou retirar. A regra é conferida no servidor. */
function EditorCupom({ cupom, salvar, cancelar }: { cupom: CupomDoPedido; salvar: (codigo: string | null, observacao?: string) => Promise<string | null>; cancelar: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviar = async (c: string | null) => {
    setErro(null);
    setSalvando(true);
    const e = await salvar(c, observacao || undefined);
    setSalvando(false);
    if (e) setErro(e);
  };
  return (
    <>
      {cupom.atual ? (
        <Alert severity="success" variant="outlined" action={<Button color="error" size="small" disabled={salvando} onClick={() => enviar(null)}>Retirar cupom</Button>}>
          Cupom <strong>{cupom.atual.codigo}</strong> · {cupom.atual.freteGratis ? 'frete grátis' : `−${brl(cupom.atual.desconto)}`}
          <Typography variant="body2" color="text.secondary">{cupom.atual.beneficio}</Typography>
        </Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">O pedido não tem cupom. O desconto do cupom soma com o desconto do vendedor.</Typography>
      )}
      {cupom.podeAplicar ? (
        <>
          <Box component="form" sx={{ display: 'flex', gap: 1 }} onSubmit={e => { e.preventDefault(); if (codigo.trim()) enviar(codigo); }}>
            <TextField value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder={cupom.atual ? 'Trocar por outro código' : 'Código do cupom'} aria-label="Código do cupom" slotProps={{ htmlInput: { maxLength: 30 } }} autoFocus />
            <Button type="submit" variant="contained" disabled={salvando || !codigo.trim()} loading={salvando}>Aplicar</Button>
          </Box>
          {cupom.disponiveis.length > 0 && (
            <Stack sx={{ gap: 0.5 }}>
              <Typography variant="overline" color="text.secondary">Disponíveis para esta cliente</Typography>
              <Stack sx={{ gap: 0.5, maxHeight: 224, overflowY: 'auto' }}>
                {cupom.disponiveis.map(c => (
                  <Button key={c.codigo} variant="outlined" disabled={salvando || c.codigo === cupom.atual?.codigo} onClick={() => enviar(c.codigo)} sx={{ justifyContent: 'flex-start', textAlign: 'left', fontWeight: 400 }}>
                    <strong>{c.codigo}</strong>&nbsp;<Box component="span" sx={{ color: 'text.secondary' }}>· {c.regra}</Box>
                  </Button>
                ))}
              </Stack>
            </Stack>
          )}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">Aplicar cupom não está liberado agora. Você ainda pode retirar o cupom atual.</Typography>
      )}
      <TextField value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 500))} placeholder="Motivo (opcional, fica no histórico)" aria-label="Motivo da alteração" />
      {erro && <Alert severity="error">{erro}</Alert>}
      <Stack direction="row" sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', pt: 2 }}><Button onClick={cancelar}>Fechar</Button></Stack>
    </>
  );
}
