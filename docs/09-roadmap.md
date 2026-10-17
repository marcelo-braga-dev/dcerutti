# 09 · Roadmap

Cada fase termina com algo utilizável. Os códigos RF/RN remetem a [Requisitos](02-requisitos.md). Situação em 10/10/2026. O que falta para a produção está em [19 · Lançamento](19-lancamento.md).

## Fase 0 — Fundação ✅

- [x] Definir visibilidade do catálogo (privado) e hospedagem (VPS) — [D-09, D-10](10-decisoes.md)
- [x] Next.js 16 com TypeScript, Tailwind 4, ESLint, App Router, pasta `src/`
- [x] Componentes de interface próprios com os tokens da marca ([D-11](10-decisoes.md))
- [x] `docker-compose.yml` com MariaDB 10.11 (antes MySQL 8, D-12), Prisma e a primeira migration
- [x] Better Auth: login, cadastro, papéis, `exigirPapel()`
- [x] Importação do protótipo (catálogo, custos, logo e fotos)
- [x] Seed de desenvolvimento e `criar-gestor` para produção
- [x] CI no GitHub Actions em `.github/workflows/ci.yml` (lint, typecheck, unidade, migrations em MariaDB 10.11, build, integração e ponta a ponta). Verde desde a primeira execução, em 10/10/2026
- [x] Repositório no GitHub: `marcelo-braga-dev/dcerutti`

## Fase 1 — Catálogo ✅

- [x] Layout da loja: cabeçalho, rodapé, navegação mobile (RNF-01)
- [x] Home (RF-01)
- [x] Catálogo com filtros na URL, busca e "Carregar mais" (RF-02, RF-03)
- [x] Página de produto com galeria, tamanhos e relacionados (RF-04)
- [x] Sacola (RF-05)
- [x] Proteção de todas as páginas da loja por login (RN-17, RNF-11)
- [x] Fotos no próprio servidor (RNF-05, D-13): upload grava em `armazenamento/`; as importadas da Hering migradas com `npm run fotos:migrar`

## Fase 2 — Pedidos e painel básico ✅

- [x] Cadastro de cliente e link de convite (RF-08, RF-09)
- [x] Envio de pedido e condicional pelo WhatsApp, com imagem (RF-06, RF-07)
- [x] Painel: resumo, pedidos, confirmação item a item, clientes, venda manual (RF-20 a RF-26)
- [x] Seleção montada pelo vendedor (RF-23)
- [x] Vendedores, metas mensais, desativação com transferência de clientes (RF-30, RN-01)
- [x] Baixa e reserva de estoque (RN-07 a RN-09)
- [x] Condicional montado pelo vendedor, fechamento com parte das unidades e edição das peças de um pedido pendente (auditoria, U-08, B-13)
- [x] Venda na loja com as peças, já confirmada (D-14)
- [x] Expiração de pendentes, com motivo do cancelamento (D-14)
- [x] Cliente edita os próprios dados e cancela pedido em aberto (U-04, U-05)
- [x] Testes ponta a ponta dos fluxos de [Fluxos](05-fluxos.md), integração contra MariaDB e seed completo ([Testes](14-testes.md))
- [x] Cupons de desconto: cadastro do gestor, sacola, pedido pela equipe, campanhas de primeira e próxima compra e relatório ([Cupons](20-cupons.md))
- [x] Histórico do cliente: navegação, interesse na ficha, tela Interesse e aviso de sacola parada ([Histórico do cliente](21-historico-do-cliente.md), RF-40 a RF-42)
- [x] Caixa da loja física ([Caixa](22-caixa.md), D-23), CPF opcional da cliente (D-24) e identidade visual editável (D-25)
- [x] Acompanhamento da equipe ([Acompanhamento](24-acompanhamento-da-equipe.md), D-26)
- [x] Sugestões para você, fase 1 ([Sugestões](23-selecoes.md), D-27)
- [x] Sugestões, fase 2 (automática, "Mais para você", cupom, renovar, duplicar, conversão) — 17/10/2026; a mala direta (fase 3) foi feita e retirada no mesmo dia: as vendas são direcionadas, cliente a cliente (D-27)
- [x] VPS preparada; o app roda em dcerutti.com.br como ambiente de teste (produção: ver Lançamento, abaixo)

## Fase 3 — Gestão ✅

- [x] Cadastro e edição de produtos com upload de fotos (RF-31)
- [x] Estoque com histórico (RF-32)
- [x] Custos e indicadores de estoque (RF-33)
- [x] Resultados: faturamento, lucro, margem por vendedor, categoria e produto (RF-34)
- [x] "Minha conta" do cliente (RF-10)
- [x] Configurações da loja pelo painel
- [x] Recuperação de senha por e-mail; falta ligar o SMTP (L-04)
- [x] LGPD: política (minuta), aceite registrado, exclusão da própria conta
- [x] Fotos em miniaturas com mover e remover; exclusão completa de produto
- [x] Auditoria de bugs, usabilidade e coerência: 40 de 40 itens ([18 · Auditoria](18-auditoria.md))
- [x] Segurança: limite de tentativas, cabeçalhos, app sem root, Nginx com limite por IP ([16 · Plano de atualizações](16-plano-de-atualizacoes.md))

## Lançamento — até 28/10/2026

Detalhes, responsáveis e passo a passo em [19 · Lançamento](19-lancamento.md).

- [x] Certificado com `www` (L-05)
- [x] Código publicado na `main` e CI verde (L-07)
- [x] Aviso de pedido por e-mail ao vendedor (L-13)
- [x] Fotos originais guardadas no servidor (L-01, parte técnica)
- [ ] Banco de produção criado e montado; teste em `teste.dcerutti.com.br` (L-02, L-06)
- [ ] E-mail ligado (L-04)
- [ ] Estoque real (L-03) e dados da loja: política aprovada, equipe real, Configurações (L-08)
- [ ] Backup fora do servidor (L-09), monitor externo (L-10), portas fechadas (L-11), reboot ensaiado (L-12)
- [ ] Ensaio geral em 23/10 e virada em 28/10

## Depois do lançamento (primeiro mês)

- [ ] Verificação de e-mail no cadastro
- [ ] Registro de auditoria das alterações (preço, custo, senha, configurações)
- [ ] Deploy sem interrupção, com volta à versão anterior em um comando
- [ ] Prisma 7 e `npm audit fix`
- [ ] "Não encontrado" do painel com HTTP 404; testes de upload pela tela

## Fase 4 — Evolução (a avaliar)

- [ ] Importação de estoque por planilha / integração com o sistema da loja (RF-35, P-05)
- [ ] Lista de desejos
- [ ] Avise-me quando chegar (produto esgotado)
- [ ] Novas marcas além da Hering
- [ ] Abrir o catálogo ao público: ISR, Open Graph, sitemap (D-09). A chave "Catálogo público" já existe em Configurações
- [ ] Notificação push no celular da equipe
