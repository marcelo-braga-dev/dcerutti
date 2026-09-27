# 14 · Testes

## Visão geral

| Tipo | Ferramenta | Onde | Comando | Precisa de banco? |
|---|---|---|---|:-:|
| Unidade | Vitest | `tests/unit/` | `npm test` | não |
| Ponta a ponta | Playwright (Chromium) | `tests/e2e/` | `npm run test:e2e` | sim |
| Estático | ESLint + TypeScript | — | `npm run lint && npm run typecheck` | não |
| CI | GitHub Actions | `deploy/github-ci.yml` (inativo) | automático em push e PR depois de ativado | não (lint, tipos, unidade e build) |

## Testes de unidade

Cobrem a lógica pura de `src/lib/`, que é onde estavam os bugs mais sutis do protótipo.

| Arquivo | O que garante |
|---|---|
| `catalogo.test.ts` | Leitura e montagem dos filtros pela URL (ida e volta), busca sem acento com vários termos, filtro de tamanho só com estoque disponível, "promoção" sem o Imperdível, contagens, esgotados no fim, ordenação por preço, paginação de 24 |
| `utilitarios.test.ts` | Leitura de valores digitados ("1.259,70"), formato BRL, desconto; **venda às 22h do último dia do mês fica no mês certo** (RN-12); intervalos de mês em UTC; máscaras de telefone e CEP; número do `wa.me`; conteúdo das mensagens de pedido e condicional |

## Testes ponta a ponta

Rodam no navegador contra o sistema de verdade, com o banco preenchido.

| Teste | Regra coberta |
|---|---|
| Pedido de compra: cliente envia, vendedora confirma, estoque baixa | RN-07, D-07, RF-06, RF-10 |
| Condicional: CEP fora da área, reserva ao enviar, "Voltou tudo" devolve o estoque | RN-04, RN-08 |
| Cancelar condicional libera a reserva | RN-09 |
| Permissões: visitante, cliente e vendedora barrados onde não podem; nenhum "custo" no HTML do vendedor | RN-16, RN-17, [Permissões](06-permissoes.md) |
| Cadastro pelo link de convite: validação, máscara, vínculo com a vendedora | RF-09 |
| Celular (Pixel 7): sem rolagem horizontal; filtros abrem | RNF-01 |

### Como rodar

```bash
npx playwright install chromium          # só na primeira vez
npm run db:importar-prototipo && npm run db:seed   # banco com catálogo e usuários
npm run build
npm run test:e2e                         # sobe `npm start` sozinho se a porta 3000 estiver livre
E2E_URL=http://localhost:3000 npm run test:e2e     # ou usa um servidor já rodando
```

Em caso de falha, o Playwright guarda o *trace* em `test-results/` (`npx playwright show-trace <arquivo>`).

### Cuidados
- Os testes **gravam no banco**: criam pedidos, vendas e clientes "Cliente de Teste". Use um banco de desenvolvimento, nunca o de produção.
- Cada execução consome uma peça do estoque de uma camiseta (o pedido confirmado). Para voltar ao estado original: `npm run db:importar-prototipo -- --forcar`.
- Os testes rodam em série (um worker), porque dependem do estoque.

## O que ainda não tem teste automatizado

- Upload de fotos para o R2 (depende de credenciais).
- Tela de produtos do gestor (edição e movimentação de estoque), testada só manualmente.
- Concorrência real, com duas pessoas reservando a última peça ao mesmo tempo. A proteção existe (`UPDATE ... WHERE estoque - reservado >= q`), mas não há teste simulando isso.
- Imagem do pedido: conferida visualmente; não há comparação automática de imagem.
