# 29 · Plano de migração para Laravel + Inertia + React + MUI

Plano para reescrever o sistema inteiro em **Laravel (PHP)** no servidor, **Inertia.js** como ponte, **React** nas telas e **MUI (Material UI)** como biblioteca de componentes, no lugar de Next.js + Prisma + Better Auth + Tailwind. Situação em 26/11/2026; nada foi feito ainda.

Princípio: **mudar a tecnologia, não o produto.** As regras de negócio estão escritas nos capítulos 01 a 28 e nos testes; a versão Laravel tem de se comportar igual, tela por tela, até a virada. Melhorias ficam para depois.

## 1. Tamanho do trabalho

| Parte | Hoje (Next) | Vira (Laravel) |
|---|---|---|
| Páginas | 69 `page.tsx` em loja, conta, painel, caixa, editor e páginas públicas | 69 páginas Inertia (`resources/js/Pages`) + controllers |
| Regras de negócio | `src/server`: 77 arquivos, ~10,2 mil linhas | Services/Actions em PHP: **a maior parte do esforço** |
| Ações e consultas | `src/server/acoes` (21) e `src/server/consultas` (15) | Controllers + Form Requests (ações), Query classes (consultas) |
| Componentes | `src/components`: 81 componentes, ~10,3 mil linhas, Tailwind | Componentes React com MUI: lógica reaproveitada, visual refeito |
| Lógica pura | `src/lib`: 33 arquivos, ~3,2 mil linhas | Dividida: regra vai para PHP; formatação e máscaras ficam no front (TS) |
| API | 14 `route.ts` | Rotas e controllers Laravel |
| Banco | 46 tabelas (Prisma, MySQL 8 local / MariaDB 10.11 na VPS) | **O mesmo schema**, com Eloquent |
| Scripts | 16 em `scripts/` (seeds, importações, manutenção) | Comandos Artisan e Seeders |
| Testes | ~9,4 mil linhas: Vitest (unit, integração) + 17 specs Playwright | Pest (unit, feature) + **os mesmos specs Playwright** |

**Estimativa:** uma pessoa experiente em Laravel e React, em tempo integral, **14 a 18 semanas** até a paridade completa; com duas pessoas (back e front em paralelo), **9 a 12 semanas**. O redesenho em MUI é cerca de um terço disso.

## 2. Arquitetura alvo

### 2.1 Pilha

| Camada | Escolha | Substitui |
|---|---|---|
| Servidor | Laravel (versão estável atual), PHP 8.3+ | Next.js (App Router, Server Components, Server Actions) |
| Ponte | Inertia.js (adapter Laravel + `@inertiajs/react`) | Roteamento e renderização do Next |
| Telas | React 19 + TypeScript, empacotado pelo Vite | React 19 no Next |
| Componentes | MUI (`@mui/material`, `@mui/icons-material`, `@mui/x-date-pickers`; `@mui/x-data-grid` nas listas grandes) | Componentes próprios + Tailwind 4 |
| Banco | Eloquent sobre o schema atual | Prisma 6 |
| Login | Sessão do Laravel + Fortify (entrar, cadastro, esqueci/redefinir senha) | Better Auth |
| Validação | Form Requests (servidor); Zod opcional só no front | Zod 4 |
| Tarefas | Scheduler (`schedule:run` no cron) + filas (driver `database`) | Gatilhos "talvez..." disparados por requisição |
| E-mail | Mail + Notifications do Laravel | Nodemailer |
| Imagens | Intervention Image (Imagick) | sharp |
| Planilhas | PhpSpreadsheet (ou Laravel Excel) | ExcelJS |
| Vídeo | ffmpeg via `Process` | ffmpeg via Node |
| QR Code | `bacon/bacon-qr-code` (servidor) ou `qrcode` (front) | `qrcode` |
| Arrastar e soltar | `@dnd-kit` (fica igual) | `@dnd-kit` |
| Testes | Pest + Playwright | Vitest + Playwright |

### 2.2 Pastas

