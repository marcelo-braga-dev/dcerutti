# 27 · Pagamento online com Mercado Pago

Análise e plano de 23/11/2026, **implementados no mesmo dia** (fases 1 a 4; decisão [D-34](10-decisoes.md)). O que falta é da loja: conta, credenciais e as decisões da seção 9 (até lá valem os padrões recomendados). Como ligar está na seção 13; o que mudou em relação ao plano, na seção 14. A revisão com as correções e os próximos passos está em [28](28-pagamento-online-revisao.md).

## 1. Resumo

A D'Cerutti vende **conversando**: a cliente monta a sacola, o pedido cai no WhatsApp da vendedora, as duas acertam peças, frete e pagamento, e a vendedora confirma no painel. O condicional (provar em casa e pagar só o que ficou) é central. Um checkout de e-commerce tradicional, que cobra antes de qualquer conversa, iria contra essa estratégia.

A proposta é o pagamento entrar **onde a conversa já termina em cobrança**:

1. **Link de pagamento da vendedora** (o principal). Em qualquer pedido, inclusive no condicional já fechado, a vendedora gera um link `/pagar/…` e manda no WhatsApp. A cliente paga com **Pix** (QR e copia e cola, na nossa página) ou **cartão** (Checkout Pro do Mercado Pago, parcelado), sem precisar entrar na conta.
2. **"Pagar agora" depois de enviar a sacola** (opcional, por chave em Configurações). Quem já sabe o que quer paga na hora; o pedido vai ao WhatsApp como hoje, já marcado como pago.
3. **Baixa automática.** O Mercado Pago avisa o site (webhook). O pedido passa a "Pago" sozinho, a forma de pagamento é gravada, a vendedora é avisada e, se a loja quiser, a venda é confirmada na hora.
4. **Depois**: Pix dinâmico no caixa da loja física e, se fizer sentido, a maquininha Point.

Tecnicamente, o desenho segue os padrões que o projeto já usa: uma **única porta** para mudar o estado de uma cobrança (como `server/estoque.ts` para o estoque), valores sempre vindos do banco, transações com trava de linha, efeitos colaterais depois da resposta (`after()`), e tudo testável contra o MariaDB com um gateway falso.

**Esforço estimado do MVP (fases 0 a 3): 2 a 2,5 semanas de desenvolvimento**, mais o tempo da loja para abrir a conta e decidir os pontos da seção 9.

## 2. Como a loja vende hoje e onde o pagamento entra

| Situação | Hoje | Com o Mercado Pago |
| --- | --- | --- |
| Compra pela sacola | Pedido `pendente`, WhatsApp, pagamento combinado na conversa, vendedora confirma | Igual, e a vendedora manda o link; ou a cliente paga logo depois de enviar (opcional) |
| Seleção / Sugestão da vendedora | Idem | Link de pagamento junto com a seleção, depois do "Quero" |
| Condicional | Peças vão, voltam, vendedora fecha com o que ficou | **Nada é cobrado antes.** Fechado o condicional, link com o valor do que ficou |
| Caixa da loja física (D-23) | Forma de pagamento registrada à mão (Pix, débito, crédito, dinheiro) | Fase 5: Pix dinâmico na tela do caixa com baixa automática; Point a avaliar |
| Situação de pagamento (docs/26) | `a_combinar / aguardando / pago`, mudada à mão | Atualizada sozinha quando houver cobrança online; manual continua para pagamento fora do site |

O que **não muda**: o pedido continua sendo gravado antes do WhatsApp (D-07), a vendedora continua dona da conversa e da cliente, e o condicional continua "pague só o que ficar".

## 3. Produto do Mercado Pago: qual usar

