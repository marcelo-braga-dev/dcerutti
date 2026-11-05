import 'server-only';
import { Prisma, type Estacao, type Genero } from '@prisma/client';
import { db } from './db';
import { posicaoTamanho } from '@/lib/catalogo';
import {
  agruparLinhas, categoriaDaDescricao, corDaLinha, eanDaLinha, estacaoDaDescricao, estoqueDaLinha, generoDaDescricao, marcaDoProduto,
  nomeDoProduto, precoDoGrupo, referenciaDoProduto, regraPadrao, tamanhoDaPlanilha, type LinhaPlanilha, type RegrasFornecedores,
} from '@/lib/planilha-estoque';

/**
 * Importação da planilha de estoque (docs/25-importacao-de-estoque.md). A planilha é a verdade:
 *  - estoque de cada tamanho = Estoq. − Cond. − Res. EC (o reservado pelos pedidos do site continua à parte);
 *  - preço cheio = Preço Venda; promoção do site (preço menor que o cheio) continua enquanto for menor que o novo cheio;
 *  - peça nova vira produto ou tamanho novo; nome, categoria, gênero e estação só são deduzidos na criação
 *    (depois disso, o que o gestor editar no painel fica);
 *  - tamanho que não está na planilha fica com estoque 0; produto sem nenhuma linha na planilha é desativado e volta
 *    a ficar ativo quando reaparecer.
 * `planejar` só lê o banco e devolve o que mudaria; `aplicar` replaneja (o banco pode ter mudado) e grava tudo numa
 * transação, com um movimento de estoque para cada diferença.
 */

type ProdutoBanco = Prisma.ProdutoGetPayload<{ include: { marca: true; variantes: true } }>;
type VarianteBanco = ProdutoBanco['variantes'][number];

type VarianteNova = { tamanho: string; ordem: number; estoque: number; codigoInterno: string; ean: string | null };
type ProdutoNovo = {
  referencia: string; nome: string; marca: string; categoria: string; genero: Genero; estacao: Estacao | null; cor: string | null;
  preco: number; fornecedor: string; variantes: VarianteNova[];
};
type MudancaProduto = {
  id: number; referencia: string; nome: string;
  dados: { preco?: number; precoCheio?: number; ativo?: boolean; fornecedor?: string; marca?: string };
};
type MudancaVariante = { id: number; produtoId: number; nome: string; tamanho: string; de: number; para: number; codigoInterno?: string; ean?: string | null; reservado: number };

