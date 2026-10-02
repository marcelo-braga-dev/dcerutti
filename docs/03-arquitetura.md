# 03 · Arquitetura

## Visão geral

Uma única aplicação **Next.js** serve a loja (hoje restrita a clientes logados) e o painel interno. Não há API separada: páginas e ações rodam no servidor Next.js e acessam o MySQL via Prisma.

```
Navegador (cliente / vendedor / gestor)
        │
        ▼
Nginx (HTTPS) → Next.js (PM2, VPS própria)
 ├─ (loja)    páginas da loja, exigem login (catálogo privado)
 ├─ (painel)  páginas dinâmicas, protegidas por papel
 ├─ Server Actions  → validação Zod → exigirPapel() → Prisma
 └─ Better Auth     → sessões em cookie
        │                         │
        ▼                         ▼
  MariaDB 10.11 (VPS)       armazenamento/ (fotos, no servidor)
```

A sacola e a geração da imagem do pedido rodam no navegador. O WhatsApp é aberto por link `wa.me` — não há integração com a API do WhatsApp.

## Stack

| Uso | Biblioteca | Observação |
|---|---|---|
| Framework | `next` 16 (App Router, Turbopack), `react` 19, `typescript` | Node 22 LTS. No Next 16 o antigo `middleware.ts` chama-se `proxy.ts` |
| Banco | MariaDB 10.11 (servidor, Docker local e CI) | `utf8mb4` / `utf8mb4_unicode_ci`, fuso UTC |
| ORM | `prisma` 6 | Migrations em `prisma/migrations`. O Prisma 7+ exige driver adapter; migrar quando estabilizar |
| Autenticação | `better-auth` | Adapter Prisma; e-mail + senha; cadastro público desligado (contas criadas pelas nossas Server Actions) |
| Validação | `zod` 4 | Nas Server Actions |
| Formulários | `useActionState` do React + componentes próprios (`Formulario`, `Campo`) | Sem biblioteca: erros por campo e valores preservados vêm da própria action |
| Interface | `tailwindcss` 4 + componentes próprios em `src/components/ui` | Tokens da marca em `src/app/globals.css` ([Identidade visual](11-identidade-visual.md)) |
| Imagens | `next/image` + `sharp` | Arquivos em `armazenamento/`, servidos por `/arquivos/...` (D-13) |
| Datas | `Intl` nativo | Fuso America/Sao_Paulo em `src/lib/datas.ts` |
| Testes | `vitest` (unidade), `@playwright/test` (ponta a ponta) | |
| Qualidade | `eslint` (config do Next) | |
| Pacotes | `npm` | |

## Estrutura de pastas

```
.
├─ prisma/schema.prisma, migrations/   # modelo de dados (fonte da verdade)
├─ scripts/
│  ├─ importar-prototipo.ts           # catálogo + custos + logo/fotos do protótipo
│  ├─ seed.ts                         # usuários de desenvolvimento
│  └─ criar-gestor.ts                 # primeiro gestor em produção
├─ prototipo/                         # index.html e loja.html originais (só referência)
├─ deploy/                            # PM2, Nginx, deploy.sh, backup-mysql.sh
├─ docker-compose.yml                 # MySQL local na porta 3307
├─ tests/unit, tests/e2e
└─ src/
   ├─ proxy.ts                        # sem cookie de sessão → /entrar (painel e minha-conta)
   ├─ app/
   │  ├─ (conta)/entrar, cadastro     # login e cadastro (com convite ?v=)
   │  ├─ (loja)/                      # layout exige login enquanto o catálogo for privado
   │  │  ├─ page.tsx                  # home
   │  │  ├─ catalogo/                 # filtros na URL
   │  │  ├─ produto/[referencia]/
   │  │  ├─ sacola/                   # compra e condicional → WhatsApp
   │  │  └─ minha-conta/
   │  ├─ (painel)/painel/             # layout exige vendedor ou gestor
   │  │  ├─ page.tsx                  # resumo e metas
   │  │  ├─ pedidos/ (lista, [id], novo)
   │  │  ├─ clientes/ (lista, novo, [id])
   │  │  ├─ vendas/
   │  │  └─ resultados/ produtos/ vendedores/ configuracoes/   # só gestor (checado em cada página)
   │  └─ api/auth/[...all], api/upload
   ├─ components/ui | loja | painel
   ├─ server/                         # só servidor ('server-only')
   │  ├─ db.ts, auth.ts, permissoes.ts, config.ts, site.ts, arquivos.ts
   │  ├─ contas.ts                    # criação de conta (também usado pelos scripts)
   │  ├─ catalogo.ts                  # catálogo ativo em cache de memória
   │  ├─ pedidos.ts                   # criar / confirmar / cancelar (transações)
   │  ├─ estoque.ts                   # ÚNICA porta de alteração de estoque (reservar, baixar, liberar, movimentar)
   │  ├─ erros.ts                     # ErroNegocio e gravar(): erros previsíveis viram mensagem
   │  ├─ limite.ts                    # limite de tentativas (login, cadastro)
   │  ├─ relatorios.ts                # metas, resultados, indicadores de estoque
   │  ├─ consultas/                   # LEITURAS das páginas, já com o escopo do usuário
   │  └─ acoes/                       # Server Actions (escritas): conta, pedidos, clientes, gestao, produtos
   └─ lib/                            # código puro compartilhado (testado em tests/unit)
      ├─ catalogo.ts                  # tipos + filtros do catálogo
      ├─ dinheiro.ts, datas.ts, telefone.ts, whatsapp.ts, imagens.ts, formulario.ts
      └─ imagem-pedido.ts             # arte do pedido em canvas (navegador)
```

