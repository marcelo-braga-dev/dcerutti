/**
 * Atualiza o catálogo pelas planilhas exportadas (produtos-completo.csv + produtos-por-tamanho.csv).
 *   npm run db:importar-planilha                         # só mostra o que faria
 *   npm run db:importar-planilha -- --confirmar          # grava
 *   npm run db:importar-planilha -- --pasta=outra/pasta  # padrão: repositorio/
 * A planilha manda, com estas exceções:
 *   - campo vazio na planilha não apaga o que o banco já tem (estação, cor, descrição...);
 *   - fotos só são trocadas quando a planilha tem mais fotos que o banco;
 *   - estoque divergente vira um movimento de "ajuste" (produto novo: "entrada" com o saldo inicial);
 *   - o estoque da planilha é o de antes dos pedidos do site: o que os pedidos baixaram continua baixado.
 * Produto que está no banco e não está na planilha fica como está.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient, type Estacao, type Genero } from '@prisma/client';
import { salvarFotoProduto } from '../src/server/arquivos';
import { posicaoTamanho } from '../src/lib/catalogo';
import { baixarFoto } from './fotos-cache';

const db = new PrismaClient();
const confirmar = process.argv.includes('--confirmar');
const PASTA = path.resolve(process.argv.find(a => a.startsWith('--pasta='))?.slice(8) ?? path.join(__dirname, '..', 'repositorio'));

const slug = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Mesmas grafias corrigidas do importar-prototipo.
const CATEGORIAS: Record<string, string> = {
  Sueter: 'Suéteres', Lenco: 'Lenços', Blazer: 'Blazers', Colete: 'Coletes', Ceroula: 'Ceroulas', Gorro: 'Gorros',
  Necessaire: 'Necessaires', Bata: 'Batas', Mala: 'Malas', 'Roupa íntima': 'Roupas íntimas',
};

// Mesma regra do importar-prototipo, usada só quando a planilha não traz a estação.
function estacaoDe(nome: string, categoria: string): Estacao | null {
  const t = `${nome} ${categoria}`.toLowerCase();
  if (/manga longa|moletom|tric[oô]|blus[aã]o|jaqueta|casaco|cardigan|su[eé]ter|gola alta|t[eé]rmic|colete|gorro|ceroula|flanel|pijama longo|cal[cç]a jeans|cal[cç]a moletom/.test(t)) return 'inverno';
  if (/manga curta|regata|short|bermuda|sunga|biqu[ií]ni|linho|top |cropped|vestido|saia|bata|camiseta/.test(t)) return 'verao';
  return null;
}

/** CSV com ";" e aspas, como o Excel exporta. */
function lerCsv(arquivo: string): Record<string, string>[] {
  const texto = readFileSync(path.join(PASTA, arquivo), 'utf8').replace(/^﻿/, '');
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); campo = ''; linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas.filter(l => l.some(Boolean));
  return resto.map(l => Object.fromEntries(cab.map((k, i) => [k, (l[i] ?? '').trim()])));
}

