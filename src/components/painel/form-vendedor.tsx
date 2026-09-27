import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { salvarVendedor } from '@/server/acoes/gestao';

export function FormVendedor({ vendedor, meta }: { vendedor?: { id: string; name: string; email: string; telefone: string | null }; meta?: number }) {
  return (
    <Formulario acao={salvarVendedor} className="grid sm:grid-cols-2 gap-5">
      {vendedor && <input type="hidden" name="id" value={vendedor.id} />}
      <Campo nome="nome" rotulo="Nome completo" padrao={vendedor?.name} className="sm:col-span-2" />
      <Campo nome="telefone" rotulo="WhatsApp (recebe os pedidos)" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" padrao={vendedor?.telefone} />
      <Campo nome="meta" rotulo="Meta deste mês (R$)" padrao={meta ?? ''} placeholder="15000" />
      <Campo nome="email" rotulo="E-mail de acesso" tipo="email" padrao={vendedor?.email} placeholder="nome@dcerutti.com.br" />
      <Campo nome="senha" rotulo={vendedor ? 'Nova senha (em branco mantém)' : 'Senha'} tipo="password" autoComplete="new-password" ajuda="Mínimo de 8 caracteres." />
      <div className="sm:col-span-2"><BotaoEnviar>{vendedor ? 'Salvar alterações' : 'Cadastrar vendedor'}</BotaoEnviar></div>
    </Formulario>
  );
}
