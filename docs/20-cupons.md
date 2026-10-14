# 20 · Cupons de desconto

Planejamento de 14/10/2026 · Marcelo · situação: **fases 1, 2 e 3 prontas** (14/10/2026); fases 4 e 5 a fazer

Hoje o projeto não tem cupom. Os descontos que existem são a promoção do produto (`preco` menor que `precoCheio`), o selo "Imperdível" e o desconto do vendedor no pedido pendente, por peça ou geral (U-08). Este capítulo define a estratégia e o plano para um sistema de cupons com estas opções:

- desconto em **%**, em **valor fixo (R$)** ou **frete grátis**;
- vale para a **loja toda** ou só para algumas **categorias, marcas ou produtos**;
- **validade** (início e fim) e **limite de uso**, no total e por cliente;
- **valor mínimo** de compra;
- **quem aplica**: a cliente digita o código na sacola, o vendedor aplica no pedido, ou os dois;
- campanhas automáticas de **primeira compra** e de **próxima compra**;
- tudo isso **ligado, criado e configurado só pelo admin** (papel `gestor`); o vendedor não cria cupom, mas vê todos os disponíveis para divulgar aos clientes dele.

## Resumo da estratégia

1. **O uso do cupom vive no pedido.** O pedido guarda o cupom e o desconto de cada peça. Não há tabela separada de "usos": um uso é um pedido não cancelado com aquele cupom. Pedido cancelado ou expirado devolve o uso sozinho.
2. **O desconto é distribuído pelas peças.** Cada linha do pedido guarda a sua parte do desconto do cupom. Com isso a venda, os relatórios de margem por produto e categoria, o condicional fechado em parte e o histórico continuam certos sem regras especiais.
3. **Uma única função calcula o cupom**, em `src/lib/cupom.ts`, sem acesso ao banco: recebe o cupom, as peças e o contexto da cliente e devolve o desconto por linha ou o motivo da recusa. A sacola (prévia), o servidor (gravação) e o painel usam a mesma função, e os testes de unidade cobrem todas as regras.
4. **O servidor sempre confere de novo, dentro da transação do pedido**, com a linha do cupom travada (`SELECT … FOR UPDATE`). Assim, duas clientes não passam do limite usando a última unidade ao mesmo tempo, como já é feito com o estoque (C-06, C-07).
5. **Só o admin (gestor) liga, cria e configura.** Um interruptor geral em Configurações liga o sistema de cupons; com ele desligado, nenhum campo ou botão de cupom aparece. Vendedor e cliente só *usam* cupons que o gestor criou (P-13). O vendedor tem uma tela com todos os cupons disponíveis, pronta para divulgar. Para desconto individual ele já tem o desconto do pedido (U-08), que **soma** com o cupom (P-11).
6. **Campanhas automáticas usam o mesmo motor.** Primeira compra e próxima compra são cupons com um gatilho: o sistema os oferece ou gera sozinho, mas o cálculo e a conferência são os mesmos de qualquer cupom.

## Opções de cada cupom

| Opção | Como funciona | Padrão |
| --- | --- | --- |
| Código | Letras, números e hífen, até 30 caracteres, gravado em maiúsculas. Na digitação, maiúsculas e minúsculas são iguais | obrigatório |
| Tipo | **Percentual** (ex.: 10%), **valor fixo** (ex.: R$ 20,00) ou **frete grátis** | percentual |
| Teto do desconto | Só no percentual: o desconto não passa de R$ X (ex.: 15% até R$ 50) | sem teto |
| Abrangência | Loja toda, ou uma lista de categorias, marcas e produtos (vale a peça que estiver em qualquer item da lista) | loja toda |
| Produtos em promoção | Escolha no cadastro do cupom: **vale** ou **não vale** para peças já em promoção ou "Imperdível" (P-10) | não vale |
| Valor mínimo | Soma de **todas as peças do pedido** (P-08), já com o desconto do vendedor, sem o frete e antes do cupom | sem mínimo |
| Validade | Data e hora de início e de fim, no fuso de São Paulo (as datas do sistema já seguem esse fuso) | começa na criação, sem fim |
| Limite total | Quantos pedidos podem usar o cupom ao todo | sem limite |
| Limite por cliente | Quantas vezes a mesma cliente pode usar | 1 |
| Só primeira compra | Vale apenas para quem não tem nenhuma venda confirmada | não |
| Clientes específicos | Lista de clientes que podem usar (ex.: cupom de aniversário, de reativação) | todos |
| Quem aplica | **Cliente** (na sacola), **equipe** (no pedido) ou **ambos** | ambos |
| Ativo | Liga e desliga o cupom sem apagar | ativo |

