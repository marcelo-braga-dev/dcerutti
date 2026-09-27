import 'server-only';
import { PrismaClient } from '@prisma/client';

// Instância única — evita abrir novas conexões a cada recarga em desenvolvimento.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') g.prisma = db;
