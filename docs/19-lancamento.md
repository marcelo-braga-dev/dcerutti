# 19 · Lançamento: o que falta estruturalmente

Análise de 08/10/2026 · Marcelo. Tudo abaixo foi conferido no servidor, no banco, no DNS e no código nesta data. Substitui a lista de bloqueadores do [17 · Go-live](17-go-live.md), que fica como histórico.

## Veredito

O **software está pronto** para lançar: os 40 itens da auditoria foram resolvidos, as decisões da loja aplicadas (D-14), 24 testes ponta a ponta e 36 de unidade passando, sem reinício por memória e com respostas entre 40 e 110 ms.

O que falta é **estrutura de produção**: o domínio definitivo ainda serve o ambiente de teste, as fotos reais não estão mais no servidor, o e-mail não está ligado, o `www` dá erro de certificado e o código não foi publicado. São 8 bloqueadores. Cerca de 4 a 5 dias de trabalho técnico, mais as tarefas da loja (estoque, fotos que faltam, textos e equipe) em paralelo. A virada em **28/10/2026** continua viável se o item L-01 começar já.

## O que mudou desde 07/10

| Antes (doc 17) | Agora |
| --- | --- |
| B-01 Painel sem teste logado | ✅ 24 testes ponta a ponta (gestor, vendedor, cliente, celular) em banco isolado |
| B-02 Reinícios por memória | ✅ Nenhum desde a correção. Os 7 reinícios em 15 h foram os `reload` dos deploys; o app usa ~226 MB |
| B-03 Recuperação de senha | 🟡 Código pronto e testado; falta ligar o e-mail (L-04) |
| B-07 LGPD | 🟡 Aceite, exclusão de conta e política publicados; o texto ainda é minuta (L-08) |
| B-09 Decisões de negócio | ✅ D-14: expiração em 7 dias, venda na loja com peças, frete e parcelamento a combinar, gestor fora da carteira |
| B-10 App como root | ✅ Usuário `dcerutti`, Node em `/opt/node-22` (ver L-12: falta ensaiar o reboot) |
| Auditoria de bugs e usabilidade | ✅ 40 de 40 itens |

## Bloqueadores

Sem estes, não abrir para clientes.

| # | Bloqueador | Evidência (08/10) | O que fazer | Esforço | Quem |
| --- | --- | --- | --- | --- | --- |
| L-01 | **Fotos reais não estão mais no servidor** | O ambiente de teste foi reduzido a 112 fotos repetidas; os arquivos originais foram apagados. A única fonte é o dump de 30/09 (2.415 URLs da Hering), que seria apagado pela rotina de 7 dias e foi **copiado** para `/var/backups/dcerutti/preservado/`. Em 02/10, 235 dessas URLs já davam 404 | No banco de produção: importar o catálogo com as URLs originais e rodar `npm run fotos:migrar -- --remover-quebradas` o quanto antes (a Hering apaga fotos com o tempo). Depois, a loja fotografa o que ficar sem foto | 0,5 dia + loja | Dev, depois loja |
| L-02 | **O domínio definitivo serve o ambiente de teste** | Banco `dcerutti` com 24 clientes fictícios, 48 sessões, 2 pedidos, estoque e fotos de teste; `CLAUDE.md` libera build e reload livres aqui | Criar banco de produção novo (migrations + catálogo + fotos de L-01 + estoque de L-03 + gestor real). Mover o teste para `teste.dcerutti.com.br` com banco, `.env`, porta e processo PM2 próprios. Atualizar `CLAUDE.md` e a memória do projeto | 1 dia | Dev |
| L-03 | **Estoque não é o real** | 1.162 tamanhos, 1.482 peças, todos do protótipo (P-05) | Contagem ou planilha da loja, importada no banco de produção. Combinar a rotina: toda venda no balcão entra como "Venda na loja" com peças, senão o site vende o que não tem | 1–2 dias | Loja + dev |
| L-04 | **E-mail desligado** | `SMTP_URL` ausente no `.env`: o link de "Esqueci a senha" vai para o log. O domínio já tem e-mail na hospedaqui (MX `mail.dcerutti.com.br`, SPF `-all` só com esse servidor, DMARC `p=quarantine`) | Criar a caixa `nao-responda@dcerutti.com.br` na hospedagem de e-mail e usar o SMTP dela (o SPF já cobre). Com outro provedor, incluir o provedor no SPF e configurar DKIM, senão o DMARC manda tudo para spam. Testar o envio real para Gmail e Outlook | 0,5 dia | Dev + quem administra o e-mail |
| L-05 | **`https://www.dcerutti.com.br` dá erro de certificado** | O Nginx atende `www`, mas o certificado só cobre `dcerutti.com.br`; o navegador mostra alerta de segurança | Reemitir o Let's Encrypt com os dois nomes no aaPanel e redirecionar `www` → domínio principal | 15 min | Dev |
| L-06 | **Segredos de teste** | A senha do banco circulou em conversa; o `BETTER_AUTH_SECRET` é o do teste; o usuário `dcerutti` do MariaDB tem `ALL PRIVILEGES` e acesso também ao banco de teste | Produção com usuário de banco novo (só `SELECT/INSERT/UPDATE/DELETE`; outro, com `ALTER`, para migrations), senha nova e `BETTER_AUTH_SECRET` novo | 0,5 dia | Dev |
| L-07 | **Código não publicado** | A branch tem 26 commits à frente da `main`, que no GitHub é de 27/09; o CI nunca rodou | Push (token com escopo `workflow`), pull request, CI verde, merge. Produção sempre por `deploy/deploy.sh` a partir da `main` | 0,5 dia | Marcelo (token) + dev |
| L-08 | **Dados e textos da loja** | Tabela `configuracao` vazia: vale o WhatsApp padrão do protótipo (49 98803-6499) e nenhum vendedor padrão. A política de privacidade está marcada como minuta. Equipe é a de teste (1 gestor, 3 vendedores) | Loja aprova a política; gestor real criado com `npm run criar-gestor`; vendedores reais com WhatsApp completo; Configurações salvas (WhatsApp, vendedor padrão, CEPs, prazo de expiração) | 0,5 dia | Loja + gestor |

