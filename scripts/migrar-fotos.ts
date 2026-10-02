/**
 * Baixa para o servidor as fotos de produto que ainda apontam para sites externos (Hering, Dafiti) — C-08 / D-13.
 *   npm run fotos:migrar                       # migra e lista as que não baixaram
 *   npm run fotos:migrar -- --remover-quebradas  # também apaga do produto as fotos que não existem mais (404)
 * Pode rodar de novo: só pega o que ainda é externo. Relatório em armazenamento/migracao-fotos.json.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { DIR_ARQUIVOS, salvarFotoProduto } from '../src/server/arquivos';

const db = new PrismaClient();
const removerQuebradas = process.argv.includes('--remover-quebradas');
const SIMULTANEAS = 6;

type Falha = { imagemId: number; referencia: string; url: string; motivo: string };

async function baixar(url: string): Promise<Buffer | number> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'dcerutti-migracao-fotos' } });
  if (!r.ok) return r.status;
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const imagens = await db.produtoImagem.findMany({
    where: { url: { startsWith: 'http' } },
    select: { id: true, url: true, produto: { select: { referencia: true } } },
    orderBy: { id: 'asc' },
  });
  console.log(`${imagens.length} foto(s) externas para migrar.`);
  const falhas: Falha[] = [];
  let migradas = 0;

  const processar = async (img: (typeof imagens)[number]) => {
    const referencia = img.produto.referencia;
    try {
      // Tenta a versão grande da Hering (o tamanho está no caminho); se não houver, a original.
      const grande = img.url.replace('-600-800/', '-1200-1600/');
      let dados = grande !== img.url ? await baixar(grande) : 404;
      if (typeof dados === 'number') dados = await baixar(img.url);
      if (typeof dados === 'number') return void falhas.push({ imagemId: img.id, referencia, url: img.url, motivo: `HTTP ${dados}` });
      const nova = await salvarFotoProduto(referencia.replace(/[^\w-]/g, '').slice(0, 20), dados);
      await db.$transaction([
        db.produtoImagem.update({ where: { id: img.id }, data: { url: nova } }),
        // Pedidos guardam uma cópia da URL da foto: atualiza junto.
        db.pedidoItem.updateMany({ where: { imagem: img.url }, data: { imagem: nova } }),
      ]);
      migradas++;
      if (migradas % 100 === 0) console.log(`  ${migradas} migradas...`);
    } catch (e) {
      falhas.push({ imagemId: img.id, referencia, url: img.url, motivo: e instanceof Error ? e.message : String(e) });
    }
  };

  for (let i = 0; i < imagens.length; i += SIMULTANEAS) await Promise.all(imagens.slice(i, i + SIMULTANEAS).map(processar));

  const quebradas = falhas.filter(f => f.motivo === 'HTTP 404' || f.motivo === 'HTTP 410');
  if (removerQuebradas && quebradas.length) await db.produtoImagem.deleteMany({ where: { id: { in: quebradas.map(f => f.imagemId) } } });

  const relatorio = path.join(DIR_ARQUIVOS, 'migracao-fotos.json');
  await writeFile(relatorio, JSON.stringify({ em: new Date().toISOString(), total: imagens.length, migradas, removidas: removerQuebradas ? quebradas.length : 0, falhas }, null, 2));
  console.log(`Migradas: ${migradas}. Falhas: ${falhas.length} (${quebradas.length} não existem mais${removerQuebradas ? ', removidas dos produtos' : ''}).`);
  console.log(`Relatório: ${relatorio}`);
  console.log('Reinicie o app (pm2 reload dcerutti) para o catálogo em memória pegar as novas URLs.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
