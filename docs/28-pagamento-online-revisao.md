# 28 · Pagamento online: revisão e próximos passos

Revisão de 23/11/2026 da integração com o Mercado Pago entregue no mesmo dia ([27](27-pagamento-online-mercado-pago.md), D-34). Foi feita com olhar de auditoria, no código, nos testes e no servidor. Separa três coisas: **falhas reais** do que foi entregue, o que **validar quando a conta existir** e as **evoluções** que deixam o pagamento mais completo e mais útil para a estratégia da loja.

## 1. Veredito

A base está sólida. O valor sempre vem do banco, existe uma única porta de estado, as travas no pedido funcionam, o aviso é assinado e confirmado na API, a conciliação roda e há 28 testes de integração cobrindo os casos difíceis. Mesmo assim, a revisão achou **12 pontos para corrigir antes de usar dinheiro de verdade**. Um deles é grave (seção 2, R-01): o Mercado Pago simulado ligado na produção deixaria qualquer pessoa marcar um pedido como pago. Nenhum dos 12 depende da conta do Mercado Pago, então dá para corrigir **enquanto a loja abre a conta**.

Ordem sugerida:

| Etapa | O quê | Depende da conta? | Esforço |
| --- | --- | --- | --- |
| A | Correções da revisão (seção 2) | Não | 2–3 dias |
| B | Conta, credenciais e sandbox, com os pontos a confirmar da API (seção 3) | Sim | 1–2 dias |
| C | Antes de ligar na produção: operação, conformidade e lançamento (seção 4) | Parte | 2–3 dias + loja |
| D | Evoluções de produto e estratégia (seção 5) | Não | por item |
| E | Caixa da loja física: Pix dinâmico e Point (seção 6) | Sim | 2–4 dias |

## 2. Achados da revisão (corrigir já)