Um pedido tem no máximo **um cupom**. Cupons não se somam entre si (frete grátis e um cupom de % não vão juntos no mesmo pedido). O cupom sempre soma com o desconto do vendedor.

## Como o desconto é calculado

```
subtotal        = soma de (preço combinado × quantidade) de todas as peças
mínimo          → subtotal ≥ valor mínimo, senão: "Faltam R$ X para usar este cupom"
peças elegíveis = peças dentro da abrangência
                  − peças em promoção (se o cupom foi criado como "não vale para promoção")
                  → nenhuma elegível: "Este cupom não vale para as peças da sacola"
base            = soma de (preço combinado × quantidade) das peças elegíveis
desconto        = percentual: base × % (limitado ao teto)
                  valor fixo: o menor entre o valor e a base
distribuição    = proporcional ao valor de cada peça elegível, em centavos;
                  a sobra do arredondamento vai para a peça de maior valor
```

- **Preço combinado** é o `precoUnitario` do pedido. O cupom vem **depois** do desconto do vendedor, nunca por cima do preço de catálogo, e os dois **sempre somam** (P-11).
- **Frete:** cupom de % ou de valor não mexe no frete, e o mínimo do frete grátis da loja é conferido sobre as peças **antes** do cupom (a cliente não perde o frete grátis por usar cupom).
- **Total do pedido** = soma das peças − desconto do cupom + frete.

### Cupom de frete grátis (P-12)

- Zera o frete do pedido de compra. Valem as mesmas regras de validade, limites, mínimo do pedido, abrangência e promoção: ele é aceito se o pedido tiver **pelo menos uma peça elegível**.
- **Frete "a combinar":** enquanto a loja não tem regra de frete (D-14, P-03), o pedido fica com frete **grátis (cupom)** em vez de "a combinar", e a mensagem do WhatsApp avisa a cliente e o vendedor. Quando a loja tiver regra, o cupom zera o valor que seria cobrado.
- **Condicional e venda na loja:** não têm frete, então o cupom de frete grátis é recusado ("Este cupom vale só para pedido com entrega").
- No histórico e nos relatórios aparece como "Frete grátis (cupom X)", com o valor do frete que deixou de ser cobrado, quando havia regra.

### Exemplos

| Pedido | Cupom | Resultado |
| --- | --- | --- |
| Camiseta R$ 100 + Calça R$ 200 | 10%, loja toda | −R$ 10 na camiseta, −R$ 20 na calça; total R$ 270 |
| Camiseta R$ 100 + Calça R$ 200 | R$ 30, só calças | −R$ 30 na calça; total R$ 270 |
| Camiseta R$ 100 (em promoção) + Calça R$ 200 | 10%, não vale promoção, mínimo R$ 250 | pedido de R$ 300 passa no mínimo; desconto só na calça: −R$ 20 |
| Camiseta R$ 100 (preço do vendedor: R$ 90) | 10%, loja toda | −R$ 9 sobre os R$ 90 combinados: o desconto do vendedor e o cupom somam |
| Camiseta R$ 100, frete R$ 24,90 | frete grátis, mínimo R$ 80 | frete R$ 0; total R$ 100 |
| Camiseta R$ 100 | 15% até R$ 10 | −R$ 10 (o teto) |
| Camiseta R$ 80 | R$ 100 fixo | −R$ 80 (nunca deixa a peça negativa) |

## Campanhas automáticas

O gestor configura cada campanha uma vez, em `/painel/cupons/campanhas`, e liga ou desliga quando quiser. As duas usam as mesmas opções de um cupom comum (tipo, valor, teto, abrangência, promoção, mínimo, quem aplica).

### Primeira compra

