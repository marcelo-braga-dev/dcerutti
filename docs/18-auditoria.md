# 18 · Auditoria de bugs, usabilidade e coerência

Análise de 07/10/2026 · Marcelo · versão completa (com reprodução de cada item): [Claude Docs](https://claude.ai/code/artifact/308995f0-2a4a-444d-a186-bc644704726e)

40 problemas encontrados navegando como visitante, cliente, vendedora e gestor (computador e celular), lendo o código e conferindo os dados. **Todos os 40 resolvidos** nos commits `d171ce1` (onda 1), `f122664` (onda 2), `96dc502` (onda 3) e `33bf32b` (decisões D-14), com testes ponta a ponta para os graves. 

## Bugs

| # | Problema | Situação |
| --- | --- | --- |
| B-01 | Sacola em "Provar em casa" estourava a tela do celular | ✅ onda 1 |
| B-02 | Painel no celular sem Sair e sem Ver loja | ✅ onda 1 |
| B-03 | Loja no celular sem acesso a Minha conta e Sair | ✅ onda 1 |
| B-04 | Link de produto perdia o destino no login | ✅ onda 1 |
| B-05 | Sacola aceitava mais peças que o estoque | ✅ onda 1 |
| B-06 | Peça fora do catálogo travava a sacola sem dizer qual | ✅ onda 2 |
| B-07 | Minha conta mostrava o valor cheio do condicional fechado | ✅ onda 2 |
| B-08 | Lista de pedidos com o mesmo total cheio | ✅ onda 2 |
| B-09 | Pedidos em aberto ficavam com o vendedor antigo | ✅ onda 2 |
| B-10 | Sem aceite da política não dava para excluir a conta | ✅ onda 1 |
| B-11 | Cliente excluído continuava nas listas, com WhatsApp vazio | ✅ onda 2 |
| B-12 | Confirmação "Salvo" fora da tela em formulário longo | ✅ onda 1 |
| B-13 | Condicional com várias unidades só fechava inteiro | ✅ onda 3 |
| B-14 | Venda manual aceitava data no futuro | ✅ onda 2 |
| B-15 | Página inicial sem `h1` | ✅ onda 1 |

## Inconsistências

| # | Problema | Situação |
| --- | --- | --- |
| Q-01 | Cada tela mostrava um total diferente (frete) | ✅ onda 2: frete gravado no pedido |
| Q-02 | Preço congelado na sacola | ✅ onda 2: sacola conferida ao abrir |
| Q-03 | Nome do pedido podia diferir do cadastro | ✅ onda 1 |
| Q-04 | Venda na loja física não baixa estoque | ✅ D-14: Novo pedido → Venda na loja, com baixa de estoque |
| Q-05 | Condicional abandonado segura estoque para sempre | ✅ D-14: expira em 7 dias (configurável), com motivo registrado |
| Q-06 | Histórico de estoque vazio em produto importado | ✅ onda 3 |
| Q-07 | Link para produto inativo dava 404 | ✅ onda 2 |
| Q-08 | Gestor como vendedor fora do ranking | ✅ D-14: não; cliente fica só com vendedor ativo |
| Q-09 | Mesma cor para tipo e status | ✅ onda 2 |

## Usabilidade

| # | Problema | Situação |
| --- | --- | --- |
| U-01 | Menus escondiam itens sem aviso no celular | ✅ onda 1 |
| U-02 | CEP do condicional não vinha preenchido | ✅ onda 1 |
| U-03 | "Seu nome" redundante na sacola | ✅ onda 1 |
| U-04 | Cliente não editava os próprios dados | ✅ onda 3 |
| U-05 | Cliente não cancelava pedido em aberto | ✅ onda 3 |
| U-06 | Tamanho desmarcado depois de adicionar | ✅ onda 1 |
| U-07 | Galeria sem deslizar no celular | ✅ onda 3 |
| U-08 | Pedido pendente não editável; vendedor só criava compra | ✅ onda 3 (condicional do vendedor) e edição de peças do pedido pendente |
| U-09 | Fotos do produto como lista de endereços | ✅ onda 3: miniaturas com mover e remover |
| U-10 | Meta obrigatória ao cadastrar vendedor | ✅ onda 3 |
| U-11 | Gestor sem link de convite | ✅ D-14: não se aplica (gestor não atende clientes) |

## Coerência

| # | Problema | Situação |
| --- | --- | --- |
| C-01 | "Sair" com estilo diferente de "Ver loja" | ✅ onda 1 |
| C-02 | Mesmo conceito com nomes diferentes | ✅ onda 2: "Pedido" e "Condicional" |
| C-03 | "6x" e frete grátis sem regra confirmada | ✅ D-14: frete a combinar e parcelamento escondido até a loja definir |
| C-04 | Plurais com "(s)" e "atendida(o)" | ✅ onda 2 |
| C-05 | Mensagens de erro em tons diferentes | ✅ onda 2 |

## Decisões

Tomadas em 07/10/2026 e registradas em [D-14](10-decisoes.md). Ainda em aberto: os valores reais de frete (P-03) e de parcelamento (P-04), que o gestor ativa em Configurações quando a loja definir.
