'use server';

import { revalidatePath } from 'next/cache';
import { lerPlanilhaGuardada } from '../arquivo-planilha';
import { lerConfig, salvarConfig } from '../config';
import { aplicar, planejar, regrasDosFornecedores, resumir, type ResumoImportacao } from '../importacao-estoque';
import { exigirPapel } from '../permissoes';
import { lerPlanilhaEstoque } from '../planilha-xlsx';
import type { RegrasFornecedores } from '@/lib/planilha-estoque';

type Resultado = { ok: true; resumo: ResumoImportacao } | { ok: false; erro: string };

/** Uma importação por vez (dois cliques ou duas abas não gravam a planilha duas vezes). */
let importando = false;

/** Só aceita regras bem formadas vindas da tela. */
function limparRegras(r: unknown): RegrasFornecedores {
  const out: RegrasFornecedores = {};
  if (!r || typeof r !== 'object') return out;
  for (const [nome, v] of Object.entries(r as Record<string, unknown>)) {
    const x = v as { marca?: unknown; ignorar?: unknown };
    const marca = typeof x?.marca === 'string' ? x.marca.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    if (marca) out[nome.slice(0, 120)] = { marca, ignorar: x.ignorar === true };
  }
  return out;
}

async function carregar(id: string, regras: unknown) {
  const dados = await lerPlanilhaGuardada(id);
  if (!dados) return null;
  const { linhas } = await lerPlanilhaEstoque(dados);
  const salvas = (await lerConfig()).fornecedores;
  return { linhas, salvas, regras: regrasDosFornecedores(linhas, salvas, limparRegras(regras)) };
}

/** Refaz a prévia com as marcas e os fornecedores ignorados escolhidos na tela. */
export async function previaImportacao(id: string, regras: RegrasFornecedores): Promise<Resultado> {
  await exigirPapel(['gestor']);
  const c = await carregar(id, regras);
  if (!c) return { ok: false, erro: 'Planilha não encontrada. Envie de novo.' };
  return { ok: true, resumo: resumir(await planejar(c.linhas, c.regras, c.salvas)) };
}

/** Importa: replaneja com o banco de agora, grava tudo e guarda as regras dos fornecedores para as próximas. */
export async function confirmarImportacao(id: string, nomeOriginal: string, regras: RegrasFornecedores): Promise<Resultado> {
  const u = await exigirPapel(['gestor']);
  if (importando) return { ok: false, erro: 'Já há uma importação em andamento. Aguarde terminar.' };
  importando = true;
  try {
    const c = await carregar(id, regras);
    if (!c) return { ok: false, erro: 'Planilha não encontrada. Envie de novo.' };
    const plano = await planejar(c.linhas, c.regras, c.salvas);
    await aplicar(plano, { usuarioId: u.id, arquivo: id, nomeOriginal: String(nomeOriginal).slice(0, 200) });
    await salvarConfig({ fornecedores: { ...c.salvas, ...c.regras } });
    revalidatePath('/', 'layout');
    return { ok: true, resumo: resumir(plano) };
  } catch (e) {
    console.error('Importação de estoque falhou', e);
    return { ok: false, erro: 'A importação falhou e nada foi gravado. Tente de novo; se continuar, avise o suporte.' };
  } finally {
    importando = false;
  }
}