- **Para quem:** cliente sem nenhuma venda confirmada (pedido, condicional fechado ou venda na loja).
- **Como chega:** a sacola mostra um aviso, "Você tem 10% de desconto na sua primeira compra", e um botão para aplicar. A cliente não precisa saber de nenhum código. Opcionalmente, a campanha tem um código público (ex.: `BEMVINDA`) para divulgar fora do site.
- **Prazo:** "válido por N dias depois do cadastro" (ex.: 30). Sem prazo, vale até a primeira compra.
- **Uso:** uma vez por cliente. Enquanto o pedido com o cupom estiver pendente, o uso fica reservado; se for cancelado ou expirar, o cupom volta a valer.
- **Proteção:** hoje o telefone **não** é único entre as fichas de cliente (o cadastro só evita ligar a conta a uma ficha existente, C-03). Por isso a regra confere o **telefone normalizado**: se qualquer ficha com o mesmo telefone já tem venda confirmada, ou já usou o cupom de primeira compra, a nova conta não ganha o desconto. Assim a mesma pessoa não cria várias contas para repetir o cupom.

### Próxima compra (fidelização)

- **Gatilho:** toda venda confirmada acima de um valor (ex.: compras a partir de R$ 150) gera um cupom **pessoal e de uso único** para aquela cliente, com código próprio (ex.: `VOLTA-7KQ2`).
- **Prazo:** começa a valer X dias depois da compra (ex.: 1) e vence Y dias depois (ex.: 60). O cupom com início futuro evita usar o desconto no mesmo pedido de troca.
- **Como chega:** o cupom aparece em **Minha conta › Meus cupons**, na sacola (aplicado com um clique) e na mensagem do WhatsApp de confirmação que o vendedor envia ("Na sua próxima compra, use VOLTA-7KQ2 e ganhe 10% até 13/12").
- **Uma por vez:** se a cliente já tem um cupom de próxima compra válido e não usado, a nova venda **não** gera outro (configurável: "acumular" ou "manter só um").
- **Condicional:** gera só no fechamento, sobre o valor que ficou.
- **Venda com cupom gera cupom?** Configurável na campanha. O padrão é **não**, para o desconto não virar permanente.

### Interruptor e regras gerais (só admin)

| Configuração | O que faz | Padrão |
| --- | --- | --- |
| Cupons ligados | Liga e desliga todo o sistema. Desligado: some o campo da sacola, o botão do painel e as campanhas; pedidos que já têm cupom continuam como estão | desligado |
| Campanha primeira compra | Liga, desliga e define as opções | desligada |
| Campanha próxima compra | Liga, desliga e define as opções, o valor mínimo que gera o cupom, o início e o prazo | desligada |
| Vendedor pode aplicar cupom | Permite ou não que o vendedor aplique cupons "equipe" ou "ambos" no pedido | sim |

Todas ficam em Configurações e em `/painel/cupons`, acessíveis apenas ao papel `gestor`, com `exigirPapel(['gestor'])` na primeira linha de cada página e de cada Server Action (regra 2 de [Permissões](06-permissoes.md)).

## Onde o cupom aparece

### Sacola (cliente)

- Campo **"Tem um cupom?"** abaixo do resumo. Ao aplicar, a sacola mostra o desconto e o novo total na hora. Essa conta é uma prévia, feita pela mesma função do servidor.
- Mensagens de recusa claras: "Cupom não encontrado", "Este cupom expirou em 10/10", "Este cupom começa em 20/10", "Faltam R$ 35,00 para usar este cupom", "Este cupom não vale para as peças da sacola", "Você já usou este cupom", "Este cupom esgotou", "Este cupom é só para a primeira compra".
- **Link de campanha:** `/sacola?cupom=PRIMAVERA10` preenche o cupom sozinho, para o vendedor mandar pelo WhatsApp ou o gestor usar no Instagram.
- O cupom fica guardado junto da sacola no navegador. Se a sacola mudar e o cupom deixar de valer (abaixo do mínimo, por exemplo), ele fica marcado como "não aplicado", com o motivo.
- Ao enviar o pedido, o servidor confere tudo de novo. Se o cupom tiver deixado de valer nesse meio-tempo, o pedido **não** é enviado e a cliente vê o motivo (nada de enviar com um total diferente do que ela viu).
- A mensagem do WhatsApp ganha a linha "Cupom PRIMAVERA10: −R$ 27,00".
- **Proteção contra tentativa e erro:** a conferência de cupom usa o mesmo limitador de tentativas do login (C-01), por exemplo 10 códigos errados por cliente a cada 15 minutos.

### Pedido no painel (equipe)

