# 23 · Sugestões (Sugestões para você)

Planejamento e implementação de 16/10/2026 · Marcelo · situação: **concluído** — fase 1 em 16/10/2026 e fase 2 em 17/10/2026 (D-27), conferidas no navegador. A mala direta (fase 3) foi feita e retirada em 17/10/2026: as vendas da loja são direcionadas, cliente a cliente

O vendedor monta uma **sugestão**: uma seleção de peças que ele acha que a cliente vai gostar (novidades, promoções no tamanho dela, o que combina com a última compra). A cliente recebe um link no WhatsApp e, nele:
- marca o que quer, o que talvez queira e o que não quer;
- troca o tamanho ou a cor;
- tira peças e acrescenta outras;
- devolve as escolhas, que já viram pedido ou condicional.

É a forma de o vendedor **começar a venda**: mostrar ofertas, direcionar e estimular, sempre cliente a cliente.

## O que existe hoje e o que falta

Hoje o vendedor usa o **montador de pedidos** (fluxo 3 em [05 · Fluxos](05-fluxos.md)): escolhe a cliente, as peças e os tamanhos, e **Salvar e enviar ao cliente** cria um **pedido pendente** e manda a imagem "Seleção para você" pelo WhatsApp. O link público do pedido (`/p/…`, D-20) mostra as peças.

| Falta hoje | Consequência |
|---|---|
| A cliente não interage: só lê e responde por texto | O vendedor reescreve à mão o que ela quer ("a azul no M, a preta não") |
| A sugestão já nasce como **pedido** | Polui a lista de pedidos, conta como pendente, entra no prazo de vencimento (D-14) |
| O vendedor precisa acertar o tamanho de cada peça | Sugestão de modelo ("dá uma olhada nesta camisa") não cabe |
| Não dá para saber se ela abriu | O vendedor não sabe se insiste ou espera |
| Sem nota do vendedor por peça, sem preço especial com validade | A oferta perde o tom pessoal e a urgência |

## A ideia em uma frase

Uma **seleção** é uma **proposta**, não um pedido:
- não reserva estoque, não conta na meta e não vence como pedido;
- vira pedido só quando a cliente devolve as escolhas;
- até lá, o vendedor acompanha se ela abriu, o que marcou e o que respondeu.

## Como fica para o vendedor

1. **Montar.**
   - Em *Seleções → + Nova seleção*, ou *Montar seleção* na ficha da cliente.
   - A tela reaproveita o montador de pedidos (busca, filtros, um card por modelo), com estas diferenças:
     - a peça entra **sem tamanho** (a cliente escolhe), ou já no tamanho dela, que vem sugerido pelo histórico (D-18);
     - **nota por peça**: "fica linda com a calça que você levou";
     - **preço especial** por peça ou na seleção toda, dentro do limite de desconto do vendedor (o mesmo do caixa, D-23), com **validade** ("até domingo");
     - **título e mensagem**: "Novidades de inverno no seu tamanho";
     - **cupom** opcional (docs/20).
2. **Sugerir automaticamente** preenche 6 a 8 peças a partir do histórico:
   - favoritos e peças vistas mais de uma vez;
   - o que ficou na sacola sem enviar;
   - promoções e novidades nas categorias e tamanhos que ela mais usa;
   - sempre só o que tem estoque no tamanho dela.
   O vendedor tira e põe à vontade.
3. **Enviar.**
   - O WhatsApp abre com a mensagem e o link.
   - A prévia do link mostra o cartão com as fotos, como o do pedido (D-20): "Ana separou 8 peças para você".
4. **Acompanhar.** Cada seleção mostra a situação:
   - **Enviada → Vista** (quando, quantas vezes) **→ Respondida** (o que ela marcou) **→ Virou pedido**, ou **Venceu**;
   - o painel avisa quando a cliente abre ou responde (selo no menu e e-mail opcional, como o da sacola parada).
5. **Fechar.** Quando ela devolve as escolhas, o pedido (ou condicional) já está pronto, com os tamanhos e preços combinados. O vendedor confirma como hoje.

## Como fica para a cliente

Link `/s/SEL-000123.<assinatura>`, aberto direto do WhatsApp. Funciona **sem login**, pelo mesmo motivo do link do pedido (D-20): muitas fichas não têm conta, e pedir senha antes de ver a sugestão mata a venda.

