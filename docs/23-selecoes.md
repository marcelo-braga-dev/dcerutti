# 23 · Seleções do vendedor (sugestões e mala direta)

Planejamento de 16/10/2026 · Marcelo · situação: **planejado** — aguardando as decisões da seção "Decisões em aberto"

O vendedor monta uma **seleção**: um carrinho de sugestões com as peças que ele acha que a cliente vai gostar (novidades, promoções no tamanho dela, o que combina com a última compra). A cliente recebe um link no WhatsApp e, nele:
- marca o que quer, o que talvez queira e o que não quer;
- troca o tamanho ou a cor;
- tira peças e acrescenta outras;
- devolve as escolhas, que já viram pedido ou condicional.

É a forma de o vendedor **começar a venda**: mostrar ofertas, direcionar e estimular. Em escala, a mesma seleção vai para várias clientes de uma vez, personalizada para cada uma (**mala direta**).

## O que existe hoje e o que falta

Hoje o vendedor usa o **montador de pedidos** (fluxo 3 em [05 · Fluxos](05-fluxos.md)): escolhe a cliente, as peças e os tamanhos, e **Salvar e enviar ao cliente** cria um **pedido pendente** e manda a imagem "Seleção para você" pelo WhatsApp. O link público do pedido (`/p/…`, D-20) mostra as peças.

| Falta hoje | Consequência |
|---|---|
| A cliente não interage: só lê e responde por texto | O vendedor reescreve à mão o que ela quer ("a azul no M, a preta não") |
| A sugestão já nasce como **pedido** | Polui a lista de pedidos, conta como pendente, entra no prazo de vencimento (D-14) |
| O vendedor precisa acertar o tamanho de cada peça | Sugestão de modelo ("dá uma olhada nesta camisa") não cabe |
| Não dá para saber se ela abriu | O vendedor não sabe se insiste ou espera |
| Uma seleção por vez, cliente por cliente | Sem mala direta: uma promoção para 40 clientes são 40 montagens |
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

## Mala direta (campanhas)

Uma campanha é **uma seleção-modelo enviada a várias clientes**, personalizada para cada uma:

1. O gestor, ou o vendedor para as próprias clientes, escolhe as peças e a mensagem. Exemplo: "Promoção de inverno, até 30%".
2. **Público**, com filtros sobre o que já existe:
   - clientes de um vendedor;
   - quem comprou ou viu uma categoria;
   - quem usa tal tamanho;
   - quem não compra há N dias;
   - quem tem sacola parada;
   - quem está no CEP do condicional.
   A tela mostra quantas clientes entram antes de gerar.
3. **Gerar** cria **uma seleção por cliente**:
   - peças sem estoque no tamanho dela ficam de fora;
   - o tamanho já vem marcado;
   - a mensagem leva o nome dela.
4. **Fila de envio:** sem a API oficial do WhatsApp (D-08), não existe envio automático em massa. O painel lista as clientes da campanha com o botão **Enviar** em cada uma, e cada toque abre o WhatsApp já com a mensagem e o link. São 40 toques, não 40 montagens. Quando houver a API oficial, a fila vira envio automático sem mudar o resto.
5. **Resultado da campanha:** enviadas, vistas, respondidas, viraram pedido, valor vendido e peças mais escolhidas.

## Modelo de dados (proposta)

| Tabela | Campos principais | Observações |
|---|---|---|
| `selecao` | id, **codigo** (`SEL-000123`), vendedorId, clienteId, campanhaId?, titulo, mensagem, **status**, validaAte?, cupomId?, criadaEm, enviadaEm?, vistaEm?, vezesVista, respondidaEm?, **pedidoId**? | Status: `rascunho`, `enviada`, `vista`, `respondida`, `convertida`, `vencida`, `cancelada`. Não reserva estoque. O link é assinado como o do pedido (D-20), sem coluna nova. |
| `selecao_item` | id, selecaoId, **produtoId**, varianteId? (tamanho sugerido), precoOferta?, nota?, ordem, **escolha** (`pendente`/`quero`/`talvez`/`nao`), varianteEscolhida?, quantidade, **adicionadoPelaCliente** | A peça pode entrar sem tamanho. `precoOferta` vale até `validaAte`. |
| `campanha` | id, titulo, mensagem, criadoPorId, **filtro** (JSON do público), validaAte?, cupomId?, criadaEm | As peças-modelo ficam numa `selecao` sem cliente, ou em `campanha_item`. |
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
| **3 · Mala direta** | Campanhas com público por filtros, uma seleção por cliente personalizada pelo tamanho, fila de envio, resultado da campanha, modelos reutilizáveis | Média |

O **montador de pedidos** continua para o pedido direto, quando a cliente já disse o que quer. "Salvar e enviar ao cliente" passa a sugerir a seleção quando o objetivo é oferecer.

## Decisões em aberto

1. **Link sem login.** Recomendado, como o do pedido (D-20), porque muitas clientes não têm conta. A alternativa é exigir login para marcar as escolhas, o que é mais seguro e tem muito mais atrito.
2. **Peças fora da seleção.** Recomendado: a faixa "Mais para você" para todas, e o catálogo inteiro só para quem está logada.
3. **Estoque.** Recomendado: não reservar. A alternativa é reservar por algumas horas, o que prende peças de quem não responde.
4. **Validade.** Padrão de 7 dias para a seleção e para os preços especiais?
5. **Devolver as escolhas.** Recomendado: já cria o pedido pendente e abre o WhatsApp. A alternativa é só avisar o vendedor e ele monta o pedido.
6. **Mala direta.** O vendedor cria campanhas para as próprias clientes, ou só o gestor?
7. **Nome na tela.** "Seleção", "Sugestões para você" ou "Vitrine da [vendedora]"?