export type Plano = {
  linhas: number;
  ignoradas: { linha: number; codigo: string; descricao: string; motivo: string }[];
  fornecedores: { nome: string; marca: string; ignorar: boolean; novo: boolean; skus: number; pecas: number }[];
  produtosNovos: ProdutoNovo[];
  produtosMudados: MudancaProduto[];
  variantesNovas: (VarianteNova & { produtoId: number; nome: string })[];
  variantesMudadas: MudancaVariante[];
  marcasNovas: string[];
  categoriasNovas: string[];
  avisos: string[];
  totais: { pecasPlanilha: number; valorPlanilha: number; pecasSiteAntes: number; pecasSiteDepois: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const chave = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = (t: string) => chave(t).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Regras de cada fornecedor da planilha: as salvas, as enviadas agora (página) e, para os novos, a sugestão. */
export function regrasDosFornecedores(linhas: LinhaPlanilha[], salvas: RegrasFornecedores, agora: RegrasFornecedores = {}): RegrasFornecedores {
  const r: RegrasFornecedores = {};
  for (const f of new Set(linhas.map(l => l.fornecedor))) r[f] = agora[f] ?? salvas[f] ?? regraPadrao(f);
  return r;
}

export async function planejar(linhas: LinhaPlanilha[], regras: RegrasFornecedores, salvas: RegrasFornecedores = {}): Promise<Plano> {
  const [produtos, marcas, categorias] = await Promise.all([
    db.produto.findMany({ include: { marca: true, variantes: true } }),
    db.marca.findMany(),
    db.categoria.findMany(),
  ]);
  const avisos: string[] = [];
  const ignoradas: Plano['ignoradas'] = [];
  const porCodigo = new Map<string, { v: VarianteBanco; p: ProdutoBanco }>();
  for (const p of produtos) for (const v of p.variantes) if (v.codigoInterno) porCodigo.set(v.codigoInterno, { v, p });
  const produtoPorId = new Map(produtos.map(p => [p.id, p]));
  const codigosUsados = new Map<string, number>([...porCodigo].map(([c, x]) => [c, x.v.id]));

  // Linhas válidas: fornecedor não ignorado, com preço, sem código repetido.
  const vistas = new Set<string>();
  const validas: LinhaPlanilha[] = [];
  for (const l of linhas) {
    const motivo = regras[l.fornecedor]?.ignorar ? 'Fornecedor ignorado' : !(l.preco > 0) ? 'Sem preço de venda' : vistas.has(l.codigo) ? 'Código repetido na planilha' : null;
    if (motivo) { ignoradas.push({ linha: l.linha, codigo: l.codigo, descricao: l.descricao, motivo }); continue; }
    vistas.add(l.codigo);
    validas.push(l);
  }

  const produtosNovos: ProdutoNovo[] = [];
  const produtosMudados = new Map<number, MudancaProduto>();
  const variantesNovas: Plano['variantesNovas'] = [];
  const variantesMudadas = new Map<number, MudancaVariante>();
  const tocados = new Set<number>(); // produtos do site presentes na planilha
  const variantesTocadas = new Set<number>();
  const referencias = new Set(produtos.map(p => p.referencia));
  const estoquePorProduto = new Map<number, number>();

  const mudarProduto = (p: ProdutoBanco, dados: MudancaProduto['dados']) => {
    const m = produtosMudados.get(p.id) ?? { id: p.id, referencia: p.referencia, nome: p.nome, dados: {} };
    Object.assign(m.dados, dados);
    produtosMudados.set(p.id, m);
  };

  /** Junta as linhas por tamanho: soma o estoque e escolhe o código (o que o site já conhece, se houver). */
  const porTamanho = (ls: LinhaPlanilha[], p?: ProdutoBanco) => {
    const m = new Map<string, LinhaPlanilha[]>();
    for (const l of ls) { const t = tamanhoDaPlanilha(l.tamanho); m.set(t, [...(m.get(t) ?? []), l]); }
    return [...m].map(([tamanho, grupo]) => {
      const conhecida = grupo.find(l => p?.variantes.some(v => v.codigoInterno === l.codigo)) ?? grupo[0];
      if (grupo.length > 1) avisos.push(`${grupo[0].descricao} (${tamanho}): ${grupo.length} códigos para o mesmo tamanho (${grupo.map(l => l.codigo).join(', ')}); estoque somado no código ${conhecida.codigo}.`);
      return { tamanho, linha: conhecida, estoque: grupo.reduce((a, l) => a + estoqueDaLinha(l), 0), ean: grupo.map(l => eanDaLinha(l.codigoBarras)).find(Boolean) ?? null };
    });
  };

  const grupos = agruparLinhas(validas);
  // Mesma referência em várias cores: a referência do produto novo leva a cor.
  const coresPorReferencia = new Map<string, Set<string>>();
  for (const g of grupos) { const k = `${g.fornecedor}|${g.referenciaBase}`; coresPorReferencia.set(k, (coresPorReferencia.get(k) ?? new Set()).add(g.chave)); }

  for (const g of grupos) {
    // Destino de cada linha: o produto da variante com o mesmo código; as outras vão para o produto mais comum do grupo.
    const destinos = g.linhas.map(l => porCodigo.get(l.codigo)?.p.id ?? null);
    const contagem = new Map<number, number>();
    for (const d of destinos) if (d != null) contagem.set(d, (contagem.get(d) ?? 0) + 1);
    const principal = [...contagem].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const porDestino = new Map<number | null, LinhaPlanilha[]>();
    g.linhas.forEach((l, i) => { const d = destinos[i] ?? principal; porDestino.set(d, [...(porDestino.get(d) ?? []), l]); });

    for (const [destino, ls] of porDestino) {
      if (destino == null) {
        // Produto novo.
        const l = ls[0];
        const categoria = categoriaDaDescricao(l.descricao);
        const genero = generoDaDescricao(l.descricao, categoria);
        const marca = marcaDoProduto(regras[l.fornecedor].marca, categoria);
        const variantes = porTamanho(ls).map(t => ({ tamanho: t.tamanho, ordem: posicaoTamanho(t.tamanho), estoque: t.estoque, codigoInterno: t.linha.codigo, ean: t.ean }));
        const precisaCor = (coresPorReferencia.get(`${g.fornecedor}|${g.referenciaBase}`)?.size ?? 0) > 1;
        produtosNovos.push({
          referencia: referenciaDoProduto(g, referencias, precisaCor || !g.referenciaBase), nome: nomeDoProduto(l), marca, categoria, genero,
          estacao: estacaoDaDescricao(l.descricao, categoria), cor: corDaLinha(l), preco: precoDoGrupo(ls), fornecedor: l.fornecedor, variantes,
        });
        for (const v of variantes) codigosUsados.set(v.codigoInterno, -1);
        continue;
      }
      const p = produtoPorId.get(destino)!;
      tocados.add(p.id);
      // Preço: cheio = planilha; a promoção do site continua se ainda for menor que o cheio novo.
      const cheio = precoDoGrupo(ls);
      const emPromocao = Number(p.preco) < Number(p.precoCheio);
      const preco = emPromocao && Number(p.preco) < cheio ? Number(p.preco) : cheio;
      const dados: MudancaProduto['dados'] = {};
      if (r2(Number(p.precoCheio)) !== r2(cheio)) dados.precoCheio = cheio;
      if (r2(Number(p.preco)) !== r2(preco)) dados.preco = preco;
      if (p.fornecedor !== ls[0].fornecedor) dados.fornecedor = ls[0].fornecedor;
      // Marca: a do fornecedor (mudou na regra), mantendo as linhas da marca (Hering Sports, Hering Intimates).
      const marcaRegra = regras[ls[0].fornecedor].marca;
      const marcaAntes = salvas[ls[0].fornecedor]?.marca;
      if (p.fornecedor && marcaAntes && marcaAntes !== marcaRegra && !chave(p.marca.nome).startsWith(chave(marcaRegra))) dados.marca = marcaDoProduto(marcaRegra, '');
      if (Object.keys(dados).length) mudarProduto(p, dados);

      let total = estoquePorProduto.get(p.id) ?? 0;
      for (const t of porTamanho(ls, p)) {
        const v = p.variantes.find(x => x.codigoInterno === t.linha.codigo) ?? p.variantes.find(x => x.tamanho === t.tamanho && !variantesTocadas.has(x.id));
        total += t.estoque;
        if (!v) {
          if (codigosUsados.has(t.linha.codigo)) { avisos.push(`Código ${t.linha.codigo} já está em outra peça do site; linha ${t.linha.linha} ignorada.`); continue; }
          variantesNovas.push({ produtoId: p.id, nome: p.nome, tamanho: t.tamanho, ordem: posicaoTamanho(t.tamanho), estoque: t.estoque, codigoInterno: t.linha.codigo, ean: t.ean });
          codigosUsados.set(t.linha.codigo, -1);
          continue;
        }
        variantesTocadas.add(v.id);
        const m: MudancaVariante = { id: v.id, produtoId: p.id, nome: p.nome, tamanho: v.tamanho, de: v.estoque, para: t.estoque, reservado: v.reservado };
        if (v.codigoInterno !== t.linha.codigo) {
          const dono = codigosUsados.get(t.linha.codigo);
          if (dono == null || dono === v.id) { m.codigoInterno = t.linha.codigo; if (v.codigoInterno) codigosUsados.delete(v.codigoInterno); codigosUsados.set(t.linha.codigo, v.id); }
        }
        if (t.ean && t.ean !== v.ean) m.ean = t.ean;
        if (m.de !== m.para || m.codigoInterno || m.ean !== undefined) variantesMudadas.set(v.id, m);
        if (t.estoque < v.reservado) avisos.push(`${p.nome} (${v.tamanho}): ${v.reservado} reservada(s) em pedidos do site e só ${t.estoque} na planilha.`);
      }
      estoquePorProduto.set(p.id, total);
    }
  }

  // Tamanhos que sumiram da planilha: estoque 0. Produto sem nenhuma linha: desativado; com estoque: ativo.
  for (const p of produtos) {
    for (const v of p.variantes) {
      if (variantesTocadas.has(v.id) || v.estoque === 0) continue;
      variantesMudadas.set(v.id, { id: v.id, produtoId: p.id, nome: p.nome, tamanho: v.tamanho, de: v.estoque, para: 0, reservado: v.reservado });
    }
    const presente = tocados.has(p.id);
    const comEstoque = (estoquePorProduto.get(p.id) ?? 0) > 0 || variantesNovas.some(v => v.produtoId === p.id && v.estoque > 0);
    const ativo = presente && comEstoque;
    if (p.ativo !== ativo) mudarProduto(p, { ativo });
  }

  const nomesMarcas = new Set(marcas.map(m => chave(m.nome)));
  const nomesCategorias = new Set(categorias.map(c => chave(c.nome)));
  const marcasNovas = [...new Set([...produtosNovos.map(p => p.marca), ...[...produtosMudados.values()].flatMap(m => (m.dados.marca ? [m.dados.marca] : []))])].filter(m => !nomesMarcas.has(chave(m)));
  const categoriasNovas = [...new Set(produtosNovos.map(p => p.categoria))].filter(c => !nomesCategorias.has(chave(c)));

  const fornecedores = [...new Set(linhas.map(l => l.fornecedor))].map(nome => {
    const ls = linhas.filter(l => l.fornecedor === nome);
    return { nome, ...regras[nome], novo: !(nome in salvas), skus: ls.length, pecas: ls.reduce((a, l) => a + l.estoque, 0) };
  }).sort((a, b) => b.pecas - a.pecas);

  const pecasSiteAntes = produtos.filter(p => p.ativo).reduce((a, p) => a + p.variantes.reduce((b, v) => b + v.estoque, 0), 0);
  const mudadas = [...variantesMudadas.values()];
  const desativados = new Set([...produtosMudados.values()].filter(m => m.dados.ativo === false).map(m => m.id));
  const ativados = new Set([...produtosMudados.values()].filter(m => m.dados.ativo === true).map(m => m.id));
  let pecasSiteDepois = 0;
  for (const p of produtos) {
    const ativo = ativados.has(p.id) || (p.ativo && !desativados.has(p.id));
    if (!ativo) continue;
    for (const v of p.variantes) pecasSiteDepois += variantesMudadas.get(v.id)?.para ?? v.estoque;
  }
  pecasSiteDepois += variantesNovas.reduce((a, v) => a + v.estoque, 0) + produtosNovos.reduce((a, p) => a + p.variantes.reduce((b, v) => b + v.estoque, 0), 0);

  return {
    linhas: linhas.length, ignoradas, fornecedores, produtosNovos, produtosMudados: [...produtosMudados.values()], variantesNovas,
    variantesMudadas: mudadas, marcasNovas, categoriasNovas, avisos,
    totais: { pecasPlanilha: linhas.reduce((a, l) => a + l.estoque, 0), valorPlanilha: r2(linhas.reduce((a, l) => a + l.estoque * l.preco, 0)), pecasSiteAntes, pecasSiteDepois },
  };
}

/** Resumo do plano para a tela e para o histórico (listas cortadas). */
export function resumir(p: Plano, limite = 300) {
  const desativados = p.produtosMudados.filter(m => m.dados.ativo === false);
  const ativados = p.produtosMudados.filter(m => m.dados.ativo === true);
  const precos = p.produtosMudados.filter(m => m.dados.precoCheio !== undefined || m.dados.preco !== undefined);
  const estoque = p.variantesMudadas.filter(v => v.de !== v.para);
  return {
    linhas: p.linhas, totais: p.totais, fornecedores: p.fornecedores, marcasNovas: p.marcasNovas, categoriasNovas: p.categoriasNovas,
    contagens: {
      produtosNovos: p.produtosNovos.length, variantesNovas: p.variantesNovas.length + p.produtosNovos.reduce((a, x) => a + x.variantes.length, 0),
      estoqueAlterado: estoque.length, precosAlterados: precos.length, desativados: desativados.length, reativados: ativados.length,
      ignoradas: p.ignoradas.length, avisos: p.avisos.length,
    },
    produtosNovos: p.produtosNovos.slice(0, limite).map(x => ({ referencia: x.referencia, nome: x.nome, marca: x.marca, categoria: x.categoria, genero: x.genero, preco: x.preco, tamanhos: x.variantes.map(v => v.tamanho).join(', '), pecas: x.variantes.reduce((a, v) => a + v.estoque, 0) })),
    estoque: estoque.slice(0, limite).map(v => ({ nome: v.nome, tamanho: v.tamanho, de: v.de, para: v.para })),
    precos: precos.slice(0, limite).map(m => ({ referencia: m.referencia, nome: m.nome, preco: m.dados.preco, precoCheio: m.dados.precoCheio })),
    desativados: desativados.slice(0, limite).map(m => ({ referencia: m.referencia, nome: m.nome })),
    reativados: ativados.slice(0, limite).map(m => ({ referencia: m.referencia, nome: m.nome })),
    ignoradas: p.ignoradas.slice(0, limite),
    avisos: p.avisos.slice(0, limite),
  };
}
export type ResumoImportacao = ReturnType<typeof resumir>;

/** Grava o plano numa transação: marcas e categorias novas, produtos, tamanhos, preços, estoque (com movimentos). */
export async function aplicar(p: Plano, ctx: { usuarioId: string | null; arquivo: string; nomeOriginal: string }) {
  const obs = `Importação da planilha ${ctx.nomeOriginal}`;
  await db.$transaction(async tx => {
    const marcas = new Map((await tx.marca.findMany()).map(m => [chave(m.nome), m.id]));
    for (const nome of p.marcasNovas) {
      let s = slug(nome) || 'marca', n = 2;
      while (await tx.marca.findUnique({ where: { slug: s } })) s = `${slug(nome)}-${n++}`;
      marcas.set(chave(nome), (await tx.marca.create({ data: { nome, slug: s } })).id);
    }
    const categorias = new Map((await tx.categoria.findMany()).map(c => [chave(c.nome), c.id]));
    for (const nome of p.categoriasNovas) {
      let s = slug(nome) || 'categoria', n = 2;
      while (await tx.categoria.findUnique({ where: { slug: s } })) s = `${slug(nome)}-${n++}`;
      categorias.set(chave(nome), (await tx.categoria.create({ data: { nome, slug: s } })).id);
    }

    const movimentos: Prisma.MovimentoEstoqueCreateManyInput[] = [];
    // Primeiro libera os códigos que vão mudar de dono (o código é único).
    for (const v of p.variantesMudadas) if (v.codigoInterno) await tx.variante.updateMany({ where: { codigoInterno: v.codigoInterno, NOT: { id: v.id } }, data: { codigoInterno: null } });

    for (const m of p.produtosMudados) {
      const { marca, ...resto } = m.dados;
      await tx.produto.update({ where: { id: m.id }, data: { ...resto, ...(marca ? { marcaId: marcas.get(chave(marca))! } : {}) } });
    }
    for (const v of p.variantesMudadas) {
      await tx.variante.update({ where: { id: v.id }, data: { estoque: v.para, ...(v.codigoInterno ? { codigoInterno: v.codigoInterno } : {}), ...(v.ean !== undefined ? { ean: v.ean } : {}) } });
      if (v.para !== v.de) movimentos.push({ varianteId: v.id, delta: v.para - v.de, motivo: 'ajuste', observacao: obs, usuarioId: ctx.usuarioId });
    }
    for (const v of p.variantesNovas) {
      const criada = await tx.variante.create({ data: { produtoId: v.produtoId, tamanho: v.tamanho, ordem: v.ordem, estoque: v.estoque, codigoInterno: v.codigoInterno, ean: v.ean } });
      if (v.estoque) movimentos.push({ varianteId: criada.id, delta: v.estoque, motivo: 'entrada', observacao: obs, usuarioId: ctx.usuarioId });
    }
    for (const n of p.produtosNovos) {
      const criado = await tx.produto.create({
        data: {
          referencia: n.referencia, nome: n.nome, marcaId: marcas.get(chave(n.marca))!, categoriaId: categorias.get(chave(n.categoria))!, genero: n.genero,
          estacao: n.estacao, cor: n.cor, preco: n.preco, precoCheio: n.preco, fornecedor: n.fornecedor, ativo: n.variantes.some(v => v.estoque > 0),
          variantes: { create: n.variantes },
        },
        include: { variantes: { select: { id: true, estoque: true } } },
      });
      for (const v of criado.variantes) if (v.estoque) movimentos.push({ varianteId: v.id, delta: v.estoque, motivo: 'entrada', observacao: obs, usuarioId: ctx.usuarioId });
    }
    for (let i = 0; i < movimentos.length; i += 500) await tx.movimentoEstoque.createMany({ data: movimentos.slice(i, i + 500) });
    await tx.importacaoEstoque.create({ data: { arquivo: ctx.arquivo, nomeOriginal: ctx.nomeOriginal, usuarioId: ctx.usuarioId, resumo: resumir(p, 100) as unknown as Prisma.InputJsonValue } });
  }, { timeout: 10 * 60_000, maxWait: 30_000 });
}

/** Últimas importações, para o histórico da página (só o gestor chega aqui). */
export const historicoImportacoes = (n = 10) =>
  db.importacaoEstoque.findMany({ orderBy: { criadoEm: 'desc' }, take: n, include: { usuario: { select: { name: true } } } });
