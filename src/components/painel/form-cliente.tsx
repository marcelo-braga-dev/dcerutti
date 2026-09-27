import type { Cliente } from '@prisma/client';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { salvarCliente } from '@/server/acoes/clientes';

type Props = {
  cliente?: Cliente & { temAcesso: boolean };
  vendedores?: { id: string; name: string }[]; // só para o gestor
  vendedorPadrao?: string;
};

export function FormCliente({ cliente, vendedores, vendedorPadrao }: Props) {
  return (
    <Formulario acao={salvarCliente} className="grid sm:grid-cols-2 gap-5">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      <Campo nome="nome" rotulo="Nome" padrao={cliente?.nome} className="sm:col-span-2" />
      <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" padrao={cliente?.telefone} />
      <Campo nome="cidade" rotulo="Cidade" padrao={cliente?.cidade ?? 'Maravilha'} />
      <Campo nome="endereco" rotulo="Endereço" placeholder="Rua, número, bairro" padrao={cliente?.endereco} className="sm:col-span-2" />
      <Campo nome="cep" rotulo="CEP" mascara="cep" placeholder="89874-000" padrao={cliente?.cep} />
      <Campo nome="preferencias" rotulo="Preferências" placeholder="Tricôs · Tam. M" padrao={cliente?.preferencias} />
      {vendedores && (
        <Campo nome="vendedorId" rotulo="Vendedor que atende" tipo="select" padrao={cliente?.vendedorId ?? vendedorPadrao}
          opcoes={vendedores.map(v => ({ valor: v.id, rotulo: v.name }))} className="sm:col-span-2" />
      )}
      <fieldset className="sm:col-span-2 grid sm:grid-cols-2 gap-5 border-t border-borda pt-5">
        <legend className="rotulo text-caramelo pr-3">Acesso à loja {cliente?.temAcesso ? '· ativo' : '(opcional)'}</legend>
        <Campo nome="email" rotulo="E-mail" tipo="email" padrao={cliente?.email} placeholder="cliente@email.com" />
        <Campo nome="senha" rotulo={cliente?.temAcesso ? 'Nova senha (em branco mantém)' : 'Senha'} tipo="password" autoComplete="new-password"
          ajuda={cliente?.temAcesso ? undefined : 'Com e-mail e senha, o cliente já pode entrar no catálogo.'} />
      </fieldset>
      <div className="sm:col-span-2"><BotaoEnviar>{cliente ? 'Salvar alterações' : 'Cadastrar cliente'}</BotaoEnviar></div>
    </Formulario>
  );
}
