/** Pagamento online (docs/27): regras puras e a assinatura dos avisos do Mercado Pago. */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  descreverMeio, ehAtiva, ehPaga, formaDoMeio, lerValorMp, mensagemLinkPagamento, podeMudar, tempoRestante, traduzirStatusMp, valorACobrar, valorMp,
  type StatusCobranca,
} from '@/lib/pagamento';
import { assinarAviso, horarioDoAviso, lerCabecalhoAssinatura, manifesto, validarAssinatura } from '@/server/pagamentos/assinatura';
import { chaveDoPagamento, chaveDoPedido, codigoDaChave, codigoDaChavePagamento, linkDePagamento } from '@/server/link-pedido';
import { brl } from '@/lib/dinheiro';

describe('situação do Mercado Pago (API Orders) → cobrança', () => {
  it.each([
    ['created', 'created', 'pendente'],
    ['action_required', 'waiting_transfer', 'pendente'],
    ['action_required', 'waiting_retry', 'pendente'],
    ['processing', 'in_process', 'pendente'],
    ['processed', 'accredited', 'aprovada'],
    ['processed', 'partially_refunded', 'estornada_parcial'],
    ['refunded', 'refunded', 'estornada'],
    ['canceled', 'canceled', 'cancelada'],
    ['canceled', 'canceled_transaction', 'cancelada'],
    ['canceled', 'expired', 'expirada'],
    ['failed', 'expired', 'expirada'],
    ['failed', 'failed', 'recusada'],
    ['charged_back', 'in_process', 'contestada'],
    ['charged_back', 'settled', 'contestada'],
    ['charged_back', 'reimbursed', 'aprovada'],
    ['', '', 'pendente'],
  ])('%s / %s → %s', (s, d, esperado) => expect(traduzirStatusMp(s, d)).toBe(esperado));
});

describe('ordem das mudanças', () => {
  const todos: StatusCobranca[] = ['criada', 'pendente', 'aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'];
  it('a mesma situação sempre pode (idempotente)', () => { for (const s of todos) expect(podeMudar(s, s)).toBe(true); });
  it('nunca volta a criada ou pendente depois de pago, vencido ou cancelado', () => {
    for (const s of ['aprovada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'] as StatusCobranca[]) {
      expect(podeMudar(s, 'criada')).toBe(false);
      expect(podeMudar(s, 'pendente')).toBe(false);
    }
  });
  it('pago no último segundo vence o vencido/cancelado; estorno total é final', () => {
    expect(podeMudar('expirada', 'aprovada')).toBe(true);
    expect(podeMudar('cancelada', 'aprovada')).toBe(true);
    for (const s of todos.filter(x => x !== 'estornada')) expect(podeMudar('estornada', s)).toBe(false);
  });
  it('aprovada não volta a recusada; contestação ganha volta a aprovada', () => {
    expect(podeMudar('aprovada', 'recusada')).toBe(false);
    expect(podeMudar('aprovada', 'expirada')).toBe(false);
    expect(podeMudar('contestada', 'aprovada')).toBe(true);
  });
  it('ativas e pagas', () => {
    expect(ehAtiva('pendente') && ehAtiva('criada')).toBe(true);
    expect(ehAtiva('aprovada')).toBe(false);
    expect(['aprovada', 'estornada_parcial', 'contestada'].every(ehPaga)).toBe(true);
    expect(ehPaga('estornada')).toBe(false);
  });
});

describe('valor a cobrar (RP-01, RP-02)', () => {
  const compra = { tipo: 'compra' as const, status: 'pendente' as const, origem: 'loja' as const, total: 189.9, frete: 15, pagamentoSituacao: 'a_combinar', venda: null };
  it('compra: peças (já com cupom) + frete', () => expect(valorACobrar(compra)).toEqual({ ok: true, valor: 204.9 }));
  it('frete a combinar bloqueia e pede o frete; frete 0 libera', () => {
    expect(valorACobrar({ ...compra, frete: null })).toMatchObject({ ok: false, precisaFrete: true });
    expect(valorACobrar({ ...compra, frete: 0 })).toEqual({ ok: true, valor: 189.9 });
  });
  it('compra confirmada cobra pela venda + frete', () => expect(valorACobrar({ ...compra, status: 'confirmado', venda: 150 })).toEqual({ ok: true, valor: 165 }));
  it('condicional: só depois de fechado, o que ficou', () => {
    const cond = { ...compra, tipo: 'condicional' as const, frete: null };
    expect(valorACobrar(cond).ok).toBe(false);
    expect(valorACobrar({ ...cond, status: 'confirmado', venda: 99.9 })).toEqual({ ok: true, valor: 99.9 });
    expect(valorACobrar({ ...cond, status: 'confirmado', venda: null }).ok).toBe(false);
  });
  it('balcão, cancelado e já pago não cobram', () => {
    expect(valorACobrar({ ...compra, origem: 'balcao' }).ok).toBe(false);
    expect(valorACobrar({ ...compra, status: 'cancelado' }).ok).toBe(false);
    expect(valorACobrar({ ...compra, pagamentoSituacao: 'pago' }).ok).toBe(false);
  });
  it('centavos sem erro de arredondamento', () => expect(valorACobrar({ ...compra, total: 0.1 + 0.2, frete: 0 })).toEqual({ ok: true, valor: 0.3 }));
});

