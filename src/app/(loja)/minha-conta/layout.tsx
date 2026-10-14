import { AbasConta } from '@/components/loja/abas-conta';
import { sair } from '@/server/acoes/conta';
import { exigirPapel } from '@/server/permissoes';

/** Área da cliente: cabeçalho com nome e e-mail, abas entre Meus pedidos e Meus dados. Cada página confere o papel de novo. */
export default async function LayoutMinhaConta({ children }: { children: React.ReactNode }) {
  const u = await exigirPapel(['cliente']);
  return (
    <div className="py-8 sm:py-10 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="rotulo text-caramelo mb-2">Minha conta</div>
          <h1 className="titulo text-2xl sm:text-3xl truncate">{u.name}</h1>
          <p className="mt-1 text-sm text-suave truncate">{u.email}</p>
        </div>
        <form action={sair}>
          <button className="rotulo text-suave underline underline-offset-4 hover:text-caramelo">Sair</button>
        </form>
      </div>
      <AbasConta />
      <div className="pt-8">{children}</div>
    </div>
  );
}