```
┌─────────────────────────────────────────────┐
│ D'Cerutti                                    │
│ Oi, Mariana! A Ana separou 8 peças para você │
│ "Novidades de inverno no seu tamanho"        │
│ Preços especiais até domingo, 19/10          │
├─────────────────────────────────────────────┤
│ [foto]  Blusa Tricô Gola Alta                │
│         R$ 129,90  R$ 159,90  −19%           │
│         "Combina com a calça que você levou" │
│         Cor  ● Bege  ● Preto                 │
│         Tam. [P] [M✓] [G]   Qtd. [1]         │
│         [ ♥ Quero ]  [ Talvez ]  [ Não ]      │
│ … (as outras peças)                          │
├─────────────────────────────────────────────┤
│ Mais para você: no seu tamanho, em promoção  │
│ [+] [+] [+]                                   │
├─────────────────────────────────────────────┤
│ 3 peças · R$ 349,70                          │
│ [ Quero comprar ]  [ Quero provar em casa ]  │
│ Ainda estou pensando · Falar com a Ana       │
└─────────────────────────────────────────────┘
```

- **Por peça:** Quero, Talvez ou Não; tamanho e cor (as outras cores do modelo, D-21); quantidade. O estoque aparece na hora, e uma peça que esgotou mostra parecidas no lugar.
- **Acrescentar:**
  - a faixa "Mais para você" traz peças no tamanho dela, em promoção ou da mesma categoria;
  - quem está logada também pode abrir o catálogo e voltar com peças para a seleção;
  - quem não tem conta não navega no catálogo, que é privado (D-09), mas usa essa faixa.
- **Devolver:**
  - **Quero comprar** cria o pedido de compra pendente com as peças marcadas como "Quero";
  - **Quero provar em casa** cria o condicional, se o CEP for atendido;
  - nos dois casos, o WhatsApp do vendedor abre com a mensagem do pedido (D-19), já com o código.
- **Ainda estou pensando:** grava as marcações e avisa o vendedor, sem criar pedido.
- As escolhas ficam salvas no próprio link. Ela pode voltar depois e continuar de onde parou.
- Logada, a seleção aparece também em **Minha conta → Seleções para você**, com "pôr na sacola".

## Modelo de dados (proposta)

| Tabela | Campos principais | Observações |
|---|---|---|
| `selecao` | id, **codigo** (`SEL-000123`), vendedorId, clienteId, campanhaId?, titulo, mensagem, **status**, validaAte?, cupomId?, criadaEm, enviadaEm?, vistaEm?, vezesVista, respondidaEm?, **pedidoId**? | Status: `rascunho`, `enviada`, `vista`, `respondida`, `convertida`, `vencida`, `cancelada`. Não reserva estoque. O link é assinado como o do pedido (D-20), sem coluna nova. |
| `selecao_item` | id, selecaoId, **produtoId**, varianteId? (tamanho sugerido), precoOferta?, nota?, ordem, **escolha** (`pendente`/`quero`/`talvez`/`nao`), varianteEscolhida?, quantidade, **adicionadoPelaCliente** | A peça pode entrar sem tamanho. `precoOferta` vale até `validaAte`. |
| `pedido` | + **selecaoId**? | Liga o pedido à seleção de origem, para medir a conversão. A origem continua `vendedor`. |

Reaproveita o que já existe:
- `criarPedido` com `precos` (D-23) para os preços especiais;
- o limite de desconto do vendedor (`caixa.descontoMaxVendedor`);
- `chaveDoModelo` e as cores (D-21);
- o histórico (`interesseDoCliente`, D-18) para sugerir;
- o cartão do link (`cartao-pedido.ts`, D-20);
- a mensagem do pedido (D-19);
- as regras de cupom (docs/20);
- o aviso por e-mail da sacola parada, adaptado para "abriu ou respondeu".

## Regras de negócio

