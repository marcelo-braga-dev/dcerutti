'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import type { RegrasFornecedores } from '@/lib/planilha-estoque';
import { confirmarImportacao, previaImportacao } from '@/server/acoes/importacao';
import type { ResumoImportacao } from '@/server/importacao-estoque';

type Envio = { id: string; nomeOriginal: string; aba: string | null; resumo: ResumoImportacao };

const GENEROS: Record<string, string> = { feminino: 'Feminino', masculino: 'Masculino', unissex: 'Unissex' };

/**
 * Importação da planilha de estoque: 1) envia o .xlsx e vê a prévia; 2) ajusta a marca de cada fornecedor (ou ignora
 * o fornecedor) e atualiza a prévia; 3) confirma. A prévia é refeita na confirmação com o banco de agora.
 */
export function ImportadorEstoque() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [regras, setRegras] = useState<RegrasFornecedores>({});
  const [regrasDaPrevia, setRegrasDaPrevia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<ResumoImportacao | null>(null);
  const [pendente, iniciar] = useTransition();

  const aplicarResumo = (r: ResumoImportacao) => {
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
      const resp = await fetch('/api/importacao-estoque', { method: 'POST', body: fd });
      const j = await resp.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!resp.ok) return setErro(j.erro ?? 'Não foi possível ler a planilha.');
      setEnvio(j);
      aplicarResumo(j.resumo);
    } catch {
      setErro('Não foi possível enviar a planilha. Confira a conexão e tente de novo.');
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const mudouRegras = envio && JSON.stringify(regras) !== regrasDaPrevia;
  const atualizarPrevia = () => envio && iniciar(async () => {
    setErro(null);
    const r = await previaImportacao(envio.id, regras);
    if (!r.ok) return setErro(r.erro);
    setEnvio({ ...envio, resumo: r.resumo });
    aplicarResumo(r.resumo);
  });
  const confirmar = () => envio && iniciar(async () => {
    if (!confirm(`Importar a planilha "${envio.nomeOriginal}"? O estoque, os preços e os produtos do site vão seguir a planilha.`)) return;
    setErro(null);
    const r = await confirmarImportacao(envio.id, envio.nomeOriginal, regras);
    if (!r.ok) return setErro(r.erro);
    setFeito(r.resumo);
    setEnvio(null);
    router.refresh();
  });

  if (feito) {
    const c = feito.contagens;
    return (
      <div className="rounded-3xl bg-card border border-oliva/40 p-6 sm:p-8 grid gap-5">
        <div className="flex items-center gap-3">
          <span className="size-12 grid place-items-center rounded-full bg-oliva text-creme text-xl" aria-hidden="true">✓</span>
          <div>
            <h2 className="titulo text-2xl">Estoque importado</h2>
            <p className="text-sm text-suave">O site agora tem {feito.totais.pecasSiteDepois.toLocaleString('pt-BR')} peças à venda (antes: {feito.totais.pecasSiteAntes.toLocaleString('pt-BR')}).</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Produtos novos" valor={c.produtosNovos} />
          <Numero rotulo="Tamanhos novos" valor={c.variantesNovas} />
          <Numero rotulo="Estoques corrigidos" valor={c.estoqueAlterado} />
          <Numero rotulo="Preços atualizados" valor={c.precosAlterados} />
        </div>
        {c.produtosNovos > 0 && <Alerta tipo="aviso">Os produtos novos entraram sem foto. Em Produtos → filtro <strong>Sem foto</strong>, abra cada um para pôr as fotos e conferir nome, categoria e gênero.</Alerta>}
        <div className="flex flex-wrap gap-3">
          <Link href="/painel/produtos?filtro=sem-foto" className={botao('primario')}>Produtos sem foto</Link>
          <button type="button" onClick={() => setFeito(null)} className={botao('secundario')}>Importar outra planilha</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Envio. */}
      <label
        onDragOver={e => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files?.[0]); }}
        className={`rounded-3xl border-2 border-dashed p-8 sm:p-10 grid justify-items-center gap-3 text-center cursor-pointer transition-colors ${arrastando ? 'border-marrom-950 bg-bege' : 'border-borda-forte bg-card hover:border-marrom-950'}`}>
        <input ref={entrada} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={e => enviar(e.target.files?.[0])} disabled={enviando || pendente} />
        <span className="size-14 grid place-items-center rounded-2xl bg-oliva/10 text-oliva">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M14 3.5v5h5M9 13l2 2 4-4" /></svg>
        </span>
        <span className="text-lg font-semibold text-marrom-950">{enviando ? 'Lendo a planilha…' : envio ? `Planilha: ${envio.nomeOriginal}` : 'Arraste a planilha aqui ou clique para escolher'}</span>
        <span className="text-sm text-suave">{envio ? 'Clique para enviar outra' : 'Arquivo .xlsx exportado do sistema da loja (Relatório de Produtos), até 20 MB'}</span>
      </label>

      {erro && <Alerta>{erro}</Alerta>}

      {envio && <Previa envio={envio} regras={regras} setRegras={setRegras} mudouRegras={!!mudouRegras} atualizar={atualizarPrevia} confirmar={confirmar} pendente={pendente} />}
    </div>
  );
}

