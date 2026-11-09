/**
 * Link da peça (docs/26, D-32): o que aparece sem login, o formulário público e a mídia enviada pela vendedora.
 * O público nunca cria ficha, pedido ou reserva, e a resposta não diz se o telefone é conhecido.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { avisarPecaEnviada, prepararEnvioDaPeca, registrarInteresse } from '@/server/acoes/peca';
import { salvarMidia } from '@/server/acoes/produtos';
import { pecaPublica } from '@/server/consultas/peca-publica';
import { midiaDaPeca, podeEnviarMidia } from '@/server/consultas/produtos';
import { chaveDaPeca } from '@/server/link-pedido';
import { invalidarCatalogo } from '@/server/catalogo';
import { comoUsuario, db, entrarComo, estado, form, produtoDeTeste, redirecionou, usuarioPorEmail, variante } from './suporte/ajuda';

const vazio = {};
let seq = 0;
const celular = () => { const d = String(Date.now() + seq++).slice(-8); return `(49) 9${d.slice(0, 4)}-${d.slice(4)}`; };
const quero = (chave: string, varianteId: number, telefone = celular(), extra: Record<string, unknown> = {}) => registrarInteresse(chave, { varianteId, nome: 'Fulana Pública', telefone, aceite: true, ...extra });

async function chaveDaAna(o?: Parameters<typeof produtoDeTeste>[0]) {
  const ana = await usuarioPorEmail('ana@dcerutti.local');
  const t = await produtoDeTeste(o);
  return { ...t, ana, chave: chaveDaPeca(t.ref, ana.id) };
}

beforeEach(async () => {
  estado.ip = `10.1.${seq % 250}.${++seq % 250}`;
  await entrarComo(null);
});

describe('página pública', () => {
  it('só com a chave certa, e sem custo nem estoque exato', async () => {
    const { chave, ref, ana } = await chaveDaAna({ estoque: { P: 9, M: 1, G: 0 }, custo: 77 });
    expect(await pecaPublica(`${ref}~${ana.id}.aaaaaaaaaaaaaaaa`)).toBeNull();
    const p = (await pecaPublica(chave))!;
    expect(p.variantes.map(v => [v.tamanho, v.ultimas])).toEqual([['P', false], ['M', true]]);
    const texto = JSON.stringify(p);
    expect(texto).not.toMatch(/custo|estoque|disponivel|codigoInterno|"reservado"/i);
    expect(texto).not.toContain('"77"');
    expect(p.contato.nome).toBe('Ana');
  });

  it('peça inativa não abre; vendedora sem número usa o padrão', async () => {
    const inativa = await produtoDeTeste({ ativo: false });
    const gustavo = await usuarioPorEmail('gustavo@dcerutti.local');
    expect(await pecaPublica(chaveDaPeca(inativa.ref, gustavo.id))).toBeNull();
    const t = await produtoDeTeste();
    const p = (await pecaPublica(chaveDaPeca(t.ref, gustavo.id)))!;
    expect(p.contato).toEqual({ telefone: (await db.numeroWhatsApp.findFirstOrThrow({ where: { padrao: true } })).telefone, nome: null });
  });
});

describe('Quero esta peça', () => {
  it('registra para quem enviou, sem ficha, pedido nem reserva', async () => {
    const { chave, v, ana } = await chaveDaAna();
    const tel = celular();
    const fichasAntes = await db.cliente.count(), pedidosAntes = await db.pedido.count();
    const r = await quero(chave, v.P, tel);
    expect(r).toMatchObject({ ok: true, destinatario: 'Ana' });
    expect(r.ok && r.url).toContain('phone=5549988904646');
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel }, include: { itens: true, registros: true } });
    expect(a).toMatchObject({ responsavelId: ana.id, canal: 'link_peca', clienteId: null, contatoNome: 'Fulana Pública' });
    expect(a.aceitouContatoEm).not.toBeNull();
    expect(a.itens.map(i => i.varianteId)).toEqual([v.P]);
    expect(await db.cliente.count()).toBe(fichasAntes);
    expect(await db.pedido.count()).toBe(pedidosAntes);
    expect((await variante(v.P)).reservado).toBe(0);
  });

  it('telefone de ficha de outra vendedora: vai para a dona, a ficha não muda e a resposta é igual', async () => {
    const { chave, v } = await chaveDaAna();
    const carlos = await usuarioPorEmail('carlos@dcerutti.local');
    const ficha = await db.cliente.create({ data: { nome: 'Ficha Secreta', telefone: celular(), vendedorId: carlos.id } });
    const conhecido = await quero(chave, v.P, ficha.telefone);
    const desconhecido = await quero(chave, v.P);
    const semCodigo = (r: typeof conhecido) => (r.ok ? decodeURIComponent(r.url).replace(/AT-\d+/, 'AT') : r.erro);
    expect(semCodigo(conhecido)).toBe(semCodigo(desconhecido));
    expect(JSON.stringify(conhecido)).not.toMatch(/Carlos|Secreta/);
    const a = await db.atendimento.findFirstOrThrow({ where: { clienteId: ficha.id }, include: { registros: true } });
    expect(a.responsavelId).toBe(carlos.id);
    expect(a.contatoNome).toBeNull();
    expect(a.registros[0].texto).toContain('Fulana Pública');
    expect((await db.cliente.findUniqueOrThrow({ where: { id: ficha.id } })).nome).toBe('Ficha Secreta');
  });

  it('a mesma pessoa de novo: junta as peças no atendimento aberto', async () => {
    const { chave, v } = await chaveDaAna();
    const tel = celular();
    await quero(chave, v.P, tel);
    estado.ip = '10.2.0.1';
    await quero(chave, v.M, tel);
    await quero(chave, v.M, tel);
    const lista = await db.atendimento.findMany({ where: { contatoTelefone: tel }, include: { itens: true } });
    expect(lista).toHaveLength(1);
    expect(lista[0].itens.map(i => [i.varianteId, i.quantidade]).sort()).toEqual([[v.P, 1], [v.M, 1]].sort());
  });

  it('validações: aceite, telefone, nome, tamanho de outra peça, tamanho esgotado', async () => {
    const { chave, v } = await chaveDaAna({ estoque: { P: 1, G: 0 } });
    const outra = await produtoDeTeste();
    const antes = await db.atendimento.count();
    expect((await quero(chave, v.P, celular(), { aceite: false })).ok).toBe(false);
    expect((await quero(chave, v.P, '123')).ok).toBe(false);
    expect((await quero(chave, v.P, celular(), { nome: 'A' })).ok).toBe(false);
    expect((await quero(chave, outra.v.P)).ok).toBe(false);
    expect((await quero(chave, v.G)).ok).toBe(false);
    expect((await quero('chave-falsa', v.P)).ok).toBe(false);
    expect(await db.atendimento.count()).toBe(antes);
  });

  it('robô no campo invisível: resposta normal, nada gravado', async () => {
    const { chave, v } = await chaveDaAna();
    const tel = celular();
    expect((await quero(chave, v.P, tel, { site: 'http://spam' })).ok).toBe(true);
    expect(await db.atendimento.count({ where: { contatoTelefone: tel } })).toBe(0);
  });

  it('limite por conexão e por telefone', async () => {
    const { chave, v } = await chaveDaAna();
    estado.ip = '10.3.0.1';
    const r = [];
    for (let i = 0; i < 11; i++) r.push(await quero(chave, v.P));
    expect(r.slice(0, 10).every(x => x.ok)).toBe(true);
    expect(r[10]).toMatchObject({ ok: false, erro: expect.stringContaining('Muitos pedidos') });
    const tel = celular();
    for (let i = 0; i < 5; i++) { estado.ip = `10.4.0.${i}`; expect((await quero(chave, v.P, tel)).ok).toBe(true); }
    estado.ip = '10.4.0.99';
    expect((await quero(chave, v.P, tel)).ok).toBe(false);
  });

  it('confirmado o número, o atendimento público cria a ficha e vira pedido pelo fluxo normal', async () => {
    const { chave, v, ana } = await chaveDaAna();
    const tel = celular();
    await quero(chave, v.P, tel);
    const a = await db.atendimento.findFirstOrThrow({ where: { contatoTelefone: tel } });
    await entrarComo('ana@dcerutti.local');
    const { salvarContato } = await import('@/server/acoes/atendimento');
    expect((await salvarContato(vazio, form({ id: a.id, telefone: tel }))).ok).toBe(true);
    const depois = await db.atendimento.findUniqueOrThrow({ where: { id: a.id }, include: { cliente: true } });
    expect(depois.cliente).toMatchObject({ nome: 'Fulana Pública', telefone: tel, vendedorId: ana.id, origem: 'link_peca' });
  });
});

describe('enviar peça (painel)', () => {
  it('só a equipe; o link leva quem enviou; o envio entra no histórico do atendimento', async () => {
    const { ref } = await produtoDeTeste();
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(prepararEnvioDaPeca(ref))).toBe('/');
    const ana = await entrarComo('ana@dcerutti.local');
    const r = await prepararEnvioDaPeca(ref);
    expect(r).toMatchObject({ ok: true, referencia: ref, semEstoque: false });
    expect(r.ok && decodeURIComponent(r.link)).toContain(chaveDaPeca(ref, ana!.id));
    expect(r.ok && r.texto).toContain('Tamanhos: P, M, G');
    expect((await prepararEnvioDaPeca('NAO-EXISTE')).ok).toBe(false);

    const at = await db.atendimento.create({ data: { codigo: `AT-E${Date.now() % 1e9}`, canal: 'whatsapp', contatoNome: 'X', responsavelId: ana!.id } });
    await avisarPecaEnviada(ref, at.id);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: at.id, tipo: 'envio_peca' } })).toBe(1);
    await entrarComo('carlos@dcerutti.local');
    await avisarPecaEnviada(ref, at.id);
    expect(await db.atendimentoRegistro.count({ where: { atendimentoId: at.id, tipo: 'envio_peca' } })).toBe(1);
  });
});

describe('mídia da peça', () => {
  const foto = (n: string) => `/arquivos/produtos/TESTE/${n}.webp`;
  const salvar = (id: number, imagens: string[], videos: unknown[] = []) => salvarMidia(vazio, form({ id, imagens: imagens.join('\n'), videos: JSON.stringify(videos) }));

  it('vendedora acrescenta; só a gestão remove; endereço externo é só do gestor', async () => {
    const { produto } = await produtoDeTeste({ imagens: [foto('a')], preco: 123 });
    await entrarComo('cliente@dcerutti.local');
    expect(await redirecionou(salvar(produto.id, []))).toBe('/');
    await entrarComo('ana@dcerutti.local');
    expect((await salvar(produto.id, [foto('a'), foto('b')], [{ url: '/arquivos/produtos/TESTE/v.mp4', capa: null }])).ok).toBe(true);
    expect((await midiaDaPeca(produto.id))!.imagens.map(i => i.url)).toEqual([foto('a'), foto('b')]);
    expect((await midiaDaPeca(produto.id))!.videos).toHaveLength(1);
    expect((await salvar(produto.id, [foto('b')], [{ url: '/arquivos/produtos/TESTE/v.mp4', capa: null }])).erro).toMatch(/gestão remove/);
    expect((await salvar(produto.id, [foto('a'), foto('b')], [])).erro).toMatch(/gestão remove/);
    expect((await salvar(produto.id, [foto('a'), foto('b'), 'https://exemplo.com/x.jpg'], [{ url: '/arquivos/produtos/TESTE/v.mp4', capa: null }])).ok).not.toBe(true);
    expect((await salvar(produto.id, ['/arquivos/../../etc/passwd'], [])).ok).not.toBe(true);
    // Preço e estoque continuam como estavam.
    expect(Number((await db.produto.findUniqueOrThrow({ where: { id: produto.id } })).preco)).toBe(123);
    await entrarComo('gestor@dcerutti.local');
    expect((await salvar(produto.id, [foto('b')], [])).ok).toBe(true);
    expect((await midiaDaPeca(produto.id))!.imagens.map(i => i.url)).toEqual([foto('b')]);
    invalidarCatalogo();
  });

  it('enviar arquivo: gestor sempre; vendedora só em peça que existe; cliente e visitante nunca', async () => {
    const { ref } = await produtoDeTeste();
    expect(await podeEnviarMidia(await comoUsuario('gestor@dcerutti.local'), 'NOVA')).toBe(true);
    const ana = await comoUsuario('ana@dcerutti.local');
    expect(await podeEnviarMidia(ana, ref)).toBe(true);
    expect(await podeEnviarMidia(ana, '../../etc')).toBe(false);
    expect(await podeEnviarMidia(await comoUsuario('cliente@dcerutti.local'), ref)).toBe(false);
    expect(await podeEnviarMidia(null, ref)).toBe(false);
  });
});
