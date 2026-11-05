import { NextResponse } from 'next/server';
import { guardarPlanilha, TAMANHO_MAXIMO_PLANILHA } from '@/server/arquivo-planilha';
import { lerConfig } from '@/server/config';
import { planejar, regrasDosFornecedores, resumir } from '@/server/importacao-estoque';
import { usuarioAtual } from '@/server/permissoes';
import { lerPlanilhaEstoque } from '@/server/planilha-xlsx';

/**
 * Recebe a planilha de estoque (multipart: `arquivo`), guarda no servidor e devolve a prévia do que a importação
 * mudaria (nada é gravado no catálogo aqui). Só gestor. Rota de API, e não Server Action, por causa do tamanho do arquivo.
 */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (u?.papel !== 'gestor') return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  const arquivo = fd?.get('arquivo');
  if (!(arquivo instanceof File) || !arquivo.size) return NextResponse.json({ erro: 'Escolha a planilha (.xlsx).' }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_PLANILHA) return NextResponse.json({ erro: 'Planilha acima de 20 MB.' }, { status: 413 });
  if (!/\.xlsx$/i.test(arquivo.name)) return NextResponse.json({ erro: 'Envie a planilha no formato .xlsx (Excel).' }, { status: 400 });
  const dados = Buffer.from(await arquivo.arrayBuffer());
  const { linhas, erros, aba } = await lerPlanilhaEstoque(dados);
  if (!linhas.length) return NextResponse.json({ erro: erros[0] ?? 'Nenhuma peça encontrada na planilha.' }, { status: 400 });
  const id = await guardarPlanilha(dados);
  const salvas = (await lerConfig()).fornecedores;
  const plano = await planejar(linhas, regrasDosFornecedores(linhas, salvas), salvas);
  return NextResponse.json({ id, nomeOriginal: arquivo.name.slice(0, 200), aba, erros, resumo: resumir(plano) });
}
