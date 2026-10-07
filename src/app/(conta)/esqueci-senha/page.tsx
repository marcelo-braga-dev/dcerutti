import Link from 'next/link';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { pedirRedefinicao } from '@/server/acoes/conta';

export const metadata = { title: 'Esqueci a senha' };

export default function EsqueciSenha() {
  return (
    <>
      <h1 className="titulo text-2xl mb-1">Esqueci a senha</h1>
      <p className="text-suave mb-8">Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</p>
      <Formulario acao={pedirRedefinicao} className="grid gap-5">
        <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" placeholder="voce@email.com" />
        <BotaoEnviar pendente="Enviando…" className="w-full">Enviar link</BotaoEnviar>
      </Formulario>
      <p className="mt-8 text-center text-suave">
        Lembrou? <Link href="/entrar" className="text-caramelo font-semibold underline underline-offset-4">Entrar</Link>
      </p>
    </>
  );
}
