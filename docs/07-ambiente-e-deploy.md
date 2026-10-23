# 07 · Ambiente e deploy

## Pré-requisitos

- Node.js 22 LTS e npm
- Docker (para o MariaDB local)

## Primeira execução

```bash
cp .env.example .env              # e gere BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d              # MariaDB 10.11 na porta 3307 (a 3306 costuma estar ocupada)
npm install                       # roda `prisma generate`
npx prisma migrate dev            # cria as tabelas
npm run db:importar-prototipo     # 583 produtos + custos + logo e fotos em public/
npm run db:seed                   # usuários de teste
npm run dev                       # http://localhost:3000
```

O `docker-compose.yml` monta `docker/mysql-init/`, que concede ao usuário `dcerutti` a permissão para o *shadow database* do `prisma migrate dev`. Isso vale **só em desenvolvimento**: em produção o usuário da aplicação acessa apenas o banco `dcerutti` e as migrations rodam com `migrate deploy`.

## Variáveis de ambiente

Modelo em [.env.example](../.env.example).

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Banco do site. Na produção, o usuário só com leitura e escrita de dados (`dcerutti_app`) |
| `MIGRATE_DATABASE_URL` | Opcional. Usuário com permissão de alterar tabelas (`dcerutti_migra`); o `deploy.sh` usa este para as migrations quando existe (L-06) |
| `BETTER_AUTH_SECRET` | Chave das sessões: `openssl rand -base64 32`, exclusiva de cada ambiente |
| `LINK_PEDIDO_SEGREDO` | Opcional. Assina os links públicos de pedido (`/p/PED-000123.…`, D-20); sem ele, vale o `BETTER_AUTH_SECRET`. Trocar qualquer um dos dois invalida os links já enviados no WhatsApp |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | Endereço público do site (sessão, links de convite e de e-mail). O `NEXT_PUBLIC_` entra no build: mudou, refaça o build |
| `ARMAZENAMENTO_DIR` | Pasta das fotos e vídeos. Padrão: `armazenamento/` no projeto |
| `SMTP_URL`, `EMAIL_REMETENTE` | E-mail (recuperação de senha e avisos de pedido). Sem `SMTP_URL`, o e-mail vai para o log |
| `FOTOS_CACHE_DIR` | Cache das fotos originais da Hering. Padrão: `../fotos-originais`, ao lado do projeto |
| `SEED_SENHA`, `SEED_PERMITIDO` | Só desenvolvimento e testes. Nunca no servidor de produção |
| `INTEGRACAO_DATABASE_URL`, `INTEGRACAO_SEM_PREPARO`, `E2E_URL`, `E2E_LOG_SERVIDOR` | Só testes ([Testes](14-testes.md)) |

Configurações de negócio (WhatsApp da loja, CEPs e cidade do condicional, frete, parcelas, vendedor padrão, catálogo público) ficam na tabela `configuracao` e são editadas pelo gestor em **Painel → Configurações**.

## Scripts (`package.json`)

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Testes de unidade (Vitest) |
| `npm run test:integracao` | Testes de integração (Vitest) contra o banco de `INTEGRACAO_DATABASE_URL`, que é recriado com o seed completo. Ver [Testes](14-testes.md) |
| `npm run test:preparar` | Recria o banco de `DATABASE_URL` com o seed completo para os testes ponta a ponta (só aceita bancos `test_*`) |
| `npm run test:e2e` | Testes ponta a ponta (Playwright). Sobe `npm start` sozinho; ou use `E2E_URL=http://localhost:3000` com um servidor já rodando. Na primeira vez: `npx playwright install chromium` |
| `npx prisma migrate dev` / `deploy` | Migrations em desenvolvimento / produção |
| `npx prisma studio` | Interface visual do banco |
| `npm run db:importar-prototipo` | Importa do protótipo (`-- --forcar` para sobrescrever produtos existentes, inclusive estoque) |
| `npm run db:seed` | Usuários de teste (recusa rodar com `NODE_ENV=production`) |
| `npm run db:seed:completo` | Seed que popula todas as tabelas e variações (clientes, pedidos em todos os status, condicionais, vendas, metas, estoque) |
| `npm run fotos:guardar-originais` | Baixa as fotos originais da Hering para o cache `../fotos-originais`, fora do projeto (ou `FOTOS_CACHE_DIR`) |
| `npm run fotos:migrar` | Copia as fotos do catálogo para `armazenamento/` (lê do cache; `-- --remover-quebradas` tira as que não existem mais) |
| `npm run fotos:reduzir-teste` | Só no ambiente de teste: troca as fotos por um conjunto pequeno e repetido |
| `npm run criar-gestor` | Cria o primeiro gestor em produção (pergunta nome, e-mail e senha) |