```
app/
  Models/                 46 models (um por tabela), casts de enum, JSON e decimal
  Enums/                  Papel, StatusPedido, TipoCupom, EtapaAtendimento… (os 30 enums do schema.prisma)
  Services/               regras: Pedidos, Estoque, Catalogo, Cupons, Campanhas, Sugestoes, Atendimento,
                          Vitrines, PosVenda, Numeros, Navegacao, Equipe, Notificacoes, Config,
                          ImportacaoEstoque, Arquivos, Pagamentos/{Cobrancas, MercadoPago, Travas, Assinatura}
  Queries/                o que hoje está em src/server/consultas
  Http/Controllers/       Loja/, Conta/, Painel/, Caixa/, Publico/, Api/, Editor/
  Http/Requests/          validação de cada ação (hoje os schemas Zod das Server Actions)
  Http/Middleware/        HandleInertiaRequests (props compartilhadas), Autenticado (= src/proxy.ts), Papel
  Policies/               permissões do capítulo 06 (vendedor só vê os clientes dele etc.)
  Jobs/                   ProcessarAvisoMercadoPago, EnviarEmail, ConciliarPagamentos…
  Notifications/          os 16 tipos de notificação (canais database + mail)
  Console/Commands/       criar-gestor, estoque:importar, conciliar, manutencao…
  Hashing/                ScryptBetterAuthHasher (ver 3.2)
database/
  migrations/             0000_schema_inicial (dump do banco atual) + as novas
  seeders/                SeedTeste (= scripts/seed/semear.ts), SeedDemo (= scripts/seed/demo.ts)
resources/js/
  Pages/                  Loja/, Conta/, Painel/, Caixa/, Publico/, Editor/ (uma por page.tsx)
  Layouts/                LojaLayout, PainelLayout (menu lateral D-35), CaixaLayout, ContaLayout
  Components/             o que hoje está em src/components, refeito com MUI
  theme/                  tema MUI montado a partir da identidade visual (D-25)
  lib/                    o que de src/lib é só de tela (formatação, máscaras, datas, whatsapp, cores)
tests/
  Unit/ Feature/          Pest
  e2e/                    os specs Playwright de hoje
```

### 2.3 Como cada recurso do Next vira Laravel/Inertia

| Next (hoje) | Laravel + Inertia |
|---|---|
| Server Component carrega dados e renderiza | Controller monta as props → `Inertia::render('Painel/Pedidos/Index', [...])` |
| Server Action + `useActionState` | `POST/PUT/DELETE` para um controller com Form Request; no front, `useForm` do Inertia (`errors`, `processing`) |
| `redirect()` (`next/navigation`) | `return redirect()->route(...)` ou `back()` com mensagem em `session()->flash` |
| `revalidatePath`, `next/cache` | Desnecessário: cada visita Inertia busca as props de novo. Cache de servidor só no catálogo: `Cache::remember` + `Cache::forget` em `invalidarCatalogo` |
| `cache()` do React (`lerConfig`, usuário da requisição) | Singleton por requisição no container (`scoped`) |
| `src/proxy.ts` (rotas protegidas e cabeçalho do caminho) | Middleware `auth` nas rotas `/painel`, `/minha-conta`, `/caixa`, `/editar`, com volta para `/entrar?volta=` |
| `loading.tsx` | Barra de progresso do Inertia + `Skeleton` do MUI; *deferred props* nas telas pesadas |
| `error.tsx`, `not-found.tsx`, `global-error.tsx` | Exception handler renderizando páginas Inertia de erro (404, 403, 500) |
| `next/link` (85 usos), `useRouter` / `useSearchParams` (62) | `<Link>` e `router.visit/get` do Inertia; filtros na query string com `preserveState` |
| `next/image` (5), `next/font` (1) | `<img>` com `srcset` (as fotos já são WebP em tamanhos) e Fontsource |
| `metadata` / `generateMetadata` | `<Head>` do Inertia e, nas páginas públicas, Open Graph no Blade raiz (ver 3.6) |
| `robots.ts` | Rota `/robots.txt` |
| `route.ts` (API) | Rotas em `routes/web.php` e `routes/api.php` |

## 3. Decisões que precisam de cuidado

### 3.1 Banco: mesmo schema, sem migração de dados

