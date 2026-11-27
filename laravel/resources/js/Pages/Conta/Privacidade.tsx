import type { ReactNode } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material';
import { ComTema } from '@/tema/ComTema';
import { FONTE_TITULO } from '@/tema/tema';

/**
 * Política de privacidade (porta de src/app/privacidade/page.tsx). Pública; a cliente que ainda não aceitou vê o aceite.
 * MINUTA (B-07): o texto precisa ser revisado e aprovado pela loja antes da produção.
 */
export default function Privacidade({ pendente, whatsapp, volta }: { pendente: boolean; whatsapp: string; volta: string | null }) {
  const { identidade } = usePage().props;
  const form = useForm({ volta: volta ?? '' });
  const loja = identidade.nome;
  return (
    <ComTema area="loja">
      <Head title="Política de privacidade" />
      <Box sx={{ bgcolor: 'background.paper', minHeight: '100dvh' }}>
        <Container maxWidth="md" sx={{ py: 6, display: 'grid', gap: 3, lineHeight: 1.7 }}>
          <Link href="/" underline="none" sx={{ fontFamily: FONTE_TITULO, fontStyle: 'italic', fontSize: 30, color: 'marca.marrom-950' }}>{loja}</Link>
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'secondary.main' }}>LGPD · Lei 13.709/2018</Typography>
            <Typography component="h1" sx={{ fontFamily: FONTE_TITULO, fontSize: 36, color: 'marca.marrom-950', mt: 0.5 }}>Política de privacidade</Typography>
            <Typography color="text.secondary">Versão de 09/11/2026</Typography>
          </Box>
          {pendente && (
            <Stack spacing={1.5} sx={{ bgcolor: 'marca.bege', p: 2.5, borderRadius: 3 }}>
              <Typography sx={{ color: 'marca.marrom-950' }}>Para continuar usando o catálogo, leia a política abaixo e confirme o aceite.</Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Button variant="contained" loading={form.processing} onClick={() => form.post('/privacidade')} sx={{ borderRadius: 99 }}>{form.processing ? 'Registrando…' : 'Li e aceito a política de privacidade'}</Button>
                <Link href="/minha-conta#excluir" variant="body2" color="text.secondary">Não aceito: quero excluir minha conta</Link>
              </Stack>
            </Stack>
          )}
          <Secao titulo="Quem cuida dos seus dados">
            A {loja} (CNPJ 42.388.147/0001-40), loja em Maravilha (SC), é a controladora dos dados pessoais tratados neste catálogo. Contato para assuntos de privacidade: WhatsApp {whatsapp}.
          </Secao>
          <Secao titulo="Quais dados coletamos">
            Nome, WhatsApp, e-mail, endereço, cidade e CEP informados no cadastro; os pedidos e condicionais que você envia; as preferências que você ou seu vendedor anotam (como tamanhos); as anotações do atendimento (o que você procura, as peças de interesse e quando combinamos de falar de novo); seu usuário do Instagram, se você falar com a loja por lá; nome e WhatsApp que você informa nas páginas abertas de peças e vitrines; como você usa o catálogo (páginas e peças que abre, buscas, tamanhos escolhidos, o que põe na sacola, data e hora do acesso e o tipo de aparelho); e dados técnicos de acesso (endereço IP e navegador) usados para manter sua sessão e proteger o login.
          </Secao>
          <Secao titulo="Para que usamos">
            Para identificar você, mostrar o catálogo, registrar e atender seus pedidos e condicionais pelo WhatsApp da loja, combinar entrega e pagamento, falar com você depois da compra sobre a entrega e as peças, e prevenir fraudes e acessos indevidos. Ofertas e novidades, só se você aceitar: dá para deixar de receber a qualquer momento em &quot;Minha conta&quot; ou pedindo a quem te atende. O registro de como você usa o catálogo serve para seu vendedor entender do que você gosta e oferecer peças e tamanhos certos, e para a loja saber o que procurar para o estoque. Não vendemos seus dados e não os usamos para publicidade de terceiros.
          </Secao>
          <Secao titulo="Com quem compartilhamos">
            Com a equipe da loja (seu vendedor e a gerência) e com o WhatsApp e o Instagram, quando você fala com a loja por eles. Os dados ficam guardados em servidor contratado pela loja no Brasil.
          </Secao>
          <Secao titulo="Por quanto tempo guardamos">
            Enquanto sua conta existir; o registro de uso do catálogo, por até 12 meses; os dados de quem falou com a loja sem criar ficha, por até 12 meses depois do fim do atendimento. Se você pedir a exclusão, apagamos seu acesso, seus dados pessoais e esse registro; mantemos apenas os valores dos pedidos, sem identificar você, para os relatórios de vendas da loja.
          </Secao>
          <Secao titulo="Seus direitos">
            Você pode pedir confirmação e acesso aos seus dados, correção, exclusão, informação sobre compartilhamento e revogar este consentimento (art. 18 da LGPD). A exclusão pode ser feita por você mesmo em &quot;Minha conta&quot; → &quot;Excluir minha conta&quot;; os demais pedidos, pelo WhatsApp {whatsapp}.
          </Secao>
          <Secao titulo="Cookies">
            Usamos apenas um cookie de sessão, necessário para manter você conectado. A sacola fica guardada no seu próprio navegador e, enquanto você está conectado, uma cópia dela fica com a loja para seu vendedor poder ajudar.
          </Secao>
        </Container>
      </Box>
    </ComTema>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Box component="section">
      <Typography component="h2" sx={{ fontFamily: FONTE_TITULO, fontSize: 20, color: 'marca.marrom-950', mb: 1 }}>{titulo}</Typography>
      <Typography sx={{ color: 'marca.marrom-900' }}>{children}</Typography>
    </Box>
  );
}
