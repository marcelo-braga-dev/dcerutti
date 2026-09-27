/**
 * Importa catálogo e custos do protótipo para o MySQL e extrai logo e fotos para public/.
 *   npm run db:importar-prototipo            → importa se o banco ainda não tem produtos
 *   npm run db:importar-prototipo -- --forcar → atualiza produtos existentes (inclusive estoque)
 */
import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Estacao, type Genero } from '@prisma/client';
import { lerPacote } from './prototipo';
import { posicaoTamanho } from '../src/lib/catalogo';

type ProdutoJson = {
  id: string; r: string; n: string; c: string; sc: string; g: string; brand: string; p: number; pFull: number;
  co: string; cp: string; im: string[]; s: [string, number, string, string][]; f: string[]; b: string[]; d: string;
  hot?: boolean; link?: string;
};

const db = new PrismaClient();
const RAIZ = join(__dirname, '..');
const forcar = process.argv.includes('--forcar');

const slug = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Grafias inconsistentes do protótipo.
const CATEGORIAS: Record<string, string> = {
  Sueter: 'Suéteres', Lenco: 'Lenços', Blazer: 'Blazers', Colete: 'Coletes', Ceroula: 'Ceroulas', Gorro: 'Gorros',
  Necessaire: 'Necessaires', Bata: 'Batas', Mala: 'Malas', 'Roupa íntima': 'Roupas íntimas',
};

// Mesma regra do protótipo; no sistema novo a estação vira campo editável.
function estacaoDe(nome: string, categoria: string): Estacao | null {
  const t = `${nome} ${categoria}`.toLowerCase();
  if (/manga longa|moletom|tric[oô]|blus[aã]o|jaqueta|casaco|cardigan|su[eé]ter|gola alta|t[eé]rmic|colete|gorro|ceroula|flanel|pijama longo|cal[cç]a jeans|cal[cç]a moletom/.test(t)) return 'inverno';
  if (/manga curta|regata|short|bermuda|sunga|biqu[ií]ni|linho|top |cropped|vestido|saia|bata|camiseta/.test(t)) return 'verao';
  return null;
}

function extrairArquivos() {
  const pub = join(RAIZ, 'public');
  const idx = lerPacote(join(RAIZ, 'prototipo/index.html'));
  const logo = idx.porNome('logoPng');
  if (logo && !existsSync(join(pub, 'logo-dcerutti.png'))) writeFileSync(join(pub, 'logo-dcerutti.png'), logo.dados);
  // Fotos de ambiente usadas na tela de login (as três JPG do manifest).
  const fotos = [...idx.recursos.values()].filter(r => r.mime === 'image/jpeg');
  mkdirSync(join(pub, 'ambiente'), { recursive: true });
  fotos.forEach((f, i) => {
    const destino = join(pub, 'ambiente', `foto-${i + 1}.jpg`);
    if (!existsSync(destino)) writeFileSync(destino, f.dados);
  });
  console.log(`Arquivos: logo + ${fotos.length} fotos em public/`);
  return idx;
}

async function main() {
  const idx = extrairArquivos();
  const catalogo: ProdutoJson[] = JSON.parse(idx.porNome('catalogo')!.dados.toString('utf8'));
  const custos: Record<string, number> = JSON.parse(idx.porNome('custos')!.dados.toString('utf8'));

  const existentes = await db.produto.count();
  if (existentes && !forcar) {
    console.log(`O banco já tem ${existentes} produtos. Use --forcar para atualizar.`);
    return;
  }

  const marcas = new Map<string, number>();
  for (const nome of new Set(catalogo.map(p => p.brand))) {
    const m = await db.marca.upsert({ where: { slug: slug(nome) }, create: { nome, slug: slug(nome) }, update: { nome } });
    marcas.set(nome, m.id);
  }
  const categorias = new Map<string, number>();
  for (const bruto of new Set(catalogo.map(p => p.c))) {
    const nome = CATEGORIAS[bruto] ?? bruto;
    const c = await db.categoria.upsert({ where: { slug: slug(nome) }, create: { nome, slug: slug(nome) }, update: { nome } });
    categorias.set(bruto, c.id);
  }

  let n = 0;
  for (const p of catalogo) {
    const dados = {
      nome: p.n.slice(0, 160),
      marcaId: marcas.get(p.brand)!,
      categoriaId: categorias.get(p.c)!,
      subcategoria: p.sc || null,
      genero: p.g.toLowerCase() as Genero,
      estacao: estacaoDe(p.n, p.c),
      cor: p.co || null,
      composicao: p.cp || null,
      descricao: p.d || null,
      destaques: [...new Set([...(p.f ?? []), ...(p.b ?? [])])],
      preco: p.p,
      precoCheio: p.pFull || p.p,
      imperdivel: !!p.hot,
      linkOrigem: p.link ?? null,
    };
    await db.$transaction(async tx => {
      const prod = await tx.produto.upsert({ where: { referencia: p.r }, create: { referencia: p.r, ...dados }, update: dados });
      await tx.produtoImagem.deleteMany({ where: { produtoId: prod.id } });
      if (p.im.length) await tx.produtoImagem.createMany({ data: p.im.map((url, ordem) => ({ produtoId: prod.id, url, ordem })) });
      for (const [tamanho, estoque, codigoInterno, ean] of p.s) {
        const v = { estoque: Math.max(0, estoque), codigoInterno: codigoInterno || null, ean: ean || null, ordem: posicaoTamanho(tamanho) };
        await tx.variante.upsert({
          where: { produtoId_tamanho: { produtoId: prod.id, tamanho } },
          create: { produtoId: prod.id, tamanho, ...v },
          update: v,
        });
      }
      const custo = custos[p.r] ?? custos[p.id];
      if (custo != null) await tx.custo.upsert({ where: { produtoId: prod.id }, create: { produtoId: prod.id, valor: custo }, update: { valor: custo } });
    });
    if (++n % 100 === 0) console.log(`  ${n}/${catalogo.length}`);
  }
  console.log(`Importados ${n} produtos, ${Object.keys(custos).length} custos, ${marcas.size} marcas, ${categorias.size} categorias.`);
}

main().finally(() => db.$disconnect());
