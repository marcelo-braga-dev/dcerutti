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
    const c = await criar({ codigo: codigo(), limiteTotal: '3', limitePorCliente: '' });
    const a = await pedidoCom({ cupom: c.codigo, precos: [100] });
    const b = await pedidoCom({ cupom: c.codigo, precos: [70] });
    const { cancelarPedido } = await import('@/server/pedidos');
    await cancelarPedido(b.id, 'equipe');
    expect(a.cupom).toMatchObject({ desconto: 10 });
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

// ---------- Fase 2: cupom no pedido (motor no servidor) e na sacola ----------

type OpcoesCupom = Partial<Parameters<typeof db.cupom.create>[0]['data']>;
const cupomDireto = (o: OpcoesCupom = {}) =>
  db.cupom.create({ data: { codigo: codigo(), tipo: 'percentual', valor: 10, limitePorCliente: null, ...o } as Parameters<typeof db.cupom.create>[0]['data'] });

async function pedidoCom(o: { cupom?: string | null; tipo?: 'compra' | 'condicional'; precos?: number[]; regraFrete?: { valor: number; gratisAcima: number } | null; quem?: 'cliente' | 'equipe' }) {
  const cli = await clientePorNome('Juliana Ferreira');
  const linhas = [];
  for (const preco of o.precos ?? [100, 200]) {
    const { v } = await produtoDeTeste({ estoque: { M: 5 }, preco });
    linhas.push({ varianteId: v.M, quantidade: 1 });
  }
  return criarPedido({
    tipo: o.tipo ?? 'compra', origem: 'loja', clienteId: cli.id, vendedorId: cli.vendedorId, nomeCliente: cli.nome, telefoneCliente: cli.telefone,
    cep: o.tipo === 'condicional' ? '89874-000' : null, linhas, regraFrete: o.regraFrete ?? null,
    cupom: o.cupom ? { codigo: o.cupom, quem: o.quem ?? 'cliente' } : null,
  });
}
const itensDe = (pedidoId: string) => db.pedidoItem.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } });

