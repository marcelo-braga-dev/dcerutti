import { useRef, useState, type ReactNode } from 'react';
import { Head, router } from '@inertiajs/react';
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { NoteAddOutlined } from '@mui/icons-material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina } from '@/Components/ui/Basicos';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { postJson } from '@/lib/http';

type Regras = Record<string, { marca: string; ignorar: boolean }>;
type Resumo = {
  linhas: number; totais: { pecasPlanilha: number; valorPlanilha: number; pecasSiteAntes: number; pecasSiteDepois: number };
  fornecedores: { nome: string; marca: string; ignorar: boolean; novo: boolean; skus: number; pecas: number }[]; marcasNovas: string[]; categoriasNovas: string[];
  contagens: { produtosNovos: number; variantesNovas: number; estoqueAlterado: number; precosAlterados: number; desativados: number; reativados: number; ignoradas: number; avisos: number };
  produtosNovos: { referencia: string; nome: string; marca: string; categoria: string; genero: string; preco: number; tamanhos: string; pecas: number }[];
  estoque: { nome: string; tamanho: string; de: number; para: number }[]; precos: { referencia: string; nome: string; preco: number | null; precoCheio: number | null }[];
  desativados: { referencia: string; nome: string }[]; reativados: { referencia: string; nome: string }[];
  ignoradas: { linha: number; codigo: string; descricao: string; motivo: string }[]; avisos: string[];
};
type Envio = { id: string; nomeOriginal: string; aba: string | null; resumo: Resumo };
type Props = { colunas: string[]; historico: { id: number; nomeOriginal: string; criadoEm: string; usuario: string | null; resumo: Resumo }[] };

const GENEROS: Record<string, string> = { feminino: 'Feminino', masculino: 'Masculino', unissex: 'Unissex' };
const n = (v: number) => v.toLocaleString('pt-BR');
const csrf = () => decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');