- O schema fica como está: nomes de tabela em snake_case e colunas em camelCase (`criadoEm`, `vendedorId`). Os models declaram `$table`, `CREATED_AT`/`UPDATED_AT` (ou `$timestamps = false` onde não há `atualizadoEm`) e os nomes das chaves nas relações.
- IDs `cuid` (string): `$keyType = 'string'`, `$incrementing = false` e geração no `creating` (pacote cuid2 para PHP, ou ULID nas tabelas novas; o banco só exige string única).
- Enums MySQL viram PHP Enums com cast; colunas JSON com cast `array`; dinheiro com cast `decimal:2`. **Nunca somar dinheiro em float**: replicar o arredondamento de `src/lib/dinheiro.ts` e do caixa (`src/lib/caixa.ts`).
- Migration inicial: dump do schema atual (`php artisan schema:dump` a partir do banco migrado pelo Prisma). Daí em diante, só migrations Laravel. A tabela `_prisma_migrations` sai na virada.
- Ganho: o backup da VPS, o seed de demonstração e o banco de teste continuam servindo para comparar as duas versões lado a lado.

### 3.2 Senhas: compatibilidade com o Better Auth

O Better Auth grava `account.password` como `salt:hash` em hexadecimal: scrypt com **N=16384, r=16, p=1, 64 bytes**, senha normalizada em NFKC e o *salt* usado como texto (os 32 caracteres hexadecimais, não os bytes). O PHP não tem scrypt com r=16 no núcleo (o sodium fixa r=8).

Opções, em ordem de preferência:
1. **Hasher de transição** (`ScryptBetterAuthHasher`): confere o hash antigo e, se a senha bater, grava de novo com bcrypt (`Hash::make`) na hora. A conferência do scrypt pode ser feita por uma implementação PHP (lenta, ~1 s, mas só no primeiro login de cada pessoa) ou chamando `node -e` por `Process`. Some sozinho quando todos tiverem entrado uma vez.
2. Pedir que todos redefinam a senha na virada (e-mail de "esqueci a senha"). Simples, mas atrapalha as clientes.

As senhas passam para `users.password` (o Laravel espera na própria tabela de usuários) ou o guard lê de `account`; a decisão vem junto com o Fortify. As tabelas `session`, `verification` e `account` do Better Auth saem depois da virada.

### 3.3 Permissões

O capítulo 06 vira **Policies** e um middleware de papel. Pontos que não podem escapar: o vendedor só vê e edita os clientes, pedidos e sugestões dele (`escopoVendedor`, `podeAcessar` em `src/server/permissoes.ts`); o gestor vê tudo; o caixa aceita vendedor e gestor; o limite de desconto do vendedor (D-23) vale no caixa e nas sugestões.

### 3.4 Concorrência e dinheiro

Portar com teste, não reescrever de memória:
- `SELECT … FOR UPDATE` no estoque (`movimentar`), na edição e confirmação de pedido (C-07) e nas cobranças → `lockForUpdate()` dentro de `DB::transaction`.
- Reserva do condicional e da cobrança online (RN-08, RP-03) e baixa só na confirmação da compra (RN-07).
- Idempotência do Mercado Pago (`cobranca.chave`, `evento_pagamento.requestId` único) e assinatura do webhook (`src/server/pagamentos/assinatura.ts`).
- Contadores de código (`PED-`, `SUG-`, `AT-`) na mesma transação que cria o registro.

### 3.5 Tarefas em segundo plano

Hoje vários processos rodam "de carona" numa requisição (`talvezConciliar`, `talvezManutencao`, `verificarNotificacoes`, `avisarSacolasParadas`, expiração de pedidos). No Laravel:

| Tarefa | Agendamento |
|---|---|
| Expirar pedidos pendentes (Q-05) | a cada 15 min |
| Conciliar pagamentos (docs/27) | a cada 10 min |
| Processar aviso do Mercado Pago | fila, logo que o webhook grava o evento |
| Sacola parada, prazo vencendo, pós-venda do dia, retorno de atendimento | de hora em hora |
| Manutenção LGPD (histórico com mais de 12 meses, notificações com mais de 6, atendimentos sem ficha) | diária, de madrugada |
| E-mails | fila |
| Backup (`deploy/backup-mysql.sh`) | segue no cron do sistema |