| Opção | Como é | Prós | Contras | Uso aqui |
| --- | --- | --- | --- | --- |
| **Pix transparente** (API Orders) | Criamos a cobrança no servidor e mostramos o QR na nossa página | Taxa mais baixa, sem sair do site, baixa em segundos, o meio preferido no Brasil | Precisamos da tela de QR e do acompanhamento | **Fase 2** |
| **Checkout Pro** | A cliente vai para a página do Mercado Pago e volta | Cartão parcelado, saldo Mercado Pago e boleto sem tocar em dado de cartão; antifraude do MP; quase nenhuma mudança na CSP | Sai do site por alguns instantes | **Fase 2**, para cartão |
| **Payment Brick** (cartão transparente) | Formulário do MP dentro da nossa página | Não sai do site | Script e iframes de terceiros (CSP mais aberta), mais casos de erro para tratar | **Fase 6**, só se os números mostrarem desistência no redirecionamento |
| **Point** (maquininha) | Cobrança enviada do caixa para a maquininha | Baixa automática no caixa | Depende de a loja usar Point | **Fase 5**, a avaliar |

**Recomendação:** Pix transparente + Checkout Pro para cartão, os dois pela **API Orders**, que é a API atual do Mercado Pago para pagamentos online e Point, com um único modelo de "order", uma única notificação e o mesmo `external_reference`. Na fase 0, um spike no sandbox confirma que Pix e Checkout Pro estão disponíveis pela Orders para conta brasileira. Se algo faltar, o plano B é a API de Payments (Pix) + Preferences (Checkout Pro). O desenho abaixo isola o Mercado Pago atrás de uma interface (`GatewayPagamento`), então essa troca não afeta o resto do sistema.

**SDK:** cliente HTTP próprio e enxuto (`fetch` + `zod` para validar as respostas), em vez do pacote `mercadopago`. Segue a linha do projeto (poucas dependências), dá tipos exatos e o controle de timeout, nova tentativa e chave de idempotência. A validação da assinatura do webhook é um HMAC simples, feito no próprio código e coberto por teste de unidade.

## 4. Regras de negócio propostas

| Código | Regra |
| --- | --- |
| RP-01 | O valor cobrado vem **sempre do banco**: `total` do pedido + frete (ou o valor da venda, no condicional fechado). Nada vindo do navegador entra no cálculo. |
| RP-02 | Só se cobra pedido com **frete definido** (valor ou zero). Frete "a combinar" bloqueia o link até a vendedora informar o frete ou marcar "retirada na loja". Liga-se à P-03. |
| RP-03 | Cobrança em compra `pendente` **reserva o estoque** enquanto está ativa (validade do Pix ou do checkout). Vencida ou recusada, a reserva volta. Assim a peça paga não é vendida no balcão no meio do pagamento. |
| RP-04 | Uma cobrança ativa por pedido. Abrir o link de novo **reaproveita** o Pix ainda válido em vez de criar outro. |
| RP-05 | Pedido com cobrança ativa ou paga **não pode ser editado** (peças, preço, cupom, frete). Para editar, a vendedora cancela a cobrança ativa; um pedido pago só muda por cancelamento com estorno. |
| RP-06 | Pagamento aprovado: grava a linha em `pagamento` (forma, parcelas, valor), marca `pagamentoSituacao = pago` e avisa a vendedora. Com "Confirmar ao pagar" ligado, a compra é confirmada na hora (estoque, custo, venda e meta da vendedora da cliente, como em RN-07). |
| RP-07 | Aprovação que chega **depois** da reserva vencer: o sistema tenta reservar de novo. Se a peça acabou, o pedido fica "Pago, peça indisponível" para a equipe trocar a peça ou estornar. Nunca se perde um pagamento. |
| RP-08 | Cancelar um pedido pago ou desfazer uma venda paga online pede o **estorno** no Mercado Pago na mesma ação. O pedido só passa a "Estornado" quando o MP confirma. |
| RP-09 | Contestação (chargeback) avisa o gestor e marca o pedido; a venda continua até a decisão do gestor. |
| RP-10 | Divergência entre o que o MP diz e o pedido (valor, moeda, referência) **não altera nada** e gera alerta ao gestor. |
| RP-11 | O link `/pagar/…` é assinado (como o `/p/…` do D-20), não exige login e não mostra dados pessoais além do primeiro nome. |

