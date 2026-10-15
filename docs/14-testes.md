# 14 · Testes

Atualizado em 08/10/2026. Três camadas, todas sobre os mesmos dados de teste (o **seed completo**), e um CI que roda as três.

| Camada | Ferramenta | Onde | Testes | Banco | Comando |
|---|---|---|---:|---|---|
| Unidade | Vitest | `tests/unit/` | 65 | não | `npm test` |
| Integração | Vitest + MariaDB | `tests/integracao/` | 171 | `test_dcerutti_integracao`, recriado a cada execução | `npm run test:integracao` |
| Ponta a ponta | Playwright (Chromium + Pixel 7) | `tests/e2e/` | 63 | `test_dcerutti_e2e`, recriado por `npm run test:preparar` | `npm run test:e2e` |
| Estático | ESLint + TypeScript | — | — | não | `npm run lint && npm run typecheck` |

## Seed completo

`scripts/seed/` monta, do zero e sempre igual (gerador com semente), um banco com **todas as tabelas e todas as variações de estado**. Ele usa as próprias regras do sistema (`criarPedido`, `confirmarPedido`, `cancelarPedido`, `movimentar`), então estoque, reservas, vendas, custos e histórico ficam coerentes como em uso real.

| Tabela | Quantidade | Variações |
|---|---:|---|
| Usuários | 17 | 2 gestores; 6 vendedores ativos (meta normal, sem meta, só meta antiga, meta zero, WhatsApp incompleto); 1 vendedor inativo; 8 clientes com conta, um por situação |
| Clientes | 153 | com e sem conta, com e sem e-mail, CEP dentro e fora da área do condicional, 3 fichas anonimizadas (conta excluída) |
| Produtos | 219 | 13 categorias, 4 marcas, 3 gêneros, 3 estações; promoção, Imperdível, inativo, sem foto, sem custo, esgotado, tamanhos zerados |
| Tamanhos | 793 | letras, números, infantil e tamanho único, com código interno e EAN |
| Fotos | 398 | 24 imagens geradas no próprio seed (nada é baixado), em `ARMAZENAMENTO_DIR/produtos/SEED/` |
| Pedidos | 321 | compra e condicional × loja, vendedor e balcão × pendente, confirmado (inteiro e parcial) e cancelado (pela equipe, pela cliente, expirado), espalhados por 6 meses |
| Vendas | 369 | de pedidos e manuais, com e sem cliente, com e sem custo, incluindo do vendedor que saiu |
| Metas, movimentos, configurações | 39 · 1.218 · 8 | metas de 7 meses; entradas, ajustes e vendas no histórico; frete a combinar, expiração em 7 dias |

**Peças fixas** para os testes ponta a ponta (os pedidos sorteados nunca as usam): `FIX-ESTOQUE` (produto 1, estoque farto), `FIX-ULTIMA` (uma única peça), `FIX-ESGOTADO`, `FIX-INATIVO`, `FIX-PROMO` (50% e Imperdível), `FIX-SEMFOTO`, `FIX-SEMCOMPRA` (sem custo), `FIX-PRECO` (o teste muda o preço), `FIX-CONDICIONAL`, `FIX-RESERVA`, `FIX-EXCLUIR`.

**Pessoas** (senha de todos = `SEED_SENHA`):

| E-mail | Papel e situação |
|---|---|
| `gestor@dcerutti.local`, `supervisora@dcerutti.local` | gestores |
| `ana@`, `carlos@`, `beatriz@`, `diego@`, `elisa@` | vendedores (meta normal, normal, zero, nenhuma, antiga) |
| `gustavo@` | vendedor com WhatsApp incompleto: pedidos dos clientes dele vão para a loja (RN-03) |
| `fabio@` | vendedor inativo: não entra; vendas antigas continuam nos relatórios |
| `cliente@` (Mariana Souza) | cliente da Ana, CEP do condicional, com histórico |
| `cliente.carlos@`, `cliente.semaceite@`, `cliente.fora@`, `cliente.gustavo@` | do Carlos; sem aceite da política; CEP fora da área; atendida pelo vendedor sem WhatsApp |
| `cliente.excluir@`, `cliente.pendente@`, `cliente.dados@` | sem pedidos; com pedido em aberto (não pode excluir a conta); para editar dados |

O seed **apaga o banco** antes de semear e só roda em banco local cujo nome começa com `test_` (ou com `SEED_PERMITIDO=1`).

```bash
DATABASE_URL=mysql://usuario:senha@localhost:3306/test_dcerutti_e2e \
ARMAZENAMENTO_DIR=/caminho/das/fotos-de-teste SEED_SENHA=uma-senha-de-teste \
npm run test:preparar        # recria o banco, aplica as migrations e semeia (≈ 30 s)
```

## Testes de unidade (`tests/unit/`)

