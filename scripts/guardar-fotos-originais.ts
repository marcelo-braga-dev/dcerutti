/**
 * L-01: baixa para o cache (scripts/fotos-cache.ts) todas as fotos de produto do protótipo, antes que a Hering apague.
 *   npm run fotos:guardar-originais
 * Pode rodar de novo: só baixa o que ainda não está no cache. Relatório em <cache>/relatorio.json.
 * Não mexe no banco. Depois, no banco de produção: db:importar-prototipo e fotos:migrar (que lê do cache).
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lerPacote } from './prototipo';
import { baixarFoto, DIR_CACHE_FOTOS, temNoCache } from './fotos-cache';

const SIMULTANEAS = 6;

async function main() {
  const idx = lerPacote(path.join(__dirname, '..', 'prototipo/index.html'));
  const catalogo: { r: string; im: string[] }[] = JSON.parse(idx.porNome('catalogo')!.dados.toString('utf8'));
  const urls = [...new Set(catalogo.flatMap(p => p.im).filter(u => u.startsWith('http')))];
  const faltam = urls.filter(u => !temNoCache(u));
  console.log(`${urls.length} fotos no protótipo; ${urls.length - faltam.length} já no cache; baixando ${faltam.length} para ${DIR_CACHE_FOTOS}`);
  const falhas: { url: string; motivo: string }[] = [];
  let ok = 0;
  for (let i = 0; i < faltam.length; i += SIMULTANEAS) {
    await Promise.all(faltam.slice(i, i + SIMULTANEAS).map(async url => {
      try {
        const r = await baixarFoto(url);
        if (typeof r === 'number') falhas.push({ url, motivo: `HTTP ${r}` });
        else ok++;
      } catch (e) {
        falhas.push({ url, motivo: e instanceof Error ? e.message : String(e) });
      }
    }));
    if ((i / SIMULTANEAS) % 50 === 0) console.log(`  ${i + SIMULTANEAS}/${faltam.length}...`);
  }
  const noCache = urls.filter(temNoCache).length;
  await writeFile(path.join(DIR_CACHE_FOTOS, 'relatorio.json'), JSON.stringify({ em: new Date().toISOString(), total: urls.length, noCache, falhas }, null, 2));
  console.log(`Baixadas agora: ${ok}. No cache: ${noCache} de ${urls.length}. Falhas: ${falhas.length} (${falhas.filter(f => f.motivo === 'HTTP 404').length} não existem mais).`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
