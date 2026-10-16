import { describe, expect, it } from 'vitest';
import { calcularVenda, conferirPagamentos, dentroDoLimite, descreverPagamento } from '@/lib/caixa';

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

describe('calcularVenda', () => {
  const linhas = [{ varianteId: 1, preco: 100, quantidade: 2 }, { varianteId: 2, preco: 50, quantidade: 1 }];
  it('sem desconto: total = subtotal', () => {
    const v = calcularVenda(linhas);
    expect(v).toMatchObject({ subtotal: 250, desconto: 0, total: 250 });
    expect(v.precos.get(1)).toBe(100);
  });
  it('desconto na peça (preço combinado) e geral em %', () => {
    const v = calcularVenda([{ ...linhas[0], precoCombinado: 90 }, linhas[1]], { tipo: 'percentual', valor: 10 });
    expect(v.precos.get(1)).toBe(81);
    expect(v.precos.get(2)).toBe(45);
    expect(v.total).toBe(207);
    expect(v.desconto).toBe(43);
    expect(v.descontoParte).toBeCloseTo(43 / 250);
  });
  it('desconto geral em R$ vira percentual; o total é a soma dos preços arredondados', () => {
    const v = calcularVenda([{ varianteId: 1, preco: 33.33, quantidade: 3 }], { tipo: 'valor', valor: 10 });
    expect(v.total).toBeCloseTo(v.precos.get(1)! * 3, 10);
    expect(Math.abs(v.total - 89.99)).toBeLessThanOrEqual(0.03);
  });
  it('preço combinado acima da tabela é ignorado; desconto não passa do total', () => {
    expect(calcularVenda([{ varianteId: 1, preco: 50, quantidade: 1, precoCombinado: 80 }]).total).toBe(50);
    expect(calcularVenda([{ varianteId: 1, preco: 50, quantidade: 1 }], { tipo: 'valor', valor: 500 }).total).toBe(0);
  });
});

describe('limite e pagamentos', () => {
  it('limite de desconto do vendedor; gestor sem limite', () => {
    expect(dentroDoLimite(0.1, 10, false)).toBe(true);
    expect(dentroDoLimite(0.1001, 10, false)).toBe(false);
    expect(dentroDoLimite(0.5, 10, true)).toBe(true);
  });
  it('pagamento dividido, falta, sobra e troco', () => {
    expect(conferirPagamentos([{ forma: 'pix', valor: 100 }, { forma: 'credito', valor: 89.9, parcelas: 3 }], 189.9)).toMatchObject({ ok: true, falta: 0, troco: 0 });
    expect(conferirPagamentos([{ forma: 'pix', valor: 100 }], 189.9)).toMatchObject({ ok: false, falta: 89.9 });
    expect(conferirPagamentos([{ forma: 'dinheiro', valor: 50, recebido: 100 }], 50)).toMatchObject({ ok: true, troco: 50 });
    expect(conferirPagamentos([{ forma: 'dinheiro', valor: 50, recebido: 20 }], 50).ok).toBe(false);
    expect(conferirPagamentos([{ forma: 'pix', valor: 60 }], 50)).toMatchObject({ ok: false, sobra: 10 });
    expect(conferirPagamentos([], 0).ok).toBe(false);
  });
  it('descreve a forma', () => {
    expect(descreverPagamento({ forma: 'credito', valor: 90, parcelas: 3 }, brl)).toBe('Crédito 3x');
    expect(descreverPagamento({ forma: 'dinheiro', valor: 45, recebido: 50 }, brl)).toBe('Dinheiro (recebido R$ 50,00, troco R$ 5,00)');
    expect(descreverPagamento({ forma: 'pix', valor: 10 }, brl)).toBe('Pix');
  });
});

