import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import { catalogo, produtoPorReferencia } from '../catalogo';
import { lerConfig } from '../config';
import { chaveDaPeca, dadosDaChavePeca } from '../link-pedido';
import { contatoDe, VENDEDOR_CONTATO } from '@/lib/numeros';

/** Abaixo disso a página diz "últimas unidades", sem contar o estoque. */
const POUCAS_UNIDADES = 2;

/**
 * Peça para o link público (docs/26, D-32): só o que pode aparecer sem login, com lista branca de campos. Nunca custo,
 * estoque exato, código interno ou dados de cliente. A chave assinada autoriza e diz quem enviou o link.
 */
export const pecaPublica = cache(async (chave: string) => {
  const dados = dadosDaChavePeca(chave);
  if (!dados) return null;
  const p = await produtoPorReferencia(dados.referencia);
  if (!p) return null;
  const [lista, cfg, vendedor] = await Promise.all([
    catalogo(), lerConfig(),
    db.user.findFirst({ where: { id: dados.vendedorId, papel: { in: ['vendedor', 'gestor'] } }, select: VENDEDOR_CONTATO }),
  ]);
  const contato = contatoDe(vendedor, cfg.whatsappLoja);
  const outrasCores = (p.cores ?? []).filter(c => c.referencia !== p.referencia && c.disponivel);
  return {
    produtoId: p.id, referencia: p.referencia, nome: p.nome, marca: p.marca, categoria: p.categoria, cor: p.corNome ?? p.cor, descricao: p.descricao, composicao: p.composicao,
    preco: p.preco, precoCheio: p.precoCheio, imagens: p.imagens, videos: p.videos, vendedorId: dados.vendedorId,
    variantes: p.variantes.filter(v => v.disponivel > 0).map(v => ({ id: v.id, tamanho: v.tamanho, ultimas: v.disponivel <= POUCAS_UNIDADES })),
    cores: outrasCores.filter(c => lista.some(x => x.referencia === c.referencia)).map(c => ({ cor: c.cor, imagem: c.imagem, chave: chaveDaPeca(c.referencia, dados.vendedorId) })),
    contato: { telefone: contato.telefone, nome: contato.nome?.split(' ')[0] ?? null },
  };
});

export type PecaPublica = NonNullable<Awaited<ReturnType<typeof pecaPublica>>>;
