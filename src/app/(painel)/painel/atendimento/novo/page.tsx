import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { CANAIS, CANAIS_MANUAIS } from '@/lib/atendimento';
import { novoAtendimento } from '@/server/acoes/atendimento';
import { atendimentoLigado } from '@/server/consultas/atendimento';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Novo atendimento' };

/** Novo rápido (docs/26): nome e um contato. Se o contato já tem dona, o atendimento vai para ela. */
export default async function NovoAtendimento() {
  const u = await exigirPapel(EQUIPE);
  if (!(await atendimentoLigado())) notFound();
  const vendedoras = u.papel === 'gestor' ? await vendedoresAtivos() : [];
  return (
    <>
      <Link href="/painel/atendimento" className="rotulo text-suave hover:text-marrom-950">← Hoje</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Atendimento" titulo="Novo atendimento">Basta o nome e o WhatsApp ou o @ do Instagram.</CabecalhoPagina>
      <Cartao className="p-5 sm:p-8 max-w-2xl">
        <Formulario acao={novoAtendimento} limparAoConcluir className="grid sm:grid-cols-2 gap-5">
          <Campo nome="nome" rotulo="Nome" className="sm:col-span-2" />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" />
          <Campo nome="instagram" rotulo="Instagram" placeholder="@usuario" />
          <Campo nome="canal" rotulo="Por onde chegou" tipo="select" padrao="whatsapp" opcoes={CANAIS_MANUAIS.map(c => ({ valor: c, rotulo: CANAIS[c] }))} />
          {u.papel === 'gestor' && (
            <Campo nome="responsavelId" rotulo="Quem atende" tipo="select" opcoes={[{ valor: '', rotulo: 'Vendedor padrão da loja' }, ...vendedoras.map(v => ({ valor: v.id, rotulo: v.name }))]} ajuda="Se o contato já tem ficha, vai para a vendedora da ficha." />
          )}
          <Campo nome="nota" rotulo="Nota (opcional)" tipo="textarea" linhas={2} className="sm:col-span-2" placeholder="O que ela procura, tamanho, ocasião…" ajuda="Não registre dados sensíveis, como saúde ou documentos." />
          <div className="sm:col-span-2"><BotaoEnviar>Registrar</BotaoEnviar></div>
        </Formulario>
      </Cartao>
    </>
  );
}
