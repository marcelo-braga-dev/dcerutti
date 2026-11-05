/**
 * Planilha de estoque (relatório "Relatório de Produtos" do sistema da loja), o padrão de importação do catálogo.
 * Uma linha = uma peça num tamanho (SKU). Este arquivo só interpreta a planilha (sem banco): agrupa as linhas em
 * produtos e deduz nome, categoria, gênero, estação e referência dos produtos novos. Veja docs/25-importacao-de-estoque.md.
 */

/** Colunas obrigatórias, com o nome exato do cabeçalho. */
export const COLUNAS = ['Fornecedor', 'Código', 'Refer.', 'Cód. Barras', 'Descrição', 'Tam.', 'Cód. Cor', 'Cor Visual', 'Estoq.', 'Cond.', 'Res. EC', 'Preço Venda'] as const;

export type LinhaPlanilha = {
  /** Número da linha no Excel (para os avisos). */
  linha: number;
  fornecedor: string;
  /** Código interno do sistema da loja: identifica a peça naquele tamanho (vira `variante.codigoInterno`). */
  codigo: string;
  referencia: string;
  codigoBarras: string;
  descricao: string;
  tamanho: string;
  codigoCor: string;
  corVisual: string;
  estoque: number;
  condicional: number;
  reservadoEc: number;
  preco: number;
};

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveTexto = (t: string) => semAcento(t).toUpperCase().replace(/\s+/g, ' ').trim();

/** U, UN e UNI viram UNI; o resto, em maiúsculas e sem espaços (até 5 letras, o limite do banco). */
export function tamanhoDaPlanilha(t: string): string {
  const v = chaveTexto(t).replace(/\s+/g, '');
  if (['U', 'UN', 'UNI', 'UNICO', 'UNICA'].includes(v)) return 'UNI';
  return v.slice(0, 5) || 'UNI';
}

/** Equivalências de tamanho na ponta da referência (Carlota usa PP para o XP). */
const TAMANHOS_EQUIVALENTES: Record<string, string[]> = { XP: ['XP', 'PP'], PP: ['PP', 'XP'], UNI: ['UNI', 'UN', 'U'] };

/** Referência sem o tamanho no fim (Actum "020345996051G", Carlota "CAI23010919-0000PP", Randall "ACT3773.107.39"). */
export function referenciaBase(referencia: string, tamanho: string): string {
  const ref = referencia.trim();
  for (const t of TAMANHOS_EQUIVALENTES[tamanho] ?? [tamanho]) {
    if (ref.length > t.length + 2 && ref.toUpperCase().endsWith(t)) return ref.slice(0, -t.length).replace(/[.\-_/\s]+$/, '');
  }
  return ref;
}

/** Cor do produto: a "Cor Visual" (padronizada) ou, sem ela, o código de cor quando é um nome. */
export function corDaLinha(l: Pick<LinhaPlanilha, 'corVisual' | 'codigoCor'>): string | null {
  const nome = (l.corVisual || (/[A-Za-zÀ-ú]{3}/.test(l.codigoCor) && !/\d/.test(l.codigoCor) ? l.codigoCor : '')).trim();
  return nome ? titulo(nome) : null;
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'em', 'para', 'a', 'o', 'no', 'na']);
const SIGLAS = new Set(['UV', 'GG', 'XG', 'XXG', 'EXG', 'PP', 'XP', 'P', 'M', 'G', '3D', 'II', 'III']);

/** "CALCA JEANS SKINNY" → "Calca Jeans Skinny" (preposições em minúsculas, siglas como estão). */
export function titulo(t: string): string {
  return t.toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => {
    if (SIGLAS.has(p.toUpperCase())) return p.toUpperCase();
    if (i > 0 && MINUSCULAS.has(p)) return p;
    return p.replace(/^\p{L}/u, l => l.toUpperCase()).replace(/([-/])(\p{L})/gu, (_, s, l) => s + l.toUpperCase());
  }).join(' ');
}