Na VPS: `* * * * * php artisan schedule:run` e um `queue:work` mantido pelo Supervisor (ou pelo PM2, que já está lá).

### 3.6 Páginas públicas e prévias de link

O catálogo é privado (D-09), mas vitrine (`/vitrine/[slug]`, `/vitrines`), link da peça (`/peca/[chave]`), sugestão (`/s/[chave]`), link do pedido (`/p/[chave]`), pagamento (`/pagar/[chave]`) e `/live` são abertos e precisam da prévia no WhatsApp e no Instagram. As tags Open Graph saem do **template Blade raiz** com os dados da página, sem SSR. Os cartões `cartao.jpg` (hoje gerados com sharp) passam para Intervention Image, com cache em disco. Inertia SSR só se o catálogo virar público e o SEO passar a importar.

### 3.7 Visual com MUI

- **Tema dinâmico:** `configuracao.identidade` (cores, logos, nome e slogan; D-25) vai para as props compartilhadas, e um `ThemeProvider` monta o tema MUI com essas cores. Os padrões do capítulo 11 viram `components.MuiButton.styleOverrides` etc., e não CSS solto.
- **Componentes:** listas grandes (pedidos, clientes, produtos, vendas, notificações) com `DataGrid` ou `Table` + paginação do servidor; formulários com `TextField`, `Autocomplete` (cliente, peça), `DatePicker`; o cadastro de produto em etapas com `Stepper`; o menu lateral recolhível com `Drawer`; o caixa com layout próprio para tablet.
- **Celular primeiro:** a loja e o caixa são usados no celular e no tablet (`celular.spec.ts`).
- **Editor da página inicial** (`/editar/inicio`) é a tela mais trabalhosa de refazer: edição no lugar, com prévia.
- **Seletores dos testes:** os specs Playwright procuram por texto e papel (`getByRole`, `getByText`). Mantendo os textos e usando os `aria-label` certos nos componentes MUI, os testes continuam valendo.

## 4. Inventário: de onde para onde

### 4.1 Páginas

