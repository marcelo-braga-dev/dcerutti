# 01 · Visão geral

## O negócio

A **D'Cerutti** é uma loja de roupas em Maravilha (SC), CNPJ 42.388.147/0001-40, Instagram [@dcerutti_](https://instagram.com/dcerutti_). Revende peças das marcas **Hering**, **Hering Sports** e **Hering Intimates**.

A venda acontece principalmente pelo **WhatsApp**, com atendimento personalizado: cada cliente tem um vendedor de referência. Uma modalidade importante é o **condicional** — o cliente recebe as peças em casa, prova e paga só o que ficar.

## Objetivo do sistema

1. Dar aos clientes um **catálogo online** com o estoque real da loja, de onde possam montar uma sacola e enviá-la ao vendedor pelo WhatsApp.
2. Dar à equipe um **painel** para acompanhar pedidos, clientes, metas de venda, estoque e lucro.

**Fora do escopo:** pagamento online, cálculo de frete por transportadora, emissão de nota fiscal. Pagamento e entrega são combinados pelo WhatsApp.

## Situação (27/09/2026)

- Loja e painel implementados e testados localmente (fases 0 a 3 do [Roadmap](09-roadmap.md)).
- Catálogo **privado**: só clientes com conta veem ([D-09](10-decisoes.md)).
- Falta publicar na VPS da loja ([Ambiente e deploy](07-ambiente-e-deploy.md)) e decidir as pendências de negócio (frete, parcelamento, origem do estoque, domínio).
- Para usar o sistema no dia a dia, ver o [Guia de uso](12-guia-de-uso.md).

## Usuários

| Papel | Quem é | O que faz |
|---|---|---|
| **Cliente** | Consumidor final | Navega no catálogo, monta sacola, envia pedido ou condicional ao seu vendedor |
| **Vendedor** | Equipe de vendas | Atende seus clientes, monta seleções de peças para enviar, confirma pedidos, acompanha sua meta |
| **Gestor** | Dono(a) da loja | Tudo do vendedor, mais: cadastra vendedores e metas, vê todos os clientes e pedidos, gerencia produtos, estoque e custos, vê resultados e lucro |

## Números de partida (protótipo)

- 583 produtos: 472 Hering, 69 Hering Intimates, 42 Hering Sports
- 289 femininos, 276 masculinos, 18 unissex
- 1.162 variantes (produto × tamanho), 1.482 peças em estoque
- 33 categorias — as maiores: Camisetas (129), Camisas (72), Calças (71), Blusas (58), Bermudas (37)
- 79 produtos em promoção, 51 marcados como "Imperdível"
- Custo cadastrado para 100% dos produtos

## Glossário

| Termo | Significado |
|---|---|
| **Condicional** | Envio de peças para o cliente provar em casa; ele paga só as que ficar e devolve as demais. Hoje restrito a Maravilha (CEP 89874-000). |
| **Pedido** | Compra direta: o cliente escolhe as peças e combina pagamento e entrega pelo WhatsApp. |
| **Seleção** | Pedido montado **pelo vendedor** para um cliente e enviado a ele como imagem + mensagem. |
| **Referência (Ref.)** | Código do modelo na Hering, ex.: `SC431GSI`. Identifica o produto (modelo + cor). |
| **Código interno (Cód.)** | Código da variante no sistema da loja, ex.: `23297`. Identifica produto + tamanho. |
| **Variante** | Combinação produto + tamanho, com estoque próprio. |
| **Imperdível** | Destaque promocional forte (preço em vermelho no catálogo). |
| **Meta** | Valor mensal de vendas definido pelo gestor para cada vendedor. |
| **Link de convite** | Link pessoal do vendedor (`?v=<id>`); quem se cadastra por ele fica vinculado a esse vendedor. |
