# 09 · Roadmap

Cada fase termina com algo utilizável. Os códigos RF/RN remetem a [Requisitos](02-requisitos.md). Situação em 27/09/2026.

## Fase 0 — Fundação ✅

- [x] Definir visibilidade do catálogo (privado) e hospedagem (VPS) — [D-09, D-10](10-decisoes.md)
- [x] Next.js 16 com TypeScript, Tailwind 4, ESLint, App Router, pasta `src/`
- [x] Componentes de interface próprios com os tokens da marca ([D-11](10-decisoes.md))
- [x] `docker-compose.yml` com MySQL, Prisma e a primeira migration
- [x] Better Auth: login, cadastro, papéis, `exigirPapel()`
- [x] Importação do protótipo (catálogo, custos, logo e fotos)
- [x] Seed de desenvolvimento e `criar-gestor` para produção
- [ ] Ativar o CI no GitHub Actions (lint, typecheck, testes de unidade e build): mover `deploy/github-ci.yml` para `.github/workflows/ci.yml`. Exige token com escopo `workflow`
- [x] Repositório no GitHub: `marcelo-braga-dev/dcerutti`

## Fase 1 — Catálogo ✅

- [x] Layout da loja: cabeçalho, rodapé, navegação mobile (RNF-01)
- [x] Home (RF-01)
- [x] Catálogo com filtros na URL, busca e "Carregar mais" (RF-02, RF-03)
- [x] Página de produto com galeria, tamanhos e relacionados (RF-04)
- [x] Sacola (RF-05)
- [x] Proteção de todas as páginas da loja por login (RN-17, RNF-11)
- [ ] Migrar as fotos para o R2 (RNF-05) — hoje vêm dos servidores da Hering; o upload para o R2 já funciona para fotos novas

## Fase 2 — Pedidos e painel básico ✅ (falta o deploy)

- [x] Cadastro de cliente e link de convite (RF-08, RF-09)
- [x] Envio de pedido e condicional pelo WhatsApp, com imagem (RF-06, RF-07)
- [x] Painel: resumo, pedidos, confirmação item a item, clientes, venda manual (RF-20 a RF-26)
- [x] Seleção montada pelo vendedor (RF-23)
- [x] Vendedores, metas mensais, desativação com transferência de clientes (RF-30, RN-01)
- [x] Baixa e reserva de estoque (RN-07 a RN-09)
- [x] Testes ponta a ponta dos fluxos de [Fluxos](05-fluxos.md)
- [ ] Preparar a VPS e fazer o **deploy em produção** ([Ambiente e deploy](07-ambiente-e-deploy.md#hospedagem-vps)) — arquivos prontos em `deploy/`

## Fase 3 — Gestão ✅ (quase)

- [x] Cadastro e edição de produtos com upload de fotos (RF-31)
- [x] Estoque com histórico (RF-32)
- [x] Custos e indicadores de estoque (RF-33)
- [x] Resultados: faturamento, lucro, margem por vendedor, categoria e produto (RF-34)
- [x] "Minha conta" do cliente (RF-10)
- [x] Configurações da loja pelo painel
- [ ] Recuperação de senha por e-mail (precisa de provedor de e-mail)

## Fase 4 — Evolução (a avaliar)

- [ ] Importação de estoque por planilha / integração com o sistema da loja (RF-35, P-05)
- [ ] Lista de desejos
- [ ] Avise-me quando chegar (produto esgotado)
- [ ] Notificação ao vendedor quando entrar pedido (e-mail ou push)
- [ ] Novas marcas além da Hering
- [ ] Abrir o catálogo ao público: ISR, Open Graph, sitemap (D-09). A chave "Catálogo público" já existe em Configurações