describe('cupom no pedido', () => {
  it('aplica ao criar: desconto por peça, total, histórico e venda na confirmação', async () => {
    const c = await cupomDireto();
    const p = await pedidoCom({ cupom: c.codigo.toLowerCase() });
    expect(p.cupom).toEqual({ codigo: c.codigo, desconto: 30, freteGratis: false });
    const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect([ped.cupomId, Number(ped.descontoCupom), Number(ped.total)]).toEqual([c.id, 30, 270]);
    expect((await itensDe(p.id)).map(i => Number(i.descontoCupom))).toEqual([10, 20]);
    expect((await db.pedidoHistorico.findFirstOrThrow({ where: { pedidoId: p.id, acao: 'criado' } })).mudancas).toEqual([expect.stringMatching(new RegExp(`Cupom ${c.codigo} aplicado \\(−R\\$\\s30,00\\)`))]);
    const { confirmarPedido } = await import('@/server/pedidos');
    await confirmarPedido(p.id, {}, (await comoUsuario('ana@dcerutti.local')).id);
    expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: p.id } })).valor)).toBe(270);
  });

  it('recusado: o pedido não é gravado e o motivo sobe', async () => {
    const c = await cupomDireto({ minimoCompra: 1000 });
    const antes = await db.pedido.count();
    await expect(pedidoCom({ cupom: c.codigo })).rejects.toThrow(/Faltam R\$\s700,00/);
    await expect(pedidoCom({ cupom: 'NAOEXISTE999' })).rejects.toThrow('Cupom não encontrado.');
    const s = await cupomDireto({ quemAplica: 'equipe' });
    await expect(pedidoCom({ cupom: s.codigo })).rejects.toThrow(/vendedor/);
    expect(await db.pedido.count()).toBe(antes);
  });

  it('limite total com dois pedidos ao mesmo tempo: só um passa; cancelar devolve o uso', async () => {
    const c = await cupomDireto({ limiteTotal: 1 });
    const r = await Promise.allSettled([pedidoCom({ cupom: c.codigo, precos: [100] }), pedidoCom({ cupom: c.codigo, precos: [100] })]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find(x => x.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: 'Este cupom esgotou.' }) });
    const ok = (r.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof pedidoCom>>>).value;
    const { cancelarPedido } = await import('@/server/pedidos');
    await cancelarPedido(ok.id, 'equipe');
    await expect(pedidoCom({ cupom: c.codigo, precos: [100] })).resolves.toMatchObject({ cupom: { codigo: c.codigo } });
  });

  it('limite por cliente vale entre fichas com o mesmo telefone', async () => {
    const c = await cupomDireto({ limitePorCliente: 1 });
    await pedidoCom({ cupom: c.codigo, precos: [100] });
    const juliana = await clientePorNome('Juliana Ferreira');
    const outra = await db.cliente.create({ data: { nome: 'Juliana (outra ficha)', telefone: juliana.telefone, vendedorId: juliana.vendedorId } });
    const { v } = await produtoDeTeste({ estoque: { M: 5 }, preco: 100 });
    await expect(criarPedido({ tipo: 'compra', origem: 'loja', clienteId: outra.id, vendedorId: outra.vendedorId, nomeCliente: outra.nome, telefoneCliente: outra.telefone, linhas: [{ varianteId: v.M, quantidade: 1 }], cupom: { codigo: c.codigo, quem: 'cliente' } }))
      .rejects.toThrow(/já foi usado/);
  });

  it('frete grátis: zera o frete com regra e com frete a combinar; condicional recusa', async () => {
    const c = await cupomDireto({ tipo: 'freteGratis', valor: null });
    const comRegra = await pedidoCom({ cupom: c.codigo, precos: [100], regraFrete: { valor: 24.9, gratisAcima: 500 } });
    expect(await db.pedido.findUniqueOrThrow({ where: { id: comRegra.id } })).toMatchObject({ freteCupom: true });
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: comRegra.id } })).frete)).toBe(0);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: comRegra.id } })).total)).toBe(100);
    const aCombinar = await pedidoCom({ cupom: c.codigo, precos: [100] });
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: aCombinar.id } })).frete)).toBe(0);
    await expect(pedidoCom({ cupom: c.codigo, tipo: 'condicional' })).rejects.toThrow(/entrega/);
  });

  it('edição: recalcula o desconto, soma com o desconto do vendedor e retira o cupom que deixou de valer', async () => {
    const c = await cupomDireto({ minimoCompra: 250 });
    const p = await pedidoCom({ cupom: c.codigo });
    const [a, b] = await itensDe(p.id);
    const { editarPedido } = await import('@/server/pedidos');
    const autor = { usuarioId: (await comoUsuario('ana@dcerutti.local')).id };
    // Vendedor dá R$ 20 na calça: o cupom (10%) passa a valer sobre 280.
    await editarPedido(p.id, [{ itemId: a.id, varianteId: a.varianteId, quantidade: 1, preco: 100 }, { itemId: b.id, varianteId: b.varianteId, quantidade: 1, preco: 180 }], null, autor);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).descontoCupom)).toBe(28);
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBe(252);
    // Retira a camiseta: 180 fica abaixo do mínimo de 250 e o cupom sai, com o motivo no histórico.
    await editarPedido(p.id, [{ itemId: b.id, varianteId: b.varianteId, quantidade: 1, preco: 180 }], null, autor);
    const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect([ped.cupomId, ped.codigoCupom, Number(ped.descontoCupom), Number(ped.total)]).toEqual([null, null, 0, 180]);
    const h = await db.pedidoHistorico.findFirstOrThrow({ where: { pedidoId: p.id, acao: 'editado' }, orderBy: { id: 'desc' } });
    expect(h.mudancas).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`Cupom ${c.codigo} retirado: Faltam`))]));
  });

  it('cupom que venceu depois do pedido continua na edição (só conta, mínimo e abrangência são refeitos)', async () => {
    const c = await cupomDireto();
    const p = await pedidoCom({ cupom: c.codigo });
    await db.cupom.update({ where: { id: c.id }, data: { ativo: false, fimEm: new Date(Date.now() - 1000) } });
    const [a, b] = await itensDe(p.id);
    const { editarPedido } = await import('@/server/pedidos');
    await editarPedido(p.id, [{ itemId: a.id, varianteId: a.varianteId, quantidade: 2, preco: 100 }, { itemId: b.id, varianteId: b.varianteId, quantidade: 1, preco: 200 }], null, { usuarioId: (await comoUsuario('ana@dcerutti.local')).id });
    expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ cupomId: c.id });
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).descontoCupom)).toBe(40);
  });

  it('condicional fechado em parte: cupom sobre o que ficou; abaixo do mínimo, sai e a venda vai sem ele', async () => {
    const { confirmarPedido } = await import('@/server/pedidos');
    const ana = (await comoUsuario('ana@dcerutti.local')).id;
    const c = await cupomDireto();
    const p = await pedidoCom({ cupom: c.codigo, tipo: 'condicional' });
    const [a, b] = await itensDe(p.id);
    await confirmarPedido(p.id, { [a.id]: 0, [b.id]: 1 }, ana);
    expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: p.id } })).valor)).toBe(180);
    expect((await itensDe(p.id)).map(i => [i.situacao, Number(i.descontoCupom)])).toEqual([['devolvido', 0], ['vendido', 20]]);

    const m = await cupomDireto({ minimoCompra: 250 });
    const q = await pedidoCom({ cupom: m.codigo, tipo: 'condicional' });
    const [x, y] = await itensDe(q.id);
    await confirmarPedido(q.id, { [x.id]: 0, [y.id]: 1 }, ana);
    expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: q.id } })).valor)).toBe(200);
    expect(await db.pedido.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ cupomId: null });
    expect((await db.pedidoHistorico.findFirstOrThrow({ where: { pedidoId: q.id, acao: 'confirmado' } })).mudancas).toEqual(expect.arrayContaining([expect.stringMatching(/retirado: Faltam/)]));
  });
});

