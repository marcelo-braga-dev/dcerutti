/** Cupons (docs/20-cupons.md), fase 1: cadastro só do gestor, travas do cupom usado e a lista de divulgação do vendedor. */
import { beforeEach, describe, expect, it } from 'vitest';
import { alternarCupom, apagarCupom, salvarCupom } from '@/server/acoes/cupons';
import { cuponsParaDivulgar, listarCupons } from '@/server/consultas/cupons';
import { criarPedido } from '@/server/pedidos';
import { clientePorNome, comoUsuario, db, entrarComo, esperarErroDeCampo, form, produtoDeTeste, redirecionou } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const codigo = () => `T${Date.now().toString(36).toUpperCase()}${seq++}`;

/** FormData do cupom; listas (categorias, marcas, clientes) com um campo por item. */
function fdCupom(campos: Record<string, string | boolean | number | undefined>, listas: Record<string, (string | number)[]> = {}) {
  const fd = form({ tipo: 'percentual', valor: '10', quemAplica: 'ambos', limitePorCliente: '1', ativo: true, ...campos });
  for (const [k, vs] of Object.entries(listas)) for (const v of vs) fd.append(k, String(v));
  return fd;
}
async function criar(campos: Record<string, string | boolean | number | undefined>, listas: Record<string, (string | number)[]> = {}) {
  const destino = await redirecionou(salvarCupom(vazio, fdCupom(campos, listas)));
  const id = Number(destino.match(/\/painel\/cupons\/(\d+)/)![1]);
  return db.cupom.findUniqueOrThrow({ where: { id }, include: { categorias: true, marcas: true, produtos: true, clientes: true } });
}

beforeEach(() => entrarComo('gestor@dcerutti.local'));

describe('só o gestor mexe em cupons', () => {
  it('vendedor e cliente são barrados nas actions e nas consultas do gestor', async () => {
    for (const email of ['ana@dcerutti.local', 'cliente@dcerutti.local']) {
      await entrarComo(email);
      await redirecionou(salvarCupom(vazio, fdCupom({ codigo: codigo() })));
      await redirecionou(alternarCupom(1, false));
      await redirecionou(apagarCupom(1));
    }
    await expect(listarCupons(await comoUsuario('ana@dcerutti.local'))).rejects.toThrow(/gestor/);
  });
});

