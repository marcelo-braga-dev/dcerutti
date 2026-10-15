/** Link público do pedido (D-20): cartão da prévia no WhatsApp e página sem login, sem dados pessoais. */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { GET } from '@/app/p/[chave]/cartao.jpg/route';
import { enviarPedido } from '@/server/acoes/pedidos';
import { pedidoPublico } from '@/server/consultas/pedido-publico';
import { chaveDoPedido } from '@/server/link-pedido';
import { entrarComo, produtoDeTeste } from './suporte/ajuda';
import { depoisDaResposta } from './suporte/next';

const cartao = (chave: string) => GET(new Request(`https://teste.dcerutti.local/p/${chave}/cartao.jpg`), { params: Promise.resolve({ chave }) });

describe('link público do pedido', () => {
  it('a mensagem leva o link como primeiro endereço; o cartão sai em JPEG 1200×630 leve', async () => {
    await entrarComo('cliente@dcerutti.local');
    const { v } = await produtoDeTeste({ estoque: { P: 3, M: 3, G: 3 }, preco: 80 });
    const r = await enviarPedido({ tipo: 'compra', linhas: [{ varianteId: v.P, quantidade: 1 }, { varianteId: v.M, quantidade: 2 }, { varianteId: v.G, quantidade: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const chave = chaveDoPedido(r.codigo);
    const primeiro = r.texto.match(/https:\/\/\S+/)![0];
    expect(primeiro).toBe(`https://teste.dcerutti.local/p/${chave}`);

    const res = await cartao(chave);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    const img = Buffer.from(await res.arrayBuffer());
    expect(img.length).toBeLessThan(300 * 1024);
    expect(await sharp(img).metadata()).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
    // Segunda vez vem do cache, igual.
    expect(Buffer.from(await (await cartao(chave)).arrayBuffer()).equals(img)).toBe(true);
    await depoisDaResposta();
  });

  it('chave adulterada ou de pedido que não existe: 404', async () => {
    const chave = chaveDoPedido('PED-999999');
    expect((await cartao(chave)).status).toBe(404);
    expect((await cartao('PED-000001.aaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await cartao('qualquer-coisa')).status).toBe(404);
  });

  it('a página pública não expõe nome, telefone, CEP nem vendedor', async () => {
    const qualquer = await pedidoPublico('PED-000001');
    if (!qualquer) return;
    expect(Object.keys(qualquer)).not.toEqual(expect.arrayContaining(['nomeCliente']));
    const texto = JSON.stringify(qualquer);
    for (const campo of ['nomeCliente', 'telefoneCliente', '"cep"', 'vendedor', 'custo']) expect(texto).not.toContain(campo);
  });
});
