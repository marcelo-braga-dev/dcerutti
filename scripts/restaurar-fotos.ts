/**
 * Devolve a cada produto as próprias fotos (desfaz o fotos:reduzir-teste ou conserta fotos trocadas).
 *   npm run fotos:restaurar                 # só mostra o que faria
 *   npm run fotos:restaurar -- --confirmar  # troca as fotos no banco e apaga do disco as que ninguém usa mais
 * De onde vêm as fotos, nesta ordem:
 *   1. as do protótipo (prototipo/index.html) que estão no cache das originais (fotos:guardar-originais);
 *   2. as atuais da Hering (loja e outlet), buscadas pela referência exata na API do catálogo;
 *   3. com --outra-cor: as do mesmo modelo (4 primeiros caracteres da referência) em outra cor, de preferência
 *      com o mesmo código ou nome de cor. Para cor que saiu de linha; a foto pode não ser da cor do produto.
 * Produto sem foto em nenhum dos dois fica como está e sai no relatório (armazenamento/restauracao-fotos.json).
 * Pedidos passam a apontar para a primeira foto do produto.
 */
import 'dotenv/config';
import { readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { DIR_ARQUIVOS, PREFIXO_URL, salvarFotoProduto } from '../src/server/arquivos';
import { baixarFoto, temNoCache } from './fotos-cache';
import { lerPacote } from './prototipo';

const LOJAS = ['https://www.hering.com.br', 'https://www.outletespacociahering.com.br'];
const SIMULTANEAS = 4;
const confirmar = process.argv.includes('--confirmar');
const outraCor = process.argv.includes('--outra-cor');
const db = new PrismaClient();

type ProdutoVtex = { productReference?: string; productName: string; items: { images: { imageUrl: string }[] }[] };

async function buscarNaHering(loja: string, termo: string): Promise<ProdutoVtex[]> {
  const r = await fetch(`${loja}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}&_from=0&_to=49`, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (dcerutti-restauracao-fotos)' },
  }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => [])) as ProdutoVtex[]) : [];
}

// A primeira SKU basta (as fotos são por cor). Tira o "?v=" para o cache não duplicar.
const fotosDe = (p?: ProdutoVtex) => [...new Set((p?.items[0]?.images ?? []).map(i => i.imageUrl.split('?')[0]))];

