# 04 · Banco de dados

MariaDB 10.11, charset `utf8mb4`, collation `utf8mb4_unicode_ci` (busca sem diferenciar acento e maiúscula). Acesso via Prisma.

## Diagrama

```
user ─┬─ session / account            (Better Auth)
      ├─ 1:1 cliente  ── N:1 ── user (vendedor responsável)
      └─ (papel vendedor) ── metas

marca ─┐
categoria ─┼─ produto ─┬─ produto_imagem
           │           ├─ custo (1:1, só gestor)
           │           └─ variante ─── movimento_estoque
           │
pedido ── pedido_item ── variante
   │
   └─ venda (0..1 por pedido; vendas manuais sem pedido)

configuracao (chave/valor)
contador (sequência de códigos de pedido)
```

## Tabelas

### Usuários e clientes

| Tabela | Campos principais | Observações |
|---|---|---|
| `user` | id, name, email (único), emailVerified, image, **papel**, **telefone**, **ativo**, createdAt, updatedAt | Tabela do Better Auth com campos extras. Senha fica em `account.password` (hash). |
| `session`, `account`, `verification` | — | Geradas pelo Better Auth; não editar à mão. |
| `cliente` | id, **userId** (único, opcional), **vendedorId**, nome, telefone, endereco, cidade, cep, preferencias, criadoEm | Cliente pode existir **sem login** (cadastrado pelo vendedor). Se criar conta depois, liga-se pelo e-mail/telefone. |
| `meta` | id, vendedorId, mes (`AAAA-MM`), valor | Uma meta por vendedor por mês — preserva o histórico. Único (vendedorId, mes). |

### Catálogo

| Tabela | Campos principais | Observações |
|---|---|---|
| `marca` | id, nome, slug | Hering, Hering Sports, Hering Intimates |
| `categoria` | id, nome, slug | Camisetas, Calças… |
| `produto` | id, **referencia** (única), nome, marcaId, categoriaId, subcategoria, genero, cor, composicao, descricao, destaques (JSON), **preco**, **precoCheio**, **imperdivel**, **ativo**, linkOrigem, criadoEm, atualizadoEm | `preco < precoCheio` = promoção. Índices em (ativo, genero, categoriaId). Índice FULLTEXT em (nome, referencia) para a busca. |
| `produto_imagem` | id, produtoId, url, ordem | |
| `variante` | id, produtoId, tamanho, **estoque**, **reservado**, **codigoInterno** (único), ean | Disponível = `estoque − reservado`. Único (produtoId, tamanho). |
| `custo` | produtoId (PK), valor, atualizadoEm | Tabela separada de propósito: nenhuma consulta de catálogo faz `include` dela por engano. |
| `movimento_estoque` | id, varianteId, delta, motivo, pedidoId, usuarioId, criadoEm | Motivos: `entrada`, `ajuste`, `venda`, `reserva`, `devolucao`, `cancelamento`. Auditoria de todo estoque. |

### Pedidos e vendas

| Tabela | Campos principais | Observações |
|---|---|---|
| `pedido` | id, **codigo** (único), tipo, status, origem, clienteId, vendedorId, nomeCliente, telefoneCliente, cep, total, criadoEm, confirmadoEm, canceladoEm | `tipo`: `compra` / `condicional`. `status`: `pendente` / `confirmado` / `cancelado`. `origem`: `loja` (cliente) / `vendedor` (seleção). Nome e telefone são cópia do momento do pedido. |
| `pedido_item` | id, pedidoId, varianteId, produtoId, nome, marca, cor, tamanho, codigoInterno, quantidade, precoUnitario, **custoUnitario**, **situacao** | Campos de texto são cópia do momento do pedido. `custoUnitario` preenchido na confirmação (RN-10). `situacao` (condicional): `pendente` / `vendido` / `devolvido`. |
| `venda` | id, pedidoId (único, opcional), vendedorId, clienteId, valor, custo, data, observacao, criadoEm | Gerada ao confirmar pedido, ou manual (`pedidoId` nulo, `custo` nulo). Substitui o filtro por texto que o protótipo usava para não contar vendas em dobro. |

### Sistema

| Tabela | Campos | Uso |
|---|---|---|
| `configuracao` | chave (PK), valor (JSON) | WhatsApp da loja, CEPs do condicional, `catalogo_publico` (padrão `false`), regra de frete, parcelas exibidas |
| `contador` | nome (PK), valor | Sequência dos códigos `PED` e `COND`, incrementada dentro da transação |

## Schema

A fonte da verdade é [prisma/schema.prisma](../prisma/schema.prisma). Diferenças em relação ao planejamento inicial:

- `produto.estacao` (`inverno` / `verao`): antes era deduzida do nome; agora é campo editável, preenchido na importação.
- `variante.ordem`: posição do tamanho para exibição (PP, P, M… 36, 38…).
- `cliente.email`: contato do cliente mesmo sem acesso à loja.
- `pedido_item` guarda também `referencia`, `categoria` e `imagem` do momento do pedido (relatórios não dependem do produto atual).
- `movimento_estoque.motivo` só registra mudanças **físicas**: `entrada`, `ajuste`, `venda`. Reservas do condicional ficam em `variante.reservado` e no próprio pedido. Campo `observacao` adicionado.
- `configuracao.vendedorPadraoId` usa `''` para "nenhum".
- Tabelas do Better Auth (`user`, `session`, `account`, `verification`) com ids `cuid()`.

## Consultas importantes

**Próximo código de pedido**: `upsert` com `increment` na linha do contador, dentro da transação que cria o pedido. A linha fica travada até o commit, o que garante códigos únicos e sequenciais (`PED-000124`).

**Reserva de estoque** (condicional), sem risco de duas pessoas levarem a última peça:

```sql
UPDATE variante SET reservado = reservado + :q WHERE id = :id AND estoque - reservado >= :q;  -- 0 linhas = indisponível
```

**Vendido no mês por vendedor** (limites do mês calculados em America/Sao_Paulo e convertidos para UTC na aplicação):

```sql
SELECT vendedorId, SUM(valor) AS vendido
FROM venda
WHERE data >= :inicioMesUtc AND data < :inicioProximoMesUtc
GROUP BY vendedorId;
```

**Lucro por categoria no período** (só vendas com custo):

```sql
SELECT c.nome, SUM(i.precoUnitario * i.quantidade) AS receita,
       SUM(i.custoUnitario * i.quantidade) AS custo
FROM pedido_item i
JOIN pedido p   ON p.id = i.pedidoId AND p.status = 'confirmado'
JOIN produto pr ON pr.id = i.produtoId
JOIN categoria c ON c.id = pr.categoriaId
WHERE p.confirmadoEm >= :inicio AND p.confirmadoEm < :fim
  AND i.situacao <> 'devolvido' AND i.custoUnitario IS NOT NULL
GROUP BY c.nome;
```
