import { brl } from './dinheiro';
import { numeroWhatsApp } from './telefone';
import { nomeDaLoja } from './loja';

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

/**
 * Link que abre a conversa com o texto pronto. Usa api.whatsapp.com/send e não wa.me: o redirecionamento do wa.me
 * troca os emojis por "�" no computador (conferido em 15/10/2026); o api.whatsapp.com/send preserva o texto e também
 * abre o aplicativo no celular.
 */
export const linkWhatsApp = (telefone: string, texto: string) =>
  `https://api.whatsapp.com/send?phone=${numeroWhatsApp(telefone)}&text=${encodeURIComponent(texto)}`;

/** Compartilhar sem número (a pessoa escolhe o contato): convite, cupom. */
export const linkCompartilharWhatsApp = (texto: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

/**
 * Link da foto para quem abrir a mensagem no WhatsApp. Foto do servidor (/arquivos/...) ganha o endereço do site;
 * link antigo da Hering vai na versão grande (o tamanho está no caminho).
 */
export const imagemGrande = (url: string, site = '') => (url.startsWith('/') ? `${site}${url}` : url.replace('-600-800/', '-1200-1600/'));

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? '';

// A mensagem que a cliente envia ao fechar a sacola fica em mensagem-pedido.ts.

/** Mensagem que o vendedor envia ao cliente com a seleção de peças. */
export function mensagemDoVendedor(p: {
  codigo: string; itens: ItemMensagem[]; nomeCliente: string; nomeVendedor: string; condicional?: boolean;
  cupom?: { codigo: string; desconto: number; freteGratis: boolean } | null;
}) {
  const bruto = p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const total = Math.round((bruto - (p.cupom?.desconto ?? 0)) * 100) / 100;
  const cupom = !p.cupom ? '' : p.cupom.freteGratis ? `Cupom ${p.cupom.codigo}: frete grátis\n` : `Peças: ${brl(bruto)}\nCupom ${p.cupom.codigo}: −${brl(p.cupom.desconto)}\n`;
  const itens = p.itens
    .map(
      (i, n) =>
        `${n + 1}. ${i.nome}\n   Tam. ${i.tamanho}${i.codigoInterno ? ` · Cód. ${i.codigoInterno}` : ''} · ${i.quantidade} x ${brl(i.preco)} = *${brl(i.preco * i.quantidade)}*`,
    )
    .join('\n\n');
  return (
    `Olá, ${primeiroNome(p.nomeCliente)}! Aqui é ${primeiroNome(p.nomeVendedor)}, da ${nomeDaLoja()}. ` +
    (p.condicional
      ? `Separei estas peças para você provar em casa (*${p.codigo}*):\n\n${itens}\n\n${cupom}Valor das peças: *${brl(total)}*\n` +
        'Você fica só com o que gostar e devolve o resto. Me confirma o melhor horário para a entrega?'
      : `Separei estas peças para você (*${p.codigo}*):\n\n${itens}\n\n${cupom}Total: *${brl(total)}*\n` +
        'Me confirma que posso fechar? Pagamento e entrega combinamos por aqui.')
  );
}

/** Pedido alterado pelo vendedor (U-08): as peças como ficaram, com o desconto de cada uma. */
export function mensagemPedidoAlterado(p: {
  codigo: string; itens: (ItemMensagem & { precoTabela?: number | null })[]; nomeCliente: string; nomeVendedor: string; condicional: boolean; frete: number | null;
  cupom?: { codigo: string; desconto: number; freteGratis: boolean } | null;
}) {
  const bruto = p.itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const pecas = Math.round((bruto - (p.cupom?.desconto ?? 0)) * 100) / 100;
  const linhaCupom = !p.cupom ? '' : p.cupom.freteGratis ? `Cupom ${p.cupom.codigo}: frete grátis\n` : `Peças: ${brl(bruto)}\nCupom ${p.cupom.codigo}: −${brl(p.cupom.desconto)}\n`;
  const itens = p.itens
    .map((i, n) => {
      const de = i.precoTabela != null && i.precoTabela > i.preco ? `~${brl(i.precoTabela)}~ ` : '';
      return `${n + 1}. ${i.nome}${i.cor ? ` · ${i.cor}` : ''}\n   Tam. ${i.tamanho} · ${i.quantidade} x ${de}${brl(i.preco)} = *${brl(i.preco * i.quantidade)}*`;
    })
    .join('\n\n');
  const total = linhaCupom + (p.condicional ? `Valor das peças: *${brl(pecas)}*` : p.frete ? `${p.cupom && !p.cupom.freteGratis ? '' : `Peças: ${brl(pecas)}\n`}Frete: ${brl(p.frete)}\nTotal: *${brl(pecas + p.frete)}*` : `Total: *${brl(pecas)}*`);
  return (
    `Olá, ${primeiroNome(p.nomeCliente)}! Aqui é ${primeiroNome(p.nomeVendedor)}, da ${nomeDaLoja()}. ` +
    `Atualizei ${p.condicional ? 'o seu condicional' : 'o seu pedido'} *${p.codigo}* como combinamos:\n\n${itens}\n\n${total}\n` +
    'Confere se está tudo certo para mim?'
  );
}

/** Cupom de próxima compra gerado na venda (fase 4 dos cupons), para o vendedor mandar à cliente. */
export function mensagemCupomProximaCompra(p: { nomeCliente: string; nomeVendedor: string; codigo: string; regra: string; inicio: string; fim: string; link: string | null }) {
  return (
    `Olá, ${primeiroNome(p.nomeCliente)}! Aqui é ${primeiroNome(p.nomeVendedor)}, da ${nomeDaLoja()}. Obrigada pela compra! 💛\n\n` +
    `Na sua próxima compra, use o cupom *${p.codigo}*: ${p.regra}.\nVale de ${p.inicio} a ${p.fim}.` +
    (p.link ? `\n\nÉ só usar na sacola do site: ${p.link}` : '\n\nMe chama aqui que eu aplico no seu pedido.')
  );
}

export const mensagemContato = (nomeCliente: string, tipo: 'compra' | 'condicional', codigo: string) =>
  `Olá, ${primeiroNome(nomeCliente)}! Aqui é da ${nomeDaLoja()}, sobre o ${tipo === 'condicional' ? 'condicional' : 'pedido'} ${codigo}.`;

export const mensagemConvite = (nomeVendedor: string, link: string) =>
  `Olá! Aqui é ${primeiroNome(nomeVendedor)}, da ${nomeDaLoja()}. Crie sua conta pelo meu link e veja a coleção Hering com estoque pronto: ${link}`;