| Área | Páginas de hoje | Controller(s) |
|---|---|---|
| Loja | `/`, `/catalogo`, `/produto/[referencia]`, `/sacola` | `Loja\InicioController`, `CatalogoController`, `ProdutoController`, `SacolaController` |
| Minha conta | `/minha-conta`, `…/pedidos`, `…/favoritos`, `…/cupons`, `…/sugestoes` | `Loja\MinhaContaController` |
| Conta | `/entrar`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha` | Fortify + `Conta\…` (telas Inertia) |
| Públicas | `/p/[chave]`, `/pagar/[chave]`, `/pagar/[chave]/retorno`, `/peca/[chave]`, `/s/[chave]`, `/vitrine/[slug]`, `/vitrines`, `/privacidade` | `Publico\PedidoController`, `PagarController`, `PecaController`, `SugestaoController`, `VitrineController` |
| Editor | `/editar/inicio` | `Editor\InicioController` |
| Caixa | `/caixa`, `/caixa/vendas` | `Caixa\CaixaController` |
| Painel: início e busca | `/painel`, `/painel/busca`, `/painel/tutorial`, `/painel/resultados`, `/painel/interesse` | `Painel\InicioController`, `BuscaController`, `ResultadosController`, `InteresseController` |
| Painel: pedidos e vendas | `/painel/pedidos`, `…/novo`, `…/[id]`, `/painel/vendas`, `/painel/pagamentos` | `Painel\PedidoController`, `VendaController`, `PagamentoController` |
| Painel: clientes | `/painel/clientes`, `…/novo`, `…/[id]`, `…/[id]/historico` | `Painel\ClienteController`, `HistoricoClienteController` |
| Painel: produtos | `/painel/produtos`, `…/novo`, `…/[id]`, `…/[id]/midia`, `…/importar` | `Painel\ProdutoController`, `MidiaController`, `ImportacaoEstoqueController` |
| Painel: vendas avançadas | `/painel/cupons` (+ `novo`, `[id]`, `campanhas`), `/painel/sugestoes` (+ `nova`, `[id]`) | `Painel\CupomController`, `CampanhaController`, `SugestaoController` |
| Painel: atendimento | `/painel/atendimento` (+ `lista`, `novo`, `[id]`, `equipe`, `respostas`) | `Painel\AtendimentoController`, `RespostaProntaController` |
| Painel: vitrines e números | `/painel/vitrines` (+ `nova`, `[id]`), `/painel/numeros` (+ `[id]`) | `Painel\VitrineController`, `NumeroController` |
| Painel: equipe | `/painel/vendedores` (+ `novo`, `[id]`), `/painel/equipe` | `Painel\VendedorController`, `EquipeController` |
| Painel: sistema | `/painel/configuracoes`, `…/pagamento`, `/painel/identidade`, `/painel/notificacoes` | `Painel\ConfiguracaoController`, `IdentidadeController`, `NotificacaoController` |

### 4.2 Rotas de API

| Hoje | Laravel |
|---|---|
| `/api/auth/[...all]` | Fortify (rotas próprias) |
| `/api/upload`, `/api/upload/video` | `Api\UploadController` (Intervention + ffmpeg; mesmas pastas em `armazenamento/`) |
| `/api/atividade` (navegação da cliente) | `Api\AtividadeController` → `Services\Navegacao` |
| `/api/equipe` (presença no painel e no caixa) | `Api\PresencaController` → `Services\Equipe` |
| `/api/importacao-estoque` | `Painel\ImportacaoEstoqueController@upload` |
| `/api/pagamentos/mercadopago` (webhook) | `Api\MercadoPagoWebhookController`: valida a assinatura, grava o evento e responde 200; o processamento vai para a fila |
| `/api/pagamentos/situacao` | `Api\SituacaoPagamentoController` (consulta da página do Pix) |
| `/api/saude` | rota `/up` do Laravel + checagem do banco |
| `/arquivos/[...caminho]` | o nginx serve `armazenamento/` direto (hoje passa pelo Node); fotos originais e planilhas continuam protegidas por controller |
| `/p|/peca|/s/[chave]/cartao.jpg` | `Publico\CartaoController` |
| `/live` | `Publico\LiveController` (redireciona para a vitrine no ar) |

### 4.3 Regras (src/server → app/Services)

| Hoje | Laravel | Notas |
|---|---|---|
| `pedidos.ts`, `historico.ts`, `expiracao.ts`, `link-pedido.ts`, `cartao-pedido.ts` | `Services\Pedidos\*` | criar, editar, confirmar, cancelar, desfazer; histórico; link assinado |
| `estoque.ts` | `Services\Estoque` | `movimentar` com trava |
| `catalogo.ts`, `marca.ts` | `Services\Catalogo` + `Cache` | filtros de `src/lib/catalogo.ts` |
| `cupons.ts`, `campanhas.ts` | `Services\Cupons`, `Services\Campanhas` | docs/20 |
| `sugestoes.ts` | `Services\Sugestoes` | docs/23 |
| `atendimento.ts`, `atendimento-pedido.ts`, `interesse.ts` | `Services\Atendimento`, `Services\PosVenda` | docs/26 |
| `vitrines.ts` | `Services\Vitrines` | |
| `numeros.ts` | `Services\Numeros` | D-31 |
| `navegacao.ts` | `Services\Navegacao` | docs/21 |
| `equipe.ts` | `Services\Equipe` | docs/24 |
| `notificacoes.ts`, `avisos.ts`, `email.ts` | `Notifications\*` + `Services\Notificacoes` | preferências por tipo e canal (D-28) |
| `pagamentos/*` | `Services\Pagamentos\*` | docs/27 e 28 |
| `importacao-estoque.ts`, `arquivo-planilha.ts`, `planilha-xlsx.ts` | `Services\ImportacaoEstoque` | PhpSpreadsheet; docs/25 |
| `config.ts` | `Services\Config` | mesmas chaves e formatos (validação do JSON igual à do zod) |
| `contas.ts`, `exclusao.ts`, `auth.ts`, `permissoes.ts`, `limite.ts` | Fortify, `Services\Contas`, Policies, `RateLimiter` | LGPD: exclusão e anonimização |
| `relatorios.ts` | `Queries\Relatorios` | |
| `arquivos.ts`, `site.ts`, `erros.ts`, `db.ts` | `Services\Arquivos`, config, exceções | |

### 4.4 Scripts

| Hoje | Laravel |
|---|---|
| `seed.ts`, `seed-completo.ts`, `seed/semear.ts` | `DatabaseSeeder`, `SeedTesteSeeder` |
| `seed-demo.ts`, `seed/demo.ts` | `SeedDemoSeeder` |
| `criar-gestor.ts` | `php artisan gestor:criar` |
| `importar-estoque.ts` | `php artisan estoque:importar {arquivo} {--confirmar}` |
| `conciliar-pagamentos.ts`, `manutencao-historico-cliente.ts` | comandos chamados pelo scheduler |
| `fotos-cache.ts`, `guardar-fotos-originais.ts`, `restaurar-fotos.ts`, `migrar-fotos.ts`, `reduzir-fotos-teste.ts` | comandos de manutenção de fotos |
| `importar-planilha.ts`, `importar-prototipo.ts`, `prototipo.ts` | não migrar (importadores antigos, docs/25) |

## 5. Fases

Cada fase termina com os testes da área passando nas duas versões. A ordem segue a dependência das regras.

| # | Fase | Conteúdo | Pronto quando | Semanas* |
|---|---|---|---|---|
| 0 | Fundação | Projeto Laravel + Inertia + React + MUI + Vite; tema dinâmico; 46 models e enums sobre o banco atual; hasher de transição; middleware de login e papéis; layouts (loja, painel, caixa, conta); CI com Pest e Playwright | As contas atuais entram e cada papel cai no lugar certo | 2 |
| 1 | Núcleo | Catálogo e cache, estoque, pedidos (criar, editar, confirmar, cancelar, desfazer, expirar), histórico, link do pedido, contadores | Testes de integração de pedidos e estoque portados para Pest e passando | 2–3 |
| 2 | Painel do dia a dia | Pedidos (lista, novo, detalhe), clientes (ficha, histórico), produtos (cadastro em etapas, mídia, fotos, vídeos), vendas e metas, vendedores, busca, início com "o que pede ação" | Vendedor e gestor trabalham só no Laravel | 3 |
| 3 | Loja e conta | Home editável e editor, catálogo com filtros, produto, sacola, favoritos, cadastro e entrar, minha conta, privacidade e exclusão de conta, registro de navegação | `loja.spec`, `senha.spec`, `historico.spec`, `editor-inicio.spec` passando | 2–3 |
| 4 | Caixa | Venda no balcão, cliente ou consumidor final, desconto com limite, pagamento dividido, troco, comprovante, vendas do dia | Totais e pagamentos iguais aos da versão atual nos mesmos cenários | 1 |
| 5 | Vendas avançadas | Cupons e campanhas, sugestões e página `/s`, atendimento e respostas prontas, números de WhatsApp, vitrines, live e link da peça, pós-venda | `atendimento`, `numeros`, `vitrines`, `peca`, `pos-venda`, `fluxos` passando | 3 |
| 6 | Pagamento online | Cobrança Pix e checkout, página `/pagar`, webhook com fila, conciliação, estorno, reserva por cobrança, modo simulado | `pagamento.spec` passando e uma rodada no sandbox do Mercado Pago | 1–2 |
| 7 | Retaguarda | Importação de estoque, notificações e preferências, acompanhamento da equipe, resultados e relatórios, configurações, identidade, scheduler e filas | Todos os 17 specs Playwright passando contra o Laravel | 1–2 |
| 8 | Virada | Deploy na VPS, nginx, cron e worker; ensaio com cópia do banco de produção; corte; desligar o PM2 do Next; remover tabelas do Better Auth e `_prisma_migrations` | Uma semana de uso sem regressão | 1 |

\* Uma pessoa em tempo integral. Total: 16 a 18 semanas.

## 6. Testes como rede de segurança

1. **Playwright (17 specs, `tests/e2e`):** testam pelo navegador, sem saber a tecnologia. Basta apontar `baseURL` para o Laravel. São o critério de paridade de cada fase. Os ajustes ficam em seletores que dependem de marcação interna do Tailwind; ajustar a cada fase, nunca no fim.
2. **Integração (Vitest contra MariaDB, `tests/integracao`):** portar para Pest Feature, cenário a cenário, antes de portar a regra. Assim a regra PHP nasce já com o teste da versão atual.
3. **Unitários (`tests/unit`):** os de lógica que fica no front continuam em Vitest; os de regra vão para Pest.
4. **Comparação lado a lado:** com o mesmo banco (restaurado do mesmo backup), as duas versões precisam mostrar os mesmos números no início do painel, nos resultados e nos relatórios.
5. **Seed:** `SeedTesteSeeder` reproduz o `semear.ts` (os specs dependem dos e-mails, das referências `FIX-*` e das clientes fixas do `fixtures.ts`).

## 7. Deploy

| Hoje | Depois |
|---|---|
| Node 22 + PM2 (`deploy/ecosystem.config.cjs`) | PHP 8.3-FPM; Node só para o `npm run build` do Vite |
| nginx → proxy para o Next | nginx → `public/index.php`, com `armazenamento/` servido direto |
| `deploy/deploy.sh`: pull, `npm ci`, migrations, build, reload | pull, `composer install --no-dev`, `npm ci && npm run build`, `php artisan migrate --force`, `config:cache`, `route:cache`, `view:cache`, `queue:restart`, reload do FPM |
| Usuário `dcerutti` dono dos arquivos | igual: o FPM roda como `dcerutti` |
| Sem cron da aplicação | `schedule:run` a cada minuto + worker da fila |
| `.env` do Next | `.env` do Laravel (`APP_KEY`, banco, Mercado Pago, SMTP, `ARMAZENAMENTO_DIR`) |

O aaPanel da VPS já gerencia PHP-FPM, o que simplifica.

## 8. Riscos

| Risco | Efeito | Como reduzir |
|---|---|---|
| Lançamento perto (docs/19) | A reescrita adia o go-live em 4 meses | Lançar no Next e migrar depois: o banco não muda, e os dados reais viram teste da migração |
| Regras sutis mal portadas (trava de estoque, arredondamento, idempotência) | Estoque negativo, cobrança duplicada, total errado | Portar o teste antes da regra (seção 6); revisar 3.4 item a item |
| Senhas scrypt | Clientes sem conseguir entrar | Hasher de transição (3.2) testado com hashes reais do backup |
| MUI muda a cara da loja | Retrabalho de identidade e testes quebrando | Tema construído na fase 0 a partir do capítulo 11; textos e `aria-label` iguais |
| Duas bases de código ao mesmo tempo | Correção feita só em uma | Congelar funcionalidades novas no Next durante a migração; só correções, aplicadas nos dois |
| Desempenho do PHP em telas pesadas (início, resultados, histórico) | Painel lento | Mesmas consultas agregadas de hoje (`Queries`), índices já existentes, *deferred props* |

## 9. Decisões em aberto

1. **Motivo da troca** (equipe PHP, hospedagem, manutenção): define se vale a reescrita completa ou só do servidor.
2. **Antes ou depois do lançamento?** Recomendação: depois.
3. **MUI em tudo?** Alternativa: MUI no painel e no caixa, e a loja com visual próprio (menos parecida com "sistema").
4. **Senhas:** hasher de transição ou redefinição geral.
5. **Repositório:** pasta nova neste repositório (`laravel/`) ou repositório separado.

## 10. Primeiros passos (fase 0, em ordem)

1. Criar o projeto Laravel com o starter de React + Inertia e trocar o Tailwind do starter por MUI.
2. Apontar para uma cópia do banco atual e gerar a migration inicial pelo dump do schema.
3. Gerar os 46 models (nomes de tabela, chaves string, casts, relações) e os 30 enums a partir do `prisma/schema.prisma`.
4. Escrever o `ScryptBetterAuthHasher` e testar com os hashes do backup e com a senha conhecida do seed (`SEED_SENHA`).
5. Middleware de login e papel; `HandleInertiaRequests` compartilhando usuário, configuração pública, identidade e contagem de notificações.
6. Tema MUI dinâmico e os quatro layouts (loja, conta, painel com menu lateral, caixa).
7. CI: Pest + Playwright rodando contra o Laravel com o `SeedTesteSeeder`.
