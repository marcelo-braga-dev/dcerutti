import Link from 'next/link';
import { Cartao } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { formatarData } from '@/lib/datas';
import { linkWhatsApp } from '@/lib/whatsapp';
import { atualizarMeusDados, excluirMinhaConta } from '@/server/acoes/conta';
import { dadosDoClienteLogado } from '@/server/consultas/clientes';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Meus dados' };

export default async function MeusDados() {
  const u = await exigirPapel(['cliente']);
  const cliente = await dadosDoClienteLogado(u);
  const vendedor = cliente?.vendedor;

  return (
    <>
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Cartao className="p-6">
          <h2 className="titulo text-xl">Meus dados</h2>
          <p className="mt-1 mb-6 text-sm text-suave">Usados por quem te atende para combinar entrega e pagamento.</p>
          {cliente ? (
            <Formulario acao={atualizarMeusDados} className="grid sm:grid-cols-2 gap-5">
              <Campo nome="nome" rotulo="Nome completo" padrao={cliente.nome} autoComplete="name" className="sm:col-span-2" />
              <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" padrao={cliente.telefone} autoComplete="tel" />
              <Campo nome="cpf" rotulo="CPF (opcional)" mascara="cpf" padrao={cliente.cpf} placeholder="000.000.000-00" />
              <Campo nome="cep" rotulo="CEP" mascara="cep" padrao={cliente.cep} placeholder="89874-000" autoComplete="postal-code" />
              <Campo nome="endereco" rotulo="Endereço" padrao={cliente.endereco} placeholder="Rua, número, bairro" autoComplete="street-address" className="sm:col-span-2" />
              <Campo nome="cidade" rotulo="Cidade" padrao={cliente.cidade} autoComplete="address-level2" />
              <div className="sm:col-span-2 pt-2">
                <BotaoEnviar>Salvar meus dados</BotaoEnviar>
              </div>
            </Formulario>
          ) : (
            <p className="text-sm text-suave">Sua ficha ainda não foi criada. Fale com a loja.</p>
          )}
        </Cartao>

        <div className="grid gap-6">
          {vendedor && (
            <Cartao className="p-6">
              <div className="rotulo text-suave mb-2">Quem te atende</div>
              <div className="font-semibold">{vendedor.name}</div>
              {vendedor.telefone && (
                <>
                  <div className="text-sm text-suave">{vendedor.telefone}</div>
                  <a href={linkWhatsApp(vendedor.telefone, `Olá, ${vendedor.name.split(' ')[0]}!`)} target="_blank" rel="noopener" className={botao('oliva', 'p', 'mt-4 w-full')}>
                    Chamar no WhatsApp
                  </a>
                </>
              )}
            </Cartao>
          )}

          <Cartao className="p-6">
            <div className="rotulo text-suave mb-2">Acesso</div>
            <div className="text-sm">E-mail: <strong className="break-all">{u.email}</strong></div>
            <p className="mt-1 text-xs text-suave">Para trocar o e-mail, fale com a loja.</p>
            <Link href="/esqueci-senha" className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-caramelo">Trocar a senha</Link>
            {u.aceitouPrivacidadeEm && <p className="mt-4 text-xs text-suave">Política de privacidade aceita em {formatarData(u.aceitouPrivacidadeEm)}.</p>}
          </Cartao>
        </div>
      </div>

      <section id="excluir" className="mt-12 border-t border-borda pt-8 scroll-mt-28">
        <h2 className="titulo text-lg mb-2">Excluir minha conta</h2>
        <p className="text-sm text-suave mb-4 max-w-2xl">Apaga seu acesso e seus dados pessoais (nome, WhatsApp, e-mail, endereço). Os pedidos ficam registrados para a loja, sem identificar você. Não dá para desfazer. Veja a <a href="/privacidade" className="underline">política de privacidade</a>.</p>
        <BotaoAcao acao={excluirMinhaConta} confirmar="Excluir sua conta e seus dados pessoais? Não dá para desfazer." depois="/entrar" className={botao('perigo')}>Excluir minha conta</BotaoAcao>
      </section>
    </>
  );
}
