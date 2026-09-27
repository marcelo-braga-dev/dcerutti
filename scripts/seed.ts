/** Usuários de desenvolvimento. Nunca rodar em produção. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { criarConta } from '../src/server/contas';
import { mesDe } from '../src/lib/datas';

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed não roda em produção.');
  const senha = process.env.SEED_SENHA || 'dcerutti123';
  const existe = (email: string) => db.user.findUnique({ where: { email } });

  if (!(await existe('gestor@dcerutti.local')))
    await criarConta(db, { nome: 'Gestor D’Cerutti', email: 'gestor@dcerutti.local', senha, papel: 'gestor', telefone: '(49) 98803-6499' });

  const vendedores = [
    { nome: 'Ana Paula', email: 'ana@dcerutti.local', telefone: '(49) 98890-4646', meta: 15000 },
    { nome: 'Carlos Menezes', email: 'carlos@dcerutti.local', telefone: '(49) 99998-0637', meta: 12000 },
  ];
  const ids: string[] = [];
  for (const v of vendedores) {
    const u = (await existe(v.email)) ?? (await criarConta(db, { nome: v.nome, email: v.email, senha, papel: 'vendedor', telefone: v.telefone }));
    ids.push(u.id);
    await db.meta.upsert({
      where: { vendedorId_mes: { vendedorId: u.id, mes: mesDe() } },
      create: { vendedorId: u.id, mes: mesDe(), valor: v.meta },
      update: {},
    });
  }

  if (!(await existe('cliente@dcerutti.local'))) {
    const u = await criarConta(db, { nome: 'Mariana Souza', email: 'cliente@dcerutti.local', senha, papel: 'cliente', telefone: '(49) 99912-3456' });
    await db.cliente.create({
      data: { userId: u.id, vendedorId: ids[0], nome: u.name, telefone: '(49) 99912-3456', email: u.email, cidade: 'Maravilha', cep: '89874-000', preferencias: 'Tricôs · Tam. M' },
    });
  }
  if (!(await db.cliente.findFirst({ where: { nome: 'Juliana Ferreira' } })))
    await db.cliente.createMany({
      data: [
        { vendedorId: ids[0], nome: 'Juliana Ferreira', telefone: '(49) 99876-5432', cidade: 'Maravilha', preferencias: 'Fitness · Tam. P' },
        { vendedorId: ids[1], nome: 'Roberto Lima', telefone: '(49) 99811-2233', cidade: 'São Miguel do Oeste', preferencias: 'Camisetas · Tam. G' },
      ],
    });

  console.log(`Seed pronto. Senha de todos: ${senha}`);
  console.log('  gestor@dcerutti.local · ana@dcerutti.local · carlos@dcerutti.local · cliente@dcerutti.local');
}

main().finally(() => db.$disconnect());
