# 15 · Operação e suporte

Tarefas de manutenção do sistema em produção (VPS, [D-10](10-decisoes.md)). A instalação está em [Ambiente e deploy](07-ambiente-e-deploy.md).

## Rotina

| Quando | O que | Como |
|---|---|---|
| Todo dia (automático) | Backup do banco | `deploy/backup-mysql.sh` no `cron` |
| Toda semana | Conferir se os backups estão chegando | `ls -lh /var/backups/dcerutti` e o bucket `dcerutti-backups` |
| Todo mês | Testar a restauração de um backup | ver abaixo |
| A cada versão | Publicar | `bash deploy/deploy.sh` |
| Sempre que precisar | Ver erros | `bash deploy/pm2.sh logs dcerutti --lines 200` |

## Tarefas comuns

### Publicar uma nova versão
```bash
cd /srv/dcerutti && bash deploy/deploy.sh
```
O script para no primeiro erro. Atenção: o build reescreve a pasta `.next` enquanto a versão atual ainda está rodando, então o site pode ficar instável por 1 a 2 minutos. Publique fora do horário de movimento. Se o build falhar, volte para a versão anterior (abaixo) e rode o build de novo.

### Voltar para a versão anterior
```bash
cd /srv/dcerutti
git log --oneline -5
git checkout <commit-anterior>
bash deploy/deploy.sh   # tudo como o usuário dcerutti (B-10)
```
Se a versão nova tinha migration de banco, restaure também o backup anterior a ela.

### Restaurar um backup
```bash
gunzip -c /var/backups/dcerutti/dcerutti-AAAA-MM-DD.sql.gz | mysql dcerutti
bash deploy/pm2.sh reload dcerutti   # limpa o cache do catálogo
```
Para testar sem risco, restaure num banco temporário (`CREATE DATABASE dcerutti_teste;` e `mysql dcerutti_teste`).

### Criar o primeiro gestor (ou mais um)
```bash
cd /srv/dcerutti && npm run criar-gestor
```

### Redefinir senha
Pelo painel: o gestor abre o vendedor ou o cliente e preenche **Nova senha**. O próprio gestor que esqueceu a senha precisa de outro gestor, ou de um novo gestor criado com `npm run criar-gestor`.

### Alguém não consegue entrar
1. O e-mail está certo? (O login não diferencia maiúsculas.)
2. A pessoa está **ativa**? Vendedor inativo aparece como "Inativo" em *Vendedores*.
3. Redefina a senha pelo painel.

### Catálogo mostrando dados antigos
Mudanças pelo painel aparecem na hora. Mudanças feitas direto no banco levam até 5 minutos; para aplicar na hora, rode `bash deploy/pm2.sh reload dcerutti`.

### Reimportar o catálogo do protótipo
```bash
npm run db:importar-prototipo -- --forcar
```
⚠️ Sobrescreve preços, fotos e **estoque** dos produtos existentes com os dados do protótipo. Não use em produção depois que a loja começar a operar.

### Consultas úteis (MySQL)
```sql
-- pedidos pendentes há mais de 7 dias
SELECT codigo, nomeCliente, criadoEm FROM pedido WHERE status = 'pendente' AND criadoEm < NOW() - INTERVAL 7 DAY;

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
| Fotos quebradas na loja | Servidor de imagens fora do ar ou host não permitido | Conferir a URL; hosts aceitos em `src/lib/imagens.ts` |
| Imagem do pedido sem fotos | Otimizador recusando a requisição | Ver `bash deploy/pm2.sh logs dcerutti`; a URL de otimização deve usar `q=75` |
| "Estoque insuficiente" ao confirmar | Peça vendida por outro canal | Ajustar o estoque no produto e confirmar de novo |
| Links de convite com `localhost` | `NEXT_PUBLIC_SITE_URL` ausente no `.env` de produção | Definir o domínio e refazer o build |
| Sessão cai o tempo todo | `BETTER_AUTH_URL` diferente do domínio real | Corrigir o `.env` e `bash deploy/pm2.sh reload dcerutti` |

## Segurança

- `.env` com permissão `600`, fora do Git.
- MySQL só em `127.0.0.1`; porta 3306 fechada no firewall.
- O usuário MySQL da aplicação tem acesso apenas ao banco `dcerutti`.
- Senhas guardadas com hash (scrypt) pelo Better Auth.
- Ao desligar alguém da equipe, **desative** o vendedor: as sessões dele são encerradas na hora.