> **Memória:** o `next build` usa bastante RAM. O `next.config.ts` limita o build a 1 worker (`experimental.cpus: 1`) e os scripts usam `NODE_OPTIONS=--max-old-space-size=1536`. Numa máquina com menos de 4 GB, crie swap antes de compilar.

## Usuários de desenvolvimento (seed)

| Papel | E-mail | Senha |
|---|---|---|
| Gestor | gestor@dcerutti.local | `SEED_SENHA` do `.env` (obrigatória, sem padrão; o seed só roda em banco local com `SEED_PERMITIDO=1`) |
| Vendedora | ana@dcerutti.local | idem |
| Vendedor | carlos@dcerutti.local | idem |
| Cliente | cliente@dcerutti.local | idem |

## Hospedagem (VPS)

Decisão [D-10](10-decisoes.md): aplicação e banco na **mesma VPS própria**. As fotos ficam no próprio servidor (D-13).

### O servidor atual

| Item | Situação em 10/10/2026 |
|---|---|
| Sistema | Ubuntu 24.04 LTS, 2 vCPU, 8 GB de RAM, 96 GB de disco |
| Painel | aaPanel, que também administra Nginx, MariaDB e certificados. O servidor hospeda outros sites |
| Banco | MariaDB 10.11 (porta 3306). Falta `bind-address=127.0.0.1` (L-11) |
| Projeto | `/www/wwwroot/dcerutti/site`, dono `dcerutti` (usuário de sistema sem login, B-10) |
| Node e PM2 | `/opt/node-22`; PM2 do próprio `dcerutti`, processo `dcerutti` na porta 3000, serviço `pm2-dcerutti` no boot |
| Nginx | `/www/server/panel/vhost/nginx/dcerutti.com.br.conf` (gerado pelo aaPanel); o modelo do projeto é `deploy/nginx.conf` |
| Certificado | Let's Encrypt pelo aaPanel, `dcerutti.com.br` e `www`, renovação automática |
| Fotos e vídeos | `armazenamento/` no projeto; originais da Hering em `/www/wwwroot/dcerutti/fotos-originais` (fora do Git) |
| Backup | cron do root às 3h, em `/var/backups/dcerutti` (ver abaixo) |

Hoje o domínio serve o **ambiente de teste**, com dados fictícios. A produção terá banco, fotos e segredos próprios, e o teste vai para `teste.dcerutti.com.br` ([19 · Lançamento](19-lancamento.md), seção Virada).

```
Internet ──443──► Nginx (HTTPS, aaPanel)
                    │ proxy_pass
                    ▼
                  Next.js (PM2 do usuário dcerutti, 127.0.0.1:3000)
                    │
                    ▼
                  MariaDB 10.11 (localhost)
```

### Comandos como root

O app roda como `dcerutti`. Como root, use os atalhos, senão arquivos ficam com dono root e o app não consegue gravá-los:

```bash
bash deploy/app.sh <comando>        # ex.: bash deploy/app.sh npx prisma migrate deploy
bash deploy/pm2.sh <comando>        # ex.: bash deploy/pm2.sh reload dcerutti
bash deploy/deploy.sh               # git pull → npm ci → migrations → build → reload, tudo como dcerutti
```

### Montar num servidor novo (resumo)