- No pedido pendente, abaixo das peças, o botão **Cupom** abre um popup (como os de editar peça e desconto geral) para aplicar, trocar ou retirar o cupom, com a prévia do total.
- O vendedor só aplica cupom com "quem aplica" igual a **equipe** ou **ambos**, e as regras de validade, limite e mínimo valem para ele também.
- **Edição do pedido com cupom:** a cada edição de peça ou de desconto do vendedor, o cupom é recalculado. Se deixar de valer (por exemplo, abaixo do mínimo), a edição é salva, o cupom sai do pedido e o vendedor é avisado ("Cupom X retirado: faltam R$ 20,00 para o mínimo").
- No resumo do card, a linha **Cupom PRIMAVERA10 −R$ 27,00** aparece junto da linha de desconto do vendedor.
- O histórico registra "Cupom X aplicado (−R$ 27,00)", "Cupom X retirado" e o motivo.

### Condicional

- O cupom pode ser informado no envio, mas o desconto **só vale no fechamento**, sobre as peças que ficaram. No fechamento o cupom é recalculado. Se o que ficou não atingir o mínimo, a venda é confirmada sem o cupom, e o popup de fechamento avisa antes de confirmar.
- Enquanto o condicional está aberto, o uso fica reservado (conta no limite), como as peças.

### Venda na loja (balcão)

- O montador de pedido ganha o campo de cupom; a venda já entra confirmada com o desconto.
- A venda manual sem peças (valor digitado) não aceita cupom.

### Cupons para divulgar (vendedor)

O vendedor **não cria** cupom (P-13), mas tem a tela **Cupons** no painel, só de leitura, com tudo que pode divulgar:

- **O que aparece:** os cupons ativos e os agendados (com a data de início), e o código público da campanha de primeira compra, se houver. Para cada um: código, regra em palavras ("10% em calças, até R$ 50, a partir de R$ 150; não vale para promoção"), validade, se a cliente usa na sacola, se o vendedor aplica no pedido, e se tem limite de uso.
- **Para divulgar:** botões **Copiar código**, **Copiar link** (`/sacola?cupom=CODIGO`, que já aplica o cupom na sacola) e **Enviar pelo WhatsApp**, que abre a mensagem pronta para um cliente da carteira dele.
- **Cupons de clientes específicos:** aparecem só se algum cliente da carteira dele estiver na lista, e mostram quais.
- **Cupons pessoais de próxima compra:** não aparecem na lista geral; o vendedor os vê na **ficha do cliente**, para lembrar a cliente de usar antes de vencer.
- **O que não aparece:** números de uso, desconto concedido, receita e margem (só para o gestor).

## Painel do gestor: `/painel/cupons`

- **Lista:** código, descrição, tipo e valor, situação (**ativo**, **agendado**, **expirado**, **esgotado**, **desativado**), usos (ex.: 12 de 50) e desconto total concedido.
- **Novo e editar:** formulário com todas as opções da tabela acima. Depois que o cupom já foi usado, os campos que mudam o valor (tipo, valor, abrangência) ficam travados. Para mudar, o gestor desativa e cria outro. Isso mantém os pedidos antigos coerentes.
- **Desativar:** cupom com uso não é apagado, só desativado. Sem uso, pode ser apagado.
- **Detalhe do cupom:** pedidos que usaram o cupom, cliente, vendedor, data, desconto e situação do pedido.
- **Relatório:** em Resultados, o bloco "Cupons" mostra, por cupom e por período, pedidos, desconto concedido, receita e margem das vendas com cupom (só para o gestor, como todo dado de custo).

## Permissões

| Ação | Cliente | Vendedor | Gestor |
| --- | --- | --- | --- |
| Usar cupom na sacola | ✅ (cupom "cliente" ou "ambos") | — | — |
| Aplicar e retirar cupom em pedido pendente | — | ✅ só nos pedidos dele (cupom "equipe" ou "ambos") | ✅ todos |
| Ver todos os cupons disponíveis e divulgar (copiar código, link, WhatsApp) | — | ✅ (código, regra e validade; sem números de uso e de receita) | ✅ |
| Ver cupons pessoais de próxima compra dos próprios clientes | — | ✅ na ficha do cliente | ✅ |
| Ligar e desligar o sistema de cupons | — | — | ✅ |
| Criar, editar, desativar cupom | — | — | ✅ |
| Configurar primeira compra e próxima compra | — | — | ✅ |
| Ver os próprios cupons (Minha conta) | ✅ | — | — |
| Relatório de cupons | — | — | ✅ |

## Modelo de dados (proposta)

