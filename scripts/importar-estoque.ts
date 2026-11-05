/**
 * Importa a planilha de estoque (.xlsx do sistema da loja), o mesmo que Painel → Produtos → Importar estoque.
 *   npm run estoque:importar -- caminho/estoque.xlsx              # só mostra o que faria
 *   npm run estoque:importar -- caminho/estoque.xlsx --confirmar  # grava
 * Usa as marcas de fornecedor salvas na página (ou as sugeridas, para fornecedor novo). Veja docs/25-importacao-de-estoque.md.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerConfig, salvarConfig } from '../src/server/config';
import { aplicar, planejar, regrasDosFornecedores, resumir } from '../src/server/importacao-estoque';
import { lerPlanilhaEstoque } from '../src/server/planilha-xlsx';
import { guardarPlanilha } from '../src/server/arquivo-planilha';
import { db } from '../src/server/db';

async function main() {
  const arquivo = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!arquivo) throw new Error('Informe o arquivo: npm run estoque:importar -- estoque.xlsx [--confirmar]');
  const dados = readFileSync(arquivo);
  const { linhas, erros, aba } = await lerPlanilhaEstoque(dados);
  if (!linhas.length) throw new Error(erros[0] ?? 'Nenhuma peça na planilha.');
  const salvas = (await lerConfig()).fornecedores;
  const regras = regrasDosFornecedores(linhas, salvas);
  const plano = await planejar(linhas, regras, salvas);
  const r = resumir(plano, 15);
  console.log(`Aba "${aba}": ${r.linhas} linhas, ${r.totais.pecasPlanilha} peças.`);
  console.log(r.contagens);
  console.log(`Peças no site: ${r.totais.pecasSiteAntes} → ${r.totais.pecasSiteDepois}`);
  console.log('Fornecedores:', r.fornecedores.map(f => `${f.nome} → ${f.ignorar ? '(ignorado)' : f.marca}`).join('; '));
  if (r.marcasNovas.length) console.log('Marcas novas:', r.marcasNovas.join(', '));
  if (r.categoriasNovas.length) console.log('Categorias novas:', r.categoriasNovas.join(', '));
  if (r.avisos.length) console.log('Avisos:\n  ' + r.avisos.join('\n  '));
  if (!process.argv.includes('--confirmar')) return console.log('\nNada foi gravado. Rode de novo com --confirmar para importar.');
  const id = await guardarPlanilha(dados);
  await aplicar(plano, { usuarioId: null, arquivo: id, nomeOriginal: path.basename(arquivo) });
  await salvarConfig({ fornecedores: { ...salvas, ...regras } });
  console.log('Importação gravada.');
}

main().catch(e => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => db.$disconnect());
