import Link from 'next/link';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { redefinirSenha } from '@/server/acoes/conta';

export const metadata = { title: 'Nova senha' };

export default async function RedefinirSenha({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token)
    return (
      <>
        <h1 className="titulo text-2xl mb-1">Link incompleto</h1>
        <p className="text-suave mb-8">Abra o link exatamente como chegou no e-mail, ou peça um novo.</p>
        <Link href="/esqueci-senha" className="text-caramelo font-semibold underline underline-offset-4">Pedir novo link</Link>
      </>
    );
  return (
    <>
      <h1 className="titulo text-2xl mb-1">Criar senha nova</h1>
      <p className="text-suave mb-8">Depois de salvar, todas as sessões abertas da sua conta são encerradas.</p>
      <Formulario acao={redefinirSenha} className="grid gap-5">
        <input type="hidden" name="token" value={token} />
        <Campo nome="senha" rotulo="Senha nova" tipo="password" autoComplete="new-password" ajuda="Pelo menos 8 caracteres." />
        <Campo nome="confirmacao" rotulo="Repita a senha nova" tipo="password" autoComplete="new-password" />
        <BotaoEnviar pendente="Salvando…" className="w-full">Salvar senha</BotaoEnviar>
      </Formulario>
    </>
  );
}
