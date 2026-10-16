-- CPF da cliente (opcional), gravado com a máscara 000.000.000-00.
ALTER TABLE `cliente` ADD COLUMN `cpf` CHAR(14) NULL;
CREATE INDEX `cliente_cpf_idx` ON `cliente`(`cpf`);