```prisma
enum TipoCupom { percentual  valor  freteGratis }
enum QuemAplica { cliente  equipe  ambos }
enum OrigemCupom { manual  primeiraCompra  proximaCompra }

model Cupom {
  id                   Int        @id @default(autoincrement())
  codigo               String     @unique @db.VarChar(30) // maiúsculas
  descricao            String?
  tipo                 TipoCupom
  valor                Decimal?   @db.Decimal(10, 2)      // % ou R$; vazio no frete grátis
  tetoDesconto         Decimal?   @db.Decimal(10, 2)
  minimoCompra         Decimal?   @db.Decimal(10, 2)
  inicioEm             DateTime   @default(now())
  fimEm                DateTime?
  limiteTotal          Int?
  limitePorCliente     Int?       @default(1)
  somentePrimeiraCompra Boolean   @default(false)
  valePromocao         Boolean    @default(false)
  quemAplica           QuemAplica @default(ambos)
  ativo                Boolean    @default(true)
  origem               OrigemCupom @default(manual)
  /// Cupom pessoal de próxima compra: dono, campanha que o gerou e a venda que o originou.
  clienteId            String?
  campanhaId           Int?
  pedidoOrigemId       String?
  criadoPorId          String?
  criadoEm             DateTime   @default(now())
  categorias           CupomCategoria[]
  marcas               CupomMarca[]
  produtos             CupomProduto[]
  clientes             CupomCliente[]
  pedidos              Pedido[]
}
// CupomCategoria, CupomMarca, CupomProduto, CupomCliente: (cupomId, alvoId) com chave estrangeira e @@id composto.

/// Primeira compra e próxima compra: uma linha por campanha, com as mesmas opções de um cupom
/// (tipo, valor, teto, abrangência, promoção, mínimo, quem aplica) e as regras do gatilho.
model CampanhaCupom {
  id               Int         @id @default(autoincrement())
  tipo             OrigemCupom @unique          // primeiraCompra | proximaCompra
  ativa            Boolean     @default(false)
  codigoPublico    String?     @db.VarChar(30)  // ex.: BEMVINDA (primeira compra)
  diasValidade     Int?                         // primeira: após o cadastro; próxima: após começar
  diasParaComecar  Int?        @default(1)      // próxima compra
  minimoParaGerar  Decimal?    @db.Decimal(10, 2)
  geraComCupom     Boolean     @default(false)
  acumula          Boolean     @default(false)
  // + as opções de desconto, iguais às do Cupom
}

// Configuração (tabela existente): cupons: { ligados: boolean; vendedorAplica: boolean }

// Pedido:      cupomId Int?, codigoCupom String? (cópia), descontoCupom Decimal @default(0),
//              freteCupom Boolean @default(false)   // frete zerado por cupom de frete grátis
// PedidoItem:  descontoCupom Decimal @default(0)   // parte desta linha, em R$, para a quantidade toda
```

Reflexos em código que já existe:

| Onde | Mudança |
| --- | --- |
| `src/server/pedidos.ts` (`criarPedido`, `editarPedido`, `confirmarPedido`) | Conferir e distribuir o cupom dentro da transação; `total` passa a descontar o cupom; na confirmação, a venda usa o valor já com cupom |
| `confirmarPedido` com condicional em parte (B-13) | A linha dividida leva o desconto proporcional às unidades; o cupom é recalculado sobre o que ficou |
| `src/lib/pedido.ts` (`valoresDoPedido`) | Linha "Cupom" no resumo de todas as telas |
| `src/server/relatorios.ts` | Receita por produto e categoria passa a ser `preço × qtd − descontoCupom` |
| `src/lib/whatsapp.ts` | Linha do cupom nas mensagens da cliente, do vendedor e de pedido alterado |
| `src/server/historico.ts` | Frases de cupom aplicado e retirado |
| `src/server/expiracao.ts` | Nada: pedido expirado já fica cancelado e o uso volta sozinho |
| `confirmarPedido` | Gera o cupom de próxima compra, na mesma transação, quando a campanha está ligada |
| `src/server/config.ts` | Chave `cupons` (ligados, vendedor aplica), validada por Zod como as outras |
| `/minha-conta` | Aba **Meus cupons**, com os cupons pessoais e o de primeira compra, com validade |

## Plano de implementação

