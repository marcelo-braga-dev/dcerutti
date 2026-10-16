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
   │  └─ movimento_estoque (baixas do pedido)
   └─ venda (0..1 por pedido; vendas manuais sem pedido)

configuracao (chave/valor)
contador (sequência de códigos de pedido)
```

## Tabelas

### Usuários e clientes

| Tabela | Campos principais | Observações |
|---|---|---|
| `user` | id, name, email (único), emailVerified, image, **papel**, **telefone**, **ativo**, **aceitouPrivacidadeEm**, createdAt, updatedAt | Tabela do Better Auth com campos extras. Senha fica em `account.password` (hash). `aceitouPrivacidadeEm` nulo = ainda não aceitou a política (LGPD). |
| `session`, `account`, `verification` | — | Geradas pelo Better Auth; não editar à mão. `verification` guarda os links de redefinição de senha. |
| `cliente` | id, **userId** (único, opcional), **vendedorId**, nome, telefone, **cpf** (opcional), email, endereco, cidade, cep, preferencias, criadoEm | Cliente pode existir **sem login** (cadastrado pelo vendedor); a equipe dá o acesso pela ficha. Um cadastro pela loja **nunca** se liga a uma ficha existente pelo telefone (RN-19). `vendedorId` aponta sempre para um vendedor ativo (D-14). Conta excluída pela cliente: ficha anonimizada e `userId` nulo. `ultimoLoginEm` e `ultimoAcessoEm`: histórico do cliente (D-18). `cpf` (D-24): `000.000.000-00`, validado pelos dígitos verificadores, sem repetir entre fichas (conferido nas ações; o banco só tem índice), apagado na anonimização. |
| `meta` | id, vendedorId, mes (`AAAA-MM`), valor | Uma meta por vendedor por mês — preserva o histórico. Único (vendedorId, mes). |

### Catálogo

| Tabela | Campos principais | Observações |
|---|---|---|
| `marca` | id, nome, slug | Hering, Hering Sports, Hering Intimates |
| `categoria` | id, nome, slug | Camisetas, Calças… |
| `produto` | id, **referencia** (única), nome, marcaId, categoriaId, subcategoria, genero, cor, composicao, descricao, destaques (JSON), **preco**, **precoCheio**, **imperdivel**, **ativo**, linkOrigem, criadoEm, atualizadoEm | `preco < precoCheio` = promoção. Índice em (ativo, genero, categoriaId). A busca é feita em memória, sobre o cache do catálogo, sem acento. |
| `produto_imagem` | id, produtoId, url, ordem | `url` = `/arquivos/produtos/<REF>/<id>.webp` (fotos no servidor) |
| `variante` | id, produtoId, tamanho, ordem, **estoque**, **reservado**, **codigoInterno** (único), ean | Disponível = `estoque − reservado`. Único (produtoId, tamanho). |
| `custo` | produtoId (PK), valor, atualizadoEm | Tabela separada de propósito: nenhuma consulta de catálogo faz `include` dela por engano. |
| `movimento_estoque` | id, varianteId, delta, motivo, observacao, pedidoId, usuarioId, criadoEm | Motivos: `entrada`, `ajuste`, `venda` (só mudanças físicas; reservas ficam em `variante.reservado`). A soma dos deltas de uma variante é igual ao estoque dela. |

### Pedidos e vendas

| Tabela | Campos principais | Observações |
|---|---|---|
| `pedido` | id, **codigo** (único), tipo, status, origem, clienteId, vendedorId, nomeCliente, telefoneCliente, cep, total, **frete**, criadoEm, confirmadoEm, canceladoEm, **motivoCancelamento** | `tipo`: `compra` / `condicional`. `status`: `pendente` / `confirmado` / `cancelado`. `origem`: `loja` (cliente) / `vendedor` (seleção) / `balcao` (venda na loja física, já confirmada). `frete`: gravado no envio da compra; nulo = a combinar. `motivoCancelamento`: `equipe` / `cliente` / `expirado`. Nome e telefone são cópia do momento do pedido. |
| `pedido_item` | id, pedidoId, varianteId, produtoId, referencia, nome, marca, cor, categoria, imagem, tamanho, codigoInterno, quantidade, precoUnitario, **custoUnitario**, **situacao** | Campos de texto são cópia do momento do pedido. `custoUnitario` preenchido na confirmação (RN-10). `situacao` (condicional): `pendente` / `vendido` / `devolvido`; no fechamento parcial, a linha se divide em vendida e devolvida. |
| `venda` | id, pedidoId (único, opcional), vendedorId, clienteId, valor, custo, data, observacao, criadoEm | Gerada ao confirmar pedido, ou manual (`pedidoId` nulo, `custo` nulo). Substitui o filtro por texto que o protótipo usava para não contar vendas em dobro. |

### Sistema

| Tabela | Campos | Uso |
|---|---|---|
| `configuracao` | chave (PK), valor (JSON) | Chaves: `whatsappLoja`, `cepsCondicional`, `cidadeCondicional`, `frete` (`{valor, gratisAcima}` ou `null` = a combinar, o padrão), `parcelas` (0 = escondido, o padrão), `diasExpiracao` (padrão 7; 0 = nunca), `catalogoPublico` (padrão `false`), `vendedorPadraoId`, `cupons`, `proximaCompra`, `historico` (`{ligado, avisarSacola, horasSacola}`, padrão ligado, 24 h), `caixa`, `identidade` (`{cores, logo, logoClara, favicon}`: só as cores mudadas; logos e favicon com `url`, `largura` e `altura` em `/arquivos/marca/`; D-25). Chave ausente ou valor inválido = padrão de `src/server/config.ts` |
| `contador` | nome (PK), valor | Sequência dos códigos `PED` e `COND`, incrementada dentro da transação |

### Histórico do cliente ([21](21-historico-do-cliente.md))

| Tabela | Campos principais | Observações |
|---|---|---|
| `atividade` | id (BIGINT), clienteId, **tipo**, caminho, produtoId, varianteId, termo, dados (JSON), duracaoSeg, aparelho, ref, criadoEm | Navegação da cliente. `produtoId` sem chave estrangeira (produto excluído não apaga o histórico). Sai em cascata com a ficha e na exclusão da conta; mais de 12 meses é apagado. Sem IP. |
| `sessao_equipe` | id, usuarioId, inicioEm, fimEm, segundos, aparelho | Uso do painel e do caixa (D-26): uma sessão vai do primeiro ao último sinal, com até 5 min entre eles; `segundos` só conta a tela visível. Sai com o usuário; 13 meses de retenção. |
| `atividade_equipe` | id, usuarioId, **tipo** (`AcaoEquipe`), clienteId?, pedidoId?, valor?, descricao, aparelho, criadoEm | Histórico de ações da equipe (D-26): login, clientes, pedidos, envios e vendas. Cliente e pedido sem chave estrangeira. Sai com o usuário; 13 meses de retenção. |
| `pagamento` | id, pedidoId, **forma** (pix, debito, credito, dinheiro), valor, parcelas, recebido, criadoEm | Pagamentos da venda no caixa (D-23); uma venda pode ter vários. `recebido` só no dinheiro (troco = recebido − valor). Sai em cascata com o pedido. |
| `favorito` | clienteId + produtoId (PK), criadoEm | Coração da loja (D-22). Sai com a ficha, com o produto e na exclusão da conta. |
| `sacola_cliente` | clienteId (PK), itens (JSON `[{varianteId, quantidade}]`), atualizadoEm, avisadoEm | Cópia da sacola do navegador; vazia ou virou pedido, a linha sai. `avisadoEm`: aviso de sacola parada enviado. |

## Schema

A fonte da verdade é [prisma/schema.prisma](../prisma/schema.prisma). Diferenças em relação ao planejamento inicial:

- `produto.estacao` (`inverno` / `verao`): antes era deduzida do nome; agora é campo editável, preenchido na importação.
- `variante.ordem`: posição do tamanho para exibição (PP, P, M… 36, 38…).
- `cliente.email`: contato do cliente mesmo sem acesso à loja.
- `pedido_item` guarda também `referencia`, `categoria` e `imagem` do momento do pedido (relatórios não dependem do produto atual).
- `movimento_estoque.motivo` só registra mudanças **físicas**: `entrada`, `ajuste`, `venda`. Reservas do condicional ficam em `variante.reservado` e no próprio pedido. Campo `observacao` adicionado.
- `configuracao.vendedorPadraoId` usa `''` para "nenhum".
- `user.aceitouPrivacidadeEm` (migration `20261007120000_aceite_privacidade`): aceite da política (LGPD).
- `pedido.frete` (`20261007150000_frete_no_pedido`): o total de todas as telas sai do pedido, não da configuração do momento.
- `pedido.frete` nulo, `pedido.motivoCancelamento` e a origem `balcao` (`20261007180000_frete_a_combinar_cancelamento_balcao`): decisões D-14.
- Chaves estrangeiras em `pedido.vendedorId`, `venda.vendedorId` e `movimento_estoque` (`20261002120000_chaves_estrangeiras`, D-12).
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

**Lucro por categoria no período** (só itens vendidos com custo; a confirmação marca como `vendido` todo item que ficou com a cliente). A categoria é a gravada no item, no momento do pedido, então mudar a categoria de um produto não reescreve o passado. Em `src/server/relatorios.ts` o agrupamento é feito em memória; o SQL equivalente:

```sql
SELECT i.categoria, SUM(i.precoUnitario * i.quantidade) AS receita,
       SUM(i.custoUnitario * i.quantidade) AS custo
FROM pedido_item i
JOIN pedido p ON p.id = i.pedidoId AND p.status = 'confirmado'
WHERE p.confirmadoEm >= :inicio AND p.confirmadoEm < :fim
  AND i.situacao = 'vendido' AND i.custoUnitario IS NOT NULL
GROUP BY i.categoria;
```
