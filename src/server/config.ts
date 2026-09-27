import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
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

export const lerConfig = cache(async (): Promise<Config> => {
  const linhas = await db.configuracao.findMany();
  const salvo = Object.fromEntries(linhas.map(l => [l.chave, l.valor]));
  return { ...CONFIG_PADRAO, ...salvo } as Config;
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
