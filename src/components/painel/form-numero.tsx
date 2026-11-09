'use client';

import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarTelefone } from '@/lib/telefone';
import { salvarNumero } from '@/server/acoes/numeros';

/** Cadastro e edição de um número da loja (D-31). */
export function FormNumero({ numero, aoConcluir }: { numero?: { id: number; telefone: string; apelido: string; observacao: string | null }; aoConcluir?: () => void }) {
  return (
    <Formulario acao={salvarNumero} aoConcluir={aoConcluir} className="grid gap-4" prefixo={numero ? 'editar-numero' : 'novo-numero'}>
      {numero && <input type="hidden" name="id" value={numero.id} />}
      <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" padrao={numero ? formatarTelefone(numero.telefone) : ''} />
      <Campo nome="apelido" rotulo="Nome do número" placeholder="Loja Centro" padrao={numero?.apelido} ajuda="Como a equipe reconhece este número." />
      <Campo nome="observacao" rotulo="Observação (opcional)" tipo="textarea" linhas={2} padrao={numero?.observacao} placeholder="Chip na gaveta do caixa, celular da loja…" />
      <div><BotaoEnviar>{numero ? 'Salvar' : 'Cadastrar número'}</BotaoEnviar></div>
    </Formulario>
  );
}