## 5. Arquitetura

```
Vendedora (painel)            Cliente (WhatsApp → /pagar/<código>.<assinatura>)
  "Gerar link"                  Pix: QR + copia e cola + contagem       Cartão: → Checkout Pro → volta
       │                              │ consulta a situação a cada 5 s          │ /pagar/…/retorno
       ▼                              ▼                                          ▼
 acoes/pagamentos.ts ──► server/pagamentos/cobrancas.ts  ◄── ÚNICA porta de estado da cobrança
                              │      ▲         ▲
                              │      │         └── scripts/conciliar-pagamentos.ts (cron, a cada 10 min)
                              ▼      │
                 server/pagamentos/mercadopago.ts (GatewayPagamento; fake nos testes)
                              │      ▲
                              ▼      │  POST /api/pagamentos/mercadopago (webhook, assinatura HMAC)
                         API do Mercado Pago
```

### Arquivos novos

| Arquivo | Papel |
| --- | --- |
| `src/lib/pagamento.ts` | Puro e testado em unidade: máquina de estados, ordem dos estados (para ignorar aviso fora de ordem), cálculo do valor, leitura do cabeçalho `x-signature` |
| `src/server/pagamentos/gateway.ts` | Interface `GatewayPagamento` (`criarPix`, `criarCheckout`, `consultar`, `cancelar`, `estornar`) e a implementação falsa para testes e ponta a ponta |
| `src/server/pagamentos/mercadopago.ts` | Cliente HTTP: token do `.env`, `X-Idempotency-Key`, timeout de 10 s, nova tentativa só em 429/5xx, respostas validadas com zod, sem registrar dados sensíveis no log |
| `src/server/pagamentos/cobrancas.ts` | Regras: `criarCobranca`, `aplicarSituacao` (transação com `SELECT … FOR UPDATE` na cobrança, idempotente), `cancelarCobranca`, `estornar`, `conciliar` |
| `src/server/pagamentos/assinatura.ts` | Valida o webhook: HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com `MP_WEBHOOK_SECRET`, comparação `timingSafeEqual`, tolerância de horário |
| `src/app/api/pagamentos/mercadopago/route.ts` | Webhook: valida a assinatura (401 se falhar), grava o evento, responde 200 rápido e processa em `after()` buscando a order na API (a fonte da verdade é a consulta, nunca o corpo do aviso) |
| `src/app/pagar/[chave]/page.tsx` (e `retorno/`) | Página pública da cobrança: peças, total, Pix ou cartão, estados (aguardando, pago, vencido, recusado) |
| `src/app/api/pagamentos/situacao/route.ts` | Situação da cobrança para a página do Pix (pela chave assinada, com limite por IP) |
| `src/server/acoes/pagamentos.ts` | Server Actions: gerar link, cancelar cobrança, estornar, conferir no MP (padrão `exigirPapel` → `garantirAcesso` → regra) |
| `src/server/consultas/pagamentos.ts` | Leituras do painel com escopo (vendedora vê os seus) |
| `src/app/(painel)/painel/pagamentos/` | Lista de cobranças, filtros, conciliação, totais, taxas e líquido (gestor) |
| `scripts/conciliar-pagamentos.ts` | Cron: consulta cobranças pendentes, vence reservas, aponta divergências |

### Mudanças no que já existe

