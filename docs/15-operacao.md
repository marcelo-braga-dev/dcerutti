# 15 · Operação e suporte

Tarefas de manutenção do sistema no servidor (VPS, [D-10](10-decisoes.md)). A instalação está em [Ambiente e deploy](07-ambiente-e-deploy.md). Os comandos rodam na raiz do projeto (`/www/wwwroot/dcerutti/site`); como root, sempre pelos atalhos `deploy/app.sh` e `deploy/pm2.sh`.

> Hoje o banco é `dcerutti` (ambiente de teste). Depois da virada de 28/10, a produção usa `dcerutti_producao`: troque o nome do banco nos comandos abaixo.

## Rotina

| Quando | O que | Como |
|---|---|---|
| Todo dia (automático) | Backup do banco e das fotos | `deploy/backup-mysql.sh` no `cron` |
| Toda hora (automático) | Histórico do cliente: apagar o que passou de 12 meses e avisar sacolas paradas | `npm run historico:manutencao` no `cron` ([21](21-historico-do-cliente.md)); o site também roda sozinho, no máximo uma vez por hora |
| Toda semana | Conferir se os backups estão chegando | `ls -lh /var/backups/dcerutti`, `tail /var/log/dcerutti-backup.log` e o destino de `BACKUP_REMOTO` |
| Sempre (automático) | Saber se o site caiu | Monitor externo em `/api/saude` (L-10) |
| Todo mês | Testar a restauração de um backup | ver abaixo |
| A cada versão | Publicar, depois do CI verde no GitHub | `bash deploy/deploy.sh` |
| Sempre que precisar | Ver erros | `bash deploy/pm2.sh logs dcerutti --lines 200` |

## Tarefas comuns

### Publicar uma nova versão
```bash
bash deploy/deploy.sh
```
O script para no primeiro erro. Atenção: o build reescreve a pasta `.next` enquanto a versão atual ainda está rodando, então o site pode ficar instável por 1 a 2 minutos. Publique fora do horário de movimento. Se o build falhar, volte para a versão anterior (abaixo) e rode o build de novo.

### Voltar para a versão anterior
```bash
git log --oneline -5
bash deploy/app.sh git checkout <commit-anterior>   # como dcerutti, para não mudar o dono dos arquivos
bash deploy/app.sh env NODE_OPTIONS=--max-old-space-size=1536 npm run build
bash deploy/pm2.sh reload dcerutti
```
O `deploy.sh` faz `git pull`, então não serve para voltar: use os comandos acima e, depois de corrigir, volte para a `main`.
Se a versão nova tinha migration de banco, restaure também o backup anterior a ela.

### Restaurar um backup
```bash
gunzip -c /var/backups/dcerutti/dcerutti-AAAA-MM-DD.sql.gz | mysql dcerutti
# fotos (extrai a pasta armazenamento/ no diretório indicado):
tar -xf /var/backups/dcerutti/dcerutti-fotos-AAAA-MM-DD.tar -C /www/wwwroot/dcerutti/site
bash deploy/pm2.sh reload dcerutti   # limpa o cache do catálogo
```
Para testar sem risco, restaure num banco temporário (`CREATE DATABASE dcerutti_teste;` e `mysql dcerutti_teste`).

### Criar o primeiro gestor (ou mais um)
```bash
bash deploy/app.sh npm run criar-gestor     # pergunta nome, e-mail e senha (aceita as respostas por pipe)
```

### Redefinir senha
Pelo painel: o gestor abre o vendedor ou o cliente e preenche **Nova senha**. O próprio gestor que esqueceu a senha precisa de outro gestor, ou de um novo gestor criado com `npm run criar-gestor`.

### Alguém não consegue entrar
1. O e-mail está certo? (O login não diferencia maiúsculas.)
2. A pessoa está **ativa**? Vendedor inativo aparece como "Inativo" em *Vendedores*.
3. Errou a senha muitas vezes? Depois de 5 senhas erradas no mesmo e-mail, o login fica bloqueado por até 15 minutos. Um `reload` do PM2 zera os bloqueios.
4. Use "Esqueci a senha" ou redefina a senha pelo painel.

### E-mail não chega (recuperação de senha, avisos de pedido)
1. `bash deploy/pm2.sh logs dcerutti --lines 200`: "SMTP_URL ausente" = o `.env` não tem SMTP; outro erro = credencial ou servidor de e-mail.
2. Peça para conferir a caixa de spam. SPF e DMARC do domínio ficam na hospedagem de e-mail.
3. Enquanto isso, o gestor redefine a senha pelo painel.