| # | Gravidade | Achado | Onde | Correção | Esforço |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Crítica** | O Mercado Pago simulado é ligado só pela variável `PAGAMENTO_GATEWAY=falso`, que hoje está no `.env` deste servidor. Pelo plano de lançamento ([19](19-lancamento.md), passo 5), este mesmo diretório vira produção, e o `.env` é acrescentado, não refeito. Se a linha ficar, a página `/pagar` mostra "Simular pagamento aprovado" para qualquer pessoa, e o pedido fica pago e confirmado sem dinheiro nenhum. | `server/pagamentos/gateway.ts:75`, `acoes/pagamentos.ts` (`simularPagamento`) | Recusar o simulado quando o banco for o de produção (nome terminando em `_producao`, a mesma ideia da trava do seed) ou quando `NODE_ENV=production` sem `PAGAMENTO_SIMULADO_PERMITIDO=1`. Faixa vermelha no painel quando o simulado estiver ativo. Item no checklist da virada. | 0,5 dia |
| R-02 | Alta | **Dois cliques ao mesmo tempo** em "Pagar com Pix": o segundo encontra a primeira cobrança ainda `criada` (sem order), cancela essa cobrança e cria outra. A primeira continua, gera um Pix no Mercado Pago e devolve o QR. Se a cliente pagar esse QR, o sistema detecta o pagamento em dobro, mas é um estorno evitável. | `cobrancas.ts:115-121` | Cobrança `criada` há menos de 30 s conta como "em andamento": responder "gerando, aguarde" (ou esperar e reaproveitar) em vez de cancelar. Teste de concorrência. | 0,5 dia |
| R-03 | Alta | A conferência do valor pago usa `total_paid_amount`. A documentação traz um exemplo em que o valor pago (47,28) é **menor** que o cobrado (50,00), como se fosse líquido de taxa. Se for assim na API real, **toda aprovação seria barrada como "valor divergente"** e nada seria confirmado. | `mercadopago.ts:70`, `cobrancas.ts:243` | Conferir pelo valor cobrado da order (`total_amount`) e da transação (`amount`), que já estão presos à referência e ao id da order. Usar o valor pago só como informação. Confirmar no sandbox (seção 3). | 0,5 dia |
| R-04 | Alta | Os avisos gravados pela rota nunca são marcados como processados (`processadoEm` fica vazio). Se o app cair entre gravar e processar, nada reprocessa: a conciliação só olha cobranças **abertas**. Assim, um estorno feito direto no painel do Mercado Pago, uma contestação ou uma aprovação de checkout com aviso perdido podem nunca chegar ao sistema. | `api/pagamentos/mercadopago/route.ts:33` | Marcar `processadoEm` (e `erro`) depois de processar. A conciliação reprocessa avisos pendentes há mais de 5 min e, uma vez por dia, confere as cobranças pagas dos últimos 180 dias (prazo de estorno). | 0,5 dia |
| R-05 | Média | A "taxa" gravada vem de `taxes_amount`, que pode ser **imposto** e não a tarifa do Mercado Pago. Se for, o líquido da página Pagamentos sai errado. | `mercadopago.ts:76` | Ler a tarifa real (`fee_details` / `net_received_amount` do pagamento em `GET /v1/payments/{id}`) ou deixar "taxa a conferir" até validar no sandbox. | 0,5 dia |
| R-06 | Média | O e-mail de "Pagamento aprovado" leva o link do painel **sem o domínio** (`/painel/pedidos/…`), e a vendedora não consegue abrir. | `cobrancas.ts` (`depoisDeAplicar`) | Montar o link com `NEXT_PUBLIC_SITE_URL`. | 15 min |
| R-07 | Média | Avisos de teste podem chegar na produção, e o contrário também: o corpo do aviso traz `live_mode`, e ninguém confere. | rota do aviso | Comparar `live_mode` com o ambiente: diferente, registrar e alertar o gestor em vez de processar. | 15 min |
| R-08 | Média | A conciliação automática é disparada por **qualquer visitante** da página `/pagar` (até 100 consultas ao Mercado Pago, depois da resposta). Com a página aberta em muitas abas, ou numa tentativa de abuso, isso vira carga e risco de bloqueio por limite da API. | `cobrancas.ts:440`, `:500` | O site só concilia as cobranças **daquele pedido**; a varredura geral fica para o cron e para o painel. Limite menor por rodada. | 0,5 dia |
| R-09 | Baixa | Só existe uma chave secreta dos avisos: trocar a chave no Mercado Pago derruba os avisos até o `.env` ser atualizado. | `assinatura.ts` | Aceitar também `MP_WEBHOOK_SECRET_ANTERIOR` durante a troca. | 15 min |
| R-10 | Baixa | O histórico de cada cobrança (avisos, consultas, ações) é gravado, mas **não aparece em lugar nenhum**: a consulta `eventosDaCobranca` existe e não é usada. | `consultas/pagamentos.ts` | Linha do tempo no quadro do pedido para o gestor, com o id da order para procurar no Mercado Pago. | 0,5 dia |
| R-11 | Baixa | Falta um teste de ponta a ponta do `/pagar`. O CI também não define `PAGAMENTO_GATEWAY=falso`, então essa página nunca roda no navegador do CI. | `tests/e2e`, `.github/workflows/ci.yml` | `pagamento.spec.ts`: a vendedora gera o link, a cliente paga o Pix simulado e o pedido aparece pago no painel e em Minha conta; mais um teste no celular. | 0,5 dia |
| R-12 | Baixa | Os testes da trava `travas.ts` → `pedidos.ts` cobrem pedido e condicional, mas não a exclusão de conta (LGPD) de uma cliente com pagamento aprovado e não confirmado. | `acoes/conta.ts` | Recusar a exclusão enquanto houver pagamento aberto ou não entregue; teste. | 15 min |

## 3. Quando a conta existir: o que confirmar no sandbox

A documentação do Mercado Pago deixou dúvidas. O código foi escrito para aguentar as duas respostas possíveis, mas cada ponto precisa ser visto funcionando:

| Ponto | Hipótese no código | Se for diferente |
| --- | --- | --- |
| Checkout Pro na API Orders (`processing_mode: manual`) processa o pagamento sozinho quando a cliente paga? | Sim: o checkout processa | Chamar `POST /v1/orders/{id}/process` no retorno e no aviso. Se a Orders não servir para o Checkout Pro no Brasil, cair para Preferences (plano B, só em `mercadopago.ts`) |
| Valor pago × valor cobrado (R-03) | Corrigir para conferir por `total_amount` | — |
| Tarifa (R-05) | `taxes_amount` | Buscar a tarifa no pagamento |
| Estorno total com corpo vazio | Corpo `{}` | Mandar `transactions` com o id e o valor total |
| Assinatura do aviso | Manifesto do SDK, `data.id` como veio ou em minúsculas | Ajustar `assinatura.ts` (testado em unidade) |
| Pix exige CPF do pagador? | Não | Pedir o CPF na página (a ficha já tem CPF opcional, D-24) |
| Parcelas: `max_installments` e `interest_free` respeitados no checkout | Sim | Ajustar o corpo do checkout |
| `qr_code` vem na criação do Pix ou só depois (criação assíncrona)? | Vem na criação | A página já mostra "gerando" e atualiza; conferir |

