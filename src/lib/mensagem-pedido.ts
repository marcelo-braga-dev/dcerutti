/**
 * Mensagem do pedido que a cliente envia ao vendedor pelo WhatsApp (sacola → "Enviar pedido no WhatsApp").
 * Lógica pura: o servidor monta a mensagem gravada no link e a sacola mostra a mesma prévia antes do envio.
 *
 * Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~. Textos que vêm do cadastro (nome da peça, cor, nome da
 * cliente) passam por `textoSeguro`, para um asterisco no nome não quebrar o negrito da mensagem inteira.
 *
 * Tamanho: o link do WhatsApp leva a mensagem inteira. Pedidos grandes caem para um formato mais curto (sem os links das
 * fotos, depois uma linha por peça), sempre com os totais e o link do pedido, que tem tudo.
 */
import { brl } from './dinheiro';
import { TZ } from './datas';
import { imagemGrande, type ItemMensagem } from './whatsapp';

export type FormatoMensagem = 'completo' | 'compacto' | 'resumido';

export type DadosMensagemPedido = {
  tipo: 'compra' | 'condicional';
  /** Código do pedido; na prévia da sacola, antes de gravar, vai um marcador. */
  codigo: string;
  itens: ItemMensagem[];
  nomeCliente: string;
  /** Quem recebe: o vendedor da cliente; null = WhatsApp da loja. */
  nomeVendedor?: string | null;
  cep?: string | null;
  cidadeCondicional?: string;
  /** Frete da compra (0 = grátis). null ou ausente = a combinar. */
  frete?: number | null;
  cupom?: { codigo: string; desconto: number; freteGratis: boolean } | null;
  /** Endereço do site: fotos guardadas no servidor viram link completo. */
  site?: string;
  /** Link do pedido no painel, para o vendedor abrir direto. */
  linkPedido?: string | null;
  /**
   * Link público do pedido (D-20). Vai como primeiro link da mensagem: o WhatsApp mostra a prévia dele, o cartão com as
   * fotos das peças. Com ele, os links das fotos de cada peça saem da mensagem (estão no cartão e na página).
   */
  linkPublico?: string | null;
  /** Hora do envio (saudação). */
  agora?: Date;
  /** Máximo de caracteres antes de compactar. */
  limite?: number;
};

export const LIMITE_MENSAGEM = 3500;
const SEPARADOR = '━━━━━━━━━━━━━━━';

