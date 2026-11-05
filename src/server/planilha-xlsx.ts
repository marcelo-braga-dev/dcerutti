import 'server-only';
import ExcelJS from 'exceljs';
import { lerLinhas, type LinhaPlanilha } from '@/lib/planilha-estoque';

/** Valor simples de uma célula do ExcelJS (texto rico, fórmula e link viram o texto/resultado). */
function valor(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return v.toISOString();
  if ('richText' in v) return v.richText.map(t => t.text).join('');
  if ('result' in v) return valor(v.result as ExcelJS.CellValue);
  if ('text' in v) return v.text;
  if ('error' in v) return null;
  return String(v);
}

/** Lê a planilha de estoque (.xlsx): a primeira aba que tiver o cabeçalho do relatório de produtos. */
export async function lerPlanilhaEstoque(dados: Buffer | ArrayBuffer): Promise<{ linhas: LinhaPlanilha[]; erros: string[]; aba: string | null }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(dados as ArrayBuffer);
  } catch {
    return { linhas: [], erros: ['O arquivo não é uma planilha .xlsx válida.'], aba: null };
  }
  let ultimo: string[] = ['A planilha está vazia.'];
  for (const ws of wb.worksheets) {
    const matriz: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const vals = row.values as ExcelJS.CellValue[]; // índice 1 = coluna A
      matriz[n - 1] = vals.slice(1).map(valor);
    });
    const r = lerLinhas(Array.from(matriz, x => x ?? []));
    if (r.linhas.length) return { ...r, aba: ws.name };
    ultimo = r.erros;
  }
  return { linhas: [], erros: ultimo, aba: null };
}
