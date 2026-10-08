/**
 * Dados fixos do seed completo. Tudo que os testes procuram pelo nome está aqui (e-mails, referências, clientes):
 * mudar um valor aqui exige conferir os testes em tests/e2e e tests/integracao.
 */
import type { Papel, PrismaClient } from '@prisma/client';
import type { cancelarPedido as Cancelar, confirmarPedido as Confirmar, criarPedido as Criar } from '../../src/server/pedidos';

export const PASTA_FOTOS = 'SEED';
export const QTD_FOTOS = 24;
export const QTD_CLIENTES_SEM_CONTA = 140;
export const QTD_CLIENTES_REMOVIDOS = 3;
export const QTD_PEDIDOS = 320;
export const QTD_VENDAS_MANUAIS = 160;
export const WHATSAPP_LOJA = '49988036499';
export const CEPS_CONDICIONAL = ['89874-000', '89874-001'];

type Pessoa = { chave: string; nome: string; email: string; papel: Papel; telefone: string; ativo?: boolean; meta?: 'normal' | 'nenhuma' | 'antiga' | 'zero' };

/** Equipe: 2 gestores, 6 vendedores ativos (variações de meta e de WhatsApp) e 1 inativo. */
export const EQUIPE: Pessoa[] = [
  { chave: 'gestor', nome: 'Gestor D’Cerutti', email: 'gestor@dcerutti.local', papel: 'gestor', telefone: '(49) 98803-6499' },
  { chave: 'supervisora', nome: 'Silvia Supervisora', email: 'supervisora@dcerutti.local', papel: 'gestor', telefone: '(49) 98803-6400' },
  { chave: 'ana', nome: 'Ana Paula', email: 'ana@dcerutti.local', papel: 'vendedor', telefone: '(49) 98890-4646', meta: 'normal' },
  { chave: 'carlos', nome: 'Carlos Menezes', email: 'carlos@dcerutti.local', papel: 'vendedor', telefone: '(49) 99998-0637', meta: 'normal' },
  { chave: 'beatriz', nome: 'Beatriz Lopes', email: 'beatriz@dcerutti.local', papel: 'vendedor', telefone: '(49) 99901-1111', meta: 'zero' },
  { chave: 'diego', nome: 'Diego Martins', email: 'diego@dcerutti.local', papel: 'vendedor', telefone: '(49) 99902-2222', meta: 'nenhuma' },
  { chave: 'elisa', nome: 'Elisa Rocha', email: 'elisa@dcerutti.local', papel: 'vendedor', telefone: '(49) 99903-3333', meta: 'antiga' },
  // RN-03: WhatsApp incompleto — pedidos dos clientes dele vão para o WhatsApp da loja.
  { chave: 'gustavo', nome: 'Gustavo Sem Zap', email: 'gustavo@dcerutti.local', papel: 'vendedor', telefone: '(49) 9999-1', meta: 'normal' },
  { chave: 'fabio', nome: 'Fábio Inativo', email: 'fabio@dcerutti.local', papel: 'vendedor', telefone: '(49) 99904-4444', ativo: false, meta: 'normal' },
];

type ClienteConta = { chave: string; nome: string; email: string; telefone: string; vendedor: string; aceitou: boolean; endereco?: string; cidade?: string; cep?: string; preferencias?: string };

