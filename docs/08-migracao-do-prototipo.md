# 08 · Migração do protótipo

## O que é o protótipo

[prototipo/index.html](../prototipo/index.html) (painel + login) e [prototipo/loja.html](../prototipo/loja.html) (loja) foram exportados de uma ferramenta de design. Cada arquivo é um **pacote autoextraível**: o HTML visível só tem um carregador, e o conteúdo real fica em blocos `<script>`:

| Bloco | Conteúdo |
|---|---|
| `__bundler/manifest` | Todos os arquivos (JS, JSON, fontes, imagens) em base64, alguns com gzip, indexados por UUID |
| `__bundler/ext_resources` | Nomes amigáveis de alguns UUIDs (`catalogo`, `custos`, `logoPng`) |
| `__bundler/template` | O HTML da página, em JSON, com UUIDs no lugar das URLs |

Os arquivos **não devem ser editados** — servem só de referência visual e fonte de dados.

## O que aproveitar

| Item | Onde está | Destino |
|---|---|---|
| Catálogo (583 produtos, JSON, 455 KB) | `catalogo` nos dois arquivos (idênticos) | Tabelas `produto`, `variante`, `produto_imagem`, `marca`, `categoria` |
| Custos (583 valores) | `custos`, só no `index.html` | Tabela `custo` |
| Logo PNG | `logoPng` | `public/logo-dcerutti.png` |
| Fotos de ambiente (3 JPG) | manifest do `index.html` | Tela de login |
| Fontes (7 woff2) | manifest | Substituir por `next/font/google` (Archivo, Hanken Grotesk) |
| Layout, textos, cores | template + CSS | Referência para os componentes ([Identidade visual](11-identidade-visual.md)) |
| Lógica da imagem do pedido (canvas 1080 px) | JS do template | `src/lib/imagem-pedido.ts` |
| Texto das mensagens de WhatsApp | JS do template | `src/lib/whatsapp.ts` |
| Regra de estação (inverno/verão por palavra-chave no nome) | JS da loja | Virar campo `estacao` no produto, editável |

## Extração

Feita por [scripts/importar-prototipo.ts](../scripts/importar-prototipo.ts) (`npm run db:importar-prototipo`), que lê o pacote com [scripts/prototipo.ts](../scripts/prototipo.ts): decodifica o base64, descompacta o gzip e localiza os recursos pelos nomes de `ext_resources`. O script:

- grava o logo em `public/logo-dcerutti.png` e as três fotos de ambiente em `public/ambiente/`;
- cria marcas e categorias (com a grafia normalizada) e importa produtos, fotos, variantes e custos;
- preenche `produto.estacao` com a mesma regra por palavras-chave do protótipo;
- não mexe em um banco que já tem produtos, a menos que receba `-- --forcar`.

## Mapeamento do catálogo

Formato de cada produto no JSON do protótipo:

| Campo JSON | Exemplo | Destino |
|---|---|---|
| `id` / `r` | `SC431GSI` | `produto.referencia` (os dois são sempre iguais) |
| `n` | Bermuda Básica Esportiva Masculina - Cinza | `produto.nome` |
| `c` | Bermudas | `categoria.nome` |
| `sc` | Reta | `produto.subcategoria` |
| `g` | Feminino / Masculino / Unissex | `produto.genero` |
| `brand` | Hering Sports | `marca.nome` |
| `p` | 139.99 | `produto.preco` |
| `pFull` | 139.99 | `produto.precoCheio` |
| `hot` | true | `produto.imperdivel` (ausente = false) |
| `co` | CINZA | `produto.cor` |
| `cp` | CORPO 100% POLIESTER… | `produto.composicao` |
| `d` | texto | `produto.descricao` |
| `f` + `b` | ["secagem rápida", …] | `produto.destaques` (JSON) |
| `im` | [url, url, …] (até 10) | `produto_imagem` (baixadas para o servidor por `npm run fotos:migrar`) |
| `s` | `[["P", 1, "23297", "7900290042366"]]` | `variante`: tamanho, estoque, codigoInterno, ean |
| `link`, `fonte` | URL hering.com.br, `hering_oficial` | `produto.linkOrigem` |
| `ean`, `ci` | vazios / redundantes | ignorar (dados reais estão em `s`) |

Custos: `{ "<referencia>": valor }` → `custo(produtoId, valor)`.

Observações sobre os dados:
- 33 produtos não têm foto — importar com `ativo = true`, mas o painel deve listá-los como pendência.
- Categorias com grafia inconsistente (`Sueter`, `Lenco`, `Blazer` no singular) — normalizar na importação.
- Nenhum produto está esgotado no arquivo; o estoque é um retrato da data da exportação e deve ser conferido antes de abrir a loja (L-03).

## Fotos da Hering

As fotos do protótipo são endereços nos servidores da Hering e da Dafiti, que apagam arquivos com o tempo: 65 já davam erro em 02/10, 235 no mesmo dia por outra contagem, e 363 em 08/10. Por isso:

1. `npm run fotos:guardar-originais` baixou em 08/10 as **2.049** que ainda existiam para `/www/wwwroot/dcerutti/fotos-originais` (280 MB, fora do Git).
2. O dump de 30/09 com os endereços originais fica em `/var/backups/dcerutti/preservado/`, que a rotina de backup nunca apaga.
3. Na produção, `deploy/preparar-producao.sh` importa o catálogo e roda `fotos:migrar`, que lê do cache, grava em `armazenamento/` e troca os endereços no banco. As que não existem mais saem do produto (`--remover-quebradas`).
4. Resultado do ensaio: **113 produtos** ficam sem foto. A loja fotografa e envia pelo painel (Produtos → filtro Sem foto).

## Problemas do protótipo que **não** devem ser repetidos

| Protótipo | Consequência | No projeto novo |
|---|---|---|
| Dados em `localStorage` | Cada aparelho tem um "banco" próprio; o gestor nunca vê pedidos feitos no celular do cliente | Banco no servidor (MariaDB) |
| `custos.json` embutido na página de login | Qualquer visitante extrai custo e margem de todos os produtos | Custo só consultado no servidor, só para gestor ([Permissões](06-permissoes.md)) |
| Senhas `1234` fixas no código, gravadas em texto puro; login checado no navegador | Qualquer pessoa vira gestor editando o `localStorage` | Better Auth com hash e sessão no servidor |
| Datas com `toISOString()` (UTC) | Venda após 21h cai no dia seguinte; no fim do mês, no mês seguinte | Fuso America/Sao_Paulo (RN-12) |
| Código de pedido com 4 dígitos aleatórios; duplicado era descartado em silêncio | Pedido perdido sem aviso | Sequencial no banco (RN-05) |
| Estoque nunca baixava | Loja mostra peça já vendida | Baixa e reserva em transação (RN-07, RN-08) |
| Condicional confirmado lançava o valor total | Venda e meta infladas | Confirmação item a item (RN-08) |
| Excluir vendedor deixava clientes órfãos, que não conseguiam mais enviar pedido | Cliente travado | Desativar + transferir clientes (RN-01) |
| Frete R$ 24,90 na sacola, "a combinar" na mensagem | Informação contraditória | Uma regra só, configurável (RN-15) |
| Vendas de pedidos identificadas por texto (regex sobre a observação "Pedido PED-…" / "Condicional COND-…") | Frágil; editar a observação muda o relatório | Campo `venda.pedidoId` |
| Fotos direto do servidor da Hering | Quebram se a Hering mudar ou bloquear | Fotos no próprio servidor (D-13) |
| Meta como campo único do vendedor | Mudar a meta reescreve o passado | Tabela `meta` por mês |
