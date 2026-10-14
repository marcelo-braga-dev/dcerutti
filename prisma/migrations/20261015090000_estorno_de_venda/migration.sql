-- Venda desfeita: cancelar um pedido confirmado devolve as peças ao estoque com o motivo "estorno".
-- AlterTable
ALTER TABLE `movimento_estoque` MODIFY `motivo` ENUM('entrada', 'ajuste', 'venda', 'estorno') NOT NULL;

