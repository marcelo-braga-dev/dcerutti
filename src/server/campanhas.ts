import 'server-only';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { lerConfig } from './config';
import { COM_ALVOS, nomesDosAlvos, regraDe } from './consultas/cupons';
import { fichasDaPessoa } from './cupons';
import { regraEmPalavras } from '@/lib/cupom';
import { diaDe, fimDoDia, inicioDoDia } from '@/lib/datas';

/**
 * Campanhas de cupom (docs/20-cupons.md, fase 4).
 * - Primeira compra: um cupom comum de origem `primeiraCompra` (código público, só primeira compra, prazo após o cadastro).
 * - Próxima compra: um cupom **modelo** (nunca aplicado) com o desconto; cada venda que se encaixa gera, a partir dele,
 *   um cupom pessoal de uso único para a cliente. Quando gerar e por quanto tempo vale ficam em `Config.proximaCompra`.
 */
type Tx = Prisma.TransactionClient;

export const CODIGO_MODELO_PROXIMA = 'MODELO-PROXIMA-COMPRA';
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L: o código é ditado e digitado
const codigoPessoal = () => `VOLTA-${Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join('')}`;
const somarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * 864e5);

export type CupomGerado = { codigo: string; regra: string; inicioEm: Date; fimEm: Date };

/**
 * Na confirmação da venda (mesma transação): gera o cupom de próxima compra, se a campanha estiver ligada e a venda se
 * encaixar. Não gera: abaixo do mínimo, venda com cupom (salvo "gera com cupom") ou, sem "acumular", se a cliente já
 * tem um cupom de próxima compra válido e não usado.
 */
export async function gerarCupomProximaCompra(tx: Tx, p: { pedidoId: string; clienteId: string; valorVenda: number; tinhaCupom: boolean }): Promise<CupomGerado | null> {
  const cfg = await lerConfig();
  if (!cfg.cupons.ligados) return null;
  const regras = cfg.proximaCompra;
  const modelo = await tx.cupom.findFirst({ where: { origem: 'proximaCompra', modelo: true, ativo: true }, include: COM_ALVOS });
  if (!modelo || p.valorVenda < regras.minimoParaGerar || (p.tinhaCupom && !regras.geraComCupom)) return null;
  // Venda sem identificar a cliente (ficha "Consumidor final" do caixa, D-23) ou ficha anonimizada: não há pessoa para receber.
  const ficha = await tx.cliente.findUnique({ where: { id: p.clienteId }, select: { telefone: true } });
  if (!ficha?.telefone) return null;

  const fichas = await fichasDaPessoa(tx, p.clienteId);
  if (!regras.acumula) {
    const agora = new Date();
    const pendente = await tx.cupom.findFirst({
      where: {
        origem: 'proximaCompra', modelo: false, ativo: true, clientes: { some: { clienteId: { in: fichas } } },
        OR: [{ fimEm: null }, { fimEm: { gte: agora } }], pedidos: { none: { status: { not: 'cancelado' } } },
      },
      select: { id: true },
    });
    if (pendente) return null;
  }

  const hoje = new Date();
  const inicioEm = inicioDoDia(diaDe(somarDias(hoje, regras.diasParaComecar)));
  const fimEm = fimDoDia(diaDe(somarDias(hoje, regras.diasParaComecar + regras.diasValidade)));
  const dados = {
    tipo: modelo.tipo, valor: modelo.valor, tetoDesconto: modelo.tetoDesconto, minimoCompra: modelo.minimoCompra,
    valePromocao: modelo.valePromocao, quemAplica: modelo.quemAplica, descricao: 'Cupom de próxima compra',
    inicioEm, fimEm, limiteTotal: 1, limitePorCliente: 1, ativo: true,
    origem: 'proximaCompra' as const, modeloId: modelo.id, pedidoOrigemId: p.pedidoId,
    categorias: { create: modelo.categorias.map(x => ({ categoriaId: x.categoria.id })) },
    marcas: { create: modelo.marcas.map(x => ({ marcaId: x.marca.id })) },
    produtos: { create: modelo.produtos.map(x => ({ produtoId: x.produto.id })) },
    clientes: { create: [{ clienteId: p.clienteId }] },
  };
  // Código aleatório: em caso raro de repetido, tenta outro (a unicidade é do banco).
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = codigoPessoal();
    if (await tx.cupom.findUnique({ where: { codigo }, select: { id: true } })) continue;
    const c = await tx.cupom.create({ data: { ...dados, codigo }, include: COM_ALVOS });
    return { codigo, regra: regraEmPalavras(regraDe(c), nomesDosAlvos(c)), inicioEm, fimEm };
  }
  return null;
}
