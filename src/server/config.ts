import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';

/** Configurações de negócio editáveis pelo gestor (tabela `configuracao`). */
export type Config = {
  /** WhatsApp usado quando o cliente não tem vendedor com WhatsApp válido. Só dígitos, com DDD. */
  whatsappLoja: string;
  /** CEPs atendidos pelo condicional (formato 00000-000). */
  cepsCondicional: string[];
  cidadeCondicional: string;
  /** Regra de frete da compra. null = "a combinar" com o vendedor (C-03: até a loja definir). */
  frete: { valor: number; gratisAcima: number } | null;
  /** Parcelas exibidas na página de produto (0 = não exibir; C-03: só depois que a loja confirmar). */
  parcelas: number;
  /** Q-05: pedido ou condicional pendente há mais que isso é cancelado sozinho (0 = nunca). */
  diasExpiracao: number;
  /** D-09: catálogo privado por padrão. */
  catalogoPublico: boolean;
  /** Vendedor que recebe clientes que se cadastram sem convite e sem escolher. */
  vendedorPadraoId: string; // '' = nenhum
  /** Cupons (docs/20-cupons.md): desligado, nenhum campo ou botão de cupom aparece. Só o gestor muda. */
  cupons: { ligados: boolean; vendedorAplica: boolean };
  /** Campanha de próxima compra (fase 4): quando gerar o cupom pessoal e por quanto tempo ele vale. O desconto fica no cupom modelo. */
  proximaCompra: { minimoParaGerar: number; diasParaComecar: number; diasValidade: number; geraComCupom: boolean; acumula: boolean };
};

export const CONFIG_PADRAO: Config = {
  whatsappLoja: '49988036499',
  cepsCondicional: ['89874-000'],
  cidadeCondicional: 'Maravilha/SC',
  frete: null,
  parcelas: 0,
  diasExpiracao: 7,
  catalogoPublico: false,
  vendedorPadraoId: '',
  cupons: { ligados: false, vendedorAplica: true },
  proximaCompra: { minimoParaGerar: 150, diasParaComecar: 1, diasValidade: 60, geraComCupom: false, acumula: false },
};

/** Formato de cada chave. Valor salvo que não confere é ignorado e vale o padrão (a loja não quebra por um JSON torto). */
const FORMATO: { [K in keyof Config]: z.ZodType<Config[K]> } = {
  whatsappLoja: z.string().regex(/^\d{10,13}$/),
  cepsCondicional: z.array(z.string().regex(/^\d{5}-\d{3}$/)),
  cidadeCondicional: z.string().min(2),
  frete: z.object({ valor: z.number().min(0), gratisAcima: z.number().min(0) }).nullable(),
  parcelas: z.number().int().min(0).max(12),
  diasExpiracao: z.number().int().min(0).max(90),
  catalogoPublico: z.boolean(),
  vendedorPadraoId: z.string(),
  cupons: z.object({ ligados: z.boolean(), vendedorAplica: z.boolean() }),
  proximaCompra: z.object({
    minimoParaGerar: z.number().min(0), diasParaComecar: z.number().int().min(0).max(365), diasValidade: z.number().int().min(1).max(730),
    geraComCupom: z.boolean(), acumula: z.boolean(),
  }),
};

export const lerConfig = cache(async (): Promise<Config> => {
  const linhas = await db.configuracao.findMany();
  const cfg: Config = { ...CONFIG_PADRAO };
  for (const l of linhas) {
    const chave = l.chave as keyof Config;
    const r = FORMATO[chave]?.safeParse(l.valor);
    if (r?.success) (cfg as Record<keyof Config, unknown>)[chave] = r.data;
    else if (r) console.warn(`Configuração "${l.chave}" inválida no banco; usando o padrão.`);
  }
  return cfg;
});

export async function salvarConfig(parcial: Partial<Config>) {
  await db.$transaction(
    Object.entries(parcial).map(([chave, valor]) =>
      db.configuracao.upsert({
        where: { chave },
        create: { chave, valor: valor as Prisma.InputJsonValue },
        update: { valor: valor as Prisma.InputJsonValue },
      }),
    ),
  );
}