1. Ubuntu 24.04, SSH só por chave, firewall liberando só 22, 80 e 443, `unattended-upgrades` e `fail2ban`.
2. MariaDB 10.11 com `bind-address = 127.0.0.1` e fuso UTC (`default-time-zone = '+00:00'`).
3. Usuário de sistema `dcerutti` (`useradd --system --create-home --shell /usr/sbin/nologin dcerutti`), Node 22 com PM2 em `/opt/node-22`, projeto clonado com dono `dcerutti`.
4. Banco e usuários: `bash deploy/criar-banco-producao.sh` gera em `/root/dcerutti-producao/` o SQL (`criar.sql`) e as senhas: banco `dcerutti_producao`, usuário `dcerutti_app` (só dados) e `dcerutti_migra` (migrations). Rode o SQL como root do MariaDB.
5. `.env` de produção (permissão `600`) com as variáveis acima, sem as de seed e de teste. O `deploy/ecosystem.config.cjs` já define `NODE_ENV=production` e `MALLOC_ARENA_MAX=2` (memória, B-02).
6. `bash deploy/preparar-producao.sh`: migrations, catálogo do protótipo e fotos do cache.
7. Nginx como proxy reverso para `127.0.0.1:3000` (modelo em `deploy/nginx.conf`, com o limite das rotas de conta, upload de até 10 MB e o bloco de `/api/upload/video` para vídeos de até 100 MB, D-29) e certificado.
8. PM2 e boot:
   ```bash
   bash deploy/pm2.sh start deploy/ecosystem.config.cjs && bash deploy/pm2.sh save
   env PATH=/opt/node-22/bin:$PATH /opt/node-22/bin/pm2 startup systemd -u dcerutti --hp /home/dcerutti   # serviço pm2-dcerutti
   bash deploy/app.sh npm run criar-gestor
   ```
9. Backup no cron e monitor externo (abaixo).

### Deploy (a cada versão)

`bash deploy/deploy.sh` na raiz do projeto. O CI do GitHub roda lint, tipos, testes e build a cada push na `main`; publique só o que passou. O build reescreve a `.next` com o site no ar: publique fora do horário de movimento ([Operação](15-operacao.md)).

### Backup

- `deploy/backup-mysql.sh` no cron do root (`0 3 * * *`, log em `/var/log/dcerutti-backup.log`): `mysqldump --single-transaction` compactado e um `tar` das fotos (`armazenamento/`), guardados 7 dias em `/var/backups/dcerutti` (só o root lê). Variáveis: `BANCO`, `ARMAZENAMENTO` e `BACKUP_REMOTO` (destino rclone fora do servidor; sem ele, o log avisa que a cópia ficou só aqui). Credenciais do banco em `/root/.my.cnf`.
- `/var/backups/dcerutti/preservado/` nunca é apagada. Guarda o dump de 30/09 com os endereços originais das fotos.
- Falta o destino externo (L-09). Retenção sugerida para ele: 7 diários + 4 semanais + 3 mensais.
- Testar a restauração pelo menos uma vez por mês ([Operação](15-operacao.md)).

### Monitoramento

- `bash deploy/pm2.sh logs dcerutti` e `bash deploy/pm2.sh monit`; logs do Nginx em `/www/wwwlogs/`.
- Rotação de logs: `bash deploy/pm2.sh install pm2-logrotate`.
- Monitor externo (UptimeRobot, Better Stack ou similar, gratuito) em `https://dcerutti.com.br/api/saude`: 200 com o banco no ar, 503 sem ele. A contratar (L-10).

> Hospedagem compartilhada comum (só PHP + MySQL) **não serve**: Next.js precisa de Node.js rodando continuamente.

## Checklist de produção

O passo a passo completo da virada está em [19 · Lançamento](19-lancamento.md).

- [ ] Banco `dcerutti_producao` com `dcerutti_app` (só dados) e `dcerutti_migra` (migrations), senhas novas
- [ ] `BETTER_AUTH_SECRET` novo, exclusivo da produção
- [ ] `.env` com `SMTP_URL` e envio testado (Gmail e Outlook)
- [ ] Backup diário com cópia fora do servidor e uma restauração testada
- [ ] HTTPS com renovação automática (aaPanel), `www` incluído
- [ ] Firewall: FTP e aaPanel restritos, MariaDB só em `127.0.0.1`
- [ ] Reboot ensaiado: o site volta sozinho pelo `pm2-dcerutti`
- [ ] Monitor externo em `/api/saude`
- [ ] Catálogo público desligado; Configurações salvas (WhatsApp, vendedor padrão, CEPs, expiração)
- [ ] Gestor e vendedores reais criados; contas de teste ausentes