describe('busca e filtros do caixa', async () => {
  const { filtrarCaixa, porCodigo, familiaDaCor, FILTROS_CAIXA } = await import('@/lib/caixa');
  const p = (o: Partial<import('@/lib/caixa').ProdutoCaixa>) => ({
    id: 1, referencia: 'R1', nome: 'Camiseta Básica', marca: 'Hering', marcaSlug: 'hering', categoria: 'Camisetas', categoriaSlug: 'camisetas', genero: 'feminino',
    corNome: 'Preto', preco: 50, precoCheio: 50, imperdivel: false, imagem: null, vendidos: 0,
    variantes: [{ id: 10, tamanho: 'M', disponivel: 2, codigoInterno: '23297', ean: '7900290042366' }], ...o,
  });
  const lista = [
    p({}),
    p({ id: 2, referencia: 'R2', nome: 'Bermuda Chino', categoria: 'Bermudas', categoriaSlug: 'bermudas', genero: 'masculino', corNome: 'Azul Marinho', preco: 150, precoCheio: 200, vendidos: 9,
      variantes: [{ id: 20, tamanho: '40', disponivel: 1, codigoInterno: '11111', ean: '7900000000001' }, { id: 21, tamanho: 'UN', disponivel: 3, codigoInterno: '11112', ean: null }] }),
    p({ id: 3, referencia: 'R3', nome: 'Regata Esgotada', variantes: [{ id: 30, tamanho: 'P', disponivel: 0, codigoInterno: '33333', ean: null }] }),
  ];
  it('família da cor', () => {
    expect(familiaDaCor('Azul Marinho')).toBe('Azul');
    expect(familiaDaCor('OFF WHITE')).toBe('Off White');
    expect(familiaDaCor('Preta')).toBe('Preto');
    expect(familiaDaCor(null)).toBeNull();
  });
  it('código interno ou EAN acham o tamanho exato', () => {
    expect(porCodigo(lista, '23297')?.variante.id).toBe(10);
    expect(porCodigo(lista, '7900000000001')?.variante.id).toBe(20);
    expect(porCodigo(lista, 'camiseta')).toBeNull();
  });
  it('mais vendidas primeiro; só disponível por padrão; esgotadas aparecem desligando', () => {
    expect(filtrarCaixa(lista, FILTROS_CAIXA).produtos.map(x => x.id)).toEqual([2, 1]);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, disponivel: false }).produtos.map(x => x.id)).toContain(3);
  });
  it('filtros e contagens que respeitam os outros filtros', () => {
    const r = filtrarCaixa(lista, { ...FILTROS_CAIXA, genero: 'masculino' });
    expect(r.produtos.map(x => x.id)).toEqual([2]);
    expect(r.contagens.generos.map(g => [g.valor, g.n])).toEqual([['feminino', 1], ['masculino', 1]]);
    expect(r.contagens.tamanhos.map(t => t.valor)).toEqual(['UNI', '40']);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, cor: 'Azul' }).produtos.map(x => x.id)).toEqual([2]);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, tamanho: 'UNI' }).produtos.map(x => x.id)).toEqual([2]);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, promo: true }).produtos.map(x => x.id)).toEqual([2]);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, preco: '100-200' }).produtos.map(x => x.id)).toEqual([2]);
  });
  it('busca por nome sem acento, cor e começo do código', () => {
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, q: 'basica preto' }).produtos.map(x => x.id)).toEqual([1]);
    expect(filtrarCaixa(lista, { ...FILTROS_CAIXA, q: '1111' }).produtos.map(x => x.id)).toEqual([2]);
  });
  it('agrupa as cores do mesmo modelo num card, na ordem da lista', async () => {
    const { agruparModelos } = await import('@/lib/caixa');
    const g = agruparModelos([
      p({ id: 1, nome: 'Polo Isla - Preto', modelo: 'polo' }),
      p({ id: 2, nome: 'Bermuda - Azul', modelo: 'bermuda' }),
      p({ id: 3, nome: 'Polo Isla - Branco', modelo: 'polo' }),
      p({ id: 4, referencia: 'SEM', nome: 'Avulsa' }),
    ]);
    expect(g.map(x => [x.nome, x.cores.map(c => c.id)])).toEqual([['Polo Isla', [1, 3]], ['Bermuda', [2]], ['Avulsa', [4]]]);
  });
  it('mesma cor e preço em duas referências: uma linha, e o mesmo tamanho num botão só', async () => {
    const { agruparModelos, linhasDeCor } = await import('@/lib/caixa');
    const [m] = agruparModelos([
      p({ id: 1, nome: 'Blusa - Cinza', corNome: 'Cinza', modelo: 'blusa', variantes: [{ id: 11, tamanho: 'G', disponivel: 3, codigoInterno: '1', ean: null }, { id: 12, tamanho: 'M', disponivel: 3, codigoInterno: '2', ean: null }] }),
      p({ id: 2, nome: 'Blusa - Cinza', corNome: 'Cinza', modelo: 'blusa', variantes: [{ id: 21, tamanho: 'M', disponivel: 6, codigoInterno: '3', ean: null }, { id: 22, tamanho: 'XP', disponivel: 4, codigoInterno: '4', ean: null }] }),
      p({ id: 3, nome: 'Blusa - Preto', corNome: 'Preto', modelo: 'blusa' }),
    ]);
    const l = linhasDeCor(m);
    expect(l.map(x => x.cor)).toEqual(['Cinza', 'Preto']);
    expect(l[0].tamanhos.map(t => [t.tamanho, t.opcoes.map(o => o.v.id)])).toEqual([['XP', [22]], ['M', [12, 21]], ['G', [11]]]);
  });
});
