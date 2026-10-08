/**
 * Simula as APIs do Next que as Server Actions usam, para testá-las direto contra o banco:
 * - sessão: `entrarComo(email)` define quem está logado (exigirPapel e usuarioAtual leem daqui);
 * - redirect lança `Redirecionou` (como o Next, interrompe a action), e `redirecionou()` captura o destino;
 * - revalidatePath é registrado; `after()` roda o callback e guarda a promessa (`depoisDaResposta()` espera todos).
 */
import { vi } from 'vitest';

export class Redirecionou extends Error {
  constructor(public url: string) {
    super(`redirect(${url})`);
  }
}

type Usuario = { id: string; name: string; email: string; papel: 'gestor' | 'vendedor' | 'cliente'; telefone: string | null; aceitouPrivacidadeEm: Date | null };

export const estado = {
  usuario: null as Usuario | null,
  ip: '10.0.0.1',
  revalidados: [] as string[],
  depois: [] as Promise<unknown>[],
};

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => void estado.revalidados.push(p),
  revalidateTag: () => {},
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirecionou(url);
  },
  notFound: () => {
    throw new Redirecionou('404');
  },
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': estado.ip, host: 'teste.dcerutti.local' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, has: () => false }),
}));

vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<object>()),
  after: (fn: () => unknown) => void estado.depois.push(Promise.resolve().then(fn)),
}));

vi.mock('@/server/auth', () => ({
  auth: {
    api: {
      signInEmail: vi.fn(async () => ({})),
      signOut: vi.fn(async () => ({})),
      requestPasswordReset: vi.fn(async () => ({})),
      resetPassword: vi.fn(async () => ({})),
      getSession: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/server/permissoes', async importOriginal => {
  const real = await importOriginal<typeof import('@/server/permissoes')>();
  const { redirect } = await import('next/navigation');
  return {
    ...real,
    usuarioAtual: async () => estado.usuario,
    exigirPapel: async (papeis: string[]) => {
      const u = estado.usuario;
      if (!u) redirect('/entrar');
      if (!papeis.includes(u!.papel)) redirect(u!.papel === 'cliente' ? '/' : '/painel');
      return u!;
    },
  };
});

export async function depoisDaResposta() {
  const p = estado.depois.splice(0);
  await Promise.all(p);
}
