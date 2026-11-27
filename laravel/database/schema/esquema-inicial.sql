
/*!50503 SET NAMES utf8mb4 */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accountId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `providerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accessToken` text COLLATE utf8mb4_unicode_ci,
  `refreshToken` text COLLATE utf8mb4_unicode_ci,
  `idToken` text COLLATE utf8mb4_unicode_ci,
  `accessTokenExpiresAt` datetime(3) DEFAULT NULL,
  `refreshTokenExpiresAt` datetime(3) DEFAULT NULL,
  `scope` text COLLATE utf8mb4_unicode_ci,
  `password` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_userId_idx` (`userId`),
  CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `atendimento` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contatoNome` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contatoTelefone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contatoInstagram` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `responsavelId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numeroId` int DEFAULT NULL,
  `canal` enum('whatsapp','instagram','loja','link_peca','vitrine','live','indicacao','outro') COLLATE utf8mb4_unicode_ci NOT NULL,
  `etapa` enum('novo','em_conversa','proposta','aguardando_pagamento','ganho','perdido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'novo',
  `motivoPerda` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proximoContatoEm` datetime(3) DEFAULT NULL,
  `primeiroContatoEm` datetime(3) DEFAULT NULL,
  `ultimoContatoEm` datetime(3) DEFAULT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` datetime(3) NOT NULL,
  `fechadoEm` datetime(3) DEFAULT NULL,
  `aceitouContatoEm` datetime(3) DEFAULT NULL,
  `vitrineId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aceitouOfertasEm` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `atendimento_codigo_key` (`codigo`),
  UNIQUE KEY `atendimento_pedidoId_key` (`pedidoId`),
  KEY `atendimento_responsavelId_fechadoEm_proximoContatoEm_idx` (`responsavelId`,`fechadoEm`,`proximoContatoEm`),
  KEY `atendimento_etapa_criadoEm_idx` (`etapa`,`criadoEm`),
  KEY `atendimento_clienteId_idx` (`clienteId`),
  KEY `atendimento_contatoTelefone_idx` (`contatoTelefone`),
  KEY `atendimento_contatoInstagram_idx` (`contatoInstagram`),
  KEY `atendimento_vitrineId_criadoEm_idx` (`vitrineId`,`criadoEm`),
  CONSTRAINT `atendimento_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `atendimento_responsavelId_fkey` FOREIGN KEY (`responsavelId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `atendimento_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `atendimento_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `atendimentoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `produtoId` int NOT NULL,
  `varianteId` int NOT NULL,
  `quantidade` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `atendimento_item_atendimentoId_varianteId_key` (`atendimentoId`,`varianteId`),
  CONSTRAINT `atendimento_item_atendimentoId_fkey` FOREIGN KEY (`atendimentoId`) REFERENCES `atendimento` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `atendimento_registro` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `atendimentoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('nota','contato_whatsapp','contato_direct','etapa','transferencia','pedido','envio_peca') COLLATE utf8mb4_unicode_ci NOT NULL,
  `texto` text COLLATE utf8mb4_unicode_ci,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `atendimento_registro_atendimentoId_criadoEm_idx` (`atendimentoId`,`criadoEm`),
  KEY `atendimento_registro_usuarioId_fkey` (`usuarioId`),
  CONSTRAINT `atendimento_registro_atendimentoId_fkey` FOREIGN KEY (`atendimentoId`) REFERENCES `atendimento` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `atendimento_registro_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `atividade` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('login','acesso','pagina','produto','busca','filtro','tamanho','sacola','cupom','whatsapp') COLLATE utf8mb4_unicode_ci NOT NULL,
  `caminho` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `produtoId` int DEFAULT NULL,
  `varianteId` int DEFAULT NULL,
  `termo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dados` json DEFAULT NULL,
  `duracaoSeg` int DEFAULT NULL,
  `aparelho` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `atividade_clienteId_criadoEm_idx` (`clienteId`,`criadoEm`),
  KEY `atividade_clienteId_ref_idx` (`clienteId`,`ref`),
  KEY `atividade_clienteId_tipo_produtoId_idx` (`clienteId`,`tipo`,`produtoId`),
  KEY `atividade_produtoId_criadoEm_idx` (`produtoId`,`criadoEm`),
  KEY `atividade_tipo_criadoEm_idx` (`tipo`,`criadoEm`),
  CONSTRAINT `atividade_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `atividade_equipe` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('login','cliente_cadastrado','cliente_editado','pedido_criado','oferta_enviada','pedido_editado','pedido_confirmado','pedido_cancelado','venda_desfeita','venda_balcao','venda_caixa','venda_manual','venda_excluida','cupom_pedido','whatsapp','cupom_enviado','convite_enviado','numero_cadastrado','numero_vinculado','numero_desvinculado','atendimento_criado','atendimento_contato','atendimento_fechado','atendimento_encaminhado','peca_enviada','pos_venda_feito') COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor` decimal(10,2) DEFAULT NULL,
  `descricao` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aparelho` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `numeroId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `atividade_equipe_usuarioId_criadoEm_idx` (`usuarioId`,`criadoEm`),
  KEY `atividade_equipe_tipo_criadoEm_idx` (`tipo`,`criadoEm`),
  KEY `atividade_equipe_criadoEm_idx` (`criadoEm`),
  KEY `atividade_equipe_numeroId_criadoEm_idx` (`numeroId`,`criadoEm`),
  CONSTRAINT `atividade_equipe_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categoria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categoria_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cliente` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendedorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `endereco` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cidade` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cep` char(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preferencias` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ultimoAcessoEm` datetime(3) DEFAULT NULL,
  `ultimoLoginEm` datetime(3) DEFAULT NULL,
  `cpf` char(14) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instagram` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `origem` enum('whatsapp','instagram','loja','link_peca','vitrine','live','indicacao','outro') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aceitaOfertasEm` datetime(3) DEFAULT NULL,
  `descadastradaEm` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cliente_userId_key` (`userId`),
  KEY `cliente_vendedorId_idx` (`vendedorId`),
  KEY `cliente_telefone_idx` (`telefone`),
  KEY `cliente_ultimoAcessoEm_idx` (`ultimoAcessoEm`),
  KEY `cliente_cpf_idx` (`cpf`),
  KEY `cliente_instagram_idx` (`instagram`),
  CONSTRAINT `cliente_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `cliente_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cobranca` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metodo` enum('pix','checkout') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('criada','pendente','aprovada','recusada','expirada','cancelada','estornada','estornada_parcial','contestada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'criada',
  `valor` decimal(10,2) NOT NULL,
  `chave` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mpOrderId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mpPaymentId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `statusMp` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pixCopiaECola` text COLLATE utf8mb4_unicode_ci,
  `checkoutUrl` text COLLATE utf8mb4_unicode_ci,
  `expiraEm` datetime(3) DEFAULT NULL,
  `reservou` tinyint(1) NOT NULL DEFAULT '0',
  `semEstoque` tinyint(1) NOT NULL DEFAULT '0',
  `aprovadaEm` datetime(3) DEFAULT NULL,
  `meio` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipoMeio` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parcelas` int DEFAULT NULL,
  `taxa` decimal(10,2) DEFAULT NULL,
  `valorEstornado` decimal(10,2) NOT NULL DEFAULT '0.00',
  `criadaPorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consultadaEm` datetime(3) DEFAULT NULL,
  `criadaEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadaEm` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cobranca_chave_key` (`chave`),
  UNIQUE KEY `cobranca_mpOrderId_key` (`mpOrderId`),
  KEY `cobranca_pedidoId_status_idx` (`pedidoId`,`status`),
  KEY `cobranca_status_expiraEm_idx` (`status`,`expiraEm`),
  KEY `cobranca_criadaEm_idx` (`criadaEm`),
  CONSTRAINT `cobranca_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracao` (
  `chave` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` json NOT NULL,
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contador` (
  `nome` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('percentual','valor','freteGratis') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) DEFAULT NULL,
  `tetoDesconto` decimal(10,2) DEFAULT NULL,
  `minimoCompra` decimal(10,2) DEFAULT NULL,
  `inicioEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `fimEm` datetime(3) DEFAULT NULL,
  `limiteTotal` int DEFAULT NULL,
  `limitePorCliente` int DEFAULT '1',
  `somentePrimeiraCompra` tinyint(1) NOT NULL DEFAULT '0',
  `valePromocao` tinyint(1) NOT NULL DEFAULT '0',
  `quemAplica` enum('cliente','equipe','ambos') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ambos',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criadoPorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` datetime(3) NOT NULL,
  `diasAposCadastro` int DEFAULT NULL,
  `modelo` tinyint(1) NOT NULL DEFAULT '0',
  `modeloId` int DEFAULT NULL,
  `origem` enum('manual','primeiraCompra','proximaCompra') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `pedidoOrigemId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cupom_codigo_key` (`codigo`),
  KEY `cupom_ativo_inicioEm_idx` (`ativo`,`inicioEm`),
  KEY `cupom_criadoPorId_fkey` (`criadoPorId`),
  KEY `cupom_origem_modelo_idx` (`origem`,`modelo`),
  KEY `cupom_modeloId_idx` (`modeloId`),
  CONSTRAINT `cupom_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `cupom_modeloId_fkey` FOREIGN KEY (`modeloId`) REFERENCES `cupom` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom_categoria` (
  `cupomId` int NOT NULL,
  `categoriaId` int NOT NULL,
  PRIMARY KEY (`cupomId`,`categoriaId`),
  KEY `cupom_categoria_categoriaId_idx` (`categoriaId`),
  CONSTRAINT `cupom_categoria_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cupom_categoria_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom_cliente` (
  `cupomId` int NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`cupomId`,`clienteId`),
  KEY `cupom_cliente_clienteId_idx` (`clienteId`),
  CONSTRAINT `cupom_cliente_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cupom_cliente_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom_marca` (
  `cupomId` int NOT NULL,
  `marcaId` int NOT NULL,
  PRIMARY KEY (`cupomId`,`marcaId`),
  KEY `cupom_marca_marcaId_idx` (`marcaId`),
  CONSTRAINT `cupom_marca_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cupom_marca_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `marca` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom_produto` (
  `cupomId` int NOT NULL,
  `produtoId` int NOT NULL,
  PRIMARY KEY (`cupomId`,`produtoId`),
  KEY `cupom_produto_produtoId_idx` (`produtoId`),
  CONSTRAINT `cupom_produto_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cupom_produto_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `custo` (
  `produtoId` int NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `atualizadoEm` datetime(3) NOT NULL,
  PRIMARY KEY (`produtoId`),
  CONSTRAINT `custo_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evento_pagamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cobrancaId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `origem` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requestId` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mpOrderId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `statusMp` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dados` json DEFAULT NULL,
  `processadoEm` datetime(3) DEFAULT NULL,
  `erro` text COLLATE utf8mb4_unicode_ci,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `evento_pagamento_requestId_key` (`requestId`),
  KEY `evento_pagamento_cobrancaId_criadoEm_idx` (`cobrancaId`,`criadoEm`),
  KEY `evento_pagamento_mpOrderId_idx` (`mpOrderId`),
  KEY `evento_pagamento_criadoEm_idx` (`criadoEm`),
  CONSTRAINT `evento_pagamento_cobrancaId_fkey` FOREIGN KEY (`cobrancaId`) REFERENCES `cobranca` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorito` (
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `produtoId` int NOT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`clienteId`,`produtoId`),
  KEY `favorito_produtoId_idx` (`produtoId`),
  CONSTRAINT `favorito_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `favorito_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `importacao_estoque` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `arquivo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nomeOriginal` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resumo` json NOT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `importacao_estoque_criadoEm_idx` (`criadoEm`),
  KEY `importacao_estoque_usuarioId_fkey` (`usuarioId`),
  CONSTRAINT `importacao_estoque_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `marca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marca_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `meta` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendedorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mes` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `meta_vendedorId_mes_key` (`vendedorId`,`mes`),
  CONSTRAINT `meta_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movimento_estoque` (
  `id` int NOT NULL AUTO_INCREMENT,
  `varianteId` int NOT NULL,
  `delta` int NOT NULL,
  `motivo` enum('entrada','ajuste','venda','estorno') COLLATE utf8mb4_unicode_ci NOT NULL,
  `observacao` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `movimento_estoque_varianteId_criadoEm_idx` (`varianteId`,`criadoEm`),
  KEY `movimento_estoque_pedidoId_idx` (`pedidoId`),
  KEY `movimento_estoque_usuarioId_idx` (`usuarioId`),
  CONSTRAINT `movimento_estoque_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `movimento_estoque_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `movimento_estoque_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `variante` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacao` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('pedido_novo','pedido_cancelado','carrinho_visto','carrinho_respondido','sacola_parada','prazo_vencendo','peca_esgotada','meta_batida','cliente_nova','carrinho_vencendo','numero_alterado','atendimento_novo','retorno_vencendo','pos_venda_hoje','pagamento_aprovado','pagamento_problema') COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `texto` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chave` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lidaEm` datetime(3) DEFAULT NULL,
  `criadaEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notificacao_usuarioId_chave_key` (`usuarioId`,`chave`),
  KEY `notificacao_usuarioId_lidaEm_criadaEm_idx` (`usuarioId`,`lidaEm`,`criadaEm`),
  KEY `notificacao_criadaEm_idx` (`criadaEm`),
  CONSTRAINT `notificacao_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `numero_whatsapp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telefone` varchar(13) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apelido` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ativo','pausado','desativado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ativo',
  `padrao` tinyint(1) NOT NULL DEFAULT '0',
  `observacao` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoPorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_whatsapp_telefone_key` (`telefone`),
  KEY `numero_whatsapp_status_idx` (`status`),
  KEY `numero_whatsapp_criadoPorId_fkey` (`criadoPorId`),
  CONSTRAINT `numero_whatsapp_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `forma` enum('pix','debito','credito','dinheiro','mercado_pago') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `parcelas` int DEFAULT NULL,
  `recebido` decimal(10,2) DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cobrancaId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pagamento_cobrancaId_key` (`cobrancaId`),
  KEY `pagamento_pedidoId_idx` (`pedidoId`),
  KEY `pagamento_forma_criadoEm_idx` (`forma`,`criadoEm`),
  CONSTRAINT `pagamento_cobrancaId_fkey` FOREIGN KEY (`cobrancaId`) REFERENCES `cobranca` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pagamento_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('compra','condicional') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pendente','confirmado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente',
  `origem` enum('loja','vendedor','balcao') COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendedorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nomeCliente` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefoneCliente` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cep` char(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total` decimal(10,2) NOT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `confirmadoEm` datetime(3) DEFAULT NULL,
  `canceladoEm` datetime(3) DEFAULT NULL,
  `frete` decimal(10,2) DEFAULT NULL,
  `motivoCancelamento` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigoCupom` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cupomId` int DEFAULT NULL,
  `descontoCupom` decimal(10,2) NOT NULL DEFAULT '0.00',
  `freteCupom` tinyint(1) NOT NULL DEFAULT '0',
  `numeroId` int DEFAULT NULL,
  `vitrineId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entregaSituacao` enum('a_combinar','separando','enviado','entregue') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a_combinar',
  `pagamentoSituacao` enum('a_combinar','aguardando','pago','estornado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a_combinar',
  PRIMARY KEY (`id`),
  UNIQUE KEY `pedido_codigo_key` (`codigo`),
  KEY `pedido_vendedorId_status_criadoEm_idx` (`vendedorId`,`status`,`criadoEm`),
  KEY `pedido_clienteId_idx` (`clienteId`),
  KEY `pedido_cupomId_status_idx` (`cupomId`,`status`),
  KEY `pedido_numeroId_criadoEm_idx` (`numeroId`,`criadoEm`),
  KEY `pedido_vitrineId_status_idx` (`vitrineId`,`status`),
  CONSTRAINT `pedido_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `pedido_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pedido_numeroId_fkey` FOREIGN KEY (`numeroId`) REFERENCES `numero_whatsapp` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pedido_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `pedido_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido_historico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `acao` enum('criado','editado','confirmado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL,
  `autor` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nomeUsuario` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mudancas` json NOT NULL,
  `itens` json NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `frete` decimal(10,2) DEFAULT NULL,
  `observacao` text COLLATE utf8mb4_unicode_ci,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `pedido_historico_pedidoId_criadoEm_idx` (`pedidoId`,`criadoEm`),
  KEY `pedido_historico_usuarioId_idx` (`usuarioId`),
  CONSTRAINT `pedido_historico_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pedido_historico_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `varianteId` int NOT NULL,
  `produtoId` int NOT NULL,
  `referencia` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `marca` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cor` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `imagem` text COLLATE utf8mb4_unicode_ci,
  `tamanho` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigoInterno` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantidade` int NOT NULL,
  `precoUnitario` decimal(10,2) NOT NULL,
  `custoUnitario` decimal(10,2) DEFAULT NULL,
  `situacao` enum('pendente','vendido','devolvido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente',
  `precoTabela` decimal(10,2) DEFAULT NULL,
  `descontoCupom` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `pedido_item_pedidoId_idx` (`pedidoId`),
  KEY `pedido_item_varianteId_fkey` (`varianteId`),
  CONSTRAINT `pedido_item_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pedido_item_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `variante` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pos_venda_contato` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('entrega','satisfacao','sugestao','reativacao') COLLATE utf8mb4_unicode_ci NOT NULL,
  `venceEm` datetime(3) NOT NULL,
  `feitoEm` datetime(3) DEFAULT NULL,
  `resultado` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_venda_contato_pedidoId_tipo_key` (`pedidoId`,`tipo`),
  KEY `pos_venda_contato_feitoEm_venceEm_idx` (`feitoEm`,`venceEm`),
  KEY `pos_venda_contato_clienteId_tipo_idx` (`clienteId`,`tipo`),
  CONSTRAINT `pos_venda_contato_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pos_venda_contato_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produto` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referencia` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `marcaId` int NOT NULL,
  `categoriaId` int NOT NULL,
  `subcategoria` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `genero` enum('feminino','masculino','unissex') COLLATE utf8mb4_unicode_ci NOT NULL,
  `estacao` enum('inverno','verao') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cor` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `composicao` text COLLATE utf8mb4_unicode_ci,
  `descricao` text COLLATE utf8mb4_unicode_ci,
  `destaques` json DEFAULT NULL,
  `preco` decimal(10,2) NOT NULL,
  `precoCheio` decimal(10,2) NOT NULL,
  `imperdivel` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `linkOrigem` text COLLATE utf8mb4_unicode_ci,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` datetime(3) NOT NULL,
  `fornecedor` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `produto_referencia_key` (`referencia`),
  KEY `produto_ativo_genero_categoriaId_idx` (`ativo`,`genero`,`categoriaId`),
  KEY `produto_marcaId_fkey` (`marcaId`),
  KEY `produto_categoriaId_fkey` (`categoriaId`),
  KEY `produto_fornecedor_idx` (`fornecedor`),
  CONSTRAINT `produto_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `produto_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `marca` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produto_imagem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produtoId` int NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `produto_imagem_produtoId_ordem_idx` (`produtoId`,`ordem`),
  CONSTRAINT `produto_imagem_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produto_video` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produtoId` int NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `capa` text COLLATE utf8mb4_unicode_ci,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `produto_video_produtoId_ordem_idx` (`produtoId`,`ordem`),
  CONSTRAINT `produto_video_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `resposta_pronta` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `texto` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `resposta_pronta_usuarioId_ordem_idx` (`usuarioId`,`ordem`),
  CONSTRAINT `resposta_pronta_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sacola_cliente` (
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itens` json NOT NULL,
  `atualizadoEm` datetime(3) NOT NULL,
  `avisadoEm` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`clienteId`),
  KEY `sacola_cliente_atualizadoEm_idx` (`atualizadoEm`),
  CONSTRAINT `sacola_cliente_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessao_equipe` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inicioEm` datetime(3) NOT NULL,
  `fimEm` datetime(3) NOT NULL,
  `segundos` int NOT NULL DEFAULT '0',
  `aparelho` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessao_equipe_usuarioId_fimEm_idx` (`usuarioId`,`fimEm`),
  KEY `sessao_equipe_inicioEm_idx` (`inicioEm`),
  CONSTRAINT `sessao_equipe_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `token` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `userAgent` text COLLATE utf8mb4_unicode_ci,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_key` (`token`),
  KEY `session_userId_idx` (`userId`),
  CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sugestao` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendedorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mensagem` text COLLATE utf8mb4_unicode_ci,
  `status` enum('enviada','vista','respondida','convertida','cancelada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enviada',
  `validaAte` datetime(3) NOT NULL,
  `criadaEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `vistaEm` datetime(3) DEFAULT NULL,
  `vezesVista` int NOT NULL DEFAULT '0',
  `respondidaEm` datetime(3) DEFAULT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cupomCodigo` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enviadaEm` datetime(3) DEFAULT NULL,
  `lembradoEm` datetime(3) DEFAULT NULL,
  `lembretes` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `sugestao_codigo_key` (`codigo`),
  UNIQUE KEY `sugestao_pedidoId_key` (`pedidoId`),
  KEY `sugestao_vendedorId_criadaEm_idx` (`vendedorId`,`criadaEm`),
  KEY `sugestao_clienteId_criadaEm_idx` (`clienteId`,`criadaEm`),
  CONSTRAINT `sugestao_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sugestao_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sugestao_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sugestaoId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `produtoId` int NOT NULL,
  `varianteId` int DEFAULT NULL,
  `precoOferta` decimal(10,2) DEFAULT NULL,
  `nota` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  `escolha` enum('pendente','quero','talvez','nao') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente',
  `varianteEscolhidaId` int DEFAULT NULL,
  `quantidade` int NOT NULL DEFAULT '1',
  `adicionadoPelaCliente` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `sugestao_item_sugestaoId_idx` (`sugestaoId`),
  CONSTRAINT `sugestao_item_sugestaoId_fkey` FOREIGN KEY (`sugestaoId`) REFERENCES `sugestao` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emailVerified` tinyint(1) NOT NULL DEFAULT '0',
  `image` text COLLATE utf8mb4_unicode_ci,
  `papel` enum('cliente','vendedor','gestor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cliente',
  `telefone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `aceitouPrivacidadeEm` datetime(3) DEFAULT NULL,
  `ultimoAcessoEm` datetime(3) DEFAULT NULL,
  `ultimoLoginEm` datetime(3) DEFAULT NULL,
  `preferenciasNotificacao` json DEFAULT NULL,
  `numeroPrincipalId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_key` (`email`),
  KEY `user_numeroPrincipalId_fkey` (`numeroPrincipalId`),
  CONSTRAINT `user_numeroPrincipalId_fkey` FOREIGN KEY (`numeroPrincipalId`) REFERENCES `numero_whatsapp` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `variante` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produtoId` int NOT NULL,
  `tamanho` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  `estoque` int NOT NULL DEFAULT '0',
  `reservado` int NOT NULL DEFAULT '0',
  `codigoInterno` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ean` varchar(14) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `variante_produtoId_tamanho_key` (`produtoId`,`tamanho`),
  UNIQUE KEY `variante_codigoInterno_key` (`codigoInterno`),
  CONSTRAINT `variante_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `venda` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pedidoId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendedorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clienteId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor` decimal(10,2) NOT NULL,
  `custo` decimal(10,2) DEFAULT NULL,
  `data` datetime(3) NOT NULL,
  `observacao` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `venda_pedidoId_key` (`pedidoId`),
  KEY `venda_vendedorId_data_idx` (`vendedorId`,`data`),
  KEY `venda_clienteId_fkey` (`clienteId`),
  CONSTRAINT `venda_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `venda_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `venda_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verification` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `identifier` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `verification_identifier_idx` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vinculo_numero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numeroId` int NOT NULL,
  `usuarioId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `conexao` enum('aguardando','conectado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'aguardando',
  `inicioEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `conectadoEm` datetime(3) DEFAULT NULL,
  `fimEm` datetime(3) DEFAULT NULL,
  `desconectadoEm` datetime(3) DEFAULT NULL,
  `motivoFim` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vinculadoPorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `encerradoPorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vinculo_numero_numeroId_fimEm_idx` (`numeroId`,`fimEm`),
  KEY `vinculo_numero_usuarioId_fimEm_idx` (`usuarioId`,`fimEm`),
  CONSTRAINT `vinculo_numero_numeroId_fkey` FOREIGN KEY (`numeroId`) REFERENCES `numero_whatsapp` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `vinculo_numero_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vitrine` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('live','post','reels','story') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('rascunho','agendada','no_ar','publicada','encerrada','arquivada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rascunho',
  `titulo` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` text COLLATE utf8mb4_unicode_ci,
  `urlInstagram` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legenda` text COLLATE utf8mb4_unicode_ci,
  `responsavelId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inicioPrevisto` datetime(3) DEFAULT NULL,
  `inicioEm` datetime(3) DEFAULT NULL,
  `fimEm` datetime(3) DEFAULT NULL,
  `ofertaAte` datetime(3) DEFAULT NULL,
  `visitas` int NOT NULL DEFAULT '0',
  `criadoEm` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizadoEm` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vitrine_slug_key` (`slug`),
  KEY `vitrine_status_inicioPrevisto_idx` (`status`,`inicioPrevisto`),
  KEY `vitrine_responsavelId_idx` (`responsavelId`),
  CONSTRAINT `vitrine_responsavelId_fkey` FOREIGN KEY (`responsavelId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vitrine_peca` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vitrineId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `produtoId` int NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  `precoOferta` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vitrine_peca_vitrineId_produtoId_key` (`vitrineId`,`produtoId`),
  KEY `vitrine_peca_produtoId_idx` (`produtoId`),
  CONSTRAINT `vitrine_peca_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vitrine_peca_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


