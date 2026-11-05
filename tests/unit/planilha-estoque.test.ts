import { describe, expect, it } from 'vitest';
import {
  agruparLinhas, categoriaDaDescricao, corDaLinha, eanDaLinha, estoqueDaLinha, generoDaDescricao, lerLinhas, marcaDoProduto, nomeDoProduto,
  precoDoGrupo, referenciaBase, referenciaDoProduto, regraPadrao, tamanhoDaPlanilha, type LinhaPlanilha,
} from '@/lib/planilha-estoque';

const linha = (x: Partial<LinhaPlanilha>): LinhaPlanilha => ({
  linha: 2, fornecedor: 'CIA. HERING.', codigo: '1', referencia: '0201', codigoBarras: '7890000000001', descricao: 'CAMISETA MM MASC', tamanho: 'M',
  codigoCor: 'N1007S', corVisual: 'PRETO', estoque: 1, condicional: 0, reservadoEc: 0, preco: 79.99, ...x,
});

describe('planilha de estoque', () => {
  it('lê o cabeçalho e as linhas, e aponta colunas que faltam', () => {
    const cab = ['Fornecedor', 'Código', 'Refer.', 'Cód. Barras', 'Descrição', 'Tam.', 'Cód. Cor', 'Cor Visual', 'Estoq.', 'Cond.', 'Res. EC', 'Preço Venda'];
    const r = lerLinhas([['Relatório'], cab, ['CIA. HERING.', 14122, '0111', 7890182721212, 'CAMISETA REGATA MASC', 'XXG', 'N0A00S', null, 2, 1, 0, 59.99]]);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ linha: 3, codigo: '14122', codigoBarras: '7890182721212', estoque: 2, condicional: 1, preco: 59.99, corVisual: '' });
    expect(lerLinhas([['Fornecedor', 'Código']]).erros[0]).toMatch(/Faltam colunas/);
  });

  it('padroniza tamanhos e tira o tamanho do fim da referência', () => {
    expect(['U', 'UN', 'uni'].map(tamanhoDaPlanilha)).toEqual(['UNI', 'UNI', 'UNI']);
    expect(tamanhoDaPlanilha('39/40')).toBe('39/40');
    expect(referenciaBase('020345996051G', 'G')).toBe('020345996051');
    expect(referenciaBase('CAI23010919-0000PP', 'XP')).toBe('CAI23010919-0000');
    expect(referenciaBase('ACT3773.107.39', '39')).toBe('ACT3773.107');
    expect(referenciaBase('0201', 'M')).toBe('0201');
  });

  it('estoque à venda desconta condicional e reservado; EAN só com dígitos', () => {
    expect(estoqueDaLinha({ estoque: 3, condicional: 1, reservadoEc: 1 })).toBe(1);
    expect(estoqueDaLinha({ estoque: 1, condicional: 2, reservadoEc: 0 })).toBe(0);
    expect(eanDaLinha('7909719195355')).toBe('7909719195355');
    expect(eanDaLinha('5105LP')).toBeNull();
  });

  it('agrupa por fornecedor + referência + cor (e por descrição quando cada tamanho tem referência própria)', () => {
    const g = agruparLinhas([
      linha({ codigo: '1', tamanho: 'P' }), linha({ codigo: '2', tamanho: 'M' }), linha({ codigo: '3', tamanho: 'M', codigoCor: 'AZ2EN', corVisual: '' }),
      linha({ fornecedor: 'GARRA JEANS', codigo: '4', referencia: '1010L', tamanho: '48', codigoCor: 'PRETA', corVisual: 'PRETO' }),
      linha({ fornecedor: 'GARRA JEANS', codigo: '5', referencia: '1010L', tamanho: '50', codigoCor: 'PRETO', corVisual: 'PRETO' }),
      ...['P', 'M', 'G'].map((t, i) => linha({ fornecedor: 'MACROPAMPA', codigo: `9${i}`, referencia: `10719${i}`, descricao: `BLUSA CO4162 TRIFIL ${t} CR2 ML`, tamanho: t, codigoCor: 'BORDÔ', corVisual: 'VINHO', preco: 169 })),
    ]);
    expect(g.map(x => x.linhas.map(l => l.codigo).join(',')).sort()).toEqual(['1,2', '3', '4,5', '90,91,92']);
  });

  it('deduz nome, categoria e gênero dos produtos novos', () => {
    expect(nomeDoProduto(linha({ descricao: 'CAMISETA MM MASC' }))).toBe('Camiseta Manga Curta Masculina - Preto');
    expect(nomeDoProduto(linha({ descricao: 'SHORTS NATURAL 07 2302 001 BEGE', corVisual: 'BEGE', referencia: '06.11.076863' }))).toBe('Shorts Natural - Bege');
    expect(nomeDoProduto(linha({ descricao: 'CALCINHA LISA BÁSICA PEREQUE GG VERDE', tamanho: 'GG', corVisual: 'VERDE', codigoCor: 'VERDE' }))).toBe('Calcinha Lisa Básica Pereque - Verde');
    expect(categoriaDaDescricao('CAMISA POLO MM MASC')).toBe('Camisas Polo');
    expect(categoriaDaDescricao('MARION PREMIUM STR SUPER ALTA RETA BLACK')).toBe('Calças');
    expect(categoriaDaDescricao('VESTIDOS MULLET')).toBe('Vestidos');
    expect(categoriaDaDescricao('TENIS AD UNISSEX CASUAL')).toBe('Calçados');
    expect(categoriaDaDescricao('RIBANA 1X1 TUBULAR')).toBe('Outros');
    expect(generoDaDescricao('BERMUDA MASC', 'Bermudas')).toBe('masculino');
    expect(generoDaDescricao('VESTIDO LONGO', 'Vestidos')).toBe('feminino');
    expect(generoDaDescricao('MARION PREMIUM STR SUPER ALTA RETA', 'Calças')).toBe('feminino');
    expect(generoDaDescricao('TENIS AD UNISSEX', 'Calçados')).toBe('unissex');
  });

  it('cor, preço do grupo, referência única e marcas', () => {
    expect(corDaLinha({ corVisual: '', codigoCor: 'N1007S' })).toBeNull();
    expect(corDaLinha({ corVisual: 'AZUL MARINHO', codigoCor: 'MARINHO' })).toBe('Azul Marinho');
    expect(precoDoGrupo([{ preco: 69.99 }, { preco: 79.99 }, { preco: 79.99 }])).toBe(79.99);
    const ocupadas = new Set(['1010L']);
    const g = agruparLinhas([linha({ fornecedor: 'GARRA', referencia: '1010L', codigoCor: 'PRETO' })])[0];
    expect(referenciaDoProduto(g, ocupadas, false)).toBe('1010L2');
    expect(referenciaDoProduto(g, ocupadas, true)).toBe('1010LPRETO');
    expect(regraPadrao('CIA. HERING.')).toEqual({ marca: 'Hering', ignorar: false });
    expect(regraPadrao('GARRA JEANS INDUSTRIA E COMERCIO EIRELI').marca).toBe('Garra Jeans');
    expect(regraPadrao('MAKRO CENTRAL DE AVIAMENTOS LTDA').ignorar).toBe(true);
    expect(marcaDoProduto('Hering', 'Cuecas')).toBe('Hering Intimates');
    expect(marcaDoProduto('Hering', 'Camisetas')).toBe('Hering');
  });
});
