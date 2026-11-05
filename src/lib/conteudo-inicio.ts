/**
 * Conteúdo editável da página inicial (editor visual, /editar/inicio). Só os textos e as fotos que o gestor mudou
 * ficam gravados (chave `inicio` da tabela `configuracao`); o resto segue o padrão abaixo.
 *
 * Nos textos, {cidade} vira a cidade do condicional, {frete} a regra de frete e {parcelas} o número de parcelas.
 */
export type ConteudoInicio = {
  textos: Record<string, string>;
  /** Foto escolhida pelo gestor em cada espaço; sem ela, a foto automática (das peças do catálogo). */
  imagens: Record<string, string>;
  /** Seções escondidas da página. */
  ocultas: string[];
};

export const CONTEUDO_INICIO_VAZIO: ConteudoInicio = { textos: {}, imagens: {}, ocultas: [] };

export const TEXTOS_INICIO = {
  'banner.selo': 'Estoque pronto em {cidade} (SC)',
  'banner.titulo': 'O básico',
  'banner.destaque': 'aconchego',
  'banner.texto': 'Peças Hering e John John para o dia a dia. Monte sua sacola, envie pelo WhatsApp e, em {cidade}, prove em casa antes de pagar.',
  'banner.botao1': 'Ver novidades',
  'banner.botao2': 'Promoções',
  'banner.feminino': 'Feminino',
  'banner.masculino': 'Masculino',
  'banner.novidades': 'Novidades',
  'confianca.1.titulo': 'Prove em casa',
  'confianca.1.texto': 'Condicional em {cidade}: pague só o que ficar.',
  'confianca.2.titulo': 'Atendimento humano',
  'confianca.2.texto': 'Uma pessoa da loja cuida do seu pedido no WhatsApp.',
  'confianca.3.titulo': 'Peças originais',
  'confianca.3.texto': 'Hering, Hering Sports, Intimates e John John.',
  'confianca.4.titulo': 'Pronta-entrega',
  'confianca.4.texto': '{frete}',
  'categorias.sobre': 'Comece por aqui',
  'categorias.titulo': 'Compre por categoria',
  'novidades.sobre': 'Acabou de chegar',
  'novidades.titulo': 'Novidades',
  'ofertas.imperdivel.sobre': 'Preço de ocasião',
  'ofertas.imperdivel.titulo': 'Imperdível',
  'ofertas.imperdivel.texto': 'Peças selecionadas com o menor preço da loja. Quando acabam, não voltam.',
  'ofertas.promocoes.sobre': 'Por tempo limitado',
  'ofertas.promocoes.titulo': 'Promoções',
  'ofertas.promocoes.texto': 'Modelos com desconto, com o estoque pronto para você.',
  'ofertas.botao': 'Aproveitar',
  'imperdivel.sobre': 'Preço de ocasião',
  'imperdivel.titulo': 'Imperdível',
  'condicional.sobre': 'Condicional em {cidade}',
  'condicional.titulo': 'Prove em casa,',
  'condicional.destaque': 'pague só o que ficar',
  'condicional.texto': 'Escolha as peças, receba em casa e devolva o que não servir. Sem pressa e sem custo para provar.',
  'condicional.botao': 'Montar minha sacola',
  'condicional.1.titulo': 'Monte sua sacola',
  'condicional.1.texto': 'Escolha as peças e os tamanhos no catálogo.',
  'condicional.2.titulo': 'Envie pelo WhatsApp',
  'condicional.2.texto': 'A mensagem vai pronta para quem te atende.',
  'condicional.3.titulo': 'Receba e prove',
  'condicional.3.texto': 'Experimente com calma, no seu tempo.',
  'condicional.4.titulo': 'Pague só o que ficar',
  'condicional.4.texto': 'O resto volta para a loja, sem custo.',
  'promocoes.sobre': 'Por tempo limitado',
  'promocoes.titulo': 'Promoções',
  'precos.sobre': 'Cabe no bolso',
  'precos.titulo': 'Compre por preço',
  'marcas.sobre': 'Originais',
  'marcas.titulo': 'Marcas da loja',
} as const;

export type CampoTexto = keyof typeof TEXTOS_INICIO;

/** Espaços de foto que o gestor pode trocar. */
export const IMAGENS_INICIO = {
  'banner.feminino': 'Foto de Feminino',
  'banner.masculino': 'Foto de Masculino',
  'banner.novidades': 'Foto de Novidades',
} as const;

export type CampoImagem = keyof typeof IMAGENS_INICIO;

/** Seções que podem ser escondidas, na ordem da página. */
export const SECOES_INICIO = {
  confianca: 'Vantagens da loja',
  categorias: 'Compre por categoria',
  novidades: 'Novidades',
  ofertas: 'Faixas de ofertas',
  imperdivel: 'Imperdível',
  condicional: 'Prove em casa',
  promocoes: 'Promoções',
  precos: 'Compre por preço',
  marcas: 'Marcas da loja',
} as const;

export type Secao = keyof typeof SECOES_INICIO;

export const LIMITE_TEXTO = 300;

export const textoBruto = (c: ConteudoInicio, campo: CampoTexto) => c.textos[campo] ?? TEXTOS_INICIO[campo];

/** Troca {cidade}, {frete} e {parcelas} pelos valores da loja. */
export const preencher = (texto: string, vars: Record<string, string>) => texto.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** Junta o que veio do editor com o padrão e guarda só o que é diferente dele (texto vazio volta ao padrão). */
export function normalizarConteudo(c: ConteudoInicio): ConteudoInicio {
  const textos: Record<string, string> = {};
  for (const campo of Object.keys(TEXTOS_INICIO) as CampoTexto[]) {
    const v = c.textos[campo]?.replace(/\s+/g, ' ').trim();
    if (v && v !== TEXTOS_INICIO[campo]) textos[campo] = v.slice(0, LIMITE_TEXTO);
  }
  const imagens: Record<string, string> = {};
  for (const campo of Object.keys(IMAGENS_INICIO)) if (c.imagens[campo]) imagens[campo] = c.imagens[campo];
  const ocultas = (Object.keys(SECOES_INICIO) as Secao[]).filter(s => c.ocultas.includes(s));
  return { textos, imagens, ocultas };
}
