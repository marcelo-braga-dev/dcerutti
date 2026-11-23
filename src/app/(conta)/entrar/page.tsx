import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alerta } from '@/components/ui/basicos';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { entrar } from '@/server/acoes/conta';
import { usuarioAtual } from '@/server/permissoes';
import { caminhoInterno } from '@/lib/url';
import { linkWhatsApp } from '@/lib/whatsapp';
import { lerConfig } from '@/server/config';

export const metadata = { title: 'Entrar' };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volta?: string; redefinida?: string }> }) {
  const { volta, redefinida } = await searchParams;
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  if (u) redirect(caminhoInterno(volta) ?? (u.papel === 'cliente' ? '/' : '/painel'));
  return (
    <>
      <h1 className="titulo text-2xl mb-1">Entrar</h1>
      <p className="text-suave mb-8">Entre para ver os preços, montar a sua sacola e pedir pelo WhatsApp.</p>
      {redefinida && <div className="mb-6"><Alerta tipo="ok">Senha nova salva. Entre com ela.</Alerta></div>}
      <Formulario acao={entrar} className="grid gap-5">
        <input type="hidden" name="volta" value={volta ?? ''} />
        <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" placeholder="voce@email.com" />
        <Campo nome="senha" rotulo="Senha" tipo="password" autoComplete="current-password" />
        <BotaoEnviar pendente="Entrando…" className="w-full">Entrar</BotaoEnviar>
      </Formulario>
      <p className="mt-4 text-center"><Link href="/esqueci-senha" className="text-sm text-suave underline underline-offset-4">Esqueci a senha</Link></p>
      <div className="mt-8 rounded-2xl bg-creme border border-borda p-4 grid gap-2 text-center">
        <p className="text-marrom-950 font-semibold">Ainda não tem conta?</p>
        <p className="text-sm text-suave">Leva um minuto e é grátis: você vê os preços de quem é de casa e pede direto pelo WhatsApp.</p>
        <Link href={volta ? `/cadastro?volta=${encodeURIComponent(volta)}` : '/cadastro'} className="justify-self-center h-11 px-6 rounded-full border border-marrom-950 text-marrom-950 text-sm font-semibold inline-flex items-center hover:bg-marrom-950 hover:text-creme transition-colors">Criar minha conta</Link>
      </div>
      <p className="mt-6 text-center text-sm text-suave">Precisa de ajuda? <a href={linkWhatsApp(cfg.whatsappLoja, 'Oi! Preciso de ajuda para entrar na loja.')} target="_blank" rel="noopener" className="underline underline-offset-4 text-marrom-950">Fale com a loja no WhatsApp</a></p>
    </>
  );
}