| Fase | Entrega | Inclui | Estimativa |
| --- | --- | --- | --- |
| 1 · Base ✅ | Regras e cadastro | Migration; `lib/cupom.ts` com testes de unidade de todas as regras (inclusive frete grátis); CRUD em `/painel/cupons` (gestor); tela de leitura para o vendedor divulgar; permissões | 3 a 4 dias |
| 2 · Cliente ✅ | Cupom na sacola | Campo e prévia na sacola, link `?cupom=`, conferência na transação do pedido, limitador de tentativas, mensagem do WhatsApp, linha no resumo de "Meus pedidos" | 2 a 3 dias |
| 3 · Equipe ✅ | Cupom no painel | Popup de cupom no pedido pendente, recálculo nas edições, balcão, fechamento do condicional, histórico | 2 a 3 dias |
| 4 · Campanhas | Primeira e próxima compra | Tela de campanhas (gestor), aviso de primeira compra na sacola, geração do cupom pessoal na confirmação, aba "Meus cupons", linha na mensagem do WhatsApp | 2 a 3 dias |
| 5 · Gestão | Números | Detalhe do cupom com os pedidos, bloco "Cupons" em Resultados (inclusive quantos cupons de próxima compra voltaram como venda) | 1 a 2 dias |

Cada fase é publicada sozinha e já é utilizável: depois da fase 2 a loja pode divulgar cupons; a fase 3 leva o cupom ao atendimento pelo vendedor; a fase 4 liga a fidelização automática. Até o gestor ligar o interruptor, nada muda para clientes e vendedores.

### Fase 1 — o que foi feito (14/10/2026)

- **Banco** (`prisma/migrations/20261014200000_cupons`): tabelas `cupom`, `cupom_categoria`, `cupom_marca`, `cupom_produto` e `cupom_cliente`; no pedido, `cupomId`, `codigoCupom`, `descontoCupom` e `freteCupom`; na peça do pedido, `descontoCupom`. A tabela das campanhas (primeira e próxima compra) entra na fase 4.
- **Regras** (`src/lib/cupom.ts`): `avaliarCupom` (todas as recusas, mínimo sobre o pedido todo, abrangência, promoção, teto, frete grátis e distribuição em centavos), situação, regra em palavras. Testes em `tests/unit/cupom.test.ts`.
- **Configurações:** "Cupons de desconto ligados" (padrão desligado) e "Vendedores podem aplicar cupons".
- **Gestor** (`/painel/cupons`): lista com situação, usos e desconto dado; criar, editar (travas do cupom usado), ativar, desativar e apagar (só sem uso); detalhe com os pedidos que usaram o cupom.
- **Vendedor** (aba **Cupons** sempre no menu; com os cupons desligados, a página avisa que a loja ainda não ligou): os cupons ativos e agendados, com a regra em palavras e os botões Copiar código, Copiar link e Enviar pelo WhatsApp. O link `/sacola?cupom=` passa a aplicar o cupom na fase 2.
- **Testes de integração** em `tests/integracao/cupons.test.ts`.

### Fase 2 — o que foi feito (14/10/2026)

- **Motor no servidor** (`src/server/cupons.ts`, `cupomNoPedido`): aplica, recalcula ou retira o cupom dentro da transação do pedido, com a linha do cupom travada e os usos contados com leitura travada (`LOCK IN SHARE MODE`): dois pedidos ao mesmo tempo não passam do limite. Limite por cliente e primeira compra olham todas as fichas com o mesmo telefone.
- **Ciclo do pedido** (`src/server/pedidos.ts`): criar com cupom (recusado, o pedido não é gravado); editar recalcula o cupom ou o retira com o motivo no histórico; fechar o condicional recalcula sobre o que ficou; a venda já sai com o desconto. Cupom que venceu depois do pedido continua nele (só conta, mínimo e abrangência são refeitos).
- **Total do pedido** = todas as linhas − cupom (invariante conferido no fim da suíte). Relatórios por produto e categoria já descontam o cupom.
- **Sacola:** "Tem um cupom?", prévia do desconto na hora, link `/sacola?cupom=CODIGO`, cupom lembrado no navegador, motivo quando não aplica, limite de 10 códigos errados a cada 15 minutos por cliente. Mensagem do WhatsApp com a linha do cupom.
- **Telas:** resumo do pedido no painel com a linha **Cupom CÓDIGO · benefício · descrição −R$** (e "Desconto do vendedor" separado); "Meus pedidos" com o cupom.

### Fase 3 — o que foi feito (14/10/2026)