describe('cupom na sacola (cliente)', () => {
  it('desligado: prévia recusa e o envio ignora o código', async () => {
    const { salvarConfig } = await import('@/server/config');
    const { previaCupom, enviarPedido } = await import('@/server/acoes/pedidos');
    await salvarConfig({ cupons: { ligados: false, vendedorAplica: true } });
    await entrarComo('cliente@dcerutti.local');
    const c = await cupomDireto();
    const { v } = await produtoDeTeste({ estoque: { M: 3 }, preco: 100 });
    expect(await previaCupom({ codigo: c.codigo, tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 1 }] })).toEqual({ ok: false, erro: 'Os cupons não estão disponíveis agora.' });
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.M, quantidade: 1 }], cupom: c.codigo });
    expect(r).toMatchObject({ ok: true, cupom: null });
  });

  it('ligado: prévia com a regra, envio com o cupom na mensagem; código errado conta tentativa', async () => {
    const { salvarConfig } = await import('@/server/config');
    const { previaCupom, enviarPedido } = await import('@/server/acoes/pedidos');
    await salvarConfig({ cupons: { ligados: true, vendedorAplica: true } });
    try {
      await entrarComo('cliente@dcerutti.local');
      const c = await cupomDireto({ tetoDesconto: 50 });
      const { v } = await produtoDeTeste({ estoque: { M: 3 }, preco: 100 });
      const linhas = [{ varianteId: v.M, quantidade: 2 }];
      expect(await previaCupom({ codigo: ` ${c.codigo.toLowerCase()} `, tipo: 'compra', linhas })).toEqual({ ok: true, codigo: c.codigo, desconto: 20, freteGratis: false, regra: expect.stringMatching(/^10% de desconto \(até R\$\s50,00\)/) });
      expect(await previaCupom({ codigo: 'NAOEXISTE1', tipo: 'compra', linhas })).toEqual({ ok: false, erro: expect.stringMatching(/não encontrado/) });
      const r = await enviarPedido({ tipo: 'compra', linhas, cupom: c.codigo });
      expect(r).toMatchObject({ ok: true, cupom: { codigo: c.codigo, desconto: 20 } });
      if (!r.ok) return;
      const texto = decodeURIComponent(r.url.split('?text=')[1]);
      expect(texto).toMatch(new RegExp(`Cupom ${c.codigo}: −R\\$\\s20,00`));
      expect(texto).toMatch(/Total: \*R\$\s180,00\*/);
      // Muitas tentativas com código errado: bloqueia a prévia por um tempo.
      for (let i = 0; i < 10; i++) await previaCupom({ codigo: `ERRADO${i}`, tipo: 'compra', linhas });
      expect(await previaCupom({ codigo: c.codigo, tipo: 'compra', linhas })).toEqual({ ok: false, erro: expect.stringMatching(/Muitos códigos errados/) });
    } finally {
      await salvarConfig({ cupons: { ligados: false, vendedorAplica: true } });
    }
  });
});

// ---------- Fase 3: cupom aplicado pela equipe ----------