/** Clientes com acesso à loja: um por situação que os testes precisam. */
export const CLIENTES_COM_CONTA: ClienteConta[] = [
  { chave: 'mariana', nome: 'Mariana Souza', email: 'cliente@dcerutti.local', telefone: '(49) 99912-3456', vendedor: 'ana', aceitou: true, endereco: 'Rua das Flores, 120', cidade: 'Maravilha', cep: '89874-000', preferencias: 'Tricôs · Tam. M' },
  { chave: 'carlosCliente', nome: 'Renata Carvalho', email: 'cliente.carlos@dcerutti.local', telefone: '(49) 99913-0001', vendedor: 'carlos', aceitou: true, cidade: 'Maravilha', cep: '89874-001' },
  { chave: 'semAceite', nome: 'Paula Nogueira', email: 'cliente.semaceite@dcerutti.local', telefone: '(49) 99913-0002', vendedor: 'ana', aceitou: false, cidade: 'Maravilha' },
  { chave: 'fora', nome: 'Lucas Pereira', email: 'cliente.fora@dcerutti.local', telefone: '(49) 99913-0003', vendedor: 'beatriz', aceitou: true, cidade: 'Chapecó', cep: '89801-000' },
  { chave: 'semZap', nome: 'Tânia Ribeiro', email: 'cliente.gustavo@dcerutti.local', telefone: '(49) 99913-0004', vendedor: 'gustavo', aceitou: true, cidade: 'Maravilha', cep: '89874-000' },
  { chave: 'excluir', nome: 'Sérgio Excluível', email: 'cliente.excluir@dcerutti.local', telefone: '(49) 99913-0005', vendedor: 'carlos', aceitou: true },
  { chave: 'pendente', nome: 'Helena Pendente', email: 'cliente.pendente@dcerutti.local', telefone: '(49) 99913-0006', vendedor: 'ana', aceitou: true, cidade: 'Maravilha', cep: '89874-000' },
  { chave: 'dados', nome: 'Vera Dados', email: 'cliente.dados@dcerutti.local', telefone: '(49) 99913-0007', vendedor: 'diego', aceitou: true },
];

/** Clientes sem conta usados pelo nome nos testes. */
export const CLIENTES_FIXOS_SEM_CONTA = [
  { chave: 'juliana', nome: 'Juliana Ferreira', telefone: '(49) 99876-5432', vendedor: 'ana', cidade: 'Maravilha', preferencias: 'Fitness · Tam. P' },
  { chave: 'roberto', nome: 'Roberto Lima', telefone: '(49) 99811-2233', vendedor: 'carlos', cidade: 'São Miguel do Oeste', preferencias: 'Camisetas · Tam. G' },
];

export const NOMES = ['Adriana', 'Bruna', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Heloísa', 'Isabela', 'Joana', 'Karina', 'Larissa', 'Marina', 'Natália', 'Olívia', 'Patrícia', 'Rafaela', 'Sabrina', 'Tatiane', 'Úrsula', 'Valéria', 'Wanessa', 'Yasmin', 'André', 'Bruno', 'César', 'Davi', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo', 'Marcos', 'Nicolas', 'Otávio', 'Pedro', 'Rodrigo', 'Samuel', 'Tiago', 'Vinícius'];
export const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Fontana', 'Gomes', 'Hoffmann', 'Ianke', 'Junges', 'Klein', 'Lemos', 'Moraes', 'Nunes', 'Oliveira', 'Prado', 'Queiroz', 'Ramos', 'Schmitz', 'Teixeira', 'Vieira', 'Weber', 'Zanella'];
export const CIDADES = ['Maravilha', 'Maravilha', 'Maravilha', 'São Miguel do Oeste', 'Chapecó', 'Pinhalzinho', 'Iraceminha'];

export const MARCAS = [
  { nome: 'Hering', slug: 'hering' },
  { nome: 'Hering Kids', slug: 'hering-kids' },
  { nome: 'Dzarm', slug: 'dzarm' },
  { nome: 'Hering Intimates', slug: 'hering-intimates' },
];

export const CATEGORIAS = [
  { nome: 'Camisetas', slug: 'camisetas', tamanhos: ['P', 'M', 'G', 'GG'], singular: 'Camiseta', preco: 59.9 },
  { nome: 'Blusas', slug: 'blusas', tamanhos: ['PP', 'P', 'M', 'G'], singular: 'Blusa', preco: 89.9 },
  { nome: 'Calças', slug: 'calcas', tamanhos: ['36', '38', '40', '42', '44', '46'], singular: 'Calça', preco: 179.9 },
  { nome: 'Bermudas', slug: 'bermudas', tamanhos: ['38', '40', '42', '44'], singular: 'Bermuda', preco: 119.9 },
  { nome: 'Vestidos', slug: 'vestidos', tamanhos: ['P', 'M', 'G'], singular: 'Vestido', preco: 199.9 },
  { nome: 'Saias', slug: 'saias', tamanhos: ['36', '38', '40', '42'], singular: 'Saia', preco: 139.9 },
  { nome: 'Moletons', slug: 'moletons', tamanhos: ['P', 'M', 'G', 'GG', 'XG'], singular: 'Moletom', preco: 229.9 },
  { nome: 'Jaquetas', slug: 'jaquetas', tamanhos: ['P', 'M', 'G', 'GG'], singular: 'Jaqueta', preco: 299.9 },
  { nome: 'Pijamas', slug: 'pijamas', tamanhos: ['P', 'M', 'G'], singular: 'Pijama', preco: 149.9 },
  { nome: 'Shorts', slug: 'shorts', tamanhos: ['P', 'M', 'G'], singular: 'Short', preco: 79.9 },
  { nome: 'Meias', slug: 'meias', tamanhos: ['U'], singular: 'Meia', preco: 29.9 },
  { nome: 'Acessórios', slug: 'acessorios', tamanhos: ['U'], singular: 'Bolsa', preco: 99.9 },
  { nome: 'Infantil', slug: 'infantil', tamanhos: ['2', '4', '6', '8', '10'], singular: 'Conjunto infantil', preco: 89.9 },
] as const;