- **Pedido pendente no painel:** botão **Cupom** (ou **Cupom CÓDIGO**, quando já tem) ao lado de "Incluir peça" e "Desconto geral". O popup mostra o cupom atual com **Retirar cupom**, aplica ou troca pelo código digitado ou por um dos **disponíveis para esta cliente** (ativos, que a equipe pode aplicar, e os de clientes específicos só se ela estiver na lista), com motivo opcional. Depois de salvar, o link do WhatsApp com o pedido atualizado (já com a linha do cupom).
- **Regras:** aplicar exige os cupons ligados e, para o vendedor, "Vendedores podem aplicar cupons" (o gestor sempre); retirar vale sempre. Cupom "só cliente" é recusado. Cada mudança entra no histórico ("aplicado", "trocado", "retirado").
- **Novo pedido (seleção, condicional e venda na loja):** campo de cupom com atalhos dos disponíveis para a cliente escolhida; a mensagem do vendedor sai com o cupom e a venda na loja já entra com o desconto. Frete grátis é recusado no condicional e no balcão.
- **Fechamento:** "Confirmar venda" mostra o valor já com o cupom; no condicional, aviso de que o cupom é refeito sobre o que ficar.

## Testes

- **Unidade (`lib/cupom.ts`):** percentual com e sem teto, valor fixo maior que a base, frete grátis (com regra de frete, a combinar e condicional recusado), abrangência por categoria, marca e produto, promoção incluída e excluída, mínimo sobre o pedido todo, soma com o desconto do vendedor, distribuição em centavos sem sobra, validade nas bordas (início e fim, fuso de São Paulo).
- **Integração:** limite total e por cliente com dois pedidos ao mesmo tempo (só um passa); pedido cancelado e expirado devolvem o uso; edição que derruba o mínimo retira o cupom; condicional fechado em parte; venda e relatórios com o valor descontado; vendedor não aplica cupom "só cliente"; vendedor vê a lista de divulgação sem números de uso nem receita, e não acessa criar e editar; cliente não cria cupom; cupom usado não pode ter o valor alterado.
- **Campanhas:** primeira compra some depois da primeira venda confirmada e volta se o pedido for cancelado; próxima compra é gerada uma vez por venda acima do mínimo, começa e vence nas datas certas, não gera outra enquanto houver uma válida (com "manter só um") e não gera a partir de venda com cupom (padrão).
- **Permissões:** vendedor e cliente recebem "não encontrado" ou redirecionamento em todas as páginas e actions de cupom e campanha; com o interruptor desligado, nenhuma action de aplicar cupom aceita código.
- **Ponta a ponta:** cliente aplica cupom pelo link e envia; cliente nova vê e usa o de primeira compra; cliente com venda confirmada encontra o de próxima compra em "Meus cupons"; vendedor aplica no pedido e confirma; gestor liga o sistema, cria, vê o uso e desativa.

## Decisões tomadas — 14/10/2026

| # | Pergunta | Decisão |
| --- | --- | --- |
| P-08 | O valor mínimo considera só as peças elegíveis ou o pedido todo? | **Pedido todo** (peças, com o desconto do vendedor, sem frete) |
| P-10 | Cupom vale para produtos em promoção? | **Escolha no cadastro de cada cupom** (vale ou não vale); padrão "não vale" |
| P-11 | Cupom soma com o desconto do vendedor? | **Sempre soma**: o cupom é calculado sobre o preço já combinado |
| P-12 | Tipo "frete grátis" | **Entra já**, como terceiro tipo de cupom |
| P-13 | Vendedor pode criar cupom? | **Não**. Vê todos os cupons disponíveis, para divulgar aos clientes dele |
| P-09 | Condicional: o uso conta enquanto está aberto? | **Conta** (adotada a recomendação ao iniciar o desenvolvimento): um uso é qualquer pedido não cancelado |

## Decisões pendentes

| # | Pergunta | Opções | Recomendação |
| --- | --- | --- | --- |
| P-14 | Outros automáticos (aniversário, reativação de quem não compra há 90 dias) | Agora; depois | **Depois**: usam o mesmo motor de campanha; primeira e próxima compra entram já na fase 4 |
| P-15 | Valores das campanhas | Primeira compra: 10% sem mínimo, 30 dias; próxima compra: 10% até R$ 50, gerado a partir de R$ 150, de 1 a 60 dias | Definir com a loja antes da fase 4 |
