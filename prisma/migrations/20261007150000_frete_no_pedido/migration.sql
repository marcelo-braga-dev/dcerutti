-- Q-01: frete gravado no pedido, para sacola, WhatsApp, painel e Minha conta mostrarem o mesmo total.
ALTER TABLE `pedido` ADD COLUMN `frete` DECIMAL(10, 2) NOT NULL DEFAULT 0;
