import { brl } from './dinheiro';
import { numeroWhatsApp } from './telefone';

export type ItemMensagem = {
  nome: string;
  marca: string;
  referencia: string;
  tamanho: string;
  cor?: string | null;
  codigoInterno?: string | null;
  quantidade: number;
  preco: number;
  imagem?: string | null;
};

export const linkWhatsApp = (telefone: string, texto: string) =>
  `https://wa.me/${numeroWhatsApp(telefone)}?text=${encodeURIComponent(texto)}`;

/**
 * Link da foto para quem abrir a mensagem no WhatsApp. Foto do servidor (/arquivos/...) ganha o endereço do site;
 * link antigo da Hering vai na versão grande (o tamanho está no caminho).
 */
export const imagemGrande = (url: string, site = '') => (url.startsWith('/') ? `${site}${url}` : url.replace('-600-800/', '-1200-1600/'));

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? '';

/** Mensagem que o cliente envia ao vendedor ao fechar a sacola. */
export function mensagemDoCliente(p: {
  tipo: 'compra' | 'condicional';
  codigo: string;
  itens: ItemMensagem[];
  nomeCliente: string;
  cep?: string | null;
  cidadeCondicional?: string;
  freteTexto?: string;
  /** Endereço do site, para links de fotos guardadas no servidor. */
  site?: string;
}) {
  const total = p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const pecas = p.itens.reduce((a, i) => a + i.quantidade, 0);
  const cabecalho =
    p.tipo === 'condicional'
      ? `*CONDICIONAL ${p.codigo}*\nQuero provar em casa estas peças:`
      : `*PEDIDO ${p.codigo}*\nQuero comprar estas peças:`;
  const itens = p.itens
    .map(
      (i, n) =>
        `${n + 1}. ${i.nome}\n   ${i.marca} · Ref. ${i.referencia} · Tam. ${i.tamanho}${i.cor ? ` · ${i.cor}` : ''}` +
        (i.codigoInterno ? `\n   Cód. interno: ${i.codigoInterno}` : '') +
        `\n   ${i.quantidade} x ${brl(i.preco)} = *${brl(i.preco * i.quantidade)}*` +
        (i.imagem ? `\n   ${imagemGrande(i.imagem, p.site)}` : ''),
    )
    .join('\n\n');
  const rodape =
    p.tipo === 'condicional'
      ? `Valor das peças: *${brl(total)}*\nCEP: ${p.cep ?? ''}${p.cidadeCondicional ? ` (${p.cidadeCondicional})` : ''}`
      : `Total: *${brl(total)}*\n${p.freteTexto ?? 'Pagamento e entrega: a combinar'}`;
  return `${cabecalho}\n\n${itens}\n\nTotal de peças: ${pecas}\n${rodape}\n\nNome: ${p.nomeCliente.trim()}`;
}

/** Mensagem que o vendedor envia ao cliente com a seleção de peças. */
export function mensagemDoVendedor(p: { codigo: string; itens: ItemMensagem[]; nomeCliente: string; nomeVendedor: string }) {
  const total = p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const itens = p.itens
    .map(
      (i, n) =>
        `${n + 1}. ${i.nome}\n   Tam. ${i.tamanho}${i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''} · ${i.quantidade} x ${brl(i.preco)} = *${brl(i.preco * i.quantidade)}*`,
    )
    .join('\n\n');
  return (
    `Olá, ${primeiroNome(p.nomeCliente)}! Aqui é ${primeiroNome(p.nomeVendedor)}, da D’Cerutti. ` +
    `Separei estas peças para você (*${p.codigo}*):\n\n${itens}\n\nTotal: *${brl(total)}*\n` +
    'Me confirma que posso fechar? Pagamento e entrega combinamos por aqui.'
  );
}

export const mensagemContato = (nomeCliente: string, tipo: 'compra' | 'condicional', codigo: string) =>
  `Olá, ${primeiroNome(nomeCliente)}! Aqui é da D’Cerutti, sobre o ${tipo === 'condicional' ? 'condicional' : 'pedido'} ${codigo}.`;

export const mensagemConvite = (nomeVendedor: string, link: string) =>
  `Olá! Aqui é ${primeiroNome(nomeVendedor)}, da D’Cerutti. Crie sua conta pelo meu link e veja a coleção Hering com estoque pronto: ${link}`;
