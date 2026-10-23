/** Favoritos (coração da loja) e "Comprar de novo" (D-22). */
import { beforeEach, describe, expect, it } from 'vitest';
import { alternarFavorito } from '@/server/acoes/favoritos';
import { enviarPedido } from '@/server/acoes/pedidos';
import { pecasParaRecomprar } from '@/server/acoes/recompra';
import { invalidarCatalogo } from '@/server/catalogo';
import { movimentar } from '@/server/estoque';
import { favoritosDoClienteLogado, resumoDaConta } from '@/server/consultas/clientes';
import { clientePorEmail, comoUsuario, db, entrarComo, produtoDeTeste, usuarioPorEmail } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

beforeEach(() => entrarComo(null));

describe('favoritos', () => {
  it('a cliente marca e desmarca; aparece no resumo e na lista, do mais novo para o mais antigo', async () => {
    await entrarComo('cliente@dcerutti.local');
    const u = await comoUsuario('cliente@dcerutti.local');
    const a = await produtoDeTeste();
    const b = await produtoDeTeste();
    expect(await alternarFavorito(a.produto.id)).toEqual({ favorito: true });
    expect(await alternarFavorito(b.produto.id)).toEqual({ favorito: true });
    const ids = await favoritosDoClienteLogado(u);
    expect(ids.slice(0, 2)).toEqual([b.produto.id, a.produto.id]);
    expect((await resumoDaConta(u))!.favoritos).toBeGreaterThanOrEqual(2);
    expect(await alternarFavorito(a.produto.id)).toEqual({ favorito: false });
    expect(await favoritosDoClienteLogado(u)).not.toContain(a.produto.id);
    await alternarFavorito(b.produto.id);
  });

  it('equipe, visitante e peça que não existe não marcam', async () => {
    const { produto } = await produtoDeTeste();
    expect(await alternarFavorito(produto.id)).toBeNull();
    await entrarComo('ana@dcerutti.local');
    expect(await alternarFavorito(produto.id)).toBeNull();
    expect(await favoritosDoClienteLogado(await comoUsuario('ana@dcerutti.local'))).toEqual([]);
    await entrarComo('cliente@dcerutti.local');
    expect(await alternarFavorito(999_999_999)).toBeNull();
  });
});

describe('comprar de novo', () => {
  it('devolve as peças do próprio pedido com o preço de hoje; o que acabou volta pelo nome; outra cliente não vê', async () => {
    await entrarComo('cliente@dcerutti.local');
    const { produto, v } = await produtoDeTeste({ estoque: { P: 1, M: 5 }, preco: 60 });
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.P, quantidade: 1 }, { varianteId: v.M, quantidade: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pedido = await db.pedido.findUniqueOrThrow({ where: { codigo: r.codigo } });
    // O tamanho P acabou (contagem zerada pelo gestor, com histórico) e o preço subiu.
    const gestor = await usuarioPorEmail('gestor@dcerutti.local');
    await db.$transaction(tx => movimentar(tx, { varianteId: v.P, tipo: 'ajuste', quantidade: 0, usuarioId: gestor.id }));
    await db.produto.update({ where: { id: produto.id }, data: { preco: 70, precoCheio: 70 } });
    invalidarCatalogo();

    const de = await pecasParaRecomprar(pedido.id);
    expect(de?.itens).toEqual([expect.objectContaining({ varianteId: v.M, quantidade: 2, preco: 70, tamanho: 'M' })]);
    expect(de?.indisponiveis).toEqual([`${produto.nome} (tam. P)`]);

    await entrarComo('cliente.carlos@dcerutti.local');
    expect(await pecasParaRecomprar(pedido.id)).toBeNull();
    await entrarComo('ana@dcerutti.local');
    expect(await pecasParaRecomprar(pedido.id)).toBeNull();
    await depoisDaResposta();
  });

  it('resumo da conta: último pedido e quem atende', async () => {
    const c = await clientePorEmail('cliente@dcerutti.local');
    const r = await resumoDaConta(await comoUsuario('cliente@dcerutti.local'));
    expect(r?.pedidos).toBe(await db.pedido.count({ where: { clienteId: c.id } }));
    expect(r?.ultimoPedido?.codigo).toMatch(/^(PED|COND)-/);
    expect(r?.atendimento?.nome).toMatch(/^Ana\b/);
  });
});