- **Estoque:** a seleção não reserva. A disponibilidade é conferida ao abrir o link e de novo ao virar pedido. O condicional, quando a cliente escolhe provar em casa, reserva como hoje.
- **Preço especial:** vale até `validaAte`. Depois, o link mostra o preço do catálogo e avisa "a oferta acabou". O vendedor pode renovar.
- **Validade da seleção:** padrão de 7 dias, configurável. Vencida, o link continua abrindo, mas só para falar com o vendedor.
- **Escopo:** o vendedor vê e cria seleções só para as próprias clientes; o gestor, para todas (como em D-14).
- **Mais de uma seleção aberta para a mesma cliente:** é permitido. Minha conta mostra a mais recente primeiro.
- **Link encaminhado:** quem tem o link vê as peças e pode marcar escolhas e gerar um pedido **pendente**, que o vendedor confirma no WhatsApp. Por isso o link não mostra telefone, endereço, CEP nem histórico, como o do pedido (D-20).
- **LGPD:** "vista" registra só data e contagem, sem IP. A exclusão da conta apaga as seleções da cliente.
- **Meta e resultados:** a seleção não conta. O pedido gerado por ela conta como qualquer pedido, e o painel mostra a conversão.

## Fases

| Fase | Entrega | Tamanho |
|---|---|---|
| **1 · Seleção individual** | Tabelas `selecao` e `selecao_item`; montar (sem tamanho, nota, preço especial e validade); link `/s/…` com cartão; Quero/Talvez/Não, tamanho, cor e quantidade; devolver como pedido ou condicional; situação Enviada/Vista/Respondida/Virou pedido; lista "Seleções" no painel; Minha conta | Grande |
| **2 · Sugestões e acompanhamento** | Sugerir automaticamente pelo histórico; faixa "Mais para você"; aviso ao vendedor quando abre ou responde (selo e e-mail); "Ainda estou pensando"; cupom na seleção; conversão em Resultados; renovar e duplicar seleção | Média |

O **montador de pedidos** continua para o pedido direto, quando a cliente já disse o que quer. "Salvar e enviar ao cliente" passa a sugerir a seleção quando o objetivo é oferecer.

## Decisões (16/10/2026, D-27)

1. **Link sem login**: sim, como o do pedido (D-20).
2. **Peças fora da sugestão**: faixa "Mais para você" para todas, e o catálogo inteiro para quem está logada (fase 2).
3. **Estoque**: a sugestão não reserva.
4. **Validade**: 7 dias por padrão (3, 7, 15 ou 30), para a sugestão e para os preços especiais.
5. **Devolver as escolhas**: cria o pedido pendente e abre o WhatsApp de quem atende.
6. **Mala direta**: decidido que seria do vendedor para as próprias clientes; feita e **retirada em 17/10/2026**, porque as vendas são direcionadas (a sugestão é montada para cada cliente).
7. **Nome na tela**: **Sugestões para você**.

## Fase 1: como ficou

- No painel: **Vendas → Sugestões** (`/painel/sugestoes`, página **Sugestões enviadas**, botão **+ Montar sugestão**; na ficha da cliente, **Sugerir peças**). Para a cliente: **Sugestões para você**. (O nome foi "Enviar carrinho" até 17/10/2026: "carrinho" se confundia com a sacola da cliente.)
- **Sugestões enviadas**: lista com a situação (Enviada, Vista, Respondida, Virou pedido, Vencida, Cancelada), quantas vezes a cliente abriu e o que marcou; o gestor filtra por vendedor.
- **Montar sugestão** (`/painel/sugestoes/nova`):
  - cliente, título, mensagem e validade;
  - busca com promoções primeiro;
  - cada peça entra no tamanho tocado, no tamanho que a cliente mais usa (compras e escolhas no site) ou com "Ela escolhe";
  - **Histórico da cliente**, ao lado da sugestão: a sacola atual (ou parada, com o valor e quando mexeu), as peças que ela mais abriu (quantas vezes e os tamanhos que escolheu), os favoritos, os pedidos que não fecharam e as compras. Cada peça tem **+** para entrar na sugestão já no tamanho que ela usou (se ainda houver estoque), e a sacola tem **Pôr a sacola inteira na sugestão**;
  - desconto em % por peça (vendedor até o limite do caixa, arredondado ao centavo; gestor sem limite) e nota.
  - **Criar e enviar no WhatsApp** abre a conversa com a mensagem e o link; **Só criar** deixa para enviar depois.
