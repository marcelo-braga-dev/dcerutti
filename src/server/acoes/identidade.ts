'use server';

import { unlink } from 'node:fs/promises';
import { revalidatePath } from 'next/cache';
import { ArquivoInvalido, caminhoDoArquivo, PREFIXO_URL, salvarArquivoMarca, type TipoMarca } from '../arquivos';
import { lerConfig, salvarConfig } from '../config';
import { exigirPapel } from '../permissoes';
import { CORES, lerCor, soMudadas, type Identidade, type Token } from '@/lib/identidade';
import { NOME_PADRAO, SLOGAN_PADRAO } from '@/lib/loja';

export type ResultadoIdentidade = { ok: true; identidade: Identidade; mensagem: string } | { ok: false; erro: string };

const TIPOS: TipoMarca[] = ['logo', 'logoClara', 'favicon'];
const NOMES: Record<TipoMarca, string> = { logo: 'logo', logoClara: 'logo para fundo escuro', favicon: 'favicon' };
/** O limite das Server Actions é 2 MB (next.config.ts); a tela confere antes de enviar. */
const LIMITE = 1.8 * 1024 * 1024;

/** Apaga do armazenamento um arquivo da marca que deixou de ser usado. Falha aqui não impede o salvamento. */
async function apagar(url: string | undefined | null) {
  if (!url?.startsWith(`${PREFIXO_URL}/marca/`)) return;
  const alvo = caminhoDoArquivo(url.slice(PREFIXO_URL.length + 1).split('/'));
  if (alvo) await unlink(alvo).catch(() => {});
}

/**
 * Identidade visual (D-25), só o gestor. Campos: `cor:<token>` (hex), `logo`/`logoClara`/`favicon` (arquivo novo) e
 * `remover:<tipo>` (volta à marca de fábrica). As cores iguais ao padrão não são gravadas.
 */
export async function salvarIdentidade(fd: FormData): Promise<ResultadoIdentidade> {
  await exigirPapel(['gestor']);
  const atual = (await lerConfig()).identidade;

  const cores: Partial<Record<Token, string>> = {};
  for (const c of CORES) {
    const bruto = fd.get(`cor:${c.token}`);
    if (typeof bruto !== 'string' || !bruto.trim()) continue;
    const cor = lerCor(bruto);
    if (!cor) return { ok: false, erro: `${c.rotulo}: cor inválida. Use o formato #2e2520.` };
    cores[c.token] = cor;
  }

  // Nome e assinatura: iguais aos de fábrica não são gravados (ficam seguindo o padrão).
  const nome = String(fd.get('nome') ?? '').trim().replace(/\s+/g, ' ');
  const slogan = String(fd.get('slogan') ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 40) return { ok: false, erro: 'O nome da loja precisa ter de 2 a 40 letras.' };
  if (slogan.length > 60) return { ok: false, erro: 'A assinatura pode ter até 60 letras.' };

  const nova: Identidade = { ...atual, cores: soMudadas(cores), nome: nome === NOME_PADRAO ? undefined : nome, slogan: slogan === SLOGAN_PADRAO ? undefined : slogan };
  const sobras: string[] = [];
  for (const tipo of TIPOS) {
    const arquivo = fd.get(tipo);
    if (arquivo instanceof File && arquivo.size > 0) {
      if (arquivo.size > LIMITE) return { ok: false, erro: `A ${NOMES[tipo]} passa de 1,8 MB. Reduza o arquivo e envie de novo.` };
      try {
        nova[tipo] = await salvarArquivoMarca(tipo, Buffer.from(await arquivo.arrayBuffer()));
      } catch (e) {
        if (e instanceof ArquivoInvalido) return { ok: false, erro: `${NOMES[tipo][0].toUpperCase()}${NOMES[tipo].slice(1)}: ${e.message}` };
        throw e;
      }
      if (atual[tipo]) sobras.push(atual[tipo]!.url);
    } else if (fd.get(`remover:${tipo}`) === '1' && atual[tipo]) {
      sobras.push(atual[tipo]!.url);
      nova[tipo] = null;
    }
  }

  await salvarConfig({ identidade: nova });
  await Promise.all(sobras.map(apagar));
  // As cores e as logos estão no layout raiz: todas as páginas mudam.
  revalidatePath('/', 'layout');
  return { ok: true, identidade: nova, mensagem: 'Identidade visual salva. Já vale em todo o site.' };
}
