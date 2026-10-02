-- AlterTable
ALTER TABLE `configuracao` MODIFY `valor` JSON NOT NULL;

-- AlterTable
ALTER TABLE `produto` MODIFY `destaques` JSON NULL;

-- CreateIndex
CREATE INDEX `movimento_estoque_pedidoId_idx` ON `movimento_estoque`(`pedidoId`);

-- CreateIndex
CREATE INDEX `movimento_estoque_usuarioId_idx` ON `movimento_estoque`(`usuarioId`);

-- AddForeignKey
ALTER TABLE `movimento_estoque` ADD CONSTRAINT `movimento_estoque_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimento_estoque` ADD CONSTRAINT `movimento_estoque_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `venda_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