- **Detalhe**: o que foi sugerido e o que a cliente escolheu (tamanho, cor, quantidade), vista e respondida, link para copiar ou abrir, **Enviar de novo** e **Cancelar**; virou pedido, **Ver o pedido**.
- **Link da cliente** `/s/SUG-000001.<assinatura>` (HMAC com prefixo próprio, `link-pedido.ts`), com cartão de prévia `cartao.jpg` ("SUGESTÕES PARA VOCÊ"):
  - por peça: Quero, Talvez ou Não; cor (com a miniatura da foto, porque o mesmo nome de cor pode ser estampas diferentes); tamanho com estoque; quantidade;
  - as marcações ficam salvas no link enquanto ela escolhe;
  - **Quero comprar** ou **Quero provar em casa** (pede o CEP se a ficha não tiver um atendido) criam o pedido com os preços especiais que valem e abrem o WhatsApp de quem atende com a mensagem do pedido (D-19); **Ainda estou pensando** marca como respondida;
  - vencida, cancelada ou já respondida: só o botão para falar com quem atende.
  - "Vista" não conta a prévia do WhatsApp (robôs) nem a equipe.
- **Minha conta → Sugestões para você**: a lista, para quem está logada.
- O envio entra no acompanhamento da equipe (D-26) como **Enviou sugestões**.

Tabelas `sugestao` e `sugestao_item` (migration `20261016200000_sugestoes`); regras puras em `src/lib/sugestoes.ts`, servidor em `src/server/sugestoes.ts`, ações em `src/server/acoes/sugestoes.ts`.

## Fases 2 e 3: como ficou (17/10/2026)

**Fase 2 · sugestões e acompanhamento**
- **✨ Sugerir automaticamente** (no montador, com a cliente escolhida): até 8 peças com estoque no tamanho dela, nesta ordem: a sacola, o que ela mais abriu e não comprou, os favoritos e promoções nas categorias que ela mais olha. O vendedor tira e põe à vontade.
- **Mais para você** (página da cliente): até 6 peças das mesmas categorias da sugestão, de outros modelos, promoções primeiro. Ela toca em **+ Incluir** e a peça entra marcada como Quero (`adicionadoPelaCliente`).
- **Cupom na sugestão**: com os cupons ligados (e o vendedor liberado), o cupom vai na mensagem, aparece na página da cliente e é aplicado quando ela pede. Se ele não servir mais nessa hora (venceu, limite, peças), o pedido sai sem ele em vez de travar.
- **Renovar** dá mais 7 dias à sugestão e aos preços especiais (e reabre um vencido); **Duplicar** abre o montador com as peças, o título, a mensagem e o cupom, para a mesma ou outra cliente.
- **Conversão**: o funil enviados → vistos → respondidos → viraram pedido → vendido (pedidos confirmados) no topo de **Sugestões enviadas** (últimos 30 dias) e em **Resultados** (no período, por vendedor).
- Os avisos de sugestão vista e respondida são as notificações D-28.

**Enriquecimento das Sugestões** (17/10/2026, no lugar da mala direta)
- **Só criar = Para enviar**: a sugestão fica pronta e aparece em "Precisa de atenção" até o vendedor tocar em **Enviar no WhatsApp** (o envio é registrado no acompanhamento da equipe).
- **Precisa de atenção**, no topo de Sugestões enviadas: para enviar; enviada há 2 dias ou mais sem abrir; visto há mais de 1 dia sem resposta; "ainda pensando"; vence nas próximas 24 horas. Lembrada nas últimas 24 horas, a sugestão sai da lista por um dia.
- **Lembrar no WhatsApp**: a mensagem muda conforme o ponto em que ela parou (não abriu, viu, marcou e está pensando), com o link de novo. Fica guardado quando e quantas vezes (`lembradoEm`, `lembretes`).
- **Filtros** por situação (com a contagem de cada uma) e busca por cliente, título ou código; o gestor filtra por vendedor.
- **Ficha da cliente**: cartão **Sugestões** com as dela e "+ Sugerir peças".
- **Aviso "Sugestão vencendo"** (notificações D-28): uma sugestão enviada vence nas próximas 24 horas sem virar pedido.

Migrations `20261017090000_mala_direta` (cupom e envio na sugestão, e a mala direta) e `20261017120000_sem_mala_direta` (retira a tabela `campanha`, entram os lembretes e o aviso).
