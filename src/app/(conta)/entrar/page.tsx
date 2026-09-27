import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { entrar } from '@/server/acoes/conta';
import { usuarioAtual } from '@/server/permissoes';

export const metadata = { title: 'Entrar' };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const u = await usuarioAtual();
  if (u) redirect(u.papel === 'cliente' ? '/' : '/painel');
  const { volta } = await searchParams;
  return (
    <>
      <h1 className="titulo text-2xl mb-1">Entrar</h1>
      <p className="text-suave mb-8">Acesse o catálogo ou o painel da loja.</p>
      <Formulario acao={entrar} className="grid gap-5">
        <input type="hidden" name="volta" value={volta ?? ''} />
        <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" placeholder="voce@email.com" />
        <Campo nome="senha" rotulo="Senha" tipo="password" autoComplete="current-password" />
        <BotaoEnviar pendente="Entrando…" className="w-full">Entrar</BotaoEnviar>
      </Formulario>
      <p className="mt-8 text-center text-suave">
        Ainda não tem conta? <Link href="/cadastro" className="text-caramelo font-semibold underline underline-offset-4">Criar conta</Link>
      </p>
    </>
  );
}