## Importante antes de abrir

Não impedem a abertura sozinhos, mas são baratos e fecham riscos reais.

| # | Item | Evidência | O que fazer | Esforço |
| --- | --- | --- | --- | --- |
| L-09 | Sem cópia fora do servidor | Dumps diários só em `/var/backups` no mesmo disco; o script ainda chama o R2 (`rclone`), que foi abandonado; `armazenamento/` (as fotos) sem backup nenhum | Rever a decisão "sem backup externo" antes de ter clientes reais. O mínimo: cópia diária do dump **e** de `armazenamento/` para fora do servidor (outro provedor, Google Drive via rclone ou backup do aaPanel para nuvem) e um teste de restauração. Tirar a referência ao R2 do script | 0,5 dia |
| L-10 | Ninguém fica sabendo se o site cair | Não há monitor externo nem rastreamento de erros; `/api/saude` existe e responde | UptimeRobot ou Better Stack em `/api/saude` com alerta para o celular; Sentry (plano grátis) ou alerta por e-mail dos erros do log | 0,5 dia |
| L-11 | Portas e banco expostos | Firewall libera FTP (20, 21, 39000–40000), aaPanel (888, 887, 10823) para qualquer IP. O MariaDB escuta em `0.0.0.0:3306` (o firewall bloqueia, mas é uma camada só) | Fechar FTP; aaPanel só por IP fixo ou túnel SSH; `bind-address = 127.0.0.1` no MariaDB | 1 h |
| L-12 | Reboot nunca ensaiado | O serviço `pm2-dcerutti` está habilitado mas **inativo** (o PM2 foi iniciado à mão); o PATH da unit ainda inclui `/root/.nvm`; um PM2 antigo do root continua rodando desde 27/09 (só com o logrotate) | Em uma janela combinada: parar o PM2 do root e desabilitar `pm2-root`, iniciar pelo `systemctl start pm2-dcerutti`, reiniciar o servidor e conferir que o site volta sozinho | 1 h |
| L-13 | Pedido novo sem aviso ao vendedor | O vendedor só sabe do pedido se o cliente terminar o envio no WhatsApp. Se o cliente fechar a aba, o pedido fica no painel sem ninguém ver e expira em 7 dias | E-mail ao vendedor a cada pedido novo (usa o L-04) e um contador de pendentes no menu do painel | 0,5 dia |

## Primeiro mês

- **Verificação de e-mail no cadastro.** Hoje um e-mail digitado errado impede a cliente de recuperar a senha. Better Auth já tem o fluxo; depende do L-04.
- **Registro de auditoria** (quem, quando, o quê) para preço, custo, senha, configurações e cancelamentos.
- **Testes ponta a ponta no CI.** O CI roda lint, tipos, unidade e build, mas não o Playwright.
- **Deploy sem interrupção e com volta.** O build sobrescreve a `.next` em uso; fazer build em pasta separada e troca atômica, com retorno à versão anterior em um comando.
- **Dependências.** `npm audit` aponta 4 alertas "high" em produção: 3 vêm da ferramenta de linha de comando do Prisma (resolve com Prisma 7) e 1 do `source-map-js` (resolve com `npm audit fix`). Nenhum é explorável pelo site.
- **Direito de uso das fotos da Hering.** Fotos de produto são da Hering; como revendedora a loja costuma poder usá-las, mas vale confirmar com o representante.

## Plano até 28/10

| Período | Frente técnica | Frente da loja |
| --- | --- | --- |
| 08–10/10 | **L-01 primeiro** (fotos da Hering somem com o tempo), L-05, L-11, L-07 | Começar a contagem de estoque (L-03); revisar a política (L-08) |
| 13–17/10 | L-02 banco e ambiente de produção, L-06 segredos, L-04 e-mail, L-09 backup, L-10 monitor | Fotografar produtos sem foto; lista da equipe real |
| 20–22/10 | L-13 aviso de pedido, L-12 ensaio de reboot, importação do estoque real | Entregar estoque e textos aprovados |
| **23/10** | **Ensaio geral** no banco de produção ainda fechado: gestor, vendedor e cliente reais, do cadastro ao fechamento, inclusive "Esqueci a senha" | Gestor e vendedores participam |
| **28/10** | **Virada** | Vendedores enviam o link de convite |

## Checklist do dia da virada

- [ ] `main` com CI verde e `deploy/deploy.sh` rodado no ambiente de produção
- [ ] Banco de produção: catálogo com fotos reais, estoque real, sem contas, pedidos nem sessões de teste
- [ ] `.env` de produção: segredos novos, `SMTP_URL` e `EMAIL_REMETENTE`, usuário de banco restrito
- [ ] Certificado com `www`; `http` e `www` redirecionam para `https://dcerutti.com.br`
- [ ] Gestor real criado; vendedores reais com WhatsApp; Configurações salvas
- [ ] Política de privacidade aprovada (sem a marca de minuta)
- [ ] E-mail de "Esqueci a senha" chegou na caixa de entrada (não no spam)
- [ ] Monitor externo ativo e alerta testado; backup externo do dia conferido
- [ ] Um pedido e um condicional reais, do cadastro à confirmação no painel
- [ ] Ambiente de teste em `teste.dcerutti.com.br`; `CLAUDE.md` e memória do projeto dizendo que `dcerutti.com.br` é produção
