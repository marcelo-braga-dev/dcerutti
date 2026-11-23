# 25 · Importação da planilha de estoque

A planilha de estoque exportada do sistema da loja ("Relatório de Produtos", `.xlsx`) é **a verdade do catálogo**: estoque, preços, peças novas e peças que saíram. É o padrão de importação desde 05/11/2026 e substitui os importadores antigos (protótipo e CSV), que ficam só para referência.

## Onde

- **Painel → Produtos › Importar estoque** (aba no topo de Produtos; `/painel/produtos/importar`, só o gestor).
- Linha de comando: `npm run estoque:importar -- caminho/estoque.xlsx` (prévia) e `… --confirmar` (grava).

## A planilha

Uma linha por peça num tamanho (SKU). Colunas obrigatórias, com estes nomes exatos (a linha do cabeçalho pode ter outras linhas acima; vale a primeira aba que tiver o cabeçalho):

| Coluna | Uso no site |
|---|---|
| Fornecedor | `produto.fornecedor`; define a marca dos produtos novos (regra editável) |
| Código | `variante.codigoInterno`: é por ele que a peça do site é encontrada (o mesmo código da etiqueta e do caixa) |
| Refer. | agrupa os tamanhos num produto; base da `produto.referencia` dos produtos novos |
| Cód. Barras | `variante.ean`, quando tem de 8 a 14 dígitos |
| Descrição | nome, categoria, gênero e estação dos produtos novos |
| Tam. | `variante.tamanho` (U, UN e UNI viram UNI) |
| Cód. Cor / Cor Visual | separa as cores de uma referência; a Cor Visual vira a cor do nome ("… - Preto") |
| Estoq., Cond., Res. EC | estoque à venda no site = Estoq. − Cond. − Res. EC |
| Preço Venda | `produto.precoCheio` |

A aba "Totais" do relatório é ignorada.

## Como as linhas viram produtos

- **Produto = fornecedor + referência + cor.** A cor é o código de cor quando ele é um código de verdade (Hering: "N1007S"); senão, a Cor Visual (a Garra escreve "PRETA" e "PRETO" no código de cor da mesma calça).
- **Referência com o tamanho no fim** (Actum "020345996051G", Carlota "…-0000PP", Randall "ACT3773.107.39"): o tamanho sai antes de agrupar.
- **Referência própria por tamanho** (Macropampa, Angela, Cotton Star: mais de 60% das referências do fornecedor numa linha só): as linhas soltas com a mesma descrição (sem o tamanho), a mesma cor e o mesmo preço se juntam.
- Peça já no site: encontrada pelo **Código**. Linha nova de um produto que já existe vira um **tamanho novo** dele.
- Dois códigos para o mesmo tamanho do mesmo produto (cadastro duplicado na loja): o estoque é somado no primeiro código e a prévia avisa.

## O que a importação muda

| No site | Regra |
|---|---|
| Estoque de cada tamanho | Estoq. − Cond. − Res. EC; cada diferença vira um movimento `ajuste` ("Importação da planilha …"), tamanho novo vira `entrada`. O `reservado` dos pedidos pendentes do site não muda (a prévia avisa quando a planilha tem menos que o reservado) |
| Tamanho que não está na planilha | estoque 0 |
| Preço cheio | Preço Venda (o mais comum entre os tamanhos) |
| Preço de venda | igual ao cheio; uma promoção do site (preço menor que o cheio) continua enquanto for menor que o cheio novo |
| Produto sem nenhuma linha na planilha | desativado; volta a ficar ativo quando reaparecer com estoque |
| Produto novo | criado com nome, categoria, gênero e estação deduzidos da descrição, a marca do fornecedor, sem foto e sem custo |
| Nome, categoria, gênero, estação, fotos, descrição, custo, imperdível | **nunca** mudam nos produtos que já existem: o que o gestor editou no painel fica |

Linhas ignoradas: fornecedores marcados como ignorados (padrão: aviamentos e tecidos, como Makro e Lunelli), linhas sem preço (sacolas de embalagem) e códigos repetidos.