/** Remove o que o WhatsApp entende como marcação e junta espaços e quebras de linha. */
export function textoSeguro(s: string | null | undefined, max = 80) {
  const t = String(s ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const primeiroNome = (n: string | null | undefined) => textoSeguro(n, 40).split(' ')[0] ?? '';

/** "Bom dia", "Boa tarde" ou "Boa noite" no fuso de São Paulo. */
export function saudacao(agora = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(agora));
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Valores do pedido, iguais aos da sacola e do servidor. */
export function totaisDaMensagem(d: Pick<DadosMensagemPedido, 'tipo' | 'itens' | 'frete' | 'cupom'>) {
  const pecas = d.itens.reduce((a, i) => a + i.quantidade, 0);
  const subtotal = centavos(d.itens.reduce((a, i) => a + i.preco * i.quantidade, 0));
  const desconto = centavos(d.cupom && !d.cupom.freteGratis ? d.cupom.desconto : 0);
  const frete = d.tipo === 'compra' && d.frete != null ? d.frete : null;
  const total = centavos(subtotal - desconto + (frete ?? 0));
  return { pecas, subtotal, desconto, frete, total };
}

function linhasDoItem(i: ItemMensagem, n: number, formato: FormatoMensagem, site?: string, comFoto = true) {
  const nome = textoSeguro(i.nome, formato === 'resumido' ? 48 : 80);
  const cor = textoSeguro(i.cor, 30);
  const valor = `${i.quantidade} × ${brl(i.preco)}${i.quantidade > 1 ? ` = *${brl(i.preco * i.quantidade)}*` : ''}`;
  if (formato === 'resumido') return [`${n}. ${nome} · Tam. ${i.tamanho} · ${i.quantidade}× ${brl(i.preco)}`];
  const detalhes = [`Tam. *${textoSeguro(i.tamanho, 8)}*`, cor, textoSeguro(i.marca, 30)].filter(Boolean).join(' · ');
  const codigos = [`Ref. ${textoSeguro(i.referencia, 20)}`, i.codigoInterno ? `Cód. ${textoSeguro(i.codigoInterno, 20)}` : ''].filter(Boolean).join(' · ');
  if (formato === 'compacto') return [`*${n}. ${nome}*`, `${detalhes} · ${codigos}`, `${i.quantidade > 1 ? valor : `*${brl(i.preco)}*`}`];
  return [
    `*${n}. ${nome}*`,
    detalhes,
    codigos,
    i.quantidade > 1 ? valor : `*${brl(i.preco)}*`,
    ...(i.imagem && comFoto ? [`📷 ${imagemGrande(i.imagem, site)}`] : []),
  ];
}

function montar(d: DadosMensagemPedido, formato: FormatoMensagem) {
  const condicional = d.tipo === 'condicional';
  const t = totaisDaMensagem(d);
  const cliente = textoSeguro(d.nomeCliente, 60);
  const vendedor = primeiroNome(d.nomeVendedor);
  const pecas = `${t.pecas} ${t.pecas === 1 ? 'peça' : 'peças'}`;

  const abertura = [
    `${saudacao(d.agora)}, ${vendedor || 'equipe D’Cerutti'}! 👋`,
    condicional
      ? `Aqui é ${primeiroNome(d.nomeCliente)}. Separei algumas peças no catálogo da D’Cerutti para provar em casa:`
      : `Aqui é ${primeiroNome(d.nomeCliente)}. Acabei de fazer um pedido pelo catálogo da D’Cerutti:`,
  ];

  const titulo = condicional ? `🏠 *CONDICIONAL ${d.codigo}*` : `🛍️ *PEDIDO ${d.codigo}*`;
  const itens = d.itens.map((i, n) => linhasDoItem(i, n + 1, formato, d.site, !d.linkPublico));
  const blocoItens = formato === 'resumido' ? itens.flat().join('\n') : itens.map(l => l.join('\n')).join('\n\n');

  const resumo: string[] = [`🧾 *Resumo · ${pecas}*`];
  if (condicional) {
    if (t.desconto) resumo.push(`Peças: ${brl(t.subtotal)}`, `🎟️ Cupom ${textoSeguro(d.cupom!.codigo, 30)} (sobre o que ficar): −${brl(t.desconto)}`);
    resumo.push(`💳 *Valor das peças: ${brl(t.subtotal - t.desconto)}*`);
  } else {
    resumo.push(`Peças: ${brl(t.subtotal)}`);
    if (t.desconto) resumo.push(`🎟️ Cupom ${textoSeguro(d.cupom!.codigo, 30)}: −${brl(t.desconto)}`);
    resumo.push(
      t.frete == null ? '🚚 Frete: a combinar'
        : t.frete === 0 ? `🚚 Frete: grátis${d.cupom?.freteGratis ? ` (cupom ${textoSeguro(d.cupom.codigo, 30)})` : ''}`
          : `🚚 Frete: ${brl(t.frete)}`,
    );
    resumo.push(`💳 *Total: ${brl(t.total)}${t.frete == null ? ' + frete' : ''}*`);
  }

  const entrega = condicional
    ? [
        `📍 Entrega: CEP ${textoSeguro(d.cep, 10)}${d.cidadeCondicional ? ` · ${textoSeguro(d.cidadeCondicional, 40)}` : ''}`,
        '✨ Provo com calma e fico só com o que gostar.',
      ]
    : ['📦 Pagamento e entrega: combinamos por aqui.'];

  const dados = [
    `👤 ${cliente}`,
    ...(d.linkPedido
      ? [d.linkPublico ? `🔐 No painel da loja: ${d.linkPedido}` : `🔗 Pedido completo${formato === 'completo' ? '' : ', com as fotos'}: ${d.linkPedido}`]
      : []),
  ];

  const fecho = condicional ? 'Qual o melhor dia e horário para a entrega? Fico no aguardo!' : 'Você confirma as peças para mim? Fico no aguardo!';

  const cabecalho = d.linkPublico ? [titulo, `🖼️ Fotos e detalhes: ${d.linkPublico}`] : [titulo];
  return [abertura.join('\n'), [...cabecalho, SEPARADOR, blocoItens, SEPARADOR].join('\n'), resumo.join('\n'), [...entrega, ...dados].join('\n'), fecho].join('\n\n');
}

/**
 * Monta a mensagem no formato mais completo que cabe no limite. Sem formato que caiba (pedido enorme), vai o resumido:
 * o WhatsApp aceita, e o link do pedido leva ao detalhe.
 */
export function montarMensagemPedido(d: DadosMensagemPedido): { texto: string; formato: FormatoMensagem } {
  const limite = d.limite ?? LIMITE_MENSAGEM;
  for (const formato of ['completo', 'compacto'] as const) {
    const texto = montar(d, formato);
    if (texto.length <= limite) return { texto, formato };
  }
  return { texto: montar(d, 'resumido'), formato: 'resumido' };
}

/** Atalho: só o texto. */
export const mensagemDoCliente = (d: DadosMensagemPedido) => montarMensagemPedido(d).texto;