describe('cupom no painel (equipe)', () => {
  const ligar = async (vendedorAplica = true) => (await import('@/server/config')).salvarConfig({ cupons: { ligados: true, vendedorAplica } });
  const desligar = async () => (await import('@/server/config')).salvarConfig({ cupons: { ligados: false, vendedorAplica: true } });

  it('aplicar, trocar e retirar num pedido pendente, com histórico e o link do WhatsApp atualizado', async () => {
    const { cupomDoPedido } = await import('@/server/acoes/pedidos');
    await ligar();
    try {
      const a = await cupomDireto(), b = await cupomDireto({ tipo: 'valor', valor: 50 });
      const p = await pedidoCom({});
      await entrarComo('ana@dcerutti.local'); // Juliana é cliente da Ana
      const r = await cupomDoPedido(p.id, a.codigo.toLowerCase(), 'Cliente pediu o cupom da campanha');
      expect(r).toMatchObject({ ok: true, url: expect.stringContaining('wa.me') });
      expect(decodeURIComponent(r.url!.split('?text=')[1])).toMatch(new RegExp(`Cupom ${a.codigo}: −R\\$\\s30,00`));
      expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).total)).toBe(270);
      expect(await cupomDoPedido(p.id, b.codigo)).toMatchObject({ ok: true });
      expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ cupomId: b.id, codigoCupom: b.codigo });
      expect(await cupomDoPedido(p.id, null)).toMatchObject({ ok: true });
      const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
      expect([ped.cupomId, Number(ped.descontoCupom), Number(ped.total)]).toEqual([null, 0, 300]);
      expect(await cupomDoPedido(p.id, null)).toEqual({ ok: false, erro: 'Este pedido não tem cupom.' });
      const h = await db.pedidoHistorico.findMany({ where: { pedidoId: p.id, acao: 'editado' }, orderBy: { id: 'asc' } });
      expect(h.map(x => x.mudancas)).toEqual([
        [expect.stringMatching(new RegExp(`Cupom ${a.codigo} aplicado`))],
        [`Cupom ${a.codigo} trocado`, expect.stringMatching(new RegExp(`Cupom ${b.codigo} aplicado`))],
        [`Cupom ${b.codigo} retirado`],
      ]);
      expect(h[0].observacao).toBe('Cliente pediu o cupom da campanha');
    } finally {
      await desligar();
    }
  });

  it('regras: desligado, vendedor não liberado (gestor pode), cupom só da cliente, pedido de outro vendedor e pedido fechado', async () => {
    const { cupomDoPedido } = await import('@/server/acoes/pedidos');
    const c = await cupomDireto();
    const soCliente = await cupomDireto({ quemAplica: 'cliente' });
    const p = await pedidoCom({});
    await entrarComo('ana@dcerutti.local');
    expect(await cupomDoPedido(p.id, c.codigo)).toEqual({ ok: false, erro: 'Os cupons estão desligados em Configurações.' });
    await ligar(false);
    try {
      expect(await cupomDoPedido(p.id, c.codigo)).toEqual({ ok: false, erro: 'A loja não liberou vendedores para aplicar cupons.' });
      await entrarComo('gestor@dcerutti.local');
      expect(await cupomDoPedido(p.id, soCliente.codigo)).toEqual({ ok: false, erro: expect.stringMatching(/só para a cliente/) });
      expect(await cupomDoPedido(p.id, c.codigo)).toMatchObject({ ok: true });
      await ligar(true);
      await entrarComo('carlos@dcerutti.local');
      expect(await cupomDoPedido(p.id, null)).toEqual({ ok: false, erro: 'Pedido não encontrado.' });
      const { cancelarPedido } = await import('@/server/pedidos');
      await cancelarPedido(p.id, 'equipe');
      await entrarComo('ana@dcerutti.local');
      expect(await cupomDoPedido(p.id, null)).toEqual({ ok: false, erro: expect.stringMatching(/já foi fechado/) });
    } finally {
      await desligar();
    }
  });

  it('seleção e venda na loja com cupom: mensagem do vendedor com o cupom e venda com o desconto; frete grátis recusado no balcão', async () => {
    const { criarSelecao } = await import('@/server/acoes/pedidos');
    await ligar();
    try {
      await entrarComo('ana@dcerutti.local');
      const juliana = await clientePorNome('Juliana Ferreira');
      const c = await cupomDireto({ tipo: 'valor', valor: 15 });
      const { v } = await produtoDeTeste({ estoque: { M: 5 }, preco: 100 });
      const sel = await criarSelecao({ clienteId: juliana.id, linhas: [{ varianteId: v.M, quantidade: 1 }], cupom: c.codigo });
      expect(sel).toMatchObject({ ok: true, cupom: { codigo: c.codigo, desconto: 15 } });
      if (sel.ok) expect(decodeURIComponent(sel.url.split('?text=')[1])).toMatch(/Total: \*R\$\s85,00\*/);

      const balcao = await criarSelecao({ clienteId: juliana.id, linhas: [{ varianteId: v.M, quantidade: 1 }], tipo: 'balcao', cupom: c.codigo });
      expect(balcao.ok).toBe(true);
      expect(Number((await db.venda.findUniqueOrThrow({ where: { pedidoId: balcao.pedidoId } })).valor)).toBe(85);

      const frete = await cupomDireto({ tipo: 'freteGratis', valor: null });
      expect(await criarSelecao({ clienteId: juliana.id, linhas: [{ varianteId: v.M, quantidade: 1 }], tipo: 'balcao', cupom: frete.codigo }))
        .toEqual({ ok: false, erro: 'Este cupom vale só para pedido com entrega.' });
    } finally {
      await desligar();
    }
  });
});
