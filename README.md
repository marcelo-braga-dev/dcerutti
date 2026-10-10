# D'Cerutti — Catálogo e Gestão de Vendas

Catálogo online da **D'Cerutti** (Maravilha/SC, "O básico aconchego"), loja de roupas Hering, Hering Sports e Hering Intimates, com painel interno para gestor e vendedores.

O cliente navega pelo catálogo, monta uma sacola e envia o pedido — ou um **condicional** (provar em casa) — direto para o WhatsApp do seu vendedor. A loja acompanha pedidos, clientes, metas, estoque e lucro pelo painel.

> **Estado atual (10/10/2026):** fases 0 a 3 implementadas, 299 testes passando e CI verde no GitHub. Rodando em dcerutti.com.br como ambiente de teste; a produção está prevista para 28/10/2026 ([19 · Lançamento](docs/19-lancamento.md)). Ver [Roadmap](docs/09-roadmap.md). O protótipo original está em [prototipo/](prototipo/).

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Banco de dados | MariaDB 10.11 (compatível com MySQL) |
| ORM | Prisma 6 |
| Autenticação | Better Auth |
| Imagens | `next/image` + `sharp`; arquivos no próprio servidor (`armazenamento/`) |
| Interface | Tailwind CSS 4 + componentes próprios |
| Testes | Vitest (unidade e integração contra MariaDB) + Playwright |

## Início rápido

```bash
cp .env.example .env              # gere BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d              # MySQL local na porta 3307
npm install
npx prisma migrate dev            # cria as tabelas
npm run db:importar-prototipo     # importa os 583 produtos e custos do protótipo
npm run db:seed                   # usuários de teste (senha: SEED_SENHA do .env)
npm run dev                       # http://localhost:3000
```

| Entrar como | E-mail |
|---|---|
| Gestor | gestor@dcerutti.local |
| Vendedora | ana@dcerutti.local |
| Cliente | cliente@dcerutti.local |

Testes: `npm test` (unidade), `npm run test:integracao` (servidor e Server Actions contra um MariaDB de teste) e `npm run test:e2e` (ponta a ponta; na primeira vez rode `npx playwright install chromium`). Como preparar os bancos de teste: [14 · Testes](docs/14-testes.md). Mais comandos em [Ambiente e deploy](docs/07-ambiente-e-deploy.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [01 · Visão geral](docs/01-visao-geral.md) | Negócio, usuários, escopo e glossário |
| [02 · Requisitos](docs/02-requisitos.md) | Funcionalidades, regras de negócio e requisitos não funcionais |
| [03 · Arquitetura](docs/03-arquitetura.md) | Stack, estrutura de pastas, cache e padrões de código |
| [04 · Banco de dados](docs/04-banco-de-dados.md) | Modelo de dados MySQL e consultas importantes |
| [05 · Fluxos](docs/05-fluxos.md) | Pedido, condicional, pedido pelo vendedor, convite |
| [06 · Permissões](docs/06-permissoes.md) | Papéis e matriz de acesso |
| [07 · Ambiente e deploy](docs/07-ambiente-e-deploy.md) | Instalação local, scripts e VPS |
| [08 · Migração do protótipo](docs/08-migracao-do-prototipo.md) | Como os dados do protótipo foram importados |
| [09 · Roadmap](docs/09-roadmap.md) | O que está pronto e o que falta |
| [10 · Decisões](docs/10-decisoes.md) | Registro de decisões técnicas e pendências |
| [11 · Identidade visual](docs/11-identidade-visual.md) | Cores, tipografia, componentes e tom |
| [12 · Guia de uso](docs/12-guia-de-uso.md) | Passo a passo para gestor, vendedores e clientes |
| [13 · Guia do desenvolvedor](docs/13-guia-do-desenvolvedor.md) | Convenções, receitas e armadilhas |
| [14 · Testes](docs/14-testes.md) | O que é testado e como rodar |
| [15 · Operação e suporte](docs/15-operacao.md) | Deploy, backup, restauração e problemas comuns |
| [16 · Plano de atualizações](docs/16-plano-de-atualizacoes.md) | Análise de 02/10/2026: correções críticas, estrutura e roadmap |
| [17 · Go-live](docs/17-go-live.md) | O que falta para a produção: bloqueadores, infraestrutura e plano até a virada |
| [18 · Auditoria](docs/18-auditoria.md) | 40 problemas de bugs, usabilidade e coerência e a situação de cada um |
| [19 · Lançamento](docs/19-lancamento.md) | O que falta estruturalmente para lançar: 8 bloqueadores, riscos e plano até 28/10 |
| [CHANGELOG](CHANGELOG.md) | Histórico de versões |
