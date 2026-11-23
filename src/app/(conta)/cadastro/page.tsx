import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Campo, Formulario, BotaoEnviar } from '@/components/ui/formulario';
import { cadastrarCliente } from '@/server/acoes/conta';
import { usuarioAtual } from '@/server/permissoes';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { marcaAtual } from '@/server/marca';

export const metadata = { title: 'Criar conta' };

export default async function Cadastro({ searchParams }: { searchParams: Promise<{ v?: string; volta?: string }> }) {
  if (await usuarioAtual()) redirect('/');
  const { v, volta } = await searchParams;
  const vendedores = await vendedoresAtivos();
  const convite = v ? vendedores.find(x => x.id === v) : undefined;

  return (
    <>
      {convite ? (
        <div className="flex items-center gap-3 mb-6 p-3 bg-bege">
          <span className="grid place-items-center size-10 bg-marrom-950 text-creme font-display font-extrabold">{convite.name[0]}</span>
          <div>
            <div className="rotulo text-caramelo">Convite de {convite.name.split(' ')[0]}</div>
            <div className="text-sm text-suave">Quem vai te atender: {convite.name}.</div>
          </div>
        </div>
      ) : (
        <div className="rotulo text-caramelo mb-2">Cliente</div>
      )}
      <h1 className="titulo text-2xl mb-1">Criar conta</h1>
      <p className="text-suave mb-6">Leva um minuto e é grátis. Seu pedido vai direto para o WhatsApp de quem te atende.</p>
      <ul className="mb-8 grid gap-1.5 text-sm text-marrom-900">
        {['Preços exclusivos de quem é de casa', 'Prove em casa e pague só o que ficar (em Maravilha)', 'Atendimento de pessoa para pessoa, sem robô'].map(t => (
          <li key={t} className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="size-4 text-oliva shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{t}</li>
        ))}
      </ul>
      <Formulario acao={cadastrarCliente} className="grid gap-5">
        {convite && <input type="hidden" name="vendedorId" value={convite.id} />}
        {volta && <input type="hidden" name="volta" value={volta} />}
        {/* D-36: o essencial primeiro (quem é e como entra), depois o que serve para a entrega. */}
        <fieldset className="grid gap-5">
          <legend className="rotulo !text-[0.66rem] text-caramelo mb-3">Seus dados</legend>
          <Campo nome="nome" rotulo="Nome completo" autoComplete="name" />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" autoComplete="tel" ajuda="É por ele que quem te atende fala com você." />
          <Campo nome="email" rotulo="E-mail" tipo="email" placeholder="voce@email.com" autoComplete="email" ajuda="Para entrar e recuperar a senha." />
          <Campo nome="senha" rotulo="Senha" tipo="password" ajuda="Pelo menos 8 caracteres." autoComplete="new-password" />
        </fieldset>
        <fieldset className="grid gap-5 border-t border-borda pt-5">
          <legend className="rotulo !text-[0.66rem] text-caramelo mb-3 px-0">Para a entrega</legend>
          <Campo nome="endereco" rotulo="Endereço" placeholder="Rua, número, bairro" autoComplete="street-address" />
          <Campo nome="cidade" rotulo="Cidade" padrao="Maravilha" autoComplete="address-level2" />
          <Campo nome="cpf" rotulo="CPF (opcional)" mascara="cpf" placeholder="000.000.000-00" />
        </fieldset>
        {!convite && vendedores.length > 1 && (
          <Campo nome="vendedorId" rotulo={`Quem te atende na ${(await marcaAtual()).nome}?`} tipo="select" opcoes={vendedores.map(x => ({ valor: x.id, rotulo: x.name }))} />
        )}
        <Campo nome="aceitaOfertas" rotulo="Quero receber ofertas e novidades pelo WhatsApp (opcional)" tipo="checkbox" />
        <Campo nome="aceite" rotulo="Li e aceito a política de privacidade" tipo="checkbox"
          ajuda={<>Veja como usamos seus dados na <Link href="/privacidade" target="_blank" className="underline">política de privacidade</Link>.</>} />
        <BotaoEnviar pendente="Criando conta…" className="w-full">Criar conta</BotaoEnviar>
      </Formulario>
      <p className="mt-6 text-center text-xs text-suave">Seus dados ficam só com a loja e servem para o seu atendimento.</p>
      <p className="mt-6 text-center text-suave">
        Já tem conta? <Link href="/entrar" className="text-caramelo font-semibold underline underline-offset-4">Entrar</Link>
      </p>
    </>
  );
}
