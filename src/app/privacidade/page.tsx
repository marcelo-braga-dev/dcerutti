import Link from 'next/link';
import { BotaoEnviar, Formulario } from '@/components/ui/formulario';
import { formatarTelefone } from '@/lib/telefone';
import { aceitarPrivacidade } from '@/server/acoes/conta';
import { lerConfig } from '@/server/config';
import { usuarioAtual } from '@/server/permissoes';

export const metadata = { title: 'Política de privacidade' };

/**
 * Pública (fica fora do layout da loja, que exige login). Cliente logado que ainda não aceitou vê o botão de aceite.
 * MINUTA (B-07): o texto precisa ser revisado e aprovado pela loja antes da produção.
 */
export default async function Privacidade() {
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  const pendente = u?.papel === 'cliente' && !u.aceitouPrivacidadeEm;
  const whatsapp = formatarTelefone(cfg.whatsappLoja);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-8 py-12 grid gap-6 leading-relaxed">
      <Link href="/" className="font-[Georgia,serif] italic text-3xl text-marrom-950">D&apos;Cerutti</Link>
      <div>
        <div className="rotulo text-caramelo">LGPD · Lei 13.709/2018</div>
        <h1 className="titulo text-3xl mt-1">Política de privacidade</h1>
        <p className="text-suave mt-1">Versão de 07/10/2026</p>
      </div>

      {pendente && (
        <div className="bg-bege p-5 grid gap-3">
          <p className="text-marrom-950">Para continuar usando o catálogo, leia a política abaixo e confirme o aceite.</p>
          <Formulario acao={aceitarPrivacidade}>
            <BotaoEnviar pendente="Registrando…">Li e aceito a política de privacidade</BotaoEnviar>
          </Formulario>
        </div>
      )}

      <Secao titulo="Quem cuida dos seus dados">
        A D&apos;Cerutti (CNPJ 42.388.147/0001-40), loja em Maravilha (SC), é a controladora dos dados pessoais tratados
        neste catálogo. Contato para assuntos de privacidade: WhatsApp {whatsapp}.
      </Secao>
      <Secao titulo="Quais dados coletamos">
        Nome, WhatsApp, e-mail, endereço, cidade e CEP informados no cadastro; os pedidos e condicionais que você envia;
        as preferências que você ou seu vendedor anotam (como tamanhos); e dados técnicos de acesso (endereço IP e
        navegador) usados para manter sua sessão e proteger o login.
      </Secao>
      <Secao titulo="Para que usamos">
        Para identificar você, mostrar o catálogo, registrar e atender seus pedidos e condicionais pelo WhatsApp do seu
        vendedor, combinar entrega e pagamento, e prevenir fraudes e acessos indevidos. Não vendemos seus dados e não os
        usamos para publicidade de terceiros.
      </Secao>
      <Secao titulo="Com quem compartilhamos">
        Com a equipe da loja (seu vendedor e a gerência) e com o WhatsApp, quando você envia um pedido. Os dados ficam
        guardados em servidor contratado pela loja no Brasil.
      </Secao>
      <Secao titulo="Por quanto tempo guardamos">
        Enquanto sua conta existir. Se você pedir a exclusão, apagamos seu acesso e seus dados pessoais; mantemos apenas
        os valores dos pedidos, sem identificar você, para os relatórios de vendas da loja.
      </Secao>
      <Secao titulo="Seus direitos">
        Você pode pedir confirmação e acesso aos seus dados, correção, exclusão, informação sobre compartilhamento e
        revogar este consentimento (art. 18 da LGPD). A exclusão pode ser feita por você mesmo em &quot;Minha conta&quot; →
        &quot;Excluir minha conta&quot;; os demais pedidos, pelo WhatsApp {whatsapp}.
      </Secao>
      <Secao titulo="Cookies">
        Usamos apenas um cookie de sessão, necessário para manter você conectado. A sacola fica guardada no seu próprio
        navegador.
      </Secao>
    </main>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="titulo text-xl mb-2">{titulo}</h2>
      <p className="text-marrom-900">{children}</p>
    </section>
  );
}
