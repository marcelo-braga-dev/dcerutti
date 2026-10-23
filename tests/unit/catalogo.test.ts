import { describe, expect, it } from 'vitest';
import { emPromocao, filtrarCatalogo, FILTROS_VAZIOS, lerFiltros, POR_PAGINA, urlCatalogo, type ProdutoCatalogo } from '@/lib/catalogo';

let n = 0;
const produto = (p: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
  id: ++n, referencia: `REF${n}`, nome: 'Camiseta Básica', marca: 'Hering', marcaSlug: 'hering', categoria: 'Camisetas',
  categoriaSlug: 'camisetas', subcategoria: null, genero: 'feminino', estacao: null, cor: 'Branco', composicao: null,
  descricao: null, destaques: [], preco: 50, precoCheio: 50, imperdivel: false, imagens: ['https://x/1.jpg'], videos: [],
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

describe('catálogo: tamanhos, preço, grupos e ordem (vistoria 15/10/2026)', () => {
  const lista = [
    produto({ nome: 'A', preco: 30, categoria: 'Camisetas', categoriaSlug: 'camisetas', variantes: [{ id: 1, tamanho: 'UN', disponivel: 1, codigoInterno: null }] }),
    produto({ nome: 'B', preco: 80, categoria: 'Bermudas', categoriaSlug: 'bermudas', variantes: [{ id: 2, tamanho: '40', disponivel: 2, codigoInterno: null }] }),
    produto({ nome: 'C', preco: 150, precoCheio: 300, categoria: 'Camisetas', categoriaSlug: 'camisetas', variantes: [{ id: 3, tamanho: 'UNI', disponivel: 1, codigoInterno: null }] }),
    produto({ nome: 'D', preco: 250, categoria: 'Camisetas', categoriaSlug: 'camisetas' }),
  ];
  it('UN e UNI são o mesmo tamanho; letras e numeração separados', async () => {
    const { normalizarTamanho, grupoTamanho } = await import('@/lib/catalogo');
    expect(normalizarTamanho(' un ')).toBe('UNI');
    expect(grupoTamanho('42')).toBe('numeracao');
    expect(grupoTamanho('GG')).toBe('letras');
    const r = filtrarCatalogo(lista, FILTROS_VAZIOS);
    expect(r.contagens.tamanhos.find(t => t.valor === 'UNI')?.n).toBe(2);
    expect(r.contagens.tamanhos.some(t => t.valor === 'UN')).toBe(false);
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, tamanho: 'UNI' }).produtos.map(p => p.nome).sort()).toEqual(['A', 'C']);
    expect(lerFiltros({ tamanho: 'un' }).tamanho).toBe('UNI');
  });
  it('faixa de preço filtra e conta', () => {
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, preco: '50-100' }).produtos.map(p => p.nome)).toEqual(['B']);
    expect(filtrarCatalogo(lista, FILTROS_VAZIOS).contagens.precos.map(p => [p.valor, p.n])).toEqual([['ate-50', 1], ['50-100', 1], ['100-200', 1], ['acima-200', 1]]);
    expect(lerFiltros({ preco: 'qualquer' }).preco).toBeNull();
  });
  it('categorias vêm com o grupo; ordem por desconto e novidades', () => {
    const r = filtrarCatalogo(lista, FILTROS_VAZIOS);
    expect(r.contagens.categorias.find(c => c.valor === 'bermudas')?.grupo).toBe('Parte de baixo');
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, ordem: 'desconto' }).produtos[0].nome).toBe('C');
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, ordem: 'novidades' }).produtos.map(p => p.nome)).toEqual(['D', 'C', 'B', 'A']);
  });
  it('relevância alterna as categorias', async () => {
    const { intercalar } = await import('@/lib/catalogo');
    expect(intercalar(['c1', 'c2', 'b1', 'c3', 'b2'], x => x[0])).toEqual(['c1', 'b1', 'c2', 'b2', 'c3']);
    const nomes = filtrarCatalogo(lista, FILTROS_VAZIOS).produtos.map(p => p.categoriaSlug);
    expect(nomes.slice(0, 2)).toEqual(['camisetas', 'bermudas']);
  });
});

describe('cores do mesmo modelo', () => {
  it('nome, modelo e tom da cor', async () => {
    const { nomeDaCor, nomeDoModelo, chaveDoModelo, tomDaCor, corClara } = await import('@/lib/cores');
    expect(nomeDaCor('Bermuda Chino - OFF WHITE')).toBe('Off White');
    expect(nomeDaCor('Camiseta Básica', 'PRETO')).toBe('Preto');
    expect(nomeDaCor('Camiseta Básica')).toBeNull();
    expect(nomeDaCor('Calça - Verde Claro 2')).toBe('Verde Claro');
    expect(nomeDoModelo('Bermuda Chino - Bege')).toBe('Bermuda Chino');
    const base = { referencia: 'R1', marcaSlug: 'hering', categoriaSlug: 'bermudas', genero: 'masculino' };
    expect(chaveDoModelo({ ...base, nome: 'Bermuda Chino - Bege' })).toBe(chaveDoModelo({ ...base, referencia: 'R2', nome: 'Bermuda Chino - Azul' }));
    expect(chaveDoModelo({ ...base, nome: 'Bermuda Sem Cor' })).toBe('ref|R1');
    expect(tomDaCor('Azul Marinho')).toBe('#1f2c4c');
    expect(tomDaCor('Jeans Claro')).toBe('#8fa9c6');
    expect(tomDaCor('Multicolorido')).toBe('estampa');
    expect(tomDaCor('Cor Inventada')).toBeNull();
    expect(corClara('#fbfbf9')).toBe(true);
    expect(corClara('#1d1d1b')).toBe(false);
  });
  it('a vitrine mostra um card por modelo e conta modelos', () => {
    const lista = [
      produto({ nome: 'Polo - Azul', modelo: 'm1' }), produto({ nome: 'Polo - Preto', modelo: 'm1' }), produto({ nome: 'Polo - Branco', modelo: 'm1', preco: 20 }),
      produto({ nome: 'Regata', modelo: 'm2' }),
    ];
    const r = filtrarCatalogo(lista, FILTROS_VAZIOS);
    expect(r.total).toBe(2);
    expect(r.contagens.categorias[0].n).toBe(2);
    // Com o filtro de preço, o card do modelo vem com a cor que atende.
    expect(filtrarCatalogo(lista, { ...FILTROS_VAZIOS, preco: 'ate-50' }).produtos.map(p => p.nome)).toEqual(['Polo - Branco']);
  });
});