/** Fotos atuais do produto na Hering, pela referência exata; [] se não achar. */
async function fotosNaHering(referencia: string): Promise<string[]> {
  for (const loja of LOJAS) {
    const urls = fotosDe((await buscarNaHering(loja, referencia)).find(p => p.productReference?.toUpperCase() === referencia.toUpperCase()));
    if (urls.length) return urls;
  }
  return [];
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const corDoNome = (nome: string) => (nome.includes(' - ') ? normalizar(nome.split(' - ').slice(1).join(' - ')) : '');

// Na Hering a referência é modelo (4 caracteres) + código da cor + sufixo: 0199MD3EN é o modelo 0199 na cor MD3 (cinza).
const codigoDaCor = (referencia: string) => referencia.toUpperCase().slice(4).replace(/(07S|00S|0F|EN|SI|SN)$/, '');
/** Nome da cor de cada código, aprendido dos nomes "Produto - Cor" do banco e da Hering. */
const coresPorCodigo = new Map<string, string>();
const aprenderCor = (referencia: string, nome: string) => {
  const cor = corDoNome(nome);
  if (cor && codigoDaCor(referencia) && !coresPorCodigo.has(codigoDaCor(referencia))) coresPorCodigo.set(codigoDaCor(referencia), cor);
};

/** Fotos do mesmo modelo (4 primeiros caracteres da referência) em outra cor: prefere o mesmo código de cor, depois o mesmo nome de cor. */
async function fotosDeOutraCor(p: { referencia: string; nome: string; cor: string | null }): Promise<{ ref: string; nome: string; urls: string[] } | null> {
  const prefixo = p.referencia.slice(0, 4).toUpperCase();
  const candidatos: ProdutoVtex[] = [];
  for (const loja of LOJAS) candidatos.push(...(await buscarNaHering(loja, prefixo)));
  const mesmos = candidatos.filter(c => c.productReference?.toUpperCase().startsWith(prefixo) && fotosDe(c).length);
  for (const c of mesmos) aprenderCor(c.productReference!, c.productName);
  const codigo = codigoDaCor(p.referencia);
  const cor = (p.cor && normalizar(p.cor)) || corDoNome(p.nome) || coresPorCodigo.get(codigo) || '';
  const escolhido =
    mesmos.find(c => codigoDaCor(c.productReference!) === codigo) ??
    mesmos.find(c => cor && corDoNome(c.productName) === cor) ??
    mesmos[0];
  return escolhido ? { ref: escolhido.productReference!, nome: escolhido.productName, urls: fotosDe(escolhido) } : null;
}

async function arquivosEm(dir: string): Promise<string[]> {
  const itens = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const listas = await Promise.all(itens.map(i => (i.isDirectory() ? arquivosEm(path.join(dir, i.name)) : [path.join(dir, i.name)])));
  return listas.flat();
}

async function main() {
  const idx = lerPacote(path.join(__dirname, '..', 'prototipo/index.html'));
  const catalogo: { r: string; im: string[] }[] = JSON.parse(idx.porNome('catalogo')!.dados.toString('utf8'));
  const doPrototipo = new Map(catalogo.map(p => [p.r, p.im.filter(u => u.startsWith('http'))]));

  const produtos = await db.produto.findMany({ orderBy: { id: 'asc' }, select: { id: true, referencia: true, nome: true, cor: true } });
  for (const p of produtos) aprenderCor(p.referencia, p.nome);
  const origem = { prototipo: 0, hering: 0, outraCor: 0, semFoto: 0 };
  const substitutas: { referencia: string; nome: string; cor: string | null; usada: string; nomeUsada: string }[] = [];
  const semFoto: string[] = [];
  const falhas: { referencia: string; url: string; motivo: string }[] = [];
  let feitos = 0;

  const processar = async (p: (typeof produtos)[number]) => {
    let urls = (doPrototipo.get(p.referencia) ?? []).filter(temNoCache);
    let fonte: 'prototipo' | 'hering' | 'outraCor' = 'prototipo';
    if (!urls.length) {
      urls = await fotosNaHering(p.referencia);
      fonte = 'hering';
    }
    if (!urls.length && outraCor) {
      const achado = await fotosDeOutraCor(p);
      if (achado) {
        urls = achado.urls;
        fonte = 'outraCor';
        substitutas.push({ referencia: p.referencia, nome: p.nome, cor: p.cor, usada: achado.ref, nomeUsada: achado.nome });
      }
    }
    if (!urls.length) {
      origem.semFoto++;
      semFoto.push(p.referencia);
      return;
    }
    origem[fonte]++;
    if (!confirmar) return;

    const novas: string[] = [];
    for (const url of urls) {
      try {
        const dados = await baixarFoto(url);
        if (typeof dados === 'number') falhas.push({ referencia: p.referencia, url, motivo: `HTTP ${dados}` });
        else novas.push(await salvarFotoProduto(p.referencia.replace(/[^\w-]/g, '').slice(0, 20), dados));
      } catch (e) {
        falhas.push({ referencia: p.referencia, url, motivo: e instanceof Error ? e.message : String(e) });
      }
    }
    if (!novas.length) {
      semFoto.push(p.referencia);
      return;
    }
    await db.$transaction([
      db.produtoImagem.deleteMany({ where: { produtoId: p.id } }),
      db.produtoImagem.createMany({ data: novas.map((url, ordem) => ({ produtoId: p.id, url, ordem })) }),
      db.pedidoItem.updateMany({ where: { produtoId: p.id }, data: { imagem: novas[0] } }),
    ]);
    if (++feitos % 50 === 0) console.log(`  ${feitos} produtos restaurados...`);
  };

  for (let i = 0; i < produtos.length; i += SIMULTANEAS) await Promise.all(produtos.slice(i, i + SIMULTANEAS).map(processar));

  console.log(`${produtos.length} produtos: ${origem.prototipo} com as fotos do protótipo, ${origem.hering} com as atuais da Hering, ${origem.outraCor} com as de outra cor, ${origem.semFoto} sem foto em lugar nenhum.`);
  for (const x of substitutas) console.log(`  ${x.referencia} ${x.nome} [${coresPorCodigo.get(codigoDaCor(x.referencia)) ?? '?'}] <- ${x.usada} ${x.nomeUsada}`);
  if (semFoto.length) console.log(`Sem foto (ficaram como estavam): ${semFoto.join(' ')}`);
  if (!confirmar) return console.log('Nada foi alterado. Rode com --confirmar para restaurar.');

  // Apaga do disco o que nenhum produto nem pedido usa mais.
  const usados = new Set([
    ...(await db.produtoImagem.findMany({ select: { url: true } })).map(i => i.url),
    ...(await db.pedidoItem.findMany({ where: { imagem: { not: null } }, select: { imagem: true } })).map(i => i.imagem!),
  ]);
  const pastaProdutos = path.join(DIR_ARQUIVOS, 'produtos');
  let apagados = 0;
  for (const arq of await arquivosEm(pastaProdutos)) {
    const url = `${PREFIXO_URL}/${path.relative(DIR_ARQUIVOS, arq).split(path.sep).join('/')}`;
    if (!usados.has(url)) { await unlink(arq); apagados++; }
  }
  for (const pasta of await readdir(pastaProdutos).catch(() => [])) await rmdir(path.join(pastaProdutos, pasta)).catch(() => {});

  const relatorio = path.join(DIR_ARQUIVOS, 'restauracao-fotos.json');
  await writeFile(relatorio, JSON.stringify({ em: new Date().toISOString(), ...origem, restaurados: feitos, substitutas, semFoto, falhas }, null, 2));
  console.log(`Restaurados: ${feitos}. Fotos que não baixaram: ${falhas.length}. Arquivos sem uso apagados: ${apagados}.`);
  console.log(`Relatório: ${relatorio}`);
  console.log('Reinicie o app (pm2 reload dcerutti) para o catálogo em memória pegar as novas fotos.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