| Onde | O quê |
| --- | --- |
| `server/pedidos.ts` | `confirmarPedido` passa a aceitar compra com estoque reservado (hoje só o condicional) e autor "sistema" (`usuarioId` já é opcional no banco; ajustar o tipo de `baixarVenda`). `editarPedido` e `trocarCupomDoPedido` recusam pedido com cobrança ativa ou paga (RP-05). `cancelarPedido` e `desfazerVenda` chamam o estorno (RP-08) |
| `server/config.ts` | Novo bloco `pagamentoOnline` (seção 6) |
| `components/loja/sacola-pagina.tsx` | Na tela "Pedido registrado": botão "Pagar agora" (fase 3) |
| `painel/pedidos/[id]` | Quadro "Pagamento": gerar e copiar o link, mandar no WhatsApp, situação, histórico de tentativas, estornar |
| `minha-conta` | "Pagar" nos pedidos com cobrança disponível |
| `lib/mensagem-pedido.ts`, respostas prontas | Linha "💳 Pagar: <link>" e modelo de resposta "link de pagamento" |
| `server/notificacoes.ts` | Tipos novos: pagamento aprovado, recusado, estornado, contestado, divergência |
| Atendimento (docs/26) | Pago leva a etapa de `aguardando_pagamento` para `ganho` |
| `server/relatorios.ts` | Resultados com taxa do MP e lucro depois da taxa (fase 4) |
| `next.config.ts` | Fases 2 e 3: nada (QR em `data:` já é permitido; o Checkout Pro é navegação). Fase 6: liberar o SDK e os iframes do MP na CSP |
| `deploy/nginx.conf` | `location = /api/pagamentos/mercadopago` sem o limite das rotas de conta, corpo pequeno; `/pagar` e a situação no limite por IP |
| `.env.example` | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_KEY` (só na fase 6), `PAGAMENTO_GATEWAY=fake` nos testes |

## 6. Banco de dados

```prisma
enum MetodoCobranca { pix checkout }

enum StatusCobranca {
  criada        // gravada, ainda sem resposta do MP
  pendente      // aguardando a cliente pagar
  aprovada
  recusada
  expirada
  cancelada     // pela equipe ou por edição do pedido
  estornada
  estornada_parcial
  contestada
}

/// Uma tentativa de cobrança online de um pedido (uma "order" do Mercado Pago).
model Cobranca {
  id             String         @id @default(cuid())
  pedidoId       String
  pedido         Pedido         @relation(fields: [pedidoId], references: [id])
  metodo         MetodoCobranca
  status         StatusCobranca @default(criada)
  valor          Decimal        @db.Decimal(10, 2)
  /// Chave de idempotência enviada ao MP: a mesma tentativa nunca vira duas cobranças.
  chave          String         @unique @db.VarChar(64)
  mpOrderId      String?        @unique @db.VarChar(64)
  mpPaymentId    String?        @db.VarChar(64)
  pixCopiaECola  String?        @db.Text
  checkoutUrl    String?        @db.Text
  expiraEm       DateTime?
  /// Estoque reservado por esta cobrança (RP-03).
  reservou       Boolean        @default(false)
  aprovadaEm     DateTime?
  formaDetalhe   String?        @db.VarChar(30)   // pix, visa, master…
  parcelas       Int?
  taxa           Decimal?       @db.Decimal(10, 2)
  valorLiquido   Decimal?       @db.Decimal(10, 2)
  valorEstornado Decimal        @default(0) @db.Decimal(10, 2)
  criadaPorId    String?        // vendedora, cliente ou null (sistema)
  criadaEm       DateTime       @default(now())
  atualizadaEm   DateTime       @updatedAt
  eventos        EventoPagamento[]
  pagamento      Pagamento?

  @@index([pedidoId, status])
  @@index([status, expiraEm])
  @@map("cobranca")
}