/** Abreviações do sistema da loja, na descrição (com acento onde a palavra pede). */
const ABREVIACOES: [RegExp, string][] = [
  [/\bMM\b/g, 'MANGA CURTA'], [/\bM\/C\b/g, 'MANGA CURTA'], [/\bML\b/g, 'MANGA LONGA'], [/\bM\/L\b/g, 'MANGA LONGA'],
  [/\bAD\b/g, 'ADULTO'], [/\bEST\b/g, 'ESTAMPADO'], [/\bC\/\s*/g, 'COM '], [/\bS\/\s*/g, 'SEM '], [/\bINF\b/g, 'INFANTIL'],
  [/\bCALCA\b/g, 'CALÇA'], [/\bCALCAS\b/g, 'CALÇAS'], [/\bCALCADOS?\b/g, ''], [/\bSUTIA\b/g, 'SUTIÃ'], [/\bTRICOT\b/g, 'TRICÔ'],
  [/\bBASICA\b/g, 'BÁSICA'], [/\bBASICO\b/g, 'BÁSICO'], [/\bTERMICA\b/g, 'TÉRMICA'], [/\bALCA\b/g, 'ALÇA'], [/\bALCAS\b/g, 'ALÇAS'],
  [/\bBOTAO\b/g, 'BOTÃO'], [/\bLA\b/g, 'LÃ'], [/\bMACACAO\b/g, 'MACACÃO'], [/\bBLUSAO\b/g, 'BLUSÃO'], [/\bCETIM\b/g, 'CETIM'],
  [/\bTSHIRT\b/g, 'T-SHIRT'], [/\bVISCOSE\b/g, 'VISCOSE'], [/\bSARJA\b/g, 'SARJA'], [/\bAMARRACAO\b/g, 'AMARRAÇÃO'],
];

/**
 * Nome do produto novo a partir da descrição: sem o tamanho, sem códigos de fornecedor (CO4162, 07 2302 001…), sem
 * repetições, com as abreviações por extenso, gênero concordando com a peça e a cor no fim ("… - Preto"), que é como
 * o site junta as cores de um mesmo modelo.
 */