const CORES = ['Preto', 'Branco', 'Azul-marinho', 'Off-white', 'Verde-oliva', 'Caramelo', 'Vinho', 'Cinza mescla', 'Rosa-claro', 'Areia'];
const ESTILOS = ['Básica', 'Essencial', 'Slim', 'Comfort', 'Oversized', 'Canelada', 'Estampada', 'Listrada', 'Premium', 'Malha leve', 'Tricô', 'Fitness', 'Linho', 'Flanelada', 'Moletinho', 'Jeans'];
const GENEROS = ['feminino', 'masculino', 'unissex'] as const;
const ESTACOES = ['inverno', 'verao', null] as const;

export type ProdutoSeed = {
  referencia: string; nome: string; marca: string; categoria: string; subcategoria?: string; genero: string; estacao: string | null;
  cor: string; composicao: string; descricao: string; destaques: string[]; preco: number; precoCheio: number; imperdivel: boolean;
  ativo: boolean; fotos: number; custo: number | null; tamanhos: readonly string[]; estoque: (t: string) => number;
};

/**
 * Peças fixas para os testes ponta a ponta, uma por situação. Vêm primeiro: FIX-ESTOQUE é o produto 1.
 * Os pedidos do seed não usam peças FIX-, então o estoque delas só muda pelos próprios testes.
 */
export const FIXAS: ProdutoSeed[] = [
  base('FIX-ESTOQUE', 'Camiseta Fixa Estoque Farto', 'camisetas', { estoque: () => 500, fotos: 3, imperdivel: true }),
  base('FIX-ULTIMA', 'Camiseta Fixa Última Peça', 'camisetas', { estoque: t => (t === 'M' ? 1 : 0) }),
  base('FIX-ESGOTADO', 'Camiseta Fixa Esgotada', 'camisetas', { estoque: () => 0 }),
  base('FIX-INATIVO', 'Camiseta Fixa Fora do Catálogo', 'camisetas', { ativo: false }),
  base('FIX-PROMO', 'Vestido Fixo em Promoção', 'vestidos', { preco: 79.9, precoCheio: 159.8, imperdivel: true }),
  base('FIX-SEMFOTO', 'Blusa Fixa Sem Foto', 'blusas', { fotos: 0 }),
  base('FIX-SEMCOMPRA', 'Blusa Fixa Sem Valor de Compra', 'blusas', { custo: null }),
  base('FIX-EXCLUIR', 'Meia Fixa Para Excluir', 'meias', { estoque: () => 3 }),
  base('FIX-PRECO', 'Camiseta Fixa Muda Preço', 'camisetas', { estoque: () => 200 }),
  base('FIX-CONDICIONAL', 'Moletom Fixo Condicional', 'moletons', { estoque: () => 300, estacao: 'inverno' }),
  base('FIX-RESERVA', 'Jaqueta Fixa Reserva', 'jaquetas', { estoque: () => 4 }),
];

function base(referencia: string, nome: string, categoria: string, o: Partial<ProdutoSeed> = {}): ProdutoSeed {
  const cat = CATEGORIAS.find(c => c.slug === categoria)!;
  return {
    referencia, nome, marca: 'hering', categoria, genero: 'unissex', estacao: null, cor: 'Preto', composicao: '100% algodão',
    descricao: `${nome}: peça fixa usada pelos testes automatizados.`, destaques: ['Peça de teste'], preco: cat.preco, precoCheio: cat.preco,
    imperdivel: false, ativo: true, fotos: 2, custo: Math.round(cat.preco * 0.45 * 100) / 100, tamanhos: cat.tamanhos, estoque: () => 20, ...o,
  };
}

