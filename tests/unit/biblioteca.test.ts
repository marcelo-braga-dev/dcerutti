/** Funções puras de src/lib nos casos de borda (complementa catalogo, pedido, url e utilitarios). */
import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import {
  casaBusca, contarFiltros, emEstoque, emPromocao, filtrarCatalogo, FILTROS_VAZIOS, lerFiltros, normalizar, posicaoTamanho, termosDeBusca, urlCatalogo,
  type ProdutoCatalogo,
} from '@/lib/catalogo';
import { dataDoFormulario, diaDe, formatarData, formatarDataHora, intervaloDoMes, mesDe, mesValido, nomeDoMes, somarMeses } from '@/lib/datas';
import { brl, descontoPct, lerValor, paraNumero } from '@/lib/dinheiro';
import { celularValido, formatarCep, formatarTelefone, numeroWhatsApp, somenteDigitos } from '@/lib/telefone';
import { imagemGrande, linkWhatsApp, mensagemContato, mensagemConvite, mensagemDoCliente, mensagemDoVendedor } from '@/lib/whatsapp';
import { fotoLocal, otimizavel, urlOtimizada } from '@/lib/imagens';
import { caminhoInterno } from '@/lib/url';
import { errosDoZod, falha, valoresDe } from '@/lib/formulario';
import { diasAte, expiraEm, plural, textoCancelamento, valoresDoPedido } from '@/lib/pedido';

const espacos = (s: string) => s.replace(/\s/g, ' ');