### Catálogo mostrando dados antigos
Mudanças pelo painel aparecem na hora. Mudanças feitas direto no banco levam até 5 minutos; para aplicar na hora, rode `bash deploy/pm2.sh reload dcerutti`.

### Reimportar o catálogo do protótipo
```bash
npm run db:importar-prototipo -- --forcar
```
⚠️ Sobrescreve preços, fotos e **estoque** dos produtos existentes com os dados do protótipo. Não use em produção depois que a loja começar a operar.

### Consultas úteis (MariaDB)
```sql
-- pedidos expirados sozinhos nos últimos 30 dias (D-14)
SELECT codigo, nomeCliente, criadoEm, canceladoEm FROM pedido WHERE motivoCancelamento = 'expirado' AND canceladoEm > NOW() - INTERVAL 30 DAY;

-- pendentes mais antigos (a expiração cancela os que passam do prazo quando a equipe abre o painel)
SELECT codigo, nomeCliente, criadoEm FROM pedido WHERE status = 'pendente' ORDER BY criadoEm LIMIT 20;

-- peças reservadas em condicionais
SELECT p.referencia, v.tamanho, v.estoque, v.reservado FROM variante v JOIN produto p ON p.id = v.produtoId WHERE v.reservado > 0;

-- conferir se a reserva bate com os condicionais pendentes
SELECT i.varianteId, SUM(i.quantidade) AS reservado_pelos_pedidos, v.reservado
FROM pedido_item i JOIN pedido p ON p.id = i.pedidoId JOIN variante v ON v.id = i.varianteId
WHERE p.tipo = 'condicional' AND p.status = 'pendente'
GROUP BY i.varianteId, v.reservado HAVING SUM(i.quantidade) <> v.reservado;
```

## Problemas conhecidos e soluções

| Sintoma | Causa provável | Solução |
|---|---|---|
| Build morre com código 137 | Falta de memória | Criar swap (`fallocate -l 2G /swapfile`…) ou rodar o build com menos coisas abertas |
| Fotos quebradas na loja | Arquivo ausente em `armazenamento/` (pasta não restaurada, `ARMAZENAMENTO_DIR` errado) ou foto ainda apontando para a Hering | Conferir a pasta e o `.env`; rodar `npm run fotos:migrar` para trazer as externas |
| "Foto acima de 8 MB" ou erro 413 no upload | Limite do app (8 MB) ou do Nginx (10 MB) | Reduzir a foto no celular antes de enviar |
| Imagem do pedido sem fotos | Otimizador recusando a requisição | Ver `bash deploy/pm2.sh logs dcerutti`; a URL de otimização deve usar `q=75` |
| "Estoque insuficiente" ao confirmar | Peça vendida por outro canal | Ajustar o estoque no produto e confirmar de novo |
| Links de convite com `localhost` | `NEXT_PUBLIC_SITE_URL` ausente no `.env` de produção | Definir o domínio e refazer o build |
| Sessão cai o tempo todo | `BETTER_AUTH_URL` diferente do domínio real | Corrigir o `.env` e `bash deploy/pm2.sh reload dcerutti` |
| App não grava fotos ou não sobe depois de um comando | Arquivos com dono root | `chown -R dcerutti:dcerutti /www/wwwroot/dcerutti/site` (menos o `.user.ini`, protegido pelo aaPanel) |
| `/api/saude` responde 503 | Banco fora do ar ou credencial errada | `systemctl status mariadb`; conferir `DATABASE_URL` |
| Muitos 429 nas telas de conta | Limite do Nginx (20 por minuto por IP) | Normal sob ataque; se for a rede da loja, rever `deploy/nginx.conf` |

## Segurança

- `.env` com permissão `600`, fora do Git.
- MariaDB só em `127.0.0.1` e porta 3306 fechada no firewall (L-11, a aplicar).
- Na produção, o site usa um usuário de banco só com leitura e escrita de dados; as migrations usam outro (D-15).
- Dumps de backup só o root lê; o app roda como `dcerutti`, sem root.
- Senhas guardadas com hash (scrypt) pelo Better Auth.
- Ao desligar alguém da equipe, **desative** o vendedor: as sessões dele são encerradas na hora.
