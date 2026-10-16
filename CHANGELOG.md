# Histórico de versões

## Não lançado (main em 10/10/2026)

Preparação para a produção, prevista para 28/10/2026. Detalhes em [19 · Lançamento](docs/19-lancamento.md), [18 · Auditoria](docs/18-auditoria.md) e [16 · Plano de atualizações](docs/16-plano-de-atualizacoes.md).

### Segurança e servidor
- Limite de tentativas no login, redirecionamento seguro, cabeçalhos de segurança e seed protegido.
- App roda como o usuário de sistema `dcerutti`, sem root; Nginx com limite por IP nas rotas de conta.
- Senhas com mínimo de 8 caracteres; trocar a senha encerra as outras sessões.
- Banco com chaves estrangeiras e MariaDB 10.11 em todos os ambientes.
- Scripts para criar o banco de produção com usuários separados (app e migrations) e montar o catálogo com as fotos originais.

### Loja e painel
- Caixa da loja física em `/caixa` (D-23): busca por código e filtros, descontos com limite, cliente opcional com cadastro rápido, cupom, Pix/débito/crédito/dinheiro com troco e pagamento dividido, comprovante e fechamento pelo WhatsApp, vendas do dia.
- Favoritos (coração, aba em Minha conta, visíveis na ficha), "Comprar de novo", gaveta ao pôr na sacola, resumo em Minha conta e "Mostrar senha" (D-22).
- Loja revista (D-21): busca com sugestões e menu no celular; filtros com contagem real, grupos, faixas de preço, chips e gaveta no celular; um card por modelo com as cores; página do produto com seletor de cores, tela cheia e barra fixa; home nova com banner, confiança, categorias e vitrines; rodapé completo e WhatsApp flutuante.
- Cartão do pedido na prévia do link (D-20): link público assinado; o WhatsApp mostra a imagem do carrinho com fotos, tamanhos e total; ao tocar, as peças em tamanho grande, sem login e sem dados pessoais.
- Envio do pedido no WhatsApp (D-19): mensagem nova com saudação, peças em blocos, resumo e link do pedido para o vendedor; prévia da mensagem na sacola; tela final com abrir de novo e copiar a mensagem; links por `api.whatsapp.com`, que não estragam os emojis.
- Histórico do cliente (D-18, [21](docs/21-historico-do-cliente.md)): páginas, peças, buscas, tamanhos, sacola e acessos das clientes; card "Interesse e acesso" e linha do tempo na ficha; tela Interesse; clientes interessados no painel; aviso por e-mail de sacola parada.
- Recuperação de senha por e-mail; aviso por e-mail ao vendedor quando um pedido entra ou é cancelado.
- LGPD: política de privacidade, aceite registrado e exclusão da própria conta.
- Correções da auditoria de bugs e usabilidade (40 itens): sacola no celular, totais iguais em todas as telas, condicional parcial, cancelamento pela cliente, condicional montado pelo vendedor.
- Decisões D-14: pedidos pendentes expiram em 7 dias, venda na loja com peças, frete e parcelamento a combinar, gestor fora da carteira de clientes.
- Edição das peças de um pedido pendente.
- Exclusão completa de produto, com as fotos em disco.

### Fotos e dados
- Fotos no próprio servidor em vez do R2 (D-13), com cache das fotos originais da Hering.
- Backup diário inclui as fotos e pode enviar uma cópia externa (`BACKUP_REMOTO`, rclone).

### Testes e CI
- Seed completo, que popula todas as tabelas e variações.
- 299 testes: 65 de unidade, 171 de integração contra MariaDB e 63 ponta a ponta.
- CI no GitHub Actions ativo: lint, tipos, unidade, migrations, build, integração e ponta a ponta.

### Dependências
- Next 16.4.0, React 19.3.0, Better Auth 1.7.7.

## 0.1.0 — 2026-09-27

Primeira versão do sistema, substituindo o protótipo (`prototipo/index.html` e `prototipo/loja.html`).

### Loja
- Catálogo privado com login; cadastro de cliente com link de convite do vendedor.
- Página inicial, catálogo com filtros na URL (gênero, categoria, tamanho, promoção, Imperdível, estação, marca, estoque), busca sem acento e "Carregar mais".
- Página de produto com galeria, tamanhos, estoque do tamanho e relacionados.
- Sacola no navegador; envio de pedido ou condicional pelo WhatsApp do vendedor, com imagem do pedido.
- "Minha conta" com o histórico de pedidos.

### Painel
- Resumo com metas, ranking e link de convite.
- Pedidos com abas por status; confirmação de condicional peça a peça; cancelamento.
- Seleção de peças montada pelo vendedor e enviada ao cliente.
- Clientes, venda manual e vendas por mês.
- Gestor: resultados (faturamento, custo, lucro, margem), produtos e custos, estoque com histórico, vendedores e metas mensais, configurações da loja.

### Dados e infraestrutura
- MySQL + Prisma; importação dos 583 produtos e custos do protótipo.
- Autenticação com Better Auth; permissões por papel no servidor.
- Testes de unidade (Vitest) e ponta a ponta (Playwright); workflow de CI pronto (ativado depois, ver acima).
- Arquivos de implantação para VPS (PM2, Nginx, deploy e backup).

### Corrigido em relação ao protótipo
- Dados compartilhados no servidor, em vez de ficarem no navegador de cada pessoa.
- Custos e margens não são mais enviados a clientes e vendedores.
- Senhas com hash e login verificado no servidor.
- Datas no fuso de São Paulo (vendas depois das 21h caíam no dia ou no mês seguinte).
- Códigos de pedido sequenciais (antes, um código repetido fazia o pedido ser descartado sem aviso).
- Estoque baixa na venda e é reservado no condicional.
- Condicional registra como venda só o que o cliente ficou.
- Desativar um vendedor exige transferir os clientes dele.
- Frete exibido igual na sacola e na mensagem.
