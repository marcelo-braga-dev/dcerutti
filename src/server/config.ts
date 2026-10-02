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
  /** Frete exibido na sacola. Pendente de decisão (P-03) — padrão igual ao protótipo. */
  frete: { valor: number; gratisAcima: number };
  /** Parcelas exibidas na página de produto (0 = não exibir). Pendente de decisão (P-04). */
  parcelas: number;
  /** D-09: catálogo privado por padrão. */
  catalogoPublico: boolean;
  /** Vendedor que recebe clientes que se cadastram sem convite e sem escolher. */
  vendedorPadraoId: string; // '' = nenhum
};

export const CONFIG_PADRAO: Config = {
  whatsappLoja: '49988036499',
  cepsCondicional: ['89874-000'],
  cidadeCondicional: 'Maravilha/SC',
  frete: { valor: 24.9, gratisAcima: 299 },
  parcelas: 6,
  catalogoPublico: false,
  vendedorPadraoId: '',
};

/** Formato de cada chave. Valor salvo que não confere é ignorado e vale o padrão (a loja não quebra por um JSON torto). */
const FORMATO: { [K in keyof Config]: z.ZodType<Config[K]> } = {
  whatsappLoja: z.string().regex(/^\d{10,13}$/),
  cepsCondicional: z.array(z.string().regex(/^\d{5}-\d{3}$/)),
  cidadeCondicional: z.string().min(2),
  frete: z.object({ valor: z.number().min(0), gratisAcima: z.number().min(0) }),
  parcelas: z.number().int().min(0).max(12),
  catalogoPublico: z.boolean(),
  vendedorPadraoId: z.string(),
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
