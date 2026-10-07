-- C-03: frete NULL = a combinar (até a loja definir a regra). Pedidos antigos com 0 continuam "grátis".
ALTER TABLE `pedido` MODIFY `frete` DECIMAL(10, 2) NULL;
-- Q-05: motivo do cancelamento (equipe, cliente, expirado).
ALTER TABLE `pedido` ADD COLUMN `motivoCancelamento` VARCHAR(20) NULL;
-- Q-04: venda feita no balcão da loja física, com peças.
ALTER TABLE `pedido` MODIFY `origem` ENUM('loja', 'vendedor', 'balcao') NOT NULL;