**Roteiro do sandbox** (com `PAGAMENTO_GATEWAY` vazio e credenciais de teste no ambiente de teste):

1. Pix aprovado (pagador `APRO`), Pix vencido sem pagar (validade de 10 min) e Pix pago depois do vencimento.
2. Cartão aprovado à vista, parcelado com e sem juros, e recusado. Depois, pagar com sucesso na mesma tentativa.
3. Estorno parcial e total, pelo painel da loja e direto no painel do Mercado Pago (este testa o R-04).
4. Aviso com a chave secreta errada: o MP mostra a falha e tenta de novo.
5. Derrubar o app durante um pagamento e conferir que a conciliação acerta.
6. Medir a "qualidade da integração" no painel do Mercado Pago e corrigir o que ele apontar.

## 4. Antes de ligar na produção

| # | O quê | Por quê | Esforço |
| --- | --- | --- | --- |
| O-01 | **E-mail ligado (L-04)** | Os avisos de pagamento à vendedora e de problema ao gestor saem por e-mail. Hoje vão para o log | 0,5 dia + quem administra o e-mail |
| O-02 | **Monitor externo (L-10)** com verificação do pagamento | `/api/saude` passa a dizer também se o último aviso chegou, se há cobranças abertas sem consulta há mais de 30 min e se as credenciais existem (sem expor detalhes). Alerta no celular | 0,5 dia |
| O-03 | **Backup externo (L-09)** | Cobranças e estornos são registro financeiro | já planejado |
| O-04 | Cron da conciliação na produção | `*/10 * * * * npm run pagamentos:conciliar` | 15 min |
| O-05 | Painel "Saúde do pagamento" (gestor) | Mostra: ambiente (teste/produção/simulado), último aviso recebido, avisos recusados, falhas de consulta nas últimas 24 h e cobranças travadas. É o primeiro lugar para olhar quando "o pagamento não caiu" | 1 dia |
| O-06 | Nome na fatura do cartão (`statement_descriptor`) | "DCERUTTI" na fatura reduz contestações por "não reconheço esta compra" | 15 min |
| O-07 | Dados completos do pagador (telefone, CPF quando houver) e das peças | O Mercado Pago aprova mais e marca menos como fraude quando recebe mais informação. Hoje vai só um item "Pedido PED-…" | 0,5 dia |
| C-01 | **Política de privacidade** cita o Mercado Pago | LGPD: os dados do pagador vão para o Mercado Pago (L-08, ainda minuta) | loja |
| C-02 | **Política de trocas, devoluções e reembolso** em página própria, com link na página de pagamento | Na venda fora da loja física, o CDC (art. 49) dá à cliente 7 dias para desistir, com devolução do valor. O Mercado Pago e as contestações de cartão também pedem política clara | loja + 0,5 dia |
| C-03 | Checklist da virada | Sem `PAGAMENTO_GATEWAY`, credenciais de **produção** só no `.env` da produção, aviso cadastrado com o domínio de produção, teste de R$ 1 real com estorno | 15 min |

## 5. Evoluções de produto e estratégia

Ordenadas pelo ganho para a loja. Todas seguem a linha de D-34: o pagamento entra onde a conversa já chegou na cobrança.

