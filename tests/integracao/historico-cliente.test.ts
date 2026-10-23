/** Histórico do cliente (docs/21): registro da navegação, escopo do vendedor, sacola parada, retenção e LGPD. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/atividade/route';
import { excluirMinhaConta } from '@/server/acoes/conta';
import { salvarConfig, CONFIG_PADRAO } from '@/server/config';
import { interesseDoCliente, interessadosAgora, linhaDoTempo, relatorioInteresse } from '@/server/consultas/navegacao';
import { avisarSacolasParadas, manutencaoHistorico, registrarLogin } from '@/server/navegacao';
import { clientePorEmail, comoUsuario, db, entrarComo, produtoDeTeste } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

const CELULAR = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

function enviar(eventos: unknown, cabecalhos: Record<string, string> = {}) {
  return POST(new Request('https://teste.dcerutti.local/api/atividade', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'user-agent': CELULAR, host: 'teste.dcerutti.local', ...cabecalhos },
    body: typeof eventos === 'string' ? eventos : JSON.stringify({ eventos }),
  }));
}

const ref = () => Math.random().toString(36).slice(2, 12);

beforeEach(async () => {
  await entrarComo(null);
  await salvarConfig({ historico: CONFIG_PADRAO.historico });
});

afterAll(async () => {
  await salvarConfig({ historico: CONFIG_PADRAO.historico });
  await depoisDaResposta();
});

describe('registro da navegação (/api/atividade)', () => {
  it('grava acesso, peça, busca, tamanho, sacola e tempo da cliente logada', async () => {
    await entrarComo('cliente@dcerutti.local');
    const c = await clientePorEmail('cliente@dcerutti.local');
    await db.cliente.update({ where: { id: c.id }, data: { ultimoAcessoEm: null } });
    const { produto, v } = await produtoDeTeste({ estoque: { P: 2, M: 3 } });
    const r1 = ref(), r2 = ref();
    const res = await enviar([
      { tipo: 'pagina', ref: r1, caminho: `/produto/${produto.referencia}` },
      { tipo: 'tamanho', varianteId: v.M },
      { tipo: 'sacola', varianteId: v.M, delta: 1 },
      { tipo: 'carrinho', itens: [{ varianteId: v.M, quantidade: 1 }] },
      { tipo: 'pagina', ref: r2, caminho: '/catalogo?q=zzzznaoexiste&tamanho=M' },
    ]);
    expect(res.status).toBe(204);
    expect((await enviar([{ tipo: 'duracao', ref: r1, seg: 42 }, { tipo: 'duracao', ref: r1, seg: 8 }])).status).toBe(204);

    const eventos = await db.atividade.findMany({ where: { clienteId: c.id, criadoEm: { gte: new Date(Date.now() - 60_000) } }, orderBy: { id: 'asc' } });
    const porTipo = (t: string) => eventos.filter(e => e.tipo === t);
    expect(porTipo('acesso')).toHaveLength(1);
    expect(porTipo('acesso')[0].aparelho).toBe('celular');
    expect(porTipo('produto')[0]).toMatchObject({ produtoId: produto.id, duracaoSeg: 50 });
    expect(porTipo('tamanho')[0]).toMatchObject({ produtoId: produto.id, varianteId: v.M, termo: 'M' });
    expect(porTipo('sacola')[0]).toMatchObject({ varianteId: v.M, dados: { delta: 1 } });
    expect(porTipo('busca')[0]).toMatchObject({ termo: 'zzzznaoexiste', dados: { resultados: 0, filtros: { tamanho: 'M' } } });
    expect((await db.sacolaCliente.findUniqueOrThrow({ where: { clienteId: c.id } })).itens).toEqual([{ varianteId: v.M, quantidade: 1 }]);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).ultimoAcessoEm).not.toBeNull();

    // Recarregar a mesma peça logo em seguida não conta outra vez; nem começa outra visita.
    await enviar([{ tipo: 'pagina', ref: ref(), caminho: `/produto/${produto.referencia}` }]);
    expect(await db.atividade.count({ where: { clienteId: c.id, tipo: 'produto', produtoId: produto.id } })).toBe(1);
    expect(await db.atividade.count({ where: { clienteId: c.id, tipo: 'acesso', criadoEm: { gte: new Date(Date.now() - 60_000) } } })).toBe(1);

    // Sacola vazia (pedido enviado ou peças tiradas) apaga a cópia.
    await enviar([{ tipo: 'carrinho', itens: [] }]);
    expect(await db.sacolaCliente.count({ where: { clienteId: c.id } })).toBe(0);
  });

  it('equipe, visitante e histórico desligado não gravam nada', async () => {
    const antes = await db.atividade.count();
    await entrarComo('ana@dcerutti.local');
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '/' }])).status).toBe(204);
    await entrarComo(null);
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '/' }])).status).toBe(204);
    await entrarComo('cliente@dcerutti.local');
    await salvarConfig({ historico: { ...CONFIG_PADRAO.historico, ligado: false } });
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '/sacola' }])).status).toBe(204);
    expect(await db.atividade.count()).toBe(antes);
  });

  it('recusa outra origem, corpo inválido e caminhos de fora da loja', async () => {
    await entrarComo('cliente@dcerutti.local');
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '/' }], { origin: 'https://outro.site' })).status).toBe(403);
    expect((await enviar('isto não é json')).status).toBe(400);
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '/painel/clientes' }])).status).toBe(400);
    expect((await enviar([{ tipo: 'pagina', ref: ref(), caminho: '//evil.com' }])).status).toBe(400);
    expect((await enviar([{ tipo: 'inventado' }])).status).toBe(400);
  });

  it('login de cliente é registrado; de vendedor, não', async () => {
    const c = await clientePorEmail('cliente@dcerutti.local');
    const u = await db.user.findUniqueOrThrow({ where: { email: 'cliente@dcerutti.local' } });
    await registrarLogin(u.id, CELULAR);
    expect((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).ultimoLoginEm).not.toBeNull();
    const ana = await db.user.findUniqueOrThrow({ where: { email: 'ana@dcerutti.local' } });
    const antes = await db.atividade.count({ where: { tipo: 'login' } });
    await registrarLogin(ana.id, CELULAR);
    expect(await db.atividade.count({ where: { tipo: 'login' } })).toBe(antes);
  });
});

describe('leituras do painel', () => {
  it('o vendedor só vê as clientes dele; o gestor vê todas', async () => {
    const c = await clientePorEmail('cliente@dcerutti.local'); // cliente da Ana
    const ana = await comoUsuario('ana@dcerutti.local');
    const carlos = await comoUsuario('carlos@dcerutti.local');
    const gestor = await comoUsuario('gestor@dcerutti.local');
    expect(await interesseDoCliente(ana, c.id)).not.toBeNull();
    expect(await interesseDoCliente(gestor, c.id)).not.toBeNull();
    expect(await interesseDoCliente(carlos, c.id)).toBeNull();
    expect(await linhaDoTempo(carlos, c.id)).toBeNull();

    const linha = await linhaDoTempo(ana, c.id);
    expect(linha!.visitas.length).toBeGreaterThan(0);
    const pecas = await linhaDoTempo(ana, c.id, 50, 'pecas');
    expect(pecas!.visitas.flatMap(v => v.eventos).every(i => i.tipo === 'atividade' && ['produto', 'tamanho'].includes(i.evento.tipo))).toBe(true);

    const deAna = await relatorioInteresse(ana, 30);
    const deCarlos = await relatorioInteresse(carlos, 30);
    expect(deAna.kpis.clientesAtivas).toBeGreaterThan(0);
    expect(deCarlos.maisAtivas.some(m => m.id === c.id)).toBe(false);
    expect((await relatorioInteresse(gestor, 30)).porVendedor.length).toBeGreaterThan(0);
  });

  it('interessados agora: sacola aberta aparece para o vendedor dela', async () => {
    const c = await clientePorEmail('cliente@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    await db.sacolaCliente.upsert({ where: { clienteId: c.id }, create: { clienteId: c.id, itens: [{ varianteId: v.M, quantidade: 2 }] }, update: { itens: [{ varianteId: v.M, quantidade: 2 }] } });
    await db.cliente.update({ where: { id: c.id }, data: { ultimoAcessoEm: new Date() } });
    const lista = await interessadosAgora(await comoUsuario('ana@dcerutti.local'));
    expect(lista.find(x => x.id === c.id)?.motivos[0]).toBe('2 peças na sacola');
    expect((await interessadosAgora(await comoUsuario('carlos@dcerutti.local'))).some(x => x.id === c.id)).toBe(false);
    await db.sacolaCliente.deleteMany({ where: { clienteId: c.id } });
  });
});

describe('manutenção', () => {
  it('sacola parada avisa uma vez; com pedido depois, não avisa', async () => {
    // Cliente nova: as do seed têm pedidos recentes (datas relativas a hoje), e pedido depois da sacola não avisa.
    const base = await clientePorEmail('cliente.carlos@dcerutti.local');
    const c = await db.cliente.create({ data: { nome: 'Cliente Sacola Parada', telefone: '(49) 99900-0000', vendedorId: base.vendedorId } });
    const { v } = await produtoDeTeste({ estoque: { M: 3 } });
    await db.sacolaCliente.upsert({ where: { clienteId: c.id }, create: { clienteId: c.id, itens: [{ varianteId: v.M, quantidade: 1 }] }, update: { itens: [{ varianteId: v.M, quantidade: 1 }], avisadoEm: null } });
    const agora = new Date();
    await db.$executeRaw`UPDATE sacola_cliente SET atualizadoEm = ${new Date(agora.getTime() - 30 * 3600_000)} WHERE clienteId = ${c.id}`;
    expect(await avisarSacolasParadas(agora)).toBeGreaterThanOrEqual(1);
    expect((await db.sacolaCliente.findUniqueOrThrow({ where: { clienteId: c.id } })).avisadoEm).not.toBeNull();
    expect(await avisarSacolasParadas(agora)).toBe(0);

    // Recém-mexida: ainda não avisa.
    await db.sacolaCliente.update({ where: { clienteId: c.id }, data: { itens: [{ varianteId: v.M, quantidade: 2 }], avisadoEm: null } });
    expect(await avisarSacolasParadas(agora)).toBe(0);

    // Aviso desligado: nada.
    await db.$executeRaw`UPDATE sacola_cliente SET atualizadoEm = ${new Date(agora.getTime() - 30 * 3600_000)}, avisadoEm = NULL WHERE clienteId = ${c.id}`;
    await salvarConfig({ historico: { ...CONFIG_PADRAO.historico, avisarSacola: false } });
    expect(await avisarSacolasParadas(agora)).toBe(0);
    await db.sacolaCliente.deleteMany({ where: { clienteId: c.id } });
    await db.cliente.delete({ where: { id: c.id } });
  });

  it('apaga o histórico com mais de 12 meses', async () => {
    const c = await clientePorEmail('cliente@dcerutti.local');
    const velho = await db.atividade.create({ data: { clienteId: c.id, tipo: 'pagina', caminho: '/', criadoEm: new Date(Date.now() - 400 * 86_400_000) } });
    const novo = await db.atividade.create({ data: { clienteId: c.id, tipo: 'pagina', caminho: '/', criadoEm: new Date(Date.now() - 300 * 86_400_000) } });
    const r = await manutencaoHistorico();
    expect(r.apagados).toBeGreaterThanOrEqual(1);
    expect(await db.atividade.findUnique({ where: { id: velho.id } })).toBeNull();
    expect(await db.atividade.findUnique({ where: { id: novo.id } })).not.toBeNull();
  });
});

describe('LGPD', () => {
  it('excluir a conta apaga o histórico e a sacola guardada', async () => {
    // Conta nova: a cliente.excluir@ do seed já é excluída nos testes da conta.
    const email = `historico.${Date.now()}@exemplo.com`;
    const ana = await db.user.findUniqueOrThrow({ where: { email: 'ana@dcerutti.local' } });
    const u = await db.user.create({ data: { name: 'Cliente Histórico', email, papel: 'cliente', aceitouPrivacidadeEm: new Date() } });
    const c = await db.cliente.create({ data: { userId: u.id, vendedorId: ana.id, nome: 'Cliente Histórico', telefone: '(49) 99999-0000', ultimoAcessoEm: new Date(), ultimoLoginEm: new Date() } });
    await db.atividade.create({ data: { clienteId: c.id, tipo: 'busca', termo: 'vestido' } });
    await db.sacolaCliente.create({ data: { clienteId: c.id, itens: [] } });
    await db.favorito.create({ data: { clienteId: c.id, produtoId: (await db.produto.findFirstOrThrow()).id } });
    await entrarComo(email);
    expect((await excluirMinhaConta()).ok).toBe(true);
    expect(await db.atividade.count({ where: { clienteId: c.id } })).toBe(0);
    expect(await db.sacolaCliente.count({ where: { clienteId: c.id } })).toBe(0);
    expect(await db.favorito.count({ where: { clienteId: c.id } })).toBe(0);
    expect(await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ ultimoAcessoEm: null, ultimoLoginEm: null });
  });
});