describe('cadastro', () => {
  it('cria com abrangência, produtos pela referência, clientes e validade no fuso de São Paulo', async () => {
    const cat = await db.categoria.findFirstOrThrow();
    const marca = await db.marca.findFirstOrThrow();
    const { produto, ref } = await produtoDeTeste();
    const juliana = await clientePorNome('Juliana Ferreira');
    const cod = codigo();
    const c = await criar(
      { codigo: ` ${cod.toLowerCase()} `, valor: '15,5', tetoDesconto: '50', minimoCompra: '1.500,00', inicio: '2026-11-01', fim: '2026-11-30', limiteTotal: '100', referencias: ref.toLowerCase(), valePromocao: true, somentePrimeiraCompra: true },
      { categorias: [cat.id], marcas: [marca.id], clientes: [juliana.id] },
    );
    expect(c).toMatchObject({ codigo: cod, tipo: 'percentual', limiteTotal: 100, limitePorCliente: 1, valePromocao: true, somentePrimeiraCompra: true, ativo: true, quemAplica: 'ambos' });
    expect([Number(c.valor), Number(c.tetoDesconto), Number(c.minimoCompra)]).toEqual([15.5, 50, 1500]);
    expect(c.inicioEm.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(c.fimEm!.toISOString()).toBe('2026-12-01T02:59:59.999Z');
    expect(c.categorias.map(x => x.categoriaId)).toEqual([cat.id]);
    expect(c.marcas.map(x => x.marcaId)).toEqual([marca.id]);
    expect(c.produtos.map(x => x.produtoId)).toEqual([produto.id]);
    expect(c.clientes.map(x => x.clienteId)).toEqual([juliana.id]);
  });

  it('frete grátis não guarda valor nem teto; valor fixo não guarda teto', async () => {
    const f = await criar({ codigo: codigo(), tipo: 'freteGratis', valor: '10', tetoDesconto: '5' });
    expect([f.valor, f.tetoDesconto]).toEqual([null, null]);
    const v = await criar({ codigo: codigo(), tipo: 'valor', valor: '20', tetoDesconto: '5' });
    expect([Number(v.valor), v.tetoDesconto]).toEqual([20, null]);
  });

  it('validações: código, duplicado (sem diferenciar maiúsculas), percentual, valor, datas e referência', async () => {
    const cod = codigo();
    await criar({ codigo: cod });
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: 'AB' })), 'codigo');
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: cod.toLowerCase() })), 'codigo', /Já existe/);
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: codigo(), valor: '120' })), 'valor', /percentual/);
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: codigo(), tipo: 'valor', valor: '' })), 'valor', /reais/);
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: codigo(), inicio: '2026-11-10', fim: '2026-11-01' })), 'fim');
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: codigo(), limiteTotal: '0' })), 'limiteTotal');
    esperarErroDeCampo(await salvarCupom(vazio, fdCupom({ codigo: codigo(), referencias: 'NAOEXISTE123' })), 'referencias', /NAOEXISTE123/);
  });

  it('cupom sem uso: edita tudo e pode ser apagado; desativar e ativar', async () => {
    const c = await criar({ codigo: codigo() });
    expect(await salvarCupom(vazio, fdCupom({ id: c.id, codigo: c.codigo, tipo: 'valor', valor: '25' }))).toMatchObject({ ok: true });
    expect(Number((await db.cupom.findUniqueOrThrow({ where: { id: c.id } })).valor)).toBe(25);
    expect(await alternarCupom(c.id, false)).toEqual({ ok: true });
    expect((await db.cupom.findUniqueOrThrow({ where: { id: c.id } })).ativo).toBe(false);
    expect(await alternarCupom(c.id, true)).toEqual({ ok: true });
    expect(await redirecionou(apagarCupom(c.id))).toBe('/painel/cupons');
    expect(await db.cupom.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it('cupom usado: valor, tipo, código e abrangência travados; validade, limites e descrição continuam editáveis; não apaga', async () => {
    const c = await criar({ codigo: codigo() });
    const { v } = await produtoDeTeste();
    const cli = await clientePorNome('Juliana Ferreira');
    const p = await criarPedido({ tipo: 'compra', origem: 'loja', clienteId: cli.id, vendedorId: cli.vendedorId, nomeCliente: cli.nome, telefoneCliente: cli.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    await db.pedido.update({ where: { id: p.id }, data: { cupomId: c.id, codigoCupom: c.codigo } });

    const r = await salvarCupom(vazio, fdCupom({ id: c.id, codigo: c.codigo, valor: '20' }));
    expect(r.erro).toMatch(/já foi usado/);
    expect((await salvarCupom(vazio, fdCupom({ id: c.id, codigo: `${c.codigo}X` }))).erro).toMatch(/já foi usado/);
    expect(await salvarCupom(vazio, fdCupom({ id: c.id, codigo: c.codigo, descricao: 'Campanha', fim: '2026-12-31', limiteTotal: '5' }))).toMatchObject({ ok: true });
    expect(await db.cupom.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ descricao: 'Campanha', limiteTotal: 5 });
    expect(await apagarCupom(c.id)).toEqual({ ok: false, erro: expect.stringMatching(/desative/) });
  });
});

describe('lista do gestor e divulgação do vendedor (P-13)', () => {
  it('gestor vê usos e desconto; pedido cancelado não conta como uso', async () => {
    const c = await criar({ codigo: codigo(), limiteTotal: '3' });
    const { v } = await produtoDeTeste();
    const cli = await clientePorNome('Juliana Ferreira');
    const novo = () => criarPedido({ tipo: 'compra', origem: 'loja', clienteId: cli.id, vendedorId: cli.vendedorId, nomeCliente: cli.nome, telefoneCliente: cli.telefone, linhas: [{ varianteId: v.P, quantidade: 1 }] });
    const a = await novo(), b = await novo();
    await db.pedido.update({ where: { id: a.id }, data: { cupomId: c.id, descontoCupom: 10 } });
    await db.pedido.update({ where: { id: b.id }, data: { cupomId: c.id, descontoCupom: 7, status: 'cancelado', canceladoEm: new Date(), motivoCancelamento: 'equipe' } });
    const linha = (await listarCupons(await comoUsuario('gestor@dcerutti.local'))).find(x => x.cupom.id === c.id)!;
    expect(linha).toMatchObject({ usos: 1, desconto: 10, situacao: 'ativo' });
  });

  it('vendedor vê ativos e agendados, não vê desativados, expirados nem cupom de cliente de outro vendedor, e não recebe números', async () => {
    const ana = await comoUsuario('ana@dcerutti.local');
    const daAna = await db.cliente.findFirstOrThrow({ where: { vendedorId: ana.id, NOT: { telefone: '' } } });
    const deOutro = await db.cliente.findFirstOrThrow({ where: { NOT: [{ vendedorId: ana.id }, { telefone: '' }] } });
    const ativo = await criar({ codigo: codigo() });
    const agendado = await criar({ codigo: codigo(), inicio: '2099-01-01' });
    const desativado = await criar({ codigo: codigo(), ativo: false });
    const expirado = await criar({ codigo: codigo(), inicio: '2020-01-01', fim: '2020-01-31' });
    const meu = await criar({ codigo: codigo() }, { clientes: [daAna.id, deOutro.id] });
    const alheio = await criar({ codigo: codigo() }, { clientes: [deOutro.id] });

    const lista = await cuponsParaDivulgar(ana);
    const ids = lista.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining([ativo.id, agendado.id, meu.id]));
    for (const id of [desativado.id, expirado.id, alheio.id]) expect(ids).not.toContain(id);
    expect(lista.find(c => c.id === meu.id)!.clientes).toEqual([{ id: daAna.id, nome: daAna.nome }]);
    expect(lista.find(c => c.id === agendado.id)!.situacao).toBe('agendado');
    for (const c of lista) expect(Object.keys(c)).not.toEqual(expect.arrayContaining(['usos', 'desconto']));
  });
});