describe('datas no fuso de São Paulo', () => {
  it('meia-noite UTC do dia 1º ainda é o mês anterior em São Paulo', () => {
    expect(mesDe(new Date('2026-11-01T02:59:59Z'))).toBe('2026-10');
    expect(mesDe(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
    expect(diaDe(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
  });
  it('somar meses em qualquer direção e distância', () => {
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-01', -13)).toBe('2024-12');
    expect(somarMeses('2026-11', 14)).toBe('2028-01');
    expect(somarMeses('2026-05', 0)).toBe('2026-05');
  });
  it('intervalo do mês cobre exatamente o mês local', () => {
    const { gte, lt } = intervaloDoMes('2026-02');
    expect(gte.toISOString()).toBe('2026-02-01T03:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-03-01T03:00:00.000Z');
    expect(mesDe(new Date(lt.getTime() - 1))).toBe('2026-02');
  });
  it('formatação para a tela', () => {
    expect(formatarData('2026-10-07T23:30:00-03:00')).toBe('07/10/2026');
    expect(formatarDataHora(new Date('2026-10-07T13:05:00Z'))).toBe('07/10/2026, 10:05');
    expect(nomeDoMes('2026-03')).toBe('Março de 2026');
    expect(diaDe(dataDoFormulario('2026-12-31'))).toBe('2026-12-31');
  });
  it('mês válido', () => {
    for (const ok of ['2026-01', '2026-12']) expect(mesValido(ok)).toBe(true);
    for (const ruim of ['2026-13', '2026-00', '2026-1', '26-01', 202601, null]) expect(mesValido(ruim)).toBe(false);
  });
});

describe('dinheiro', () => {
  it('lê valores digitados nos formatos comuns', () => {
    expect(lerValor('R$ 1.234,56')).toBe(1234.56);
    expect(lerValor(' 10 ')).toBe(10);
    expect(lerValor('1,5')).toBe(1.5);
    expect(lerValor('0,99')).toBe(0.99);
    expect(lerValor('-5')).toBe(-5);
    expect(lerValor('1.2.3')).toBeNaN();
    expect(lerValor('10,5,3')).toBeNaN();
    expect(lerValor(null)).toBeNaN();
    expect(lerValor(undefined)).toBeNaN();
  });
  it('converte e formata', () => {
    expect(paraNumero(null)).toBe(0);
    expect(paraNumero({ toString: () => '12.5' })).toBe(12.5);
    expect(espacos(brl(0))).toBe('R$ 0,00');
    expect(espacos(brl('1000000'))).toBe('R$ 1.000.000,00');
    expect(espacos(brl(-3.5))).toBe('-R$ 3,50');
  });
  it('desconto arredondado e sem promoção = 0', () => {
    expect(descontoPct(79.9, 159.8)).toBe(50);
    expect(descontoPct(99.9, 129.9)).toBe(23);
    expect(descontoPct(100, 90)).toBe(0);
    expect(descontoPct(10, 0)).toBe(0);
  });
});

describe('telefone e CEP', () => {
  it('máscara progressiva enquanto digita', () => {
    expect(['4', '49', '499', '499999', '4999999', '49999980', '4999998063', '49999980637', '4999998063799'].map(formatarTelefone)).toEqual([
      '4', '49', '(49) 9', '(49) 9999', '(49) 9999-9', '(49) 9999-80', '(49) 9999-8063', '(49) 99998-0637', '(49) 99998-0637',
    ]);
  });
  it('celular válido só com DDD + 9 dígitos', () => {
    expect(celularValido('49 9 9998 0637')).toBe(true);
    expect(celularValido('+55 49 99998-0637')).toBe(false);
    expect(celularValido(null)).toBe(false);
    expect(somenteDigitos(undefined)).toBe('');
  });
  it('WhatsApp sempre com 55 uma vez só', () => {
    expect(numeroWhatsApp('(49) 99998-0637')).toBe('5549999980637');
    expect(numeroWhatsApp('+55 (49) 99998-0637')).toBe('5549999980637');
    expect(numeroWhatsApp('4988036499')).toBe('554988036499');
  });
  it('CEP progressivo', () => {
    expect(['8', '89874', '898740', '89874000', '898740001'].map(formatarCep)).toEqual(['8', '89874', '89874-0', '89874-000', '89874-000']);
  });
});

describe('mensagens do WhatsApp', () => {
  const itens = [
    { nome: 'Vestido', marca: 'Hering', referencia: 'V1', tamanho: 'M', cor: null, codigoInterno: null, quantidade: 1, preco: 199.9, imagem: '/arquivos/produtos/V1/a.webp' },
    { nome: 'Camiseta', marca: 'Hering', referencia: 'C1', tamanho: 'G', quantidade: 3, preco: 50 },
  ];
  it('compra sem frete: total e "frete a combinar"; fotos do servidor com o endereço do site', () => {
    const t = mensagemDoCliente({ tipo: 'compra', codigo: 'PED-000001', itens, nomeCliente: 'Ana', site: 'https://dcerutti.com.br' });
    expect(t).toContain('https://dcerutti.com.br/arquivos/produtos/V1/a.webp');
    expect(t).toContain('Total de peças: 4');
    expect(espacos(t)).toContain('Total: *R$ 349,90*');
    expect(t).toContain('Frete, pagamento e entrega: a combinar');
    expect(t).not.toContain('Cód. interno');
    expect(t).not.toMatch(/ · null/);
  });
  it('condicional: valor das peças e CEP, sem frete', () => {
    const t = mensagemDoCliente({ tipo: 'condicional', codigo: 'COND-000002', itens, nomeCliente: 'Ana', cep: '89874-000' });
    expect(t).toContain('Quero provar em casa');
    expect(t).toContain('CEP: 89874-000');
    expect(t).not.toContain('Frete');
  });
  it('mensagem do vendedor: primeiro nome dos dois, compra e condicional', () => {
    const c = mensagemDoVendedor({ codigo: 'PED-1', itens, nomeCliente: '  Mariana Souza ', nomeVendedor: 'Ana Paula' });
    expect(c).toMatch(/^Olá, Mariana! Aqui é Ana, da D’Cerutti\./);
    expect(c).toContain('Me confirma que posso fechar?');
    const d = mensagemDoVendedor({ codigo: 'COND-1', itens, nomeCliente: 'Mariana', nomeVendedor: 'Ana', condicional: true });
    expect(d).toContain('provar em casa');
    expect(espacos(d)).toContain('Valor das peças: *R$ 349,90*');
  });
  it('contato, convite e link', () => {
    expect(mensagemContato('Mariana Souza', 'condicional', 'COND-9')).toBe('Olá, Mariana! Aqui é da D’Cerutti, sobre o condicional COND-9.');
    expect(mensagemConvite('Carlos Menezes', 'https://x/c?v=1')).toContain('Aqui é Carlos');
    expect(linkWhatsApp('(49) 99998-0637', 'linha 1\nlinha 2 & *negrito*')).toBe('https://wa.me/5549999980637?text=linha%201%0Alinha%202%20%26%20*negrito*');
    expect(imagemGrande('/arquivos/x.webp')).toBe('/arquivos/x.webp');
  });
});

describe('imagens', () => {
  it('fotos locais e hosts permitidos passam pelo otimizador', () => {
    expect(fotoLocal('/arquivos/produtos/A/x.webp')).toBe(true);
    expect(otimizavel('/arquivos/produtos/A/x.webp')).toBe(true);
    expect(otimizavel('https://hering.vteximg.com.br/a.jpg')).toBe(true);
    expect(otimizavel('https://outro.com/a.jpg')).toBe(false);
    expect(otimizavel('não é url')).toBe(false);
    expect(urlOtimizada('/arquivos/a b.webp', 320)).toBe('/_next/image?url=%2Farquivos%2Fa%20b.webp&w=320&q=75');
  });
});

describe('caminho interno (redirecionamento seguro)', () => {
  it('casos de ataque conhecidos', () => {
    for (const ruim of ['/\\evil.com', '/%5Cevil.com'.replace('%5C', '\\'), 'javascript:alert(1)', '/\u0000', '/\nadmin', ' /painel', 'http://interno.invalid/x'])
      expect(caminhoInterno(ruim), JSON.stringify(ruim)).toBeNull();
    expect(caminhoInterno('/produto/ABC?x=1#y')).toBe('/produto/ABC?x=1#y');
    expect(caminhoInterno('/')).toBe('/');
  });
});

describe('formulários', () => {
  it('valores devolvidos nunca incluem senha nem campos internos do React', () => {
    const fd = new FormData();
    fd.set('nome', 'Ana');
    fd.set('senha', 'x');
    fd.set('novaSenha', 'y');
    fd.set('$ACTION_ID_1', 'z');
    fd.set('foto', new Blob(['x']));
    expect(valoresDe(fd)).toEqual({ nome: 'Ana' });
  });
  it('primeiro erro de cada campo; erro geral padrão', () => {
    const r = z.object({ a: z.string().min(2, 'curto').email('email'), b: z.number() }).safeParse({ a: 'x', b: 'y' });
    expect(errosDoZod(r.error as ZodError)).toEqual({ a: 'curto', b: expect.any(String) });
    expect(falha(new FormData(), { a: 'x' }).erro).toMatch(/campos precisam de ajuste/);
    expect(falha(new FormData(), {}, 'Outro').erro).toBe('Outro');
  });
});

describe('pedido: valores, prazos e textos', () => {
  const itens = [
    { situacao: 'vendido' as const, precoUnitario: 100, quantidade: 1 },
    { situacao: 'devolvido' as const, precoUnitario: 100, quantidade: 2 },
  ];
  it('condicional pendente mostra o valor cheio; fechado só o que ficou', () => {
    expect(valoresDoPedido({ tipo: 'condicional', status: 'pendente', total: 300, frete: null, itens })).toMatchObject({ pecas: 300, total: 300, ficaram: null, unidades: 3 });
    expect(valoresDoPedido({ tipo: 'condicional', status: 'confirmado', total: 300, frete: null, itens })).toMatchObject({ pecas: 100, total: 100, ficaram: 1, unidades: 3 });
    expect(valoresDoPedido({ tipo: 'condicional', status: 'cancelado', total: 300, frete: null, itens }).total).toBe(300);
  });
  it('compra soma o frete (Decimal ou número)', () => {
    expect(valoresDoPedido({ tipo: 'compra', status: 'confirmado', total: { toString: () => '100.50' }, frete: { toString: () => '24.90' }, itens: [] })).toMatchObject({ total: 125.4, frete: 24.9, freteACombinar: false });
  });
  it('prazos', () => {
    expect(expiraEm(new Date('2026-10-01T00:00:00Z'), 1)!.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(diasAte(new Date('2026-10-01'), new Date('2026-10-05'))).toBe(0);
    expect(diasAte(new Date('2026-10-05T12:00:00Z'), new Date('2026-10-05T11:00:00Z'))).toBe(1);
  });
  it('textos de cancelamento e plural', () => {
    expect(textoCancelamento('equipe', true)).toBe('Cancelado pela loja');
    expect(textoCancelamento('expirado', false)).toBe('Expirou sem resposta');
    expect(textoCancelamento('outro', true)).toBeNull();
    expect(plural(1, 'peça', 'peças')).toBe('1 peça');
    expect(plural(0, 'peça', 'peças')).toBe('0 peças');
    expect(plural(1500, 'peça', 'peças')).toBe('1.500 peças');
  });
});

describe('catálogo: filtros combinados e contagens', () => {
  let n = 0;
  const p = (o: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
    id: ++n, referencia: `R${n}`, nome: 'Peça', marca: 'Hering', marcaSlug: 'hering', categoria: 'Camisetas', categoriaSlug: 'camisetas', subcategoria: null,
    genero: 'feminino', estacao: null, cor: null, composicao: null, descricao: null, destaques: [], preco: 50, precoCheio: 50, imperdivel: false,
    imagens: ['/arquivos/a.webp'], variantes: [{ id: n, tamanho: 'M', disponivel: 1, codigoInterno: null }], ...o,
  });
  const lista = [
    p({ nome: 'Moletom Inverno', estacao: 'inverno', marca: 'Dzarm', marcaSlug: 'dzarm', genero: 'masculino', categoria: 'Moletons', categoriaSlug: 'moletons' }),
    p({ nome: 'Regata Verão', estacao: 'verao', cor: 'Azul-marinho' }),
    p({ nome: 'Sem Foto', imagens: [] }),
    p({ nome: 'Esgotada', variantes: [{ id: 900, tamanho: 'P', disponivel: 0, codigoInterno: null }] }),
    p({ nome: 'Imperdível', imperdivel: true, preco: 10, precoCheio: 40 }),
  ];
  it('marca, estação, imperdível e esgotados', () => {
    const nomes = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarCatalogo(lista, { ...FILTROS_VAZIOS, ...f }).produtos.map(x => x.nome);
    expect(nomes({ marca: 'dzarm' })).toEqual(['Moletom Inverno']);
    expect(nomes({ estacao: 'verao' })).toEqual(['Regata Verão']);
    expect(nomes({ imperdivel: true })).toEqual(['Imperdível']);
    expect(nomes({ estoque: 'esgotados' })).toEqual(['Esgotada']);
    expect(nomes({ estoque: 'disponiveis' })).not.toContain('Esgotada');
    expect(nomes({ q: 'azul marinho' })).toEqual(['Regata Verão']);
    expect(nomes({ q: 'r2' })).toEqual(['Regata Verão']);
  });
  it('relevância: com estoque primeiro, depois com foto', () => {
    const r = filtrarCatalogo(lista, FILTROS_VAZIOS).produtos.map(x => x.nome);
    expect(r.at(-1)).toBe('Esgotada');
    expect(r.indexOf('Sem Foto')).toBe(3);
  });
  it('contagens das facetas ignoram o próprio filtro (dá para trocar sem zerar)', () => {
    const r = filtrarCatalogo(lista, { ...FILTROS_VAZIOS, marca: 'dzarm' });
    expect(r.contagens.marcas.map(m => [m.valor, m.n])).toEqual([['hering', 4], ['dzarm', 1]]);
    expect(r.contagens.generos.map(g => g.valor)).toEqual(['masculino']);
    const g = filtrarCatalogo(lista, { ...FILTROS_VAZIOS, genero: 'feminino', categoria: 'moletons' });
    expect(g.contagens.categorias.map(c => c.valor)).toEqual(['camisetas']);
    expect(g.contagens.tamanhos).toEqual(['M']);
    expect(g.contagens.imperdivel).toBe(1);
  });
  it('filtros da URL: arrays, limites e contagem de filtros ativos', () => {
    const f = lerFiltros({ marca: ['hering', 'dzarm'], q: 'x'.repeat(200), pagina: '100', estacao: 'verao', imperdivel: '1', estoque: 'esgotados' });
    expect(f.marca).toBe('hering');
    expect(f.q).toHaveLength(80);
    expect(f.pagina).toBe(1);
    expect(contarFiltros(f)).toBe(5);
    expect(urlCatalogo(f, { pagina: 3 })).toBe(`/catalogo?marca=hering&imperdivel=1&estacao=verao&estoque=esgotados&q=${'x'.repeat(80)}&pagina=3`);
    expect(urlCatalogo(FILTROS_VAZIOS)).toBe('/catalogo');
  });
  it('busca e tamanhos', () => {
    expect(termosDeBusca('  Calça   JEANS  ')).toEqual(['calca', 'jeans']);
    expect(normalizar(' Ação ')).toBe('acao');
    expect(casaBusca({ nome: 'x', referencia: 'y', categoria: 'z', cor: null }, [])).toBe(true);
    expect(posicaoTamanho('pp')).toBeLessThan(posicaoTamanho('GG'));
    expect(posicaoTamanho('36')).toBeLessThan(posicaoTamanho('46'));
    expect(posicaoTamanho('TAMANHO-ESTRANHO')).toBeGreaterThan(posicaoTamanho('54'));
    expect(emEstoque(lista[3])).toBe(false);
    expect(emPromocao(lista[4])).toBe(false);
  });
});