describe('formatos', () => {
  it('valor da API', () => {
    expect(valorMp(10)).toBe('10.00');
    expect(valorMp(0.1 + 0.2)).toBe('0.30');
    expect(lerValorMp('47.28')).toBe(47.28);
    expect(lerValorMp(null)).toBeNull();
    expect(lerValorMp('abc')).toBeNull();
  });
  it('forma de pagamento gravada', () => {
    expect(formaDoMeio('pix', 'bank_transfer')).toBe('pix');
    expect(formaDoMeio('visa', 'credit_card')).toBe('credito');
    expect(formaDoMeio('debvisa', 'debit_card')).toBe('debito');
    expect(formaDoMeio('account_money', 'account_money')).toBe('mercado_pago');
  });
  it('meio e parcelas', () => {
    expect(descreverMeio({ meio: 'visa', parcelas: 3 })).toBe('Visa em 3×');
    expect(descreverMeio({ meio: 'pix', parcelas: 1 })).toBe('Pix');
    expect(descreverMeio({ meio: 'novo_meio' })).toBe('novo_meio');
  });
  it('contagem do Pix', () => {
    const agora = Date.UTC(2026, 10, 23, 12, 0, 0);
    expect(tempoRestante(new Date(agora + 29 * 60_000 + 58_000), agora)).toBe('29:58');
    expect(tempoRestante(new Date(agora - 1000), agora)).toBe('00:00');
  });
  it('mensagem com o link', () => {
    const t = mensagemLinkPagamento({ nomeCliente: 'Maria Souza', nomeVendedor: 'Ana Lima', codigo: 'PED-000123', valor: 204.9, link: 'https://x/pagar/a', pix: true, cartao: true, brl });
    expect(t).toContain('Oi, Maria!');
    expect(t).toContain('Aqui é Ana');
    expect(t).toContain('*PED-000123*');
    expect(t).toContain('Pix ou cartão');
    expect(t).toContain('https://x/pagar/a');
  });
});

describe('assinatura dos avisos', () => {
  const segredo = 'chave-secreta-de-teste';
  const agora = 1_763_900_000_000;
  const ts = String(Math.floor(agora / 1000));

  it('manifesto como o SDK: omite o que falta', () => {
    expect(manifesto('ORD123', 'req-1', '10')).toBe('id:ORD123;request-id:req-1;ts:10;');
    expect(manifesto(null, 'req-1', '10')).toBe('request-id:req-1;ts:10;');
    expect(manifesto('ORD123', null, '10')).toBe('id:ORD123;ts:10;');
  });
  it('lê o cabeçalho', () => {
    expect(lerCabecalhoAssinatura('ts=123, v1=abc')).toEqual({ ts: '123', v1: 'abc' });
    expect(lerCabecalhoAssinatura('lixo')).toEqual({});
  });
  it('aceita a assinatura certa, com o id como veio ou em minúsculas', () => {
    const h = assinarAviso(segredo, 'ORD01ABC', 'req-9', ts);
    expect(validarAssinatura({ segredo, assinatura: h, requestId: 'req-9', dataId: 'ORD01ABC', agora })).toEqual({ ok: true });
    const minusc = assinarAviso(segredo, 'ord01abc', 'req-9', ts);
    expect(validarAssinatura({ segredo, assinatura: minusc, requestId: 'req-9', dataId: 'ORD01ABC', agora })).toEqual({ ok: true });
  });
  it('recusa adulterada, de outro aviso, sem segredo, malformada ou velha', () => {
    const h = assinarAviso(segredo, 'ORD01ABC', 'req-9', ts);
    expect(validarAssinatura({ segredo, assinatura: h, requestId: 'req-9', dataId: 'ORD01ABD', agora })).toMatchObject({ ok: false, motivo: 'diferente' });
    expect(validarAssinatura({ segredo, assinatura: h, requestId: 'req-8', dataId: 'ORD01ABC', agora })).toMatchObject({ ok: false, motivo: 'diferente' });
    expect(validarAssinatura({ segredo: 'outra', assinatura: h, requestId: 'req-9', dataId: 'ORD01ABC', agora })).toMatchObject({ ok: false, motivo: 'diferente' });
    expect(validarAssinatura({ segredo: '', assinatura: h, requestId: 'req-9', dataId: 'ORD01ABC', agora })).toMatchObject({ ok: false, motivo: 'sem_segredo' });
    expect(validarAssinatura({ segredo, assinatura: null, requestId: 'req-9', dataId: 'ORD01ABC', agora })).toMatchObject({ ok: false, motivo: 'sem_cabecalho' });
    expect(validarAssinatura({ segredo, assinatura: 'ts=abc,v1=xyz', requestId: 'req-9', dataId: 'ORD01ABC', agora })).toMatchObject({ ok: false, motivo: 'malformado' });
    expect(validarAssinatura({ segredo, assinatura: h, requestId: 'req-9', dataId: 'ORD01ABC', agora: agora + 3600_000 })).toMatchObject({ ok: false, motivo: 'fora_do_prazo' });
  });
  it('horário em segundos ou milissegundos', () => {
    expect(horarioDoAviso('1763900000')).toBe(1_763_900_000_000);
    expect(horarioDoAviso('1763900000123')).toBe(1_763_900_000_123);
  });
});

describe('link de pagamento', () => {
  beforeAll(() => { process.env.LINK_PEDIDO_SEGREDO = 'segredo-de-teste-do-link-de-pedido'; });
  it('assinatura própria: não serve como link público do pedido e vice-versa', () => {
    const c = chaveDoPagamento('PED-000123');
    expect(codigoDaChavePagamento(c)).toBe('PED-000123');
    expect(codigoDaChave(c)).toBeNull();
    expect(codigoDaChavePagamento(chaveDoPedido('PED-000123'))).toBeNull();
    expect(codigoDaChavePagamento(`PED-000124.${c.split('.')[1]}`)).toBeNull();
    expect(linkDePagamento('https://loja.com/', 'COND-000001')).toMatch(/^https:\/\/loja\.com\/pagar\/COND-000001\.[\w-]{16}$/);
  });
});