/**
 * Catálogo gerado: 16 produtos por categoria, com as variações espalhadas por regra (determinístico):
 * promoção, imperdível, inativo, sem foto, sem custo, esgotado, tamanhos zerados, 3 marcas, 3 gêneros, 3 estações.
 */
export function gerarProdutos(): ProdutoSeed[] {
  const lista: ProdutoSeed[] = [...FIXAS];
  let i = 0;
  for (const cat of CATEGORIAS) {
    for (let k = 0; k < 16; k++, i++) {
      const estilo = ESTILOS[(i * 5 + k) % ESTILOS.length];
      const cor = CORES[(i * 3 + k) % CORES.length];
      const promo = i % 4 === 1;
      const preco = Math.round((cat.preco + (k % 5) * 10) * (promo ? 0.7 : 1) * 10) / 10 - (promo ? 0.01 : 0);
      const precoCheio = promo ? Math.round((cat.preco + (k % 5) * 10) * 100) / 100 : preco;
      const esgotado = i % 17 === 5;
      lista.push({
        referencia: `SEED-${String(i + 1).padStart(4, '0')}`,
        nome: `${cat.singular} ${estilo} ${cor}`,
        marca: cat.slug === 'infantil' ? 'hering-kids' : cat.slug === 'meias' ? 'hering-intimates' : i % 6 === 0 ? 'dzarm' : 'hering',
        categoria: cat.slug,
        subcategoria: k % 3 === 0 ? estilo : undefined,
        genero: cat.slug === 'vestidos' || cat.slug === 'saias' ? 'feminino' : GENEROS[i % 3],
        estacao: ESTACOES[i % 3],
        cor,
        composicao: k % 2 ? '100% algodão' : '95% algodão, 5% elastano',
        descricao: `${cat.singular} ${estilo.toLowerCase()} na cor ${cor.toLowerCase()}.`,
        destaques: k % 4 === 0 ? [] : ['Modelagem confortável', `Cor ${cor}`],
        preco: Math.max(9.9, Math.round(preco * 100) / 100),
        precoCheio: Math.max(9.9, precoCheio),
        imperdivel: i % 7 === 3,
        ativo: i % 23 !== 11,
        fotos: i % 11 === 4 ? 0 : 1 + (i % 3),
        custo: i % 13 === 6 ? null : Math.round(cat.preco * (0.35 + (k % 4) * 0.05) * 100) / 100,
        tamanhos: cat.tamanhos,
        estoque: (t: string) => (esgotado ? 0 : (i * 7 + cat.tamanhos.indexOf(t as never) * 3) % 9),
      });
    }
  }
  return lista;
}

/** Pedidos fixos: os que os testes procuram pelo cliente (pendente para recusar exclusão de conta, etc.). */
export async function semearFixasPedidos(
  db: PrismaClient,
  f: { ids: Record<string, string>; clienteIds: Record<string, string>; criarPedido: typeof Criar; confirmarPedido: typeof Confirmar; cancelarPedido: typeof Cancelar },
) {
  const variante = async (ref: string, tamanho: string) =>
    (await db.variante.findFirstOrThrow({ where: { produto: { referencia: ref }, tamanho }, select: { id: true } })).id;
  const helena = await db.cliente.findUniqueOrThrow({ where: { id: f.clienteIds.pendente } });
  // Helena tem um pedido em aberto: a exclusão da conta dela deve ser recusada.
  await f.criarPedido({
    tipo: 'compra', origem: 'loja', clienteId: helena.id, vendedorId: helena.vendedorId, nomeCliente: helena.nome, telefoneCliente: helena.telefone,
    linhas: [{ varianteId: await variante('FIX-ESTOQUE', 'G'), quantidade: 1 }],
  });
  // Venda antiga do vendedor inativo: continua nos relatórios.
  await db.venda.create({ data: { vendedorId: f.ids.fabio, valor: 450, data: new Date(Date.now() - 40 * 864e5), observacao: 'Venda na loja (vendedor que saiu)' } });
}