/// Todo aviso e consulta do MP, para auditoria e para não processar o mesmo aviso duas vezes.
model EventoPagamento {
  id          Int       @id @default(autoincrement())
  cobrancaId  String?
  cobranca    Cobranca? @relation(fields: [cobrancaId], references: [id], onDelete: SetNull)
  origem      String    @db.VarChar(15)   // webhook, consulta, retorno, conciliacao
  requestId   String?   @unique @db.VarChar(64)
  tipo        String    @db.VarChar(40)
  statusMp    String?   @db.VarChar(40)
  dados       Json      // resposta do MP sem dados de cartão nem documento
  processadoEm DateTime?
  erro        String?   @db.Text
  criadoEm    DateTime  @default(now())

  @@index([cobrancaId, criadoEm])
  @@map("evento_pagamento")
}
```

- `Pagamento` (tabela do caixa) ganha `cobrancaId String? @unique`: venda online e venda de balcão ficam no mesmo relatório por forma de pagamento.
- `SituacaoPagamento` ganha `estornado`.
- `Pedido` ganha `freteDefinido`/retirada, se a P-03 não resolver o frete antes (RP-02).
- Configuração `pagamentoOnline`: `{ ligado, pix, cartao, pagarNaSacola, confirmarAoPagar, minutosPix (padrão 30), parcelasMax, parcelasSemJuros, quemEstorna: 'gestor' | 'equipe' }`. Credenciais **nunca** vão para a tabela `configuracao`: ficam no `.env`.
- Retenção: `evento_pagamento` por 5 anos (registro fiscal e contestação), sem dados de cartão; a exclusão de conta (LGPD) anonimiza o pedido, mas mantém a cobrança, como já acontece com os valores dos relatórios.

## 7. Fluxos

### 7.1 Link de pagamento (vendedora)

```
Painel → Pedido → "Gerar link de pagamento"
  · exige frete definido (RP-02) e pedido pendente, ou condicional confirmado não pago
  · link /pagar/PED-000123.<assinatura> → copiar, ou abrir o WhatsApp com a resposta pronta
  · pagamentoSituacao = aguardando
Cliente abre o link
  · Pix: criarCobranca(pix) → reserva o estoque (compra) → order no MP → QR + copia e cola + contagem
         a página consulta a situação a cada 5 s; o webhook ou o cron fecham
  · Cartão: criarCobranca(checkout) → order no MP → redireciona → volta para /pagar/…/retorno
         o retorno consulta a API (os parâmetros da URL não valem nada sozinhos)
```

### 7.2 Aprovação

```
Webhook (ou consulta da página, ou cron) → aplicarSituacao(cobrança, situação lida na API)
  transação: trava a cobrança → transição permitida? (estado novo "maior" que o atual)
    → confere valor, moeda e referência (RP-10)
    → aprovada: linha em pagamento, pedido "pago"
       compra + confirmarAoPagar: confirmarPedido(sistema) usando a reserva da cobrança
       reserva vencida: reserva de novo; sem estoque → "Pago, peça indisponível" (RP-07)
  after(): notificação e e-mail à vendedora, atendimento → ganho, pós-venda