Lógica pura de `src/lib/`, nos casos de borda: virada de mês e de ano no fuso de São Paulo (RN-12), valores digitados em formato brasileiro, máscaras progressivas de telefone e CEP, número e link do WhatsApp (`api.whatsapp.com/send`), todas as mensagens do WhatsApp (compra, condicional, frete, fotos, vendedor, convite) o catálogo (`catalogo.test.ts`: contagens que respeitam os outros filtros, UN = UNI, letras e numeração, faixas de preço, grupos de categoria, ordem por desconto e novidades, categorias alternadas, um card por modelo), as cores (`lib/cores.ts`: nome, modelo, tom, cor clara) e a mensagem do pedido (`mensagem-pedido.test.ts`: saudação pelo horário, texto seguro, cupom, frete, condicional e os três formatos por tamanho), redirecionamento seguro contra `//`, `\`, `javascript:` e caracteres de controle, formulários (a senha nunca volta ao navegador), valores de pedido (condicional parcial, frete a combinar), prazos de expiração e o filtro do catálogo (facetas, busca sem acento, ordem, paginação, limites da URL).

## Testes de integração (`tests/integracao/`)

Rodam os módulos do servidor e **todas as Server Actions** direto contra um MariaDB real. As APIs do Next (sessão, `redirect`, `revalidatePath`, cookies, `after`) são simuladas em `suporte/next.ts`: `entrarComo(email)` define quem está logado.

| Arquivo | O que garante |
|---|---|
| `invariantes.test.ts` | **Roda primeiro**, sobre o seed recém-gerado: cobertura de todas as combinações; reserva = condicionais pendentes; estoque = soma do histórico; total = soma das linhas; venda = peças vendidas com o custo do momento; datas e motivo batem com o status; frete conforme a regra; códigos únicos e contador à frente |
| `estoque.test.ts` | Reserva, baixa, entrada e ajuste; nunca abaixo da reserva; **corrida pela última peça** (5 ao mesmo tempo, só 1 consegue); entradas simultâneas não se perdem |
| `pedidos.test.ts` | Criar (preço do banco, frete em todas as regras, peça inativa ou indisponível), confirmar inteiro e **parcial (B-13)**, cancelar, **editar (U-08)**, códigos sequenciais com pedidos simultâneos, confirmar e cancelar ao mesmo tempo |
| `expiracao-config-catalogo.test.ts` | Expiração no prazo das configurações (0 = nunca, 1 vez por hora); configuração inválida no banco cai no padrão; catálogo só com ativos, sem custo, disponível correto, cache |
| `consultas-relatorios.test.ts` | **Escopo**: vendedor só vê os próprios pedidos, clientes e vendas; consultas de gestor recusam vendedor; filtros e busca; metas vigentes; resultados e indicadores **conferidos contra SQL independente** |
| `arquivos-contas-limite.test.ts` | Fotos (WebP, 1600 px, recusa o que não é imagem, caminho nunca sai da pasta); exclusão de produto com arquivos; senhas com hash e troca encerrando sessões; erros previsíveis; limite de tentativas; avisos por e-mail ao vendedor ou aos gestores |
| `acoes-equipe.test.ts` | Clientes (permissões, validações, quem pode trocar e-mail e senha, troca de vendedor leva os pendentes), vendas manuais, vendedores (criar, desativar transferindo tudo, reativar), metas e configurações |
| `acoes-produtos.test.ts` | Cadastro e edição de produto (todas as validações, fotos, nova categoria), tamanhos, entrada e contagem de estoque, remover tamanho, excluir produto |
| `acoes-pedidos-conta.test.ts` | Envio da sacola (WhatsApp certo, frete, CEP do condicional, vendedor sem WhatsApp → loja), conferência da sacola, seleção do vendedor e **venda na loja**, escopo de confirmar, cancelar e editar, cancelamento pela cliente, Minha conta, aceite da política, **exclusão de conta (LGPD)**, cadastro (vendedor do convite, padrão, telefone já existente) e os limites de login e cadastro |
| `historico-cliente.test.ts` | Histórico do cliente ([21](21-historico-do-cliente.md)): `/api/atividade` grava acesso, peça, busca, tamanho, sacola e tempo; não conta repetição; equipe, visitante e histórico desligado não gravam; recusa outra origem, corpo inválido e caminhos fora da loja; login; **escopo** do vendedor na ficha, linha do tempo e relatório; interessados agora; sacola parada avisa uma vez; retenção de 12 meses; exclusão da conta apaga tudo |
| `link-pedido.test.ts` | Link público (D-20): primeiro link da mensagem; cartão JPEG 1200×630 com menos de 300 KB, do cache na segunda vez; chave adulterada ou pedido inexistente dá 404; sem dados pessoais |
| `favoritos-recompra.test.ts` | Favoritos (marcar, desmarcar, ordem, recusa para equipe, visitante e peça inexistente) e "Comprar de novo" (preço de hoje, o que acabou volta pelo nome, só a dona do pedido); resumo da conta (D-22) |
| `zz-invariantes-finais.test.ts` | **Roda por último**: depois de tudo que a suíte fez pelo sistema, as regras de consistência continuam valendo |

```bash
INTEGRACAO_DATABASE_URL=mysql://usuario:senha@localhost:3306/test_dcerutti_integracao SEED_SENHA=... npm run test:integracao
INTEGRACAO_SEM_PREPARO=1 ...   # reaproveita o banco (os invariantes do seed são pulados); a suíte passa repetida
```

**Os testes pegam bugs de verdade.** Em 08/10, sete erros foram introduzidos de propósito no código, um de cada vez (reserva sem checar o disponível, condicional parcial sem devolver a reserva, vendedor acessando pedido de outro, escopo vazado, gestor aceito como vendedor de cliente, frete grátis antes do mínimo, cancelamento sem devolver a reserva): **todos os sete foram detectados**, cada um pelos testes da regra correspondente.

## Testes ponta a ponta (`tests/e2e/`)

No navegador, contra o sistema rodando com o seed completo.

| Arquivo | O que cobre |
|---|---|
| `loja.spec.ts` | Login (senha errada, inativo, destino por papel, sair), **LGPD** (sem aceite não navega, aceita e volta), cadastro (validações, aceite, e-mail repetido), catálogo (categoria, ordem por preço, busca sem acento, promoção, esgotados, inativo e inexistente com 404, sem custo no HTML), sacola (última peça, CEP fora da área, **preço alterado pelo gestor**), Minha conta |
| `gestao.spec.ts` | Produto (validações, cadastro, tamanhos, aparece na loja com desconto, referência repetida, entrada e contagem no histórico, excluir, recusa excluir com pedidos, filtros, indicadores), vendedores (criar, entrar, meta, desativar encerra a sessão), **frete ligado nas configurações aparece na sacola**, configurações inválidas, resultados, venda manual (data futura recusada, registrar e excluir), escopo do vendedor pela URL, RN-03 |
| `fluxos.spec.ts` | Pedido confirmado baixa o estoque; condicional reserva e devolve; cancelar libera; permissões; convite; volta ao produto depois do login; sacola não passa do estoque |
| `melhorias.spec.ts` | Condicional parcial, dados e cancelamento pela cliente, condicional e venda na loja pelo vendedor, edição de pedido, fotos, frete a combinar, aviso de pedido por e-mail |
| `painel.spec.ts`, `senha.spec.ts` | Todas as telas do painel; escopo; LGPD; desativar vendedor (B-09); "Esqueci a senha" de ponta a ponta |
| `historico.spec.ts` | Histórico do cliente ([21](21-historico-do-cliente.md)): a cliente busca, escolhe tamanho e põe na sacola; a vendedora vê em "Clientes interessados agora", no filtro de sacola aberta, no card da ficha, na linha do tempo e em Interesse; outro vendedor não vê |
| `celular.spec.ts` (Pixel 7) | Sem rolagem horizontal na loja **e no painel**; sacola sem estouro; conta e Sair; galeria que desliza; pedido completo no celular |

```bash
npx playwright install chromium                     # só na primeira vez
npm run test:preparar                               # banco test_* recriado com o seed completo
npm run build && npx next start -p 3100             # com DATABASE_URL do banco de teste e BETTER_AUTH_URL=http://localhost:3100
E2E_URL=http://localhost:3100 E2E_LOG_SERVIDOR=<log da instância> SEED_SENHA=... npm run test:e2e
```

Cada teste cria o que vai alterar (nomes com carimbo de tempo), então a suíte **passa de novo sem recriar o banco**; o banco recriado é o caminho garantido. Sem SMTP, os e-mails vão para o log da instância, e `E2E_LOG_SERVIDOR` permite aos testes ler o link de redefinição e os avisos.

## CI

`.github/workflows/ci.yml`, em todo push na `main` e em todo pull request, com MariaDB 10.11: lint, tipos, unidade, migrations, build, **integração** e **ponta a ponta** (o próprio CI prepara os dois bancos de teste com o seed completo). Verde desde a primeira execução, em 10/10/2026. Se falhar, as telas e o log do Playwright ficam no artefato `playwright-falhas` da execução.

## O que ainda não tem teste automatizado

- Upload de foto pela tela (`/api/upload` com o arquivo do navegador). O processamento da imagem (`salvarFotoProduto`) é testado na integração.
- A imagem do pedido gerada no navegador (canvas): conferida visualmente.
- Entrega real de e-mail (SMTP): o conteúdo é testado; o envio depende do provedor (L-04).
- Desempenho e carga: medidos manualmente em 07/10 (pico de 330 MB).

## Achados dos testes (08/10)

- **"Não encontrado" do painel responde HTTP 200**, porque o painel transmite a página aos poucos (`loading.tsx`). O conteúdo está protegido (outro vendedor vê "Não encontrado" e nenhum dado), mas o status deveria ser 404. Baixa prioridade: o painel é privado e não é indexado.
