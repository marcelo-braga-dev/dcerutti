# Histórico de versões

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
- Testes de unidade (Vitest) e ponta a ponta (Playwright); CI no GitHub Actions.
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
