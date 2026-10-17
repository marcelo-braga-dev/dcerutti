-- D-27: a mala direta saiu (as vendas são direcionadas, cliente a cliente). Entram os lembretes do carrinho e o aviso de carrinho vencendo.
-- DropForeignKey
ALTER TABLE `campanha` DROP FOREIGN KEY `campanha_criadaPorId_fkey`;

-- DropForeignKey
ALTER TABLE `sugestao` DROP FOREIGN KEY `sugestao_campanhaId_fkey`;

-- DropIndex
DROP INDEX `sugestao_campanhaId_idx` ON `sugestao`;

-- AlterTable
ALTER TABLE `notificacao` MODIFY `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova', 'carrinho_vencendo') NOT NULL;

-- AlterTable
ALTER TABLE `sugestao` DROP COLUMN `campanhaId`,
    ADD COLUMN `lembradoEm` DATETIME(3) NULL,
    ADD COLUMN `lembretes` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `campanha`;