### Produtos novos

- **Nome:** a descrição sem o tamanho e sem códigos do fornecedor, com as abreviações por extenso (MM → Manga Curta, ML → Manga Longa, MASC → Masculina/o…), em maiúsculas e minúsculas, e a cor no fim ("Camiseta Manga Curta Masculina - Preto"), que é como o site junta as cores de um modelo.
- **Categoria:** pela primeira palavra (CAMISETA → Camisetas, POLO → Camisas Polo, SANDALIA/TENIS → Calçados, modelos de jeans → Calças…); o que não se encaixa vai para **Outros**. Categorias que não existem são criadas.
- **Gênero:** MASC/FEM na descrição, a categoria (vestido, calcinha: feminino; cueca: masculino) ou calça de cintura alta/skinny/mom/flare/wide (feminino); sem pista, unissex.
- **Marca:** a regra do fornecedor. Peças íntimas da Hering vão para a Hering Intimates. Marcas que não existem são criadas.
- **Referência:** a da planilha sem o tamanho (com a cor quando a mesma referência tem várias cores), até 20 letras e única.

Os produtos novos entram **sem foto**. Na vitrine, os sem foto vão para o fim em todas as ordens, e a página inicial só mostra peças com foto. Em Produtos → **Sem foto**, o gestor põe as fotos e confere nome, categoria e gênero.

## Fornecedores e marcas

Na prévia, a tabela **Fornecedores e marcas** mostra cada fornecedor da planilha com a marca que ele terá no site e a opção de ignorá-lo. Fornecedor novo vem com uma sugestão: marcas conhecidas (Cia. Hering → Hering, Veste → John John, D Cerutti → D'Cerutti, Pasquini e Randall → Acostamento) ou o nome fantasia (sem LTDA, EIRELI…). Ao importar, as regras ficam salvas (configuração `fornecedores`) e valem para as próximas planilhas e para a linha de comando. Mudar a marca de um fornecedor muda também os produtos dele que já estão no site, menos as linhas da marca (Hering Sports, Hering Intimates).

## Segurança

- **Prévia primeiro:** enviar a planilha só lê; nada muda até **Importar agora**. Na confirmação, a prévia é refeita com o banco daquele momento.
- **Tudo ou nada:** a gravação é uma transação; se falhar, nada muda.
- Uma importação por vez. Cada importação fica no histórico (`importacao_estoque`, com o resumo) e o arquivo em `armazenamento/importacoes/` (não é servido pela web).
- Importar a mesma planilha duas vezes não muda nada na segunda.

## Código

| Arquivo | O quê |
|---|---|
| `src/lib/planilha-estoque.ts` | Lê as linhas, agrupa em produtos e deduz nome, categoria, gênero, estação, referência e marca (sem banco; testes em `tests/unit/planilha-estoque.test.ts`) |
| `src/server/planilha-xlsx.ts` | Abre o `.xlsx` com o `exceljs` |
| `src/server/importacao-estoque.ts` | `planejar` (compara com o banco), `resumir` (prévia e histórico) e `aplicar` (transação) |
| `src/app/api/importacao-estoque/route.ts` | Recebe o arquivo (até 20 MB) e devolve a prévia |
| `src/server/acoes/importacao.ts` | Refazer a prévia com outras regras e confirmar |
| `src/components/painel/importador-estoque.tsx` | A tela |
| `scripts/importar-estoque.ts` | Linha de comando |

## Primeira importação (05/11/2026)

Planilha de 2.784 SKUs (3.365 peças, R$ 659 mil a preço de venda, 25 fornecedores): 811 produtos novos, 1.560 tamanhos novos, 254 estoques corrigidos, 25 preços, 57 produtos desativados e 20 marcas criadas, mais as categorias Bolsas, Calçados e Outros. O site passou de 1.714 para 3.279 peças à venda. Ficaram de fora o forro da Makro, as ribanas da Lunelli e as sacolas sem preço (66 peças).
