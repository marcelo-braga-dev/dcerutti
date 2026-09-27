import { describe, expect, it } from 'vitest';
import { emPromocao, filtrarCatalogo, FILTROS_VAZIOS, lerFiltros, POR_PAGINA, urlCatalogo, type ProdutoCatalogo } from '@/lib/catalogo';

let n = 0;
const produto = (p: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
  id: ++n, referencia: `REF${n}`, nome: 'Camiseta Básica', marca: 'Hering', marcaSlug: 'hering', categoria: 'Camisetas',
  categoriaSlug: 'camisetas', subcategoria: null, genero: 'feminino', estacao: null, cor: 'Branco', composicao: null,
  descricao: null, destaques: [], preco: 50, precoCheio: 50, imperdivel: false, imagens: ['https://x/1.jpg'],
  variantes: [{ id: n * 10, tamanho: 'M', disponivel: 2, codigoInterno: null }], ...p,
});

describe('lerFiltros / urlCatalogo', () => {
  it('ignora valores inválidos', () => {
    const f = lerFiltros({ genero: 'x', estoque: 'y', ordem: 'z', pagina: '-3' });
    expect(f).toEqual(FILTROS_VAZIOS);
  });
  it('ida e volta pela URL preserva os filtros', () => {
    const f = lerFiltros({ genero: 'masculino', tamanho: 'G', promo: '1', q: 'polo', ordem: 'menor-preco' });
    const url = urlCatalogo(f);
    expect(lerFiltros(Object.fromEntries(new URL(url, 'http://x').searchParams))).toEqual(f);
  });
  it('mudar um filtro volta para a página 1', () => {
    expect(urlCatalogo({ ...FILTROS_VAZIOS, pagina: 3 }, { tamanho: 'P' })).toBe('/catalogo?tamanho=P');
  });
});

describe('filtrarCatalogo', () => {
  const lista = [
    produto({ nome: 'Blusa Tricô', genero: 'feminino', categoria: 'Blusas', categoriaSlug: 'blusas' }),
    produto({ nome: 'Camisa Polo', genero: 'masculino', preco: 80, precoCheio: 100 }),
    produto({ nome: 'Calça Jeans', genero: 'masculino', imperdivel: true, preco: 90, precoCheio: 150 }),
    produto({ nome: 'Bermuda', variantes: [{ id: 999, tamanho: 'G', disponivel: 0, codigoInterno: null }] }),
  ];

  it('busca sem acento e por vários termos', () => {
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, q: 'blusa trico' }).produtos.map(p => p.nome)).toEqual(['Blusa Tricô']);
  });
  it('tamanho só conta variantes disponíveis', () => {
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, tamanho: 'G' }).total).toBe(0);
  });
  it('promoção não inclui o Imperdível', () => {
    expect(emPromocao(lista[2])).toBe(false);
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, promo: true }).produtos.map(p => p.nome)).toEqual(['Camisa Polo']);
  });
  it('conta disponíveis e esgotados e põe esgotados no fim', () => {
    const r = filtrarCatalogo(lista, FILTROS_VAZIOS);
    expect(r.contagens.disponiveis).toBe(3);
    expect(r.contagens.esgotados).toBe(1);
    expect(r.produtos.at(-1)!.nome).toBe('Bermuda');
  });
  it('ordena por preço', () => {
    const r = filtrarCatalogo(lista, { ...FILTROS_VAZIOS, ordem: 'maior-preco' });
    expect(r.produtos[0].nome).toBe('Calça Jeans');
  });
  it('pagina de 24 em 24', () => {
    const muitos = Array.from({ length: 30 }, () => produto());
    const r = filtrarCatalogo(muitos, FILTROS_VAZIOS);
    expect(r.produtos).toHaveLength(POR_PAGINA);
    expect(r.temMais).toBe(true);
    expect(filtrarCatalogo(muitos, { ...FILTROS_VAZIOS, pagina: 2 }).temMais).toBe(false);
  });
});