## Estratégia de renderização e cache

| Área | Modo | Motivo |
|---|---|---|
| Loja (home, catálogo, produto) | Renderizada por requisição; dados do catálogo em **cache de memória** (`src/server/catalogo.ts`, 5 min), invalidado por `invalidarCatalogo()` em toda alteração de produto, estoque ou reserva | Catálogo privado (D-09). ~600 produtos cabem em memória e filtrar em JS é instantâneo |
| Filtros do catálogo | `searchParams` na URL (`/catalogo?genero=feminino&tamanho=M`) | Link com filtro é compartilhável |
| Sacola | Client Component + `localStorage` | Preços são revalidados no servidor ao enviar |
| Envio do pedido | Server Action grava o pedido → navegador abre `wa.me` (D-07) | |
| Painel | Server Components dinâmicos | Dados por usuário |

> O cache de memória vale para **um processo** Node (PM2 em modo fork, `deploy/ecosystem.config.cjs`). Se um dia rodar mais de um processo, trocar por cache compartilhado.

## Padrões de código

**Toda leitura de página passa por `src/server/consultas/`.** Cada função recebe o usuário e aplica o escopo (vendedor só vê o que é dele; consultas de gestor chamam `exigirGestor`). Páginas e componentes não importam `@/server/db`; uma regra do ESLint (`no-restricted-imports`) barra isso.

**Estoque só muda por `src/server/estoque.ts`**, sempre dentro de transação, com `UPDATE` condicional ou `SELECT … FOR UPDATE`.

**Toda escrita passa por uma Server Action, nesta ordem:**

```ts
'use server';
export async function confirmar(pedidoId: string, situacoes: ...) {
  const u = await exigirPapel(EQUIPE);        // 1. quem é (fora do try: o redirect não pode virar mensagem de erro)
  try {
    await garantirAcesso(u, pedidoId);         // 2. pode mexer nisso?
    await confirmarPedido(pedidoId, ...);      // 3. regra de negócio em transação
  } catch (e) { return { ok: false, erro: ... }; }
  revalidatePath('/painel', 'layout');
}
```

- Formulários: a action tem a assinatura `(estado, formData) => EstadoForm`; em erro devolve `falha(fd, erros)`, que traz as mensagens por campo e os valores digitados.
- Estoque sempre com `UPDATE ... WHERE estoque - reservado >= qtd` dentro de `db.$transaction`: duas pessoas não conseguem reservar a mesma última peça.
- Custo só é lido em `server/relatorios.ts`, `acoes/produtos.ts`, páginas de produtos/resultados (todas exigem gestor) e em `confirmarPedido` (gravação do custo no item).
- Valores `Decimal` do Prisma viram número só para exibir.
- Nomes de domínio em português; termos técnicos do framework em inglês.

## Autenticação

- **Better Auth** com e-mail + senha; tabelas `user`, `session`, `account`, `verification` (ver [Banco de dados](04-banco-de-dados.md)).
- Campo adicional `papel` no usuário: `cliente | vendedor | gestor`.
- Cadastro público cria sempre `cliente`. Vendedores e gestores são criados pelo gestor.
- `src/proxy.ts` só verifica se há cookie de sessão em `/painel` e `/minha-conta` (checagem rápida). A loja é protegida pelo próprio layout, que respeita a chave "Catálogo público". A verificação de **papel** acontece no servidor, em cada layout, página e Server Action; nunca confiar só no proxy. Detalhes em [Permissões](06-permissoes.md).
- Recuperação de senha por e-mail: pendente (exige provedor de e-mail). Enquanto isso, o gestor redefine a senha de vendedores e clientes pelo painel.

## Imagens

- Fotos ficam no próprio servidor, em `armazenamento/` dentro do projeto (ou `ARMAZENAMENTO_DIR`), fora do Git e fora de `public/` (o Next só serve `public/` do momento do build). Decisão D-13.
- Caminho: `armazenamento/produtos/<REFERENCIA>/<id>.webp`; URL pública `/arquivos/produtos/<REFERENCIA>/<id>.webp`, servida por `src/app/arquivos/[...caminho]/route.ts` com cache permanente (nomes nunca se repetem).
- Upload: o painel envia a foto para `/api/upload` (só gestor). O servidor confere pelo conteúdo que é imagem, gira conforme o EXIF, reduz para no máximo 1600 px e grava em WebP (`src/server/arquivos.ts`). Limite: 8 MB no app, 10 MB no Nginx.
- `next/image` otimiza só `/arquivos/**`, `/ambiente/**` e o logo (`localPatterns`, sem query string).
- Fotos antigas da Hering/Dafiti: `npm run fotos:migrar` baixa todas para o servidor e atualiza produtos e pedidos (`--remover-quebradas` apaga as que não existem mais). Relatório em `armazenamento/migracao-fotos.json`.
- Exclusão: o banco apaga em cascata fotos, tamanhos, custo e histórico de estoque do produto, mas não os arquivos. `src/server/exclusao.ts` apaga do disco as fotos que nenhum produto nem pedido usa mais; é chamado ao excluir um produto (Painel → Produtos → Excluir produto) e ao tirar fotos da lista na edição. Produto que já entrou em pedido não é excluído (`pedido_item` bloqueia): desative no catálogo.
- Backup: a pasta `armazenamento/` não entra no dump do banco; copie-a junto se for mudar de servidor.