export function nomeDoProduto(l: Pick<LinhaPlanilha, 'descricao' | 'tamanho' | 'referencia' | 'corVisual' | 'codigoCor'>): string {
  let d = ` ${chaveTexto(l.descricao)} `;
  const tam = chaveTexto(l.tamanho);
  // Tamanho no fim ou entre barras/traços ("… / M", "… - P", "… M"); referência repetida na descrição.
  d = d.replace(new RegExp(`[\\s/\\-]+(TAM\\.?\\s*)?${tam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), ' ');
  if (l.referencia) d = d.split(chaveTexto(l.referencia)).join(' ');
  if (tam.length <= 3 && !/^\d+$/.test(tam)) d = d.replace(new RegExp(`\\s${tam}(?=\\s)`, 'g'), ' ');
  d = d.replace(/\bT\s?SHIRT\b/g, 'TSHIRT').replace(/\bM\.?\s+LONGA\b/g, 'ML').replace(/\bM\.?\s+CURTA\b/g, 'MM');
  d = d
    .replace(/\bREF\.?\s*\S+/g, ' ')
    .replace(/\b\d{2}\s\d{4}\s\d{3}\b/g, ' ') // VESTE: "07 2302 001"
    .replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b/g, ' ') // códigos alfanuméricos (CO4162, CAI23010919-0000PP)
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/\b[A-Z]{1,3}\d{1,2}\b/g, ' ') // códigos de cor curtos (ES2, CR2, SE8)
    .replace(/(^|\s)\d{2}(?=\s|$)/g, ' ')
    .replace(/\bTAMANHO:?\s*$/g, ' ')
    .replace(/\bTRIFIL\b|\bACOSTAMENTO\b|\bPECA UNICA\b/g, ' ')
    .replace(/\s+[-/]\s+/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [r, s] of ABREVIACOES) d = d.replace(r, s);
  // Repetição de trecho ("EST FLOR DE LANIKAI EST FLOR DE LANIKAI").
  d = d.replace(/\b(.{6,}?)\s+\1\b/g, '$1');
  // Gênero por extenso, concordando com a peça (camiseta → feminina; tênis → masculino).
  const pecaFeminina = /^(\s*)(CAMISETA|CAMISA|CALÇA|BLUSA|BERMUDA|SAIA|JAQUETA|REGATA|MEIA|CUECA|CALCINHA|BOLSA|SANDALIA|BLUSINHA|BATA|REGATA|POLO|T-SHIRT|JARDINEIRA|LEGGING|TOP)\b/.test(d);
  d = d.replace(/\bMASC(ULINO|ULINA)?\.?(?=\s|$)/g, pecaFeminina ? 'MASCULINA' : 'MASCULINO').replace(/\bFEM(ININO|ININA)?\.?(?=\s|$)/g, pecaFeminina ? 'FEMININA' : 'FEMININO');
  const cor = corDaLinha(l);
  let nome = titulo(d.replace(/\s+/g, ' ').trim());
  if (cor) {
    // A cor que já aparece no fim da descrição sai dali e vai para o sufixo.
    const fim = new RegExp(`\\s+${chaveTexto(cor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    nome = nome.replace(fim, '');
  }
  if (!nome) nome = 'Peça';
  return (cor ? `${nome} - ${cor}` : nome).slice(0, 160);
}

export type Genero = 'feminino' | 'masculino' | 'unissex';
export type Estacao = 'inverno' | 'verao';

/** Categoria do site pela primeira palavra da descrição (e algumas palavras-chave). Nome exato da tabela `categoria`. */
const CATEGORIAS: [RegExp, string][] = [
  [/\bPOLO\b/, 'Camisas Polo'],
  [/\b(CUECA|BOXER|SUNGA|SLIP)\b/, 'Cuecas'],
  [/\bCALCINHA/, 'Calcinhas'], [/\bSUTIA/, 'Sutiãs'], [/\bSEGUNDA PELE\b|\bCEROULA/, 'Roupas íntimas'], [/\bPIJAMA/, 'Pijamas'],
  [/^\s*(MEIA CALCA|MEIA|MEIAS)\b/, 'Meias'],
  [/^\s*KIT\b/, 'Kits'],
  [/^\s*(REGATA)\b|\bCAMISETA REGATA\b/, 'Regatas'],
  [/^\s*(CAMISETA|TSHIRT|T-SHIRT|BLUSINHA)\b/, 'Camisetas'],
  [/^\s*CAMISA\b/, 'Camisas'],
  [/^\s*(CALCA|SLIM|SKINNY|RIDER|WIDE|HOXIE|MALONE|CHICAGO|MOM|RETA|FLARE|JOGGER|101|505|JEANS|PANTALONA|ALFAIATARIA)\b/, 'Calças'],
  [/^\s*LEGGING/, 'Leggings'],
  [/^\s*BERMUDA/, 'Bermudas'], [/^\s*SHORTS?\b/, 'Shorts'], [/^\s*SAIA\b/, 'Saias'],
  [/^\s*(VESTIDOS?|CHEMISE)\b/, 'Vestidos'], [/^\s*(MACACAO|MACAQUINHO|JARDINEIRA)\b/, 'Macacões'],
  [/^\s*(BLUSAS?|CROPPED|BATA|TUNICA|CAMISETE)\b/, 'Blusas'],
  [/^\s*(TOP|BODY)\b/, 'Tops'],
  [/^\s*(JAQUETA|CORTA VENTO|PARKA|BOMBER)\b/, 'Jaquetas'], [/^\s*(CASACO|KABAN|SOBRETUDO|CASAQUETO|TRENCH)\b/, 'Casacos'],
  [/^\s*BLAZER/, 'Blazers'], [/^\s*COLETE/, 'Coletes'], [/^\s*(MOLETOM|BLUSAO)\b/, 'Moletons'],
  [/^\s*(TRICOT|TRICO|SUETER|CARDIGAN|PULLOVER|SUETER)\b/, 'Tricôs'],
  [/^\s*(CALCADOS|SANDALIA|TENIS|SAPATO|SAPATENIS|BOTA|CHINELO|RASTEIRA|MULE|SCARPIN|MOCASSIM)\b/, 'Calçados'],
  [/^\s*CINTO/, 'Cintos'], [/^\s*(BOLSA|MOCHILA|CARTEIRA|NECESSAIRE|PASTA)\b/, 'Bolsas'],
  [/^\s*(BONE|CHAPEU|VISEIRA)\b/, 'Bonés'], [/^\s*(GORRO|TOUCA)\b/, 'Gorros'], [/^\s*(LENCO|ECHARPE|CACHECOL|MANTA|PASHMINA)\b/, 'Lenços'],
  [/^\s*(ANEL|GARGANTILHA|COLAR|BRINCO|PULSEIRA|MAXI|OCULOS|RELOGIO|CHAVEIRO)\b/, 'Acessórios'],
  // Modelos de jeans pelo nome (Garra: "MARION PREMIUM STR SUPER ALTA RETA", "NEW STRAIGHT BLACK").
  [/\b(SKINNY|STRAIGHT|STRECH|STRETCH|PREMIUM STR|REGULAR FIT|SLIM FIT|SUPER SK|BOYFRIEND|BAGGY|CIGARRETE|PANTALONA)\b/, 'Calças'],
];

export function categoriaDaDescricao(descricao: string): string {
  const d = ` ${chaveTexto(descricao)}`.replace('T SHIRT', 'TSHIRT');
  return CATEGORIAS.find(([r]) => r.test(d))?.[1] ?? 'Outros';
}

const SO_FEMININAS = new Set(['Vestidos', 'Saias', 'Calcinhas', 'Sutiãs', 'Tops', 'Leggings', 'Macacões', 'Bolsas']);
const SO_MASCULINAS = new Set(['Cuecas']);

/** Gênero pela descrição (MASC/FEM), pela categoria ou, sem pista, unissex. */
export function generoDaDescricao(descricao: string, categoria: string): Genero {
  const d = ` ${chaveTexto(descricao)} `;
  if (/\bUNISSEX\b|\bUNISEX\b/.test(d)) return 'unissex';
  if (/\bMASC(ULINO|ULINA)?\b|\bMASC\./.test(d)) return 'masculino';
  if (/\bFEM(ININO|ININA)?\b|\bFEM\./.test(d)) return 'feminino';
  if (SO_FEMININAS.has(categoria)) return 'feminino';
  if (categoria === 'Calças' && /\b(ALTA|SKINNY|SUPER SK|MOM|FLARE|WIDE|PANTALONA|CIGARRETE|BOYFRIEND)\b/.test(d)) return 'feminino';
  if (SO_MASCULINAS.has(categoria)) return 'masculino';
  return 'unissex';
}

/** Estação pelo tipo de peça (a mesma regra do importador antigo); null quando não dá para saber. */
export function estacaoDaDescricao(descricao: string, categoria: string): Estacao | null {
  const t = semAcento(`${descricao} ${categoria}`).toLowerCase();
  if (/manga longa|\bml\b|moletom|tric[oô]|tricot|blusao|jaqueta|casaco|cardigan|sueter|gola alta|termic|colete|gorro|ceroula|flanel|kaban|\bla\b|veludo|segunda pele|meia calca/.test(t)) return 'inverno';
  if (/manga curta|\bmm\b|regata|short|bermuda|sunga|biquini|linho|\btop\b|cropped|vestido|saia|bata|camiseta|sandalia|rasteir/.test(t)) return 'verao';
  return null;
}

/** EAN válido (8 a 14 dígitos) ou null: a planilha às vezes traz códigos próprios no lugar ("5105LP"). */
export const eanDaLinha = (codigoBarras: string) => (/^\d{8,14}$/.test(codigoBarras.trim()) ? codigoBarras.trim() : null);

/** Estoque que o site pode vender: o da loja menos o que está em condicional e o reservado no e-commerce do sistema. */
export const estoqueDaLinha = (l: Pick<LinhaPlanilha, 'estoque' | 'condicional' | 'reservadoEc'>) => Math.max(0, l.estoque - l.condicional - l.reservadoEc);

/** Cor que separa produtos: o código de cor quando é código de verdade (Hering "N1007S"), senão a cor visual. */
const corDoAgrupamento = (l: Pick<LinhaPlanilha, 'codigoCor' | 'corVisual'>) => chaveTexto(/\d/.test(l.codigoCor) ? l.codigoCor : l.corVisual || l.codigoCor || '');

export type Grupo = { chave: string; fornecedor: string; referenciaBase: string; cor: string | null; linhas: LinhaPlanilha[] };

/**
 * Junta as linhas em produtos: fornecedor + referência (sem o tamanho) + cor. Nos fornecedores em que cada tamanho tem
 * uma referência própria (a maioria das referências aparece numa linha só), as linhas soltas com a mesma descrição
 * (sem o tamanho), a mesma cor e o mesmo preço também se juntam.
 */
export function agruparLinhas(linhas: LinhaPlanilha[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const base = referenciaBase(l.referencia, tamanhoDaPlanilha(l.tamanho));
    const cor = corDaLinha(l);
    const corChave = corDoAgrupamento(l);
    const chave = `${chaveTexto(l.fornecedor)}|${chaveTexto(base)}|${corChave}`;
    const g = grupos.get(chave) ?? { chave, fornecedor: l.fornecedor, referenciaBase: base, cor, linhas: [] };
    g.linhas.push(l);
    grupos.set(chave, g);
  }
  // Fornecedores com referência por tamanho.
  const porFornecedor = new Map<string, Grupo[]>();
  for (const g of grupos.values()) porFornecedor.set(g.fornecedor, [...(porFornecedor.get(g.fornecedor) ?? []), g]);
  const resultado: Grupo[] = [];
  for (const lista of porFornecedor.values()) {
    const soltos = lista.filter(g => g.linhas.length === 1);
    const referenciaPorTamanho = lista.length >= 3 && soltos.length / lista.length > 0.6;
    if (!referenciaPorTamanho) { resultado.push(...lista); continue; }
    const juntos = new Map<string, Grupo>();
    for (const g of lista) {
      if (g.linhas.length > 1) { resultado.push(g); continue; }
      const l = g.linhas[0];
      const tam = chaveTexto(l.tamanho).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const desc = ` ${chaveTexto(l.descricao)} `.replace(new RegExp(`\\s${tam}\\s`, 'g'), ' ').replace(/\s+/g, ' ').trim();
      const k = `${desc}|${corDoAgrupamento(l)}|${l.preco}`;
      const j = juntos.get(k);
      if (j) j.linhas.push(l);
      else juntos.set(k, { ...g, chave: `${g.chave}|d:${k}`, linhas: [l] });
    }
    resultado.push(...juntos.values());
  }
  return resultado;
}

/** Referência do produto novo no site (até 20 letras, única): a da planilha sem o tamanho e, se precisar, a cor. */
export function referenciaDoProduto(g: Grupo, ocupadas: Set<string>, precisaCor: boolean): string {
  const limpa = (t: string) => semAcento(t).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let base = limpa(g.referenciaBase) || limpa(g.linhas[0].codigo);
  if (precisaCor) base = `${base}${limpa(g.linhas[0].codigoCor || g.cor || '').slice(0, 6)}`;
  base = base.slice(0, 20);
  let ref = base, n = 2;
  while (ocupadas.has(ref)) { const s = String(n++); ref = `${base.slice(0, 20 - s.length)}${s}`; }
  ocupadas.add(ref);
  return ref;
}

/** Preço do produto: o mais comum entre os tamanhos (empate: o maior). */
export function precoDoGrupo(linhas: Pick<LinhaPlanilha, 'preco'>[]): number {
  const n = new Map<number, number>();
  for (const l of linhas) n.set(l.preco, (n.get(l.preco) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Lê as linhas de uma planilha já convertida em matriz (a primeira linha com os cabeçalhos). */
export function lerLinhas(matriz: unknown[][]): { linhas: LinhaPlanilha[]; erros: string[] } {
  const erros: string[] = [];
  const inicio = matriz.findIndex(r => r.some(c => String(c ?? '').trim() === 'Código') && r.some(c => String(c ?? '').trim() === 'Fornecedor'));
  if (inicio < 0) return { linhas: [], erros: [`Cabeçalho não encontrado. A planilha precisa das colunas: ${COLUNAS.join(', ')}.`] };
  const cab = matriz[inicio].map(c => String(c ?? '').trim());
  const faltam = COLUNAS.filter(c => !cab.includes(c));
  if (faltam.length) return { linhas: [], erros: [`Faltam colunas: ${faltam.join(', ')}.`] };
  const col = Object.fromEntries(COLUNAS.map(c => [c, cab.indexOf(c)])) as Record<(typeof COLUNAS)[number], number>;
  const texto = (v: unknown) => (v == null ? '' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v)).trim();
  const numero = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);
  const linhas: LinhaPlanilha[] = [];
  for (let i = inicio + 1; i < matriz.length; i++) {
    const r = matriz[i];
    const codigo = texto(r[col['Código']]);
    if (!codigo) continue;
    const l: LinhaPlanilha = {
      linha: i + 1, fornecedor: texto(r[col.Fornecedor]), codigo, referencia: texto(r[col['Refer.']]), codigoBarras: texto(r[col['Cód. Barras']]),
      descricao: texto(r[col['Descrição']]), tamanho: texto(r[col['Tam.']]), codigoCor: texto(r[col['Cód. Cor']]), corVisual: texto(r[col['Cor Visual']]),
      estoque: Math.round(numero(r[col['Estoq.']])), condicional: Math.round(numero(r[col['Cond.']])), reservadoEc: Math.round(numero(r[col['Res. EC']])),
      preco: Math.round(numero(r[col['Preço Venda']]) * 100) / 100,
    };
    if (!l.descricao) erros.push(`Linha ${l.linha}: sem descrição.`);
    else linhas.push(l);
  }
  return { linhas, erros };
}

/** Marca e se a importação ignora o fornecedor (tecidos, aviamentos). Editável na página de importação. */
export type RegraFornecedor = { marca: string; ignorar: boolean };
export type RegrasFornecedores = Record<string, RegraFornecedor>;

const MARCAS_CONHECIDAS: [RegExp, string][] = [
  [/HERING/, 'Hering'], [/VESTE S\.?A/, 'John John'], [/D\s?CERUTTI/, "D'Cerutti"], [/PASQUINI|RANDALL/, 'Acostamento'],
];
const IGNORADOS: RegExp = /AVIAMENTOS|LUNELLI TEXTIL/;

/** Sugestão para um fornecedor ainda sem regra: marca conhecida ou o nome fantasia (sem LTDA, EIRELI…). */
export function regraPadrao(fornecedor: string): RegraFornecedor {
  const f = chaveTexto(fornecedor);
  const conhecida = MARCAS_CONHECIDAS.find(([r]) => r.test(f))?.[1];
  const limpo = f
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(LTDA|S\.?\s?A|EIRELI|ME|EPP|CIA|IND(USTRIA)?|COM(ERCIO)?|E|DE|DO|DA|FABRICACAO|CONFECCOES|VESTUARIO|DISTRIBUIDORA|TEXTIL|ARTIGOS|COURO|CALCADOS|ACESS|FILIAL)\b\.?/g, ' ')
    .replace(/&|\d+/g, ' ').replace(/\s+/g, ' ').trim();
  return { marca: conhecida ?? (titulo(limpo || f).slice(0, 40)), ignorar: IGNORADOS.test(f) };
}

const CATEGORIAS_INTIMAS = new Set(['Cuecas', 'Calcinhas', 'Sutiãs', 'Roupas íntimas', 'Pijamas', 'Meias']);

/** Marca do produto novo: a do fornecedor; peças íntimas da Hering vão para a Hering Intimates. */
export const marcaDoProduto = (marcaFornecedor: string, categoria: string) =>
  marcaFornecedor === 'Hering' && CATEGORIAS_INTIMAS.has(categoria) ? 'Hering Intimates' : marcaFornecedor;
