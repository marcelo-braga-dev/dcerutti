-- Vídeos dos produtos (D-29).
-- CreateTable
CREATE TABLE `produto_video` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produtoId` INTEGER NOT NULL,
    `url` TEXT NOT NULL,
    `capa` TEXT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,

    INDEX `produto_video_produtoId_ordem_idx`(`produtoId`, `ordem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `produto_video` ADD CONSTRAINT `produto_video_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