```

Webhook, consulta da página e cron podem chegar ao mesmo tempo ou fora de ordem: a trava de linha e a ordem dos estados garantem que o efeito acontece **uma vez só**.

### 7.3 Vencimento e recusa

Pix vencido, checkout abandonado ou cartão recusado liberam a reserva (`liberarReserva`) e voltam o pedido a "aguardando". A cliente pode tentar de novo pelo mesmo link. O cron de 10 em 10 minutos cobre o caso de nenhum aviso chegar.

### 7.4 Estorno

`Cancelar pedido` ou `Desfazer a venda` num pedido pago abre o popup com "Estornar R$ 189,90 no Mercado Pago" (motivo obrigatório, como hoje). A ação pede o estorno com chave de idempotência; a confirmação do MP marca a cobrança e o pedido como estornados. Se o MP recusar (prazo vencido, saldo), o pedido não é cancelado e o erro aparece para a equipe. Estorno parcial (troca de uma peça) fica para depois do MVP.

### 7.5 Pagar na sacola (fase 3)

Depois de `enviarPedido` (compra, frete definido, chave ligada), a tela "Pedido registrado" mostra "Pagar agora com Pix ou cartão" ao lado do WhatsApp. É o mesmo `/pagar/…`. A mensagem ao WhatsApp leva a linha do pagamento, e a vendedora vê no painel quando cair.

## 8. Segurança, privacidade e operação

- **Credenciais**: `MP_ACCESS_TOKEN` só no servidor (`server-only`), credenciais de teste no ambiente de teste e de produção só no `.env` de produção (D-15). Nenhum segredo em conversa ou Git (lição do L-06).
- **Cartão**: no MVP o site nunca vê dado de cartão (Checkout Pro). Na fase 6, o Brick tokeniza no navegador.
- **Webhook**: assinatura obrigatória, horário dentro da tolerância, `x-request-id` único (repetição ignorada), sempre confirmar consultando a API. O MP não tem IP fixo; a assinatura é a defesa.
- **Abuso**: limite por IP em `/pagar` e na situação; reaproveitar o Pix ativo (RP-04) evita criar cobranças em série; links assinados e não adivinháveis.
- **Logs**: nunca registrar o token, o documento do pagador ou o corpo bruto completo; registrar código do pedido, id da order e situação.
- **LGPD**: a política (ainda minuta, L-08) passa a citar o Mercado Pago como responsável pelo processamento do pagamento. O mínimo de dados do pagador é enviado (e-mail e nome; CPF só se o MP exigir para o meio de pagamento).
- **Monitoramento**: o pagamento torna o L-10 obrigatório. Alertas para webhook falhando (nenhum aviso em X horas com cobranças pendentes), divergências e "pago, peça indisponível".
- **Um processo**: a idempotência e as travas ficam no banco, então funcionam mesmo se um dia houver mais de um processo Node (ressalva da [arquitetura](03-arquitetura.md)).
- **Nota fiscal** continua fora do escopo, emitida como hoje; o painel de pagamentos facilita conferir o que foi recebido.

## 9. Decisões da loja (antes de começar)

| # | Pergunta | Recomendação |
| --- | --- | --- |
| PG-01 | Conta Mercado Pago PJ no CNPJ da loja, prazo de recebimento (na hora com taxa maior, ou 14/30 dias com taxa menor) | PJ no CNPJ; Pix na hora; cartão no prazo que a loja já usa nas maquininhas |
| PG-02 | Frete (P-03): sem regra, nenhum pedido com entrega pode ser pago online | Pelo menos "retirada na loja" e "entrega em Maravilha: R$ X"; a vendedora informa nos outros casos |
| PG-03 | Parcelamento (P-04): até quantas vezes, e quantas sem juros (a loja paga) | Até 6×, sem juros até 3×; acima, juros da cliente |
| PG-04 | Confirmar a venda sozinho quando o pagamento cai? | Sim, para compra; a entrega continua com a vendedora |
| PG-05 | Quem pode estornar? | Só o gestor no começo |
| PG-06 | "Pagar agora" na sacola desde o início, ou só pelo link da vendedora? | Começar pelo link da vendedora (mais alinhado ao atendimento); ligar a sacola depois de duas semanas de uso |
| PG-07 | Validade do Pix | 30 minutos (é também o tempo de reserva da peça) |
| PG-08 | A loja usa ou quer usar maquininha Point? | Define se a fase 5 inclui Point ou só Pix dinâmico |

## 10. Fases

| Fase | Entrega | Esforço |
| --- | --- | --- |
| **0 · Preparação** | Decisões da seção 9; conta PJ e aplicação no painel de desenvolvedor do MP; credenciais de teste no `.env` do teste; **spike** no sandbox: Pix e Checkout Pro pela Orders, webhook assinado chegando em `dcerutti.com.br`, estorno; D-34 escrita | 1–2 dias |
| **1 · Fundação** | Migration (`cobranca`, `evento_pagamento`, ajustes), `lib/pagamento.ts`, gateway real e falso, `cobrancas.ts`, webhook com assinatura, cron de conciliação, bloco de Configurações (desligado por padrão) | 3–4 dias |
| **2 · Link de pagamento** | Quadro "Pagamento" no pedido, página `/pagar` com Pix e cartão, retorno, reserva de estoque, aprovação com confirmação automática, vencimento, estorno no cancelamento, notificações, resposta pronta | 4–5 dias |
| **3 · Cliente** | "Pagar agora" na sacola, "Pagar" em Minha conta, linha do pagamento na mensagem do WhatsApp | 2 dias |
| **4 · Gestão** | Tela Pagamentos (filtros, conciliação, recebido x líquido, taxas), taxa do MP em Resultados (lucro depois da taxa), exportação | 2–3 dias |
| **5 · Caixa** | Pix dinâmico na tela do caixa com baixa automática; Point pela Orders, se PG-08 | 2–4 dias |
| **6 · Cartão no site** | Payment Brick, só se a fase 4 mostrar desistência no redirecionamento do Checkout Pro | 2–3 dias |

**MVP = fases 0 a 3.** Cada fase vai para a `main` com testes e fica atrás da chave `pagamentoOnline.ligado`, então pode ser publicada desligada.

**Relação com o lançamento ([19](19-lancamento.md))**: o pagamento **não deve atrasar a virada**. Ele pode ser feito em paralelo no ambiente de teste, mas só deve ser ligado na produção depois do e-mail (L-04, avisos de pagamento), do monitor (L-10) e do backup externo (L-09): com dinheiro passando pelo site, ficar sem alerta ou sem backup deixa de ser aceitável.

## 11. Testes

| Nível | O que cobre |
| --- | --- |
| Unidade | Assinatura (válida, adulterada, horário fora da tolerância), máquina de estados (toda transição permitida e proibida, aviso fora de ordem), cálculo do valor com cupom e frete, leitura das respostas do MP |
| Integração (MariaDB, gateway falso) | Criar cobrança reserva o estoque; o mesmo aviso duas vezes gera um efeito só; webhook e consulta ao mesmo tempo; aprovação depois do vencimento com e sem estoque (RP-07); valor divergente não muda nada (RP-10); edição bloqueada (RP-05); cancelar pago chama o estorno; recusa do estorno não cancela; condicional fechado gera cobrança do que ficou; venda e meta para a vendedora certa; exclusão de conta mantém a cobrança anonimizada |
| Ponta a ponta (Playwright, `PAGAMENTO_GATEWAY=fake`) | Vendedora gera o link → cliente abre sem login → Pix → aprovação simulada → pedido "Pago" no painel e em Minha conta; cartão com retorno aprovado e recusado; estorno pelo gestor; sem rolagem horizontal no celular |
| Sandbox do MP (manual, fase 0 e antes de ligar) | Usuários e cartões de teste do MP (aprovado, recusado, pendente), Pix de teste, webhook real com assinatura, estorno total; checklist de qualidade de integração do MP |

## 12. Riscos

| Risco | Mitigação |
| --- | --- |
| Peça paga vendida no balcão ao mesmo tempo | Reserva durante a cobrança (RP-03) e tratamento de "pago, peça indisponível" (RP-07) |
| Aviso do MP que não chega ou chega repetido | Conciliação a cada 10 min, consulta na página do Pix, idempotência por `x-request-id` e trava da cobrança |
| Pedido editado depois do link enviado | Edição bloqueada com cobrança ativa; o link sempre mostra o valor atual |
| Frete "a combinar" impedir o uso | PG-02 antes da fase 2; retirada na loja como saída mínima |
| Contestação de cartão | Antifraude do Checkout Pro, alerta ao gestor, histórico do pedido como prova da entrega |
| Diferenças da API Orders entre países ou documentação desatualizada | Spike da fase 0 e gateway isolado (plano B: Payments + Preferences) |
| Taxas reduzirem a margem sem a loja perceber | Taxa e líquido gravados por cobrança e lucro depois da taxa em Resultados (fase 4) |

## 13. Como ligar (passo a passo)

1. **Conta e aplicação.** Conta Mercado Pago PJ no CNPJ da loja → [Suas integrações](https://www.mercadopago.com.br/developers/panel/app) → criar aplicação "Pagamentos online" (Checkout Transparente / API Orders).
2. **Credenciais.** No `.env` do servidor (nunca no Git, nunca em conversa):
   - `MP_ACCESS_TOKEN`: Access Token (o de **teste** no ambiente de teste; o de produção só no `.env` da produção);
   - `MP_WEBHOOK_SECRET`: em Webhooks → Configurar notificações, URL `https://<domínio>/api/pagamentos/mercadopago`, evento **Order**; copiar a chave secreta;
   - retirar `PAGAMENTO_GATEWAY=falso` (ele liga o Mercado Pago simulado).
   Depois: `bash deploy/pm2.sh reload dcerutti --update-env`.