function Previa({ envio, regras, setRegras, mudouRegras, atualizar, confirmar, pendente }: {
  envio: Envio; regras: RegrasFornecedores; setRegras: (f: (r: RegrasFornecedores) => RegrasFornecedores) => void; mudouRegras: boolean;
  atualizar: () => void; confirmar: () => void; pendente: boolean;
}) {
  const r = envio.resumo, c = r.contagens;
  return (
    <div className="grid gap-6">
      <div className="rounded-3xl bg-marrom-950 text-creme p-6 sm:p-8 grid lg:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="text-sm text-areia">Prévia · aba “{envio.aba}” · {r.linhas.toLocaleString('pt-BR')} linhas</div>
          <div className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight">{r.totais.pecasPlanilha.toLocaleString('pt-BR')} peças · {brl(r.totais.valorPlanilha)}</div>
          <div className="mt-2 text-sm text-areia">Peças à venda no site: <strong className="text-creme">{r.totais.pecasSiteAntes.toLocaleString('pt-BR')}</strong> agora → <strong className="text-creme">{r.totais.pecasSiteDepois.toLocaleString('pt-BR')}</strong> depois da importação</div>
        </div>
        <button type="button" onClick={confirmar} disabled={pendente || mudouRegras}
          className="h-14 px-8 rounded-full bg-[#ffd86b] text-marrom-950 font-bold hover:brightness-105 disabled:opacity-50">
          {pendente ? 'Importando…' : 'Importar agora'}
        </button>
      </div>
      {mudouRegras && <Alerta tipo="aviso">Você mudou marcas ou fornecedores. <button type="button" onClick={atualizar} className="underline font-semibold">Atualizar a prévia</button> antes de importar.</Alerta>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Produtos novos" valor={c.produtosNovos} />
        <Numero rotulo="Tamanhos novos" valor={c.variantesNovas} />
        <Numero rotulo="Estoques que mudam" valor={c.estoqueAlterado} />
        <Numero rotulo="Preços que mudam" valor={c.precosAlterados} />
        <Numero rotulo="Produtos desativados" valor={c.desativados} detalhe="Saíram da planilha" />
        <Numero rotulo="Produtos reativados" valor={c.reativados} detalhe="Voltaram à planilha" />
        <Numero rotulo="Linhas ignoradas" valor={c.ignoradas} />
        <Numero rotulo="Avisos" valor={c.avisos} alerta={c.avisos > 0} />
      </div>
      {(r.marcasNovas.length > 0 || r.categoriasNovas.length > 0) && (
        <p className="text-sm text-suave">
          {r.marcasNovas.length > 0 && <>Marcas que serão criadas: <strong className="text-marrom-950">{r.marcasNovas.join(', ')}</strong>. </>}
          {r.categoriasNovas.length > 0 && <>Categorias que serão criadas: <strong className="text-marrom-950">{r.categoriasNovas.join(', ')}</strong>.</>}
        </p>
      )}

      <section className="rounded-3xl bg-card border border-borda overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="titulo text-xl">Fornecedores e marcas</h2>
            <p className="text-sm text-suave">A marca vale para os produtos novos do fornecedor e fica salva para as próximas importações.</p>
          </div>
          <button type="button" onClick={atualizar} disabled={pendente || !mudouRegras} className={botao('secundario', 'p')}>Atualizar a prévia</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left rotulo !text-[0.6rem] text-suave border-y border-borda bg-creme/60">
              <tr><th className="px-6 py-2">Fornecedor</th><th className="p-2 text-right">SKUs</th><th className="p-2 text-right">Peças</th><th className="p-2">Marca no site</th><th className="p-2 pr-6">Importar</th></tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {r.fornecedores.map(f => {
                const regra = regras[f.nome] ?? { marca: f.marca, ignorar: f.ignorar };
                return (
                  <tr key={f.nome} className={regra.ignorar ? 'opacity-50' : ''}>
                    <td className="px-6 py-2"><span className="text-marrom-950">{f.nome}</span>{f.novo && <span className="ml-2 text-[0.65rem] font-bold text-caramelo">NOVO</span>}</td>
                    <td className="p-2 text-right tabular-nums">{f.skus}</td>
                    <td className="p-2 text-right tabular-nums">{f.pecas}</td>
                    <td className="p-2"><input value={regra.marca} disabled={regra.ignorar} aria-label={`Marca de ${f.nome}`} maxLength={40}
                      onChange={e => setRegras(x => ({ ...x, [f.nome]: { ...regra, marca: e.target.value } }))} className="h-9 w-full max-w-56 px-3 border border-borda-forte bg-card outline-none focus:border-marrom-950" /></td>
                    <td className="p-2 pr-6">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={!regra.ignorar} onChange={e => setRegras(x => ({ ...x, [f.nome]: { ...regra, ignorar: !e.target.checked } }))} className="size-4 accent-marrom-950" />
                        {regra.ignorar ? 'Ignorado' : 'Sim'}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3">
        <Lista titulo="Produtos novos" n={c.produtosNovos} mostrados={r.produtosNovos.length} cabecalho={['Produto', 'Marca', 'Categoria', 'Gênero', 'Tamanhos', 'Peças', 'Preço']}
          linhas={r.produtosNovos.map(p => [<span key="n"><span className="text-marrom-950">{p.nome}</span><span className="block text-xs text-suave">{p.referencia}</span></span>, p.marca, p.categoria, GENEROS[p.genero], p.tamanhos, p.pecas, brl(p.preco)])} />
        <Lista titulo="Estoques que mudam" n={c.estoqueAlterado} mostrados={r.estoque.length} cabecalho={['Produto', 'Tamanho', 'Agora', 'Depois']}
          linhas={r.estoque.map(e => [e.nome, e.tamanho, e.de, <strong key="p" className={e.para < e.de ? 'text-vermelho' : 'text-oliva'}>{e.para}</strong>])} />
        <Lista titulo="Preços que mudam" n={c.precosAlterados} mostrados={r.precos.length} cabecalho={['Produto', 'Preço cheio novo', 'Preço de venda novo']}
          linhas={r.precos.map(p => [<span key="n">{p.nome}<span className="block text-xs text-suave">{p.referencia}</span></span>, p.precoCheio != null ? brl(p.precoCheio) : '—', p.preco != null ? brl(p.preco) : '—'])} />
        <Lista titulo="Produtos desativados" n={c.desativados} mostrados={r.desativados.length} cabecalho={['Produto', 'Referência']} linhas={r.desativados.map(p => [p.nome, p.referencia])} />
        <Lista titulo="Produtos reativados" n={c.reativados} mostrados={r.reativados.length} cabecalho={['Produto', 'Referência']} linhas={r.reativados.map(p => [p.nome, p.referencia])} />
        <Lista titulo="Linhas ignoradas" n={c.ignoradas} mostrados={r.ignoradas.length} cabecalho={['Linha', 'Código', 'Descrição', 'Motivo']} linhas={r.ignoradas.map(i => [i.linha, i.codigo, i.descricao, i.motivo])} />
        <Lista titulo="Avisos" n={c.avisos} mostrados={r.avisos.length} cabecalho={['Aviso']} linhas={r.avisos.map(a => [a])} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: number; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${alerta ? 'border-caramelo/50' : 'border-borda'}`}>
      <div className="text-xs text-suave">{rotulo}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-marrom-950">{valor.toLocaleString('pt-BR')}</div>
      {detalhe && <div className="text-xs text-suave">{detalhe}</div>}
    </div>
  );
}

function Lista({ titulo, n, mostrados, cabecalho, linhas }: { titulo: string; n: number; mostrados: number; cabecalho: string[]; linhas: ReactNode[][] }) {
  if (!n) return null;
  return (
    <details className="group rounded-2xl bg-card border border-borda overflow-hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 h-14">
        <span className="font-semibold text-marrom-950">{titulo} <span className="text-suave font-normal">({n.toLocaleString('pt-BR')})</span></span>
        <span className="text-lg leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <div className="overflow-x-auto max-h-[60vh] border-t border-borda">
        <table className="w-full text-sm">
          <thead className="text-left rotulo !text-[0.6rem] text-suave bg-creme/60 sticky top-0"><tr>{cabecalho.map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-borda">{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className="px-4 py-2 align-top">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {n > mostrados && <p className="px-5 py-3 text-xs text-suave border-t border-borda">Mostrando {mostrados} de {n.toLocaleString('pt-BR')}.</p>}
    </details>
  );
}