const valor = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const lista = (s: string) => s.split('|').map(x => x.trim()).filter(Boolean);
const iguais = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const produtos = lerCsv('produtos-completo.csv');
  const tamanhos = new Map<string, Record<string, string>[]>();
  for (const t of lerCsv('produtos-por-tamanho.csv')) tamanhos.set(t.referencia, [...(tamanhos.get(t.referencia) ?? []), t]);
  console.log(`Planilha: ${produtos.length} produtos, ${[...tamanhos.values()].flat().length} tamanhos (${PASTA}).`);

  const marcas = new Map((await db.marca.findMany()).map(m => [m.slug, m.id]));
  const categorias = new Map((await db.categoria.findMany()).map(c => [c.slug, c.id]));
  const novasMarcas = [...new Set(produtos.map(p => p.marca))].filter(n => !marcas.has(slug(n)));
  const novasCategorias = [...new Set(produtos.map(p => CATEGORIAS[p.categoria] ?? p.categoria))].filter(n => !categorias.has(slug(n)));
  if (novasMarcas.length) console.log(`Marcas novas: ${novasMarcas.join(', ')}`);
  if (novasCategorias.length) console.log(`Categorias novas: ${novasCategorias.join(', ')}`);
  if (confirmar) {
    for (const nome of novasMarcas) marcas.set(slug(nome), (await db.marca.create({ data: { nome, slug: slug(nome) } })).id);
    for (const nome of novasCategorias) categorias.set(slug(nome), (await db.categoria.create({ data: { nome, slug: slug(nome) } })).id);
  }

  const resumo = { criados: 0, atualizados: 0, iguais: 0, ajustesEstoque: 0, fotosTrocadas: 0, falhas: [] as string[] };
  for (const p of produtos) {
    const atual = await db.produto.findUnique({
      where: { referencia: p.referencia },
      include: { variantes: true, custo: true, imagens: { orderBy: { ordem: 'asc' } } },
    });
    const categoria = CATEGORIAS[p.categoria] ?? p.categoria;
    const planilha = {
      nome: p.nome.slice(0, 160),
      marcaId: marcas.get(slug(p.marca)) ?? -1,
      categoriaId: categorias.get(slug(categoria)) ?? -1,
      subcategoria: p.subcategoria || null,
      genero: p.genero.toLowerCase() as Genero,
      estacao: (p.estacao.toLowerCase() || null) as Estacao | null,
      cor: p.cor || null,
      composicao: p.composicao || null,
      descricao: p.descricao || null,
      destaques: [...new Set([...lista(p.caracteristicas), ...lista(p.beneficios)])],
      preco: valor(p.preco_venda),
      precoCheio: valor(p.preco_cheio) || valor(p.preco_venda),
      imperdivel: p.imperdivel === 'SIM',
    };
    // Vazio na planilha = sem informação, não "apagar".
    const dados = Object.fromEntries(
      Object.entries(planilha).filter(([, v]) => !atual || (v !== null && !(Array.isArray(v) && !v.length))),
    ) as Partial<typeof planilha>;
    if (!atual) dados.estacao = planilha.estacao ?? estacaoDe(p.nome, categoria);
    const mudados = atual
      ? Object.keys(dados).filter(k => {
          const antes = (atual as Record<string, unknown>)[k];
          const depois = (dados as Record<string, unknown>)[k];
          return antes instanceof Prisma.Decimal ? !antes.equals(depois as number) : !iguais(antes, depois);
        })
      : [];
    const custo = p.custo ? valor(p.custo) : null;
    const mudouCusto = custo != null && !(atual?.custo?.valor.equals(custo) ?? false);
    const fotos = lista(p.fotos_todas);
    const trocarFotos = fotos.length > (atual?.imagens.length ?? 0);

    // A planilha não conhece as vendas feitas aqui: o estoque dela é o de antes dos pedidos. Desconta o que os pedidos
    // baixaram (movimentos de venda ou ligados a pedido), para cancelar/excluir o pedido devolver a peça certa.
    const vendido = new Map<string, number>();
    if (atual) {
      const porVariante = await db.movimentoEstoque.groupBy({
        by: ['varianteId'],
        where: { varianteId: { in: atual.variantes.map(v => v.id) }, OR: [{ motivo: 'venda' }, { pedidoId: { not: null } }] },
        _sum: { delta: true },
      });
      for (const m of porVariante) vendido.set(atual.variantes.find(v => v.id === m.varianteId)!.tamanho, -(m._sum.delta ?? 0));
    }
    const variantes = (tamanhos.get(p.referencia) ?? []).map(t => ({
      tamanho: t.tamanho,
      estoque: Math.max(0, (Number(t.estoque) || 0) - (vendido.get(t.tamanho) ?? 0)),
      codigoInterno: t.codigo_interno || null,
      ean: t.ean || null,
      ordem: posicaoTamanho(t.tamanho),
    }));
    const mudancasVariante = variantes.filter(v => {
      const a = atual?.variantes.find(x => x.tamanho === v.tamanho);
      return !a || a.estoque !== v.estoque || a.codigoInterno !== v.codigoInterno || a.ean !== v.ean || a.ordem !== v.ordem;
    });

    if (atual && !mudados.length && !mudouCusto && !trocarFotos && !mudancasVariante.length) { resumo.iguais++; continue; }
    const desc = atual
      ? `~ ${p.referencia} ${[...mudados, ...(mudouCusto ? ['custo'] : []), ...(trocarFotos ? [`fotos ${atual.imagens.length}→${fotos.length}`] : []),
          ...mudancasVariante.map(v => { const a = atual.variantes.find(x => x.tamanho === v.tamanho); return a ? `${v.tamanho} estoque ${a.estoque}→${v.estoque}` : `tamanho novo ${v.tamanho}`; })].join(', ')}`
      : `+ ${p.referencia} ${p.nome} (${variantes.length} tamanhos, ${fotos.length} fotos)`;
    if (atual) console.log(desc);
    if (!confirmar) { resumo[atual ? 'atualizados' : 'criados']++; continue; }

    try {
      // Baixa antes da transação: rede lenta não deve segurar o banco.
      const novasFotos: string[] = [];
      if (trocarFotos)
        for (const url of fotos) {
          const bytes = await baixarFoto(url);
          if (typeof bytes === 'number') console.log(`  foto não baixou (HTTP ${bytes}): ${url}`);
          else novasFotos.push(await salvarFotoProduto(p.referencia.replace(/[^\w-]/g, '').slice(0, 20), bytes));
        }
      await db.$transaction(async tx => {
        const prod = atual
          ? await tx.produto.update({ where: { id: atual.id }, data: dados })
          : await tx.produto.create({ data: { referencia: p.referencia, ...(dados as typeof planilha) } });
        if (novasFotos.length > (atual?.imagens.length ?? 0)) {
          await tx.produtoImagem.deleteMany({ where: { produtoId: prod.id } });
          await tx.produtoImagem.createMany({ data: novasFotos.map((url, ordem) => ({ produtoId: prod.id, url, ordem })) });
          if (atual) await tx.pedidoItem.updateMany({ where: { produtoId: prod.id }, data: { imagem: novasFotos[0] } });
          resumo.fotosTrocadas++;
        }
        for (const v of mudancasVariante) {
          const a = atual?.variantes.find(x => x.tamanho === v.tamanho);
          if (a && v.estoque < a.reservado) throw new Error(`${v.tamanho}: estoque ${v.estoque} menor que o reservado (${a.reservado})`);
          const variante = await tx.variante.upsert({
            where: { produtoId_tamanho: { produtoId: prod.id, tamanho: v.tamanho } },
            create: { produtoId: prod.id, ...v },
            update: v,
          });
          const delta = v.estoque - (a?.estoque ?? 0);
          if (delta) {
            await tx.movimentoEstoque.create({
              data: a
                ? { varianteId: variante.id, delta, motivo: 'ajuste', observacao: 'Ajuste pela planilha (importação)' }
                : { varianteId: variante.id, delta, motivo: 'entrada', observacao: 'Saldo inicial (importação)' },
            });
            if (a) resumo.ajustesEstoque++;
          }
        }
        if (mudouCusto) await tx.custo.upsert({ where: { produtoId: prod.id }, create: { produtoId: prod.id, valor: custo }, update: { valor: custo } });
      });
      resumo[atual ? 'atualizados' : 'criados']++;
    } catch (e) {
      resumo.falhas.push(`${p.referencia}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if ((resumo.criados + resumo.atualizados) % 25 === 0) console.log(`  ${resumo.criados} criados, ${resumo.atualizados} atualizados...`);
  }

  console.log(`${confirmar ? '' : '[simulação] '}Criados: ${resumo.criados}. Atualizados: ${resumo.atualizados}. Sem mudança: ${resumo.iguais}.`);
  if (confirmar) console.log(`Ajustes de estoque: ${resumo.ajustesEstoque}. Produtos com fotos trocadas: ${resumo.fotosTrocadas}.`);
  if (resumo.falhas.length) console.log(`Falhas (${resumo.falhas.length}):\n  ${resumo.falhas.join('\n  ')}`);
  if (!confirmar) return console.log('Nada foi alterado. Rode com --confirmar para gravar.');
  console.log('Reinicie o app (pm2 reload dcerutti) para o catálogo em memória pegar as mudanças.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
