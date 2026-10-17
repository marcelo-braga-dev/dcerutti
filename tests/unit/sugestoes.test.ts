import { describe, expect, it } from 'vitest';
import { aberta, descontoDaOferta, mensagemDaSugestao, mensagemLembrete, precisaDeAtencao, precoQueVale, situacaoDe, totaisEscolhidos } from '@/lib/sugestoes';

const agora = new Date('2026-10-16T12:00:00Z');
const amanha = new Date('2026-10-17T12:00:00Z'), ontem = new Date('2026-10-15T12:00:00Z');

describe('sugestões para você (D-27)', () => {
  it('situação: vence pela validade, mas pedido e cancelada não mudam', () => {
    expect(situacaoDe({ status: 'enviada', validaAte: amanha }, agora)).toBe('enviada');
    expect(situacaoDe({ status: 'vista', validaAte: ontem }, agora)).toBe('vencida');
    expect(situacaoDe({ status: 'convertida', validaAte: ontem }, agora)).toBe('convertida');
    expect(situacaoDe({ status: 'cancelada', validaAte: amanha }, agora)).toBe('cancelada');
    expect(aberta('respondida')).toBe(true);
    expect(aberta('vencida')).toBe(false);
  });

  it('preço especial só antes da validade e só abaixo do catálogo', () => {
    expect(precoQueVale(100, 80, false)).toBe(80);
    expect(precoQueVale(100, 80, true)).toBe(100);
    expect(precoQueVale(100, 120, false)).toBe(100);
    expect(precoQueVale(100, null, false)).toBe(100);
    expect(descontoDaOferta(100, 85)).toBeCloseTo(0.15);
    expect(descontoDaOferta(100, null)).toBe(0);
  });

  it('totais das peças marcadas como Quero', () => {
    const t = totaisEscolhidos([
      { escolha: 'quero', preco: 50, quantidade: 2, temTamanho: true },
      { escolha: 'quero', preco: 30, quantidade: 1, temTamanho: false },
      { escolha: 'talvez', preco: 99, quantidade: 1, temTamanho: true },
      { escolha: 'nao', preco: 99, quantidade: 1, temTamanho: true },
    ]);
    expect(t).toEqual({ pecas: 3, total: 130, semTamanho: 1 });
  });

  it('mensagem para a cliente com o link e a validade', () => {
    const m = mensagemDaSugestao({ nomeCliente: 'Mariana Souza', nomeVendedor: 'Ana Paula', loja: 'D’Cerutti', titulo: 'Novidades no seu tamanho', link: 'https://x/s/SUG-000001.abc', pecas: 3, validaAte: amanha, temOferta: true });
    expect(m).toContain('Oi, Mariana! Aqui é Ana, da D’Cerutti.');
    expect(m).toContain('Separei 3 peças para você: *Novidades no seu tamanho*');
    expect(m).toContain('https://x/s/SUG-000001.abc');
    expect(m).toContain('Os preços especiais valem até 17/10.');
  });

  it('"Para enviar" até o primeiro envio', () => {
    expect(situacaoDe({ status: 'enviada', validaAte: amanha, enviadaEm: null }, agora)).toBe('aEnviar');
    expect(situacaoDe({ status: 'enviada', validaAte: amanha, enviadaEm: agora }, agora)).toBe('enviada');
    expect(aberta('aEnviar')).toBe(true);
  });

  it('o que precisa de atenção agora', () => {
    const h = (n: number) => new Date(agora.getTime() - n * 3_600_000);
    const longe = new Date(agora.getTime() + 5 * 86_400_000);
    const base = { enviadaEm: h(1), vistaEm: null, respondidaEm: null, validaAte: longe, lembradoEm: null };
    expect(precisaDeAtencao({ ...base, situacao: 'aEnviar', enviadaEm: null }, agora)).toBe('enviar');
    expect(precisaDeAtencao({ ...base, situacao: 'enviada' }, agora)).toBeNull();
    expect(precisaDeAtencao({ ...base, situacao: 'enviada', enviadaEm: h(50) }, agora)).toBe('semAbrir');
    expect(precisaDeAtencao({ ...base, situacao: 'vista', vistaEm: h(30) }, agora)).toBe('viuSemResponder');
    expect(precisaDeAtencao({ ...base, situacao: 'respondida', respondidaEm: h(2) }, agora)).toBe('pensando');
    expect(precisaDeAtencao({ ...base, situacao: 'vista', vistaEm: h(2), validaAte: new Date(agora.getTime() + 3_600_000) }, agora)).toBe('vencendo');
    // Lembrada há pouco: sai da lista por um dia.
    expect(precisaDeAtencao({ ...base, situacao: 'vista', vistaEm: h(30), lembradoEm: h(3) }, agora)).toBeNull();
    expect(precisaDeAtencao({ ...base, situacao: 'convertida' }, agora)).toBeNull();
  });

  it('lembrete conforme o ponto em que ela parou', () => {
    const base = { nomeCliente: 'Mariana Souza', nomeVendedor: 'Ana', link: 'https://x/s/SUG-1.abc', validaAte: amanha, temOferta: true };
    expect(mensagemLembrete({ ...base, situacao: 'enviada' })).toContain('Dá uma olhadinha');
    expect(mensagemLembrete({ ...base, situacao: 'vista' })).toContain('Conseguiu ver as peças');
    expect(mensagemLembrete({ ...base, situacao: 'respondida' })).toContain('marcou algumas peças');
    expect(mensagemLembrete({ ...base, situacao: 'vista' })).toContain('https://x/s/SUG-1.abc');
  });
});