/** Importação da planilha de estoque (porta de painel/produtos/importar e components/painel/importador-estoque.tsx). */
export default function Importar({ colunas, historico }: Props) {
  return (
    <PainelLayout>
      <Head title="Importar estoque" />
      <CabecalhoPagina sobre="Catálogo e estoque" titulo="Importar estoque" acoes={<Button variant="outlined" href="/painel/produtos">Ver produtos</Button>}>
        Envie a planilha de estoque do sistema da loja. Ela é a verdade do catálogo: estoque, preços, peças novas e o que saiu.
      </CabecalhoPagina>
      <Importador />
      <Box sx={{ display: 'grid', gridTemplateColumns: { lg: '1fr 1fr' }, gap: 3, mt: 5 }}>
        <Card variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>Como funciona</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, fontSize: 14 }}>
            <li><strong>Estoque</strong> de cada tamanho = Estoq. − Cond. − Res. EC. Tamanho que não está na planilha fica com estoque 0.</li>
            <li><strong>Preço</strong> cheio = Preço Venda. Uma promoção do site continua enquanto for menor que o preço novo.</li>
            <li><strong>Peça nova</strong> vira produto (agrupado por fornecedor, referência e cor) ou um tamanho novo de um produto existente. Nome, categoria e gênero são sugeridos pela descrição; depois de criados, o que você editar no produto fica.</li>
            <li><strong>Produto que sumiu</strong> da planilha é desativado; volta a ficar ativo quando reaparecer.</li>
            <li>Nada é gravado até você conferir a prévia e clicar em <strong>Importar agora</strong>.</li>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Colunas esperadas: {colunas.join(' · ')}.</Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>Últimas importações</Typography>
          {historico.length === 0 ? <Typography variant="body2" color="text.secondary">Nenhuma importação ainda.</Typography> : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {historico.map(h => (
                <Stack key={h.id} direction="row" sx={{ py: 1.5, justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', fontSize: 14 }}>
                  <Box sx={{ minWidth: 0 }}><Box sx={{ fontWeight: 500 }}>{h.nomeOriginal}</Box><Typography variant="caption" color="text.secondary">{formatarDataHora(h.criadoEm)}{h.usuario ? ` · ${h.usuario}` : ' · linha de comando'}</Typography></Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
                    {h.resumo.contagens.produtosNovos} novos · {h.resumo.contagens.estoqueAlterado} estoques · {h.resumo.contagens.precosAlterados} preços
                    <br />{n(h.resumo.totais.pecasSiteAntes)} → {n(h.resumo.totais.pecasSiteDepois)} peças no site
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Card>
      </Box>
    </PainelLayout>
  );
}

function Importador() {
  const entrada = useRef<HTMLInputElement>(null);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [regras, setRegras] = useState<Regras>({});
  const [regrasDaPrevia, setRegrasDaPrevia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Resumo | null>(null);
  const [pendente, setPendente] = useState(false);

  const aplicarResumo = (r: Resumo) => {
    const novas = Object.fromEntries(r.fornecedores.map(f => [f.nome, { marca: f.marca, ignorar: f.ignorar }]));
    setRegras(novas);
    setRegrasDaPrevia(JSON.stringify(novas));
  };
  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null); setFeito(null); setEnvio(null); setEnviando(true);
    try {
      const fd = new FormData();
      fd.set('arquivo', arquivo);
      const resp = await fetch('/painel/produtos/importar', { method: 'POST', body: fd, headers: { 'X-XSRF-TOKEN': csrf(), Accept: 'application/json' } });
      const j = await resp.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!resp.ok) { setErro(j.erro ?? 'Não foi possível ler a planilha.'); return; }
      setEnvio(j);
      aplicarResumo(j.resumo);
    } catch {
      setErro('Não foi possível enviar a planilha. Confira a conexão e tente de novo.');
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };
  const mudouRegras = !!envio && JSON.stringify(regras) !== regrasDaPrevia;
  const atualizar = async () => {
    if (!envio) return;
    setErro(null); setPendente(true);
    const r = await postJson<{ ok: true; resumo: Resumo } | { ok: false; erro: string }>('/painel/produtos/importar/previa', { id: envio.id, regras }).catch(() => ({ ok: false as const, erro: 'Sem conexão.' }));
    setPendente(false);
    if (!r.ok) { setErro(r.erro); return; }
    setEnvio({ ...envio, resumo: r.resumo });
    aplicarResumo(r.resumo);
  };
  const confirmar = async () => {
    if (!envio || !confirm(`Importar a planilha "${envio.nomeOriginal}"? O estoque, os preços e os produtos do site vão seguir a planilha.`)) return;
    setErro(null); setPendente(true);
    const r = await postJson<{ ok: true; resumo: Resumo } | { ok: false; erro: string }>('/painel/produtos/importar/confirmar', { id: envio.id, nomeOriginal: envio.nomeOriginal, regras }).catch(() => ({ ok: false as const, erro: 'Sem conexão.' }));
    setPendente(false);
    if (!r.ok) { setErro(r.erro); return; }
    setFeito(r.resumo);
    setEnvio(null);
    router.reload({ only: ['historico'] });
  };

  if (feito) {
    const c = feito.contagens;
    return (
      <Card variant="outlined" sx={{ p: { xs: 3, sm: 4 }, display: 'grid', gap: 2.5, borderColor: 'success.main' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'marca.oliva', color: 'marca.creme', display: 'grid', placeItems: 'center', fontSize: 22 }}>✓</Box>
          <Box><Typography component="h2" variant="h5">Estoque importado</Typography><Typography variant="body2" color="text.secondary">O site agora tem {n(feito.totais.pecasSiteDepois)} peças à venda (antes: {n(feito.totais.pecasSiteAntes)}).</Typography></Box>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          <Numero rotulo="Produtos novos" valor={c.produtosNovos} /><Numero rotulo="Tamanhos novos" valor={c.variantesNovas} /><Numero rotulo="Estoques corrigidos" valor={c.estoqueAlterado} /><Numero rotulo="Preços atualizados" valor={c.precosAlterados} />
        </Box>
        {c.produtosNovos > 0 && <Alert severity="warning">Os produtos novos entraram sem foto. Em Produtos → filtro <strong>Sem foto</strong>, abra cada um para pôr as fotos e conferir nome, categoria e gênero.</Alert>}
        <Stack direction="row" spacing={1.5}><Button variant="contained" href="/painel/produtos?filtro=sem-foto">Produtos sem foto</Button><Button variant="outlined" onClick={() => setFeito(null)}>Importar outra planilha</Button></Stack>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      <Box component="label" onDragOver={(e: React.DragEvent) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={(e: React.DragEvent) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files?.[0]); }}
        sx={{ borderRadius: 6, border: '2px dashed', borderColor: arrastando ? 'marca.marrom-950' : 'marca.borda-forte', bgcolor: arrastando ? 'marca.bege' : 'marca.card', p: { xs: 4, sm: 5 }, display: 'grid', justifyItems: 'center', gap: 1.5, textAlign: 'center', cursor: 'pointer', '&:hover': { borderColor: 'marca.marrom-950' } }}>
        <input ref={entrada} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => enviar(e.target.files?.[0])} disabled={enviando || pendente} />
        <Box sx={{ width: 56, height: 56, borderRadius: 4, bgcolor: 'rgba(94,107,67,.1)', color: 'marca.oliva', display: 'grid', placeItems: 'center' }}><NoteAddOutlined /></Box>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{enviando ? 'Lendo a planilha…' : envio ? `Planilha: ${envio.nomeOriginal}` : 'Arraste a planilha aqui ou clique para escolher'}</Typography>
        <Typography variant="body2" color="text.secondary">{envio ? 'Clique para enviar outra' : 'Arquivo .xlsx exportado do sistema da loja (Relatório de Produtos), até 20 MB'}</Typography>
      </Box>
      {erro && <Alert severity="error">{erro}</Alert>}
      {envio && <Previa envio={envio} regras={regras} setRegras={setRegras} mudouRegras={mudouRegras} atualizar={atualizar} confirmar={confirmar} pendente={pendente} />}
    </Stack>
  );
}

function Previa({ envio, regras, setRegras, mudouRegras, atualizar, confirmar, pendente }: {
  envio: Envio; regras: Regras; setRegras: (f: (r: Regras) => Regras) => void; mudouRegras: boolean; atualizar: () => void; confirmar: () => void; pendente: boolean;
}) {
  const r = envio.resumo, c = r.contagens;
  return (
    <Stack spacing={3}>
      <Box sx={{ borderRadius: 6, bgcolor: 'marca.marrom-950', color: 'marca.creme', p: { xs: 3, sm: 4 }, display: 'grid', gridTemplateColumns: { lg: '1fr auto' }, gap: 3, alignItems: 'center' }}>
        <Box>
          <Typography variant="body2" sx={{ color: 'marca.areia' }}>Prévia · aba “{envio.aba}” · {n(r.linhas)} linhas</Typography>
          <Typography sx={{ mt: 0.5, fontSize: { xs: 28, sm: 34 }, fontWeight: 800 }}>{n(r.totais.pecasPlanilha)} peças · {brl(r.totais.valorPlanilha)}</Typography>
          <Typography variant="body2" sx={{ mt: 1, color: 'marca.areia' }}>Peças à venda no site: <strong style={{ color: 'inherit' }}>{n(r.totais.pecasSiteAntes)}</strong> agora → <strong>{n(r.totais.pecasSiteDepois)}</strong> depois da importação</Typography>
        </Box>
        <Button onClick={confirmar} disabled={pendente || mudouRegras} sx={{ height: 56, px: 4, borderRadius: 99, bgcolor: '#ffd86b', color: 'marca.marrom-950', fontWeight: 700, '&:hover': { bgcolor: '#ffe08a' } }}>{pendente ? 'Importando…' : 'Importar agora'}</Button>
      </Box>
      {mudouRegras && <Alert severity="warning">Você mudou marcas ou fornecedores. <Button size="small" onClick={atualizar} sx={{ textDecoration: 'underline' }}>Atualizar a prévia</Button> antes de importar.</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <Numero rotulo="Produtos novos" valor={c.produtosNovos} /><Numero rotulo="Tamanhos novos" valor={c.variantesNovas} /><Numero rotulo="Estoques que mudam" valor={c.estoqueAlterado} /><Numero rotulo="Preços que mudam" valor={c.precosAlterados} />
        <Numero rotulo="Produtos desativados" valor={c.desativados} detalhe="Saíram da planilha" /><Numero rotulo="Produtos reativados" valor={c.reativados} detalhe="Voltaram à planilha" /><Numero rotulo="Linhas ignoradas" valor={c.ignoradas} /><Numero rotulo="Avisos" valor={c.avisos} alerta={c.avisos > 0} />
      </Box>
      {(r.marcasNovas.length > 0 || r.categoriasNovas.length > 0) && (
        <Typography variant="body2" color="text.secondary">
          {r.marcasNovas.length > 0 && <>Marcas que serão criadas: <strong>{r.marcasNovas.join(', ')}</strong>. </>}
          {r.categoriasNovas.length > 0 && <>Categorias que serão criadas: <strong>{r.categoriasNovas.join(', ')}</strong>.</>}
        </Typography>
      )}
      <Card variant="outlined" sx={{ overflow: 'hidden' }}>
        <Stack direction="row" sx={{ px: 3, pt: 2.5, pb: 1.5, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5 }}>
          <Box><Typography component="h2" variant="h6">Fornecedores e marcas</Typography><Typography variant="body2" color="text.secondary">A marca vale para os produtos novos do fornecedor e fica salva para as próximas importações.</Typography></Box>
          <Button variant="outlined" size="small" onClick={atualizar} disabled={pendente || !mudouRegras}>Atualizar a prévia</Button>
        </Stack>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead><TableRow><TableCell>Fornecedor</TableCell><TableCell align="right">SKUs</TableCell><TableCell align="right">Peças</TableCell><TableCell>Marca no site</TableCell><TableCell>Importar</TableCell></TableRow></TableHead>
            <TableBody>
              {r.fornecedores.map(f => {
                const regra = regras[f.nome] ?? { marca: f.marca, ignorar: f.ignorar };
                return (
                  <TableRow key={f.nome} sx={{ opacity: regra.ignorar ? 0.5 : 1 }}>
                    <TableCell>{f.nome}{f.novo && <Box component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 700, color: 'secondary.main' }}>NOVO</Box>}</TableCell>
                    <TableCell align="right">{f.skus}</TableCell><TableCell align="right">{f.pecas}</TableCell>
                    <TableCell><TextField size="small" value={regra.marca} disabled={regra.ignorar} onChange={e => setRegras(x => ({ ...x, [f.nome]: { ...regra, marca: e.target.value } }))} slotProps={{ htmlInput: { maxLength: 40, 'aria-label': `Marca de ${f.nome}` } }} sx={{ maxWidth: 224 }} /></TableCell>
                    <TableCell><FormControlLabel control={<Checkbox size="small" checked={!regra.ignorar} onChange={e => setRegras(x => ({ ...x, [f.nome]: { ...regra, ignorar: !e.target.checked } }))} />} label={regra.ignorar ? 'Ignorado' : 'Sim'} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Card>
      <Stack spacing={1.5}>
        <Lista titulo="Produtos novos" total={c.produtosNovos} mostrados={r.produtosNovos.length} cabecalho={['Produto', 'Marca', 'Categoria', 'Gênero', 'Tamanhos', 'Peças', 'Preço']}
          linhas={r.produtosNovos.map(p => [<span key="n">{p.nome}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{p.referencia}</Typography></span>, p.marca, p.categoria, GENEROS[p.genero], p.tamanhos, p.pecas, brl(p.preco)])} />
        <Lista titulo="Estoques que mudam" total={c.estoqueAlterado} mostrados={r.estoque.length} cabecalho={['Produto', 'Tamanho', 'Agora', 'Depois']}
          linhas={r.estoque.map(e => [e.nome, e.tamanho, e.de, <Box component="strong" key="p" sx={{ color: e.para < e.de ? 'error.main' : 'success.main' }}>{e.para}</Box>])} />
        <Lista titulo="Preços que mudam" total={c.precosAlterados} mostrados={r.precos.length} cabecalho={['Produto', 'Preço cheio novo', 'Preço de venda novo']}
          linhas={r.precos.map(p => [<span key="n">{p.nome}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{p.referencia}</Typography></span>, p.precoCheio != null ? brl(p.precoCheio) : '—', p.preco != null ? brl(p.preco) : '—'])} />
        <Lista titulo="Produtos desativados" total={c.desativados} mostrados={r.desativados.length} cabecalho={['Produto', 'Referência']} linhas={r.desativados.map(p => [p.nome, p.referencia])} />
        <Lista titulo="Produtos reativados" total={c.reativados} mostrados={r.reativados.length} cabecalho={['Produto', 'Referência']} linhas={r.reativados.map(p => [p.nome, p.referencia])} />
        <Lista titulo="Linhas ignoradas" total={c.ignoradas} mostrados={r.ignoradas.length} cabecalho={['Linha', 'Código', 'Descrição', 'Motivo']} linhas={r.ignoradas.map(i => [i.linha, i.codigo, i.descricao, i.motivo])} />
        <Lista titulo="Avisos" total={c.avisos} mostrados={r.avisos.length} cabecalho={['Aviso']} linhas={r.avisos.map(a => [a])} />
      </Stack>
    </Stack>
  );
}

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: number; detalhe?: string; alerta?: boolean }) {
  return (
    <Card variant="outlined" sx={{ p: 2, borderColor: alerta ? 'secondary.main' : undefined }}>
      <Typography variant="caption" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 24, fontWeight: 800 }}>{n(valor)}</Typography>
      {detalhe && <Typography variant="caption" color="text.secondary">{detalhe}</Typography>}
    </Card>
  );
}

function Lista({ titulo, total, mostrados, cabecalho, linhas }: { titulo: string; total: number; mostrados: number; cabecalho: string[]; linhas: ReactNode[][] }) {
  if (!total) return null;
  return (
    <Card variant="outlined" component="details" sx={{ overflow: 'hidden' }}>
      <Box component="summary" sx={{ cursor: 'pointer', px: 2.5, py: 2, fontWeight: 600 }}>{titulo} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>({n(total)})</Box></Box>
      <Box sx={{ overflowX: 'auto', maxHeight: '60vh', borderTop: 1, borderColor: 'divider' }}>
        <Table size="small" stickyHeader>
          <TableHead><TableRow>{cabecalho.map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{linhas.map((l, i) => <TableRow key={i}>{l.map((c, j) => <TableCell key={j} sx={{ verticalAlign: 'top' }}>{c}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </Box>
      {total > mostrados && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2.5, py: 1.5, borderTop: 1, borderColor: 'divider' }}>Mostrando {mostrados} de {n(total)}.</Typography>}
    </Card>
  );
}
