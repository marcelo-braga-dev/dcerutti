import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { cadastrarCliente } from '@/server/acoes/conta';
import { usuarioAtual } from '@/server/permissoes';
import { vendedoresAtivos } from '@/server/consultas/equipe';

export const metadata = { title: 'Criar conta' };

export default async function Cadastro({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (await usuarioAtual()) redirect('/');
  const { v } = await searchParams;
  const vendedores = await vendedoresAtivos();
  const convite = v ? vendedores.find(x => x.id === v) : undefined;

  return (
    <>
      {convite ? (
        <div className="flex items-center gap-3 mb-6 p-3 bg-bege">
          <span className="grid place-items-center size-10 bg-marrom-950 text-creme font-display font-extrabold">{convite.name[0]}</span>
          <div>
            <div className="rotulo text-caramelo">Convite de {convite.name.split(' ')[0]}</div>
            <div className="text-sm text-suave">Você será atendida(o) por {convite.name}.</div>
          </div>
        </div>
      ) : (
        <div className="rotulo text-caramelo mb-2">Cliente</div>
      )}
      <h1 className="titulo text-2xl mb-1">Criar conta</h1>
      <p className="text-suave mb-8">Leva um minuto. Seu pedido vai direto para o WhatsApp de quem te atende.</p>
      <Formulario acao={cadastrarCliente} className="grid gap-5">
        {convite && <input type="hidden" name="vendedorId" value={convite.id} />}
        <Campo nome="nome" rotulo="Nome completo" autoComplete="name" />
        <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" autoComplete="tel" />
        <Campo nome="endereco" rotulo="Endereço" placeholder="Rua, número, bairro" autoComplete="street-address" />
        <Campo nome="cidade" rotulo="Cidade" padrao="Maravilha" autoComplete="address-level2" />
        <Campo nome="email" rotulo="E-mail" tipo="email" placeholder="voce@email.com" autoComplete="email" />
        <Campo nome="senha" rotulo="Senha" tipo="password" ajuda="Pelo menos 6 caracteres." autoComplete="new-password" />
        {!convite && vendedores.length > 1 && (
          <Campo nome="vendedorId" rotulo="Quem te atende na D’Cerutti?" tipo="select" opcoes={vendedores.map(x => ({ valor: x.id, rotulo: x.name }))} />
        )}
        <BotaoEnviar pendente="Criando conta…" className="w-full">Criar conta</BotaoEnviar>
      </Formulario>
      <p className="mt-8 text-center text-suave">
        Já tem conta? <Link href="/entrar" className="text-caramelo font-semibold underline underline-offset-4">Entrar</Link>
      </p>
    </>
  );
}