3. **Cron:** `*/10 * * * * cd /www/wwwroot/dcerutti/site && npm run pagamentos:conciliar` (como o usuário `dcerutti`).
4. **Configurações → Pagamento online:** ligar, escolher Pix e cartão, parcelas, sem juros, validade do Pix, confirmação automática, "Pagar agora" e quem estorna.
5. **Sandbox antes da produção:** Pix de teste (pagador com nome `APRO` aprova), cartão aprovado e recusado com os cartões de teste do MP, estorno total e parcial, e conferir em Painel → Pagamentos online que os avisos chegaram (`evento_pagamento`).
6. **Antes de ligar na produção:** e-mail (L-04, avisos de pagamento), monitor (L-10) e backup externo (L-09); política de privacidade citando o Mercado Pago.

Ambiente de teste sem credenciais: com `PAGAMENTO_GATEWAY=falso`, a página `/pagar` mostra "Simular pagamento aprovado" e o fluxo inteiro funciona com um Mercado Pago em memória (as cobranças simuladas somem ao reiniciar o app; a conciliação fecha as que ficaram abertas).

## 14. Implementação (23/11/2026)

| Parte | Onde |
| --- | --- |
| Regras puras (estados, tradução da API, valor, textos) | `src/lib/pagamento.ts` (testado em `tests/unit/pagamento.test.ts`) |
| Assinatura do aviso | `src/server/pagamentos/assinatura.ts` — manifesto `id:…;request-id:…;ts:…;` como o SDK oficial, `data.id` como veio ou em minúsculas |
| Gateway | `gateway.ts` (interface), `mercadopago.ts` (API Orders), `falso.ts` (testes e ambiente de teste) |
| Estado da cobrança | `cobrancas.ts` (única porta: criar, aplicar situação, cancelar, estornar, conciliar) e `travas.ts` (o que `pedidos.ts` usa) |
| Telas | `app/pagar/[chave]` (e `retorno/`), `components/pagamento/pagar.tsx`, quadro `components/painel/pagamento-pedido.tsx`, `painel/pagamentos`, Configurações, sacola e Minha conta |
| Rotas | `api/pagamentos/mercadopago` (aviso), `api/pagamentos/situacao` (a página do Pix pergunta a cada 5 s; consulta o MP no máximo a cada 15 s) |
| Testes | 28 de integração em `tests/integracao/pagamentos.test.ts` e o invariante da reserva em `zz-invariantes-finais.test.ts` |

Diferenças em relação ao plano:
- O link de pagamento não cria cobrança: a cobrança nasce quando a cliente escolhe Pix ou cartão (evita orders órfãs no Mercado Pago).
- O checkout leva um item só ("Pedido PED-…", com cupom e frete já no valor): a API exige que o total seja a soma dos itens.
- A compra confirmada também pode ser cobrada (a vendedora confirmou e depois mandou o link); a cobrança, nesse caso, não reserva nada.
- Pedido estornado só volta a ser cobrado quando a equipe gera o link de novo.
- Pix dinâmico no caixa (fase 5) e Payment Brick (fase 6) continuam para depois.

## Referências

- [Notificações da API Orders (Mercado Pago)](https://mercadopago.com.br/developers/en/docs/order/online-payments/notifications)
- [Notificações do Checkout Pro com Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications)
- [Checkout Bricks, visão geral](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/overview)
- [Checkout Pro, API ou Bricks: qual escolher (blog MP)](https://www.mercadopago.com.mx/blog/checkout-pro-api-bricks-mercado-pago)
