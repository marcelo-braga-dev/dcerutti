import Link from 'next/link';
import { BotaoEnviar, Formulario } from '@/components/ui/formulario';
import { formatarTelefone } from '@/lib/telefone';
import { aceitarPrivacidade } from '@/server/acoes/conta';
import { lerConfig } from '@/server/config';
import { usuarioAtual } from '@/server/permissoes';
import { nomeDaLoja } from '@/lib/loja';

export const metadata = { title: 'Política de privacidade' };

/**
 * Pública (fica fora do layout da loja, que exige login). Cliente logado que ainda não aceitou vê o botão de aceite.
 * MINUTA (B-07): o texto precisa ser revisado e aprovado pela loja antes da produção.
 */
export default async function Privacidade({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const { volta } = await searchParams;
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  const pendente = u?.papel === 'cliente' && !u.aceitouPrivacidadeEm;
  const whatsapp = formatarTelefone(cfg.whatsappLoja);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-8 py-12 grid gap-6 leading-relaxed">
      <Link href="/" className="font-[Georgia,serif] italic text-3xl text-marrom-950">{nomeDaLoja()}</Link>
      <div>
        <div className="rotulo text-caramelo">LGPD · Lei 13.709/2018</div>
        <h1 className="titulo text-3xl mt-1">Política de privacidade</h1>
        <p className="text-suave mt-1">Versão de 15/10/2026</p>
      </div>

      {pendente && (
        <div className="bg-bege p-5 grid gap-3">
          <p className="text-marrom-950">Para continuar usando o catálogo, leia a política abaixo e confirme o aceite.</p>
          <Formulario acao={aceitarPrivacidade} className="flex flex-wrap items-center gap-4">
            <input type="hidden" name="volta" value={volta ?? ''} />
            <BotaoEnviar pendente="Registrando…">Li e aceito a política de privacidade</BotaoEnviar>
            <Link href="/minha-conta#excluir" className="text-sm text-suave underline underline-offset-4">Não aceito: quero excluir minha conta</Link>
          </Formulario>
        </div>
      )}

      <Secao titulo="Quem cuida dos seus dados">
        A {nomeDaLoja()} (CNPJ 42.388.147/0001-40), loja em Maravilha (SC), é a controladora dos dados pessoais tratados
        neste catálogo. Contato para assuntos de privacidade: WhatsApp {whatsapp}.
      </Secao>
      <Secao titulo="Quais dados coletamos">
        Nome, WhatsApp, e-mail, endereço, cidade e CEP informados no cadastro; os pedidos e condicionais que você envia;
        as preferências que você ou seu vendedor anotam (como tamanhos); como você usa o catálogo (páginas e peças que abre,
        buscas, tamanhos escolhidos, o que põe na sacola, data e hora do acesso e o tipo de aparelho); e dados técnicos de
        acesso (endereço IP e navegador) usados para manter sua sessão e proteger o login.
      </Secao>
      <Secao titulo="Para que usamos">
        Para identificar você, mostrar o catálogo, registrar e atender seus pedidos e condicionais pelo WhatsApp do seu
        vendedor, combinar entrega e pagamento, e prevenir fraudes e acessos indevidos. O registro de como você usa o
        catálogo serve para seu vendedor entender do que você gosta e oferecer peças e tamanhos certos, e para a loja
        saber o que procurar para o estoque. Não vendemos seus dados e não os usamos para publicidade de terceiros.
      </Secao>
      <Secao titulo="Com quem compartilhamos">
        Com a equipe da loja (seu vendedor e a gerência) e com o WhatsApp, quando você envia um pedido. Os dados ficam
        guardados em servidor contratado pela loja no Brasil.
      </Secao>
      <Secao titulo="Por quanto tempo guardamos">
        Enquanto sua conta existir; o registro de uso do catálogo, por até 12 meses. Se você pedir a exclusão, apagamos
        seu acesso, seus dados pessoais e esse registro; mantemos apenas os valores dos pedidos, sem identificar você,
        para os relatórios de vendas da loja.
      </Secao>
      <Secao titulo="Seus direitos">
        Você pode pedir confirmação e acesso aos seus dados, correção, exclusão, informação sobre compartilhamento e
        revogar este consentimento (art. 18 da LGPD). A exclusão pode ser feita por você mesmo em &quot;Minha conta&quot; →
        &quot;Excluir minha conta&quot;; os demais pedidos, pelo WhatsApp {whatsapp}.
      </Secao>
      <Secao titulo="Cookies">
        Usamos apenas um cookie de sessão, necessário para manter você conectado. A sacola fica guardada no seu próprio
        navegador e, enquanto você está conectado, uma cópia dela fica com a loja para seu vendedor poder ajudar.
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