| # | Evolução | Ganho | Esforço |
| --- | --- | --- | --- |
| P-01 | **Lembrete de pagamento pendente.** Link gerado e não pago em N horas, ou Pix gerado e vencido sem pagar: notificação para a vendedora, com a resposta pronta "Vi que não deu certo o pagamento, posso ajudar?" | Recupera vendas que travam no último passo; hoje ninguém fica sabendo | 1 dia |
| P-02 | **Link de pagamento na mensagem do pedido** que a cliente manda pelo WhatsApp (com "Pagar agora" ligado e frete definido) e no "pedido atualizado" que a vendedora reenvia depois de editar | A cobrança já sai na conversa, sem a vendedora precisar gerar o link | 0,5 dia |
| P-03 | **Pagar direto na Sugestão** (`/s/…`): quando a cliente responde "Quero", oferecer pagar na hora | Fecha a venda dirigida sem idas e vindas | 1 dia |
| P-04 | **Estorno com devolução das peças.** Hoje o estorno parcial devolve dinheiro e não mexe na venda nem no estoque. Novo fluxo "Devolução": a equipe marca as peças que voltaram, o estoque volta, a venda é ajustada (meta e relatórios) e o estorno sai com o valor dessas peças | Troca e devolução são rotina em loja de roupa; mantém estoque, meta e caixa coerentes | 2 dias |
| P-05 | **"Estornar e desfazer a venda" numa ação só** para o pedido pago e confirmado | Hoje são dois passos; esquecer o segundo deixa a venda na meta | 0,5 dia |
| P-06 | **Entrega após o pagamento:** pago, a entrega passa a "Separando" e entra na fila Hoje da vendedora | Ninguém esquece de despachar um pedido pago | 0,5 dia |
| P-07 | **Pedidos: filtro por pagamento** ("Pago, falta entregar", "Aguardando pagamento", "Estornado") e etiqueta "Pago online" na lista | Operação do dia a dia | 0,5 dia |
| P-08 | **Resultados com a tarifa:** faturamento, tarifas do Mercado Pago e lucro depois da tarifa, por mês e por meio (depende do R-05) | Mostra quanto o cartão parcelado custa de verdade | 1 dia |
| P-09 | **Exportar pagamentos** (planilha do mês: data, pedido, cliente, meio, parcelas, bruto, tarifa, estorno, líquido, id da order) | Conferência com a contabilidade e com o extrato do Mercado Pago | 0,5 dia |
| P-10 | **Conciliação com o extrato (relatório de liberações do Mercado Pago)** | Confere o que o Mercado Pago depositou com o que o sistema registrou | 1–2 dias |
| P-11 | **Contestações:** aviso com prazo, pedido marcado e um "kit de provas" (peças, conversa, entrega com data e quem entregou) | Ganhar contestações de cartão | 1 dia |
| P-12 | **Cartão dentro do site** (Payment Brick, fase 6) | Só se P-08/P-09 mostrarem desistência no redirecionamento | 2–3 dias |
| P-13 | **Nota fiscal** (fora do escopo hoje): integração com um emissor (ex.: Bling, NFE.io) disparada pelo pagamento aprovado | Com volume online, emitir à mão vira gargalo. Decisão da loja | a avaliar |

## 6. Caixa da loja física (fase 5)

| # | O quê | Esforço |
| --- | --- | --- |
| K-01 | **Pix dinâmico no caixa:** botão "Pix (QR na tela)" no Cobrar; o pagamento cai e a venda fecha sozinha, sem digitar nada | 1,5 dia |
| K-02 | **Point (maquininha) pela API Orders:** o valor vai do caixa para a maquininha e volta aprovado, com parcelas. Só se a loja usar Point (PG-08) | 2 dias |
| K-03 | Fechamento do caixa separando "Pix conferido pelo Mercado Pago" de "Pix informado" | 0,5 dia |

## 7. Decisões da loja

As de 27 (PG-01 a PG-08) continuam valendo. Estas são novas:

| # | Pergunta | Recomendação |
| --- | --- | --- |
| PG-09 | Política de trocas e devoluções online: prazo, quem paga o frete da volta, reembolso por Pix ou estorno | 7 dias para desistir (CDC), troca em 30 dias, estorno pelo mesmo meio |
| PG-10 | Lembrete de pagamento pendente: depois de quanto tempo? | 4 horas para o link, 1 hora depois do Pix vencido |
| PG-11 | Emitir nota fiscal das vendas online pelo sistema? | Avaliar depois de 1 mês de uso |
| PG-12 | Nome na fatura do cartão | "DCERUTTI" |

## 8. Plano

| Semana | Técnico | Loja |
| --- | --- | --- |
| 1 | Etapa A: R-01 a R-12, com testes (R-01, R-02, R-03, R-04 e R-06 primeiro) | Abrir a conta PJ e criar a aplicação; decidir PG-01 a PG-12 |
| 2 | Etapa B: sandbox completo (seção 3) e ajustes; O-05 a O-07; P-01, P-02, P-05 e P-06 | Políticas de privacidade e de trocas (C-01, C-02) |
| 3 | Etapa C: e-mail, monitor e backup, junto com o lançamento ([19](19-lancamento.md)); teste de R$ 1 real; ligar | Treinar as vendedoras no link de pagamento |
| Depois | P-03, P-04, P-07 a P-11; caixa (K-01 a K-03) | Medir: % de pedidos pagos online, Pix × cartão, tarifa média, tempo até pagar |

**Indicadores para acompanhar depois de ligar:** pedidos com link gerado × pagos (conversão do link), tempo entre o link e o pagamento, Pix × cartão, parcelamento médio, tarifa sobre o faturamento, estornos e contestações, e cobranças que precisaram de atenção (R-03, R-07, peça esgotada).
