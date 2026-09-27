# 07 · Ambiente e deploy

## Pré-requisitos

- Node.js 22 LTS e npm
- Docker (para o MySQL local)
- Conta Cloudflare (R2) — opcional; sem ela o painel aceita URLs de imagem

## Primeira execução

```bash
cp .env.example .env              # e gere BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d              # MySQL 8.4 na porta 3307 (a 3306 costuma estar ocupada)
npm install                       # roda `prisma generate`
npx prisma migrate dev            # cria as tabelas
npm run db:importar-prototipo     # 583 produtos + custos + logo e fotos em public/
npm run db:seed                   # usuários de teste
npm run dev                       # http://localhost:3000
```

O `docker-compose.yml` monta `docker/mysql-init/`, que concede ao usuário `dcerutti` a permissão para o *shadow database* do `prisma migrate dev`. Isso vale **só em desenvolvimento**: em produção o usuário da aplicação acessa apenas o banco `dcerutti` e as migrations rodam com `migrate deploy`.

## Variáveis de ambiente

Ver [.env.example](../.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `R2_*` + `NEXT_PUBLIC_IMAGENS_URL` (opcionais), `NEXT_PUBLIC_SITE_URL` (usado nos links de convite) e `SEED_SENHA` (só desenvolvimento).

Configurações de negócio (WhatsApp da loja, CEPs e cidade do condicional, frete, parcelas, vendedor padrão, catálogo público) ficam na tabela `configuracao` e são editadas pelo gestor em **Painel → Configurações**.

## Scripts (`package.json`)

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Testes de unidade (Vitest) |
| `npm run test:e2e` | Testes ponta a ponta (Playwright). Sobe `npm start` sozinho; ou use `E2E_URL=http://localhost:3000` com um servidor já rodando. Na primeira vez: `npx playwright install chromium` |
| `npx prisma migrate dev` / `deploy` | Migrations em desenvolvimento / produção |
| `npx prisma studio` | Interface visual do banco |
| `npm run db:importar-prototipo` | Importa do protótipo (`-- --forcar` para sobrescrever produtos existentes, inclusive estoque) |
| `npm run db:seed` | Usuários de teste (recusa rodar com `NODE_ENV=production`) |
| `npm run criar-gestor` | Cria o primeiro gestor em produção (pergunta nome, e-mail e senha) |

> **Memória:** o `next build` usa bastante RAM. O `next.config.ts` limita o build a 1 worker (`experimental.cpus: 1`) e os scripts usam `NODE_OPTIONS=--max-old-space-size=1536`. Numa máquina com menos de 4 GB, crie swap antes de compilar.

## Usuários de desenvolvimento (seed)

| Papel | E-mail | Senha |
|---|---|---|
| Gestor | gestor@dcerutti.local | `SEED_SENHA` do `.env` (padrão `dcerutti123`) |
| Vendedora | ana@dcerutti.local | idem |
| Vendedor | carlos@dcerutti.local | idem |
| Cliente | cliente@dcerutti.local | idem |

## Hospedagem (VPS)

Decisão [D-10](10-decisoes.md): aplicação e MySQL na **mesma VPS própria**. As fotos continuam no Cloudflare R2, fora do servidor.

### Servidor

| Item | Recomendação |
|---|---|
| Sistema | Ubuntu Server 24.04 LTS |
| Recursos mínimos | 2 vCPU, 4 GB RAM, 40 GB SSD (o `next build` consome bastante memória; com 2 GB, criar swap de 2 GB) |
| Localização | Brasil ou leste dos EUA, pela latência |
| Software | Node.js 22 LTS, npm, MySQL 8.4, Nginx, PM2, Certbot |

### Arquitetura no servidor

```
Internet ──443──► Nginx (HTTPS, gzip, cache de /_next/static)
                    │ proxy_pass
                    ▼
                  Next.js (PM2, 127.0.0.1:3000)
                    │
                    ▼
                  MySQL 8.4 (127.0.0.1:3306, sem acesso externo)
```

### Preparação (uma vez)

1. Criar usuário `deploy` com sudo; desativar login SSH por senha e do `root` (só chave).
2. Firewall `ufw`: liberar apenas 22, 80 e 443. **A porta 3306 fica fechada.**
3. `unattended-upgrades` para atualizações de segurança automáticas; `fail2ban` para o SSH.
4. Instalar MySQL, rodar `mysql_secure_installation`, garantir `bind-address = 127.0.0.1`, e criar banco e usuário da aplicação:
   ```sql
   CREATE DATABASE dcerutti CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'dcerutti'@'localhost' IDENTIFIED BY '<senha forte>';
   GRANT ALL PRIVILEGES ON dcerutti.* TO 'dcerutti'@'localhost';
   ```
   Fuso do MySQL em UTC (`default-time-zone = '+00:00'`).
5. Instalar Node 22 e PM2 (`npm i -g pm2`) (`pm2 startup` para subir junto com o servidor).
6. Nginx como proxy reverso para `127.0.0.1:3000`; certificado com `certbot --nginx`.
7. Clonar o repositório em `/srv/dcerutti` e criar o `.env` de produção (permissão `600`).

### Deploy (a cada versão)

Arquivos prontos em [deploy/](../deploy/): `ecosystem.config.cjs` (PM2, um processo), `nginx.conf` (proxy reverso), `deploy.sh` e `backup-mysql.sh`.

```bash
# primeira vez
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
npm run criar-gestor
# a cada versão
bash deploy/deploy.sh      # git pull → npm ci → migrate deploy → build → pm2 reload
```

Evolução natural: um workflow do GitHub Actions que conecta por SSH e executa esses passos a cada push na branch `main`.

### Backup

- `deploy/backup-mysql.sh` via `cron` (3h da manhã): `mysqldump --single-transaction` compactado e enviado com `rclone` para um bucket R2 **separado** (`dcerutti-backups`).
- Retenção sugerida: 7 diários + 4 semanais + 3 mensais.
- Testar a restauração em ambiente local pelo menos uma vez por mês.
- Se o provedor oferecer snapshot da VPS, ativar também (não substitui o dump).

### Monitoramento

- `pm2 logs` e `pm2 monit` para a aplicação; logs do Nginx em `/var/log/nginx`.
- Rotação de logs: `pm2 install pm2-logrotate`.
- Aviso de site fora do ar: UptimeRobot ou similar (gratuito), checando a página `/entrar`.

> Hospedagem compartilhada comum (só PHP + MySQL) **não serve**: Next.js precisa de Node.js rodando continuamente.

## Checklist de produção

- [ ] `BETTER_AUTH_SECRET` forte e exclusivo do ambiente
- [ ] Usuário MySQL da aplicação sem privilégios globais
- [ ] Backup diário testado (restaurar pelo menos uma vez)
- [ ] CORS do bucket R2 liberado para o domínio do site
- [ ] Domínio com HTTPS (Certbot com renovação automática)
- [ ] Firewall ativo, porta 3306 fechada, SSH só por chave
- [ ] `catalogo_publico = false` em `configuracao`
- [ ] Gestor inicial criado e senha trocada
- [ ] `configuracao` preenchida: WhatsApp da loja, CEPs do condicional
