<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum AcaoEquipe). O valor é o que está gravado no banco. */
enum AcaoEquipe: string
{
    case Login = 'login';
    case ClienteCadastrado = 'cliente_cadastrado';
    case ClienteEditado = 'cliente_editado';
    case PedidoCriado = 'pedido_criado';
    case OfertaEnviada = 'oferta_enviada';
    case PedidoEditado = 'pedido_editado';
    case PedidoConfirmado = 'pedido_confirmado';
    case PedidoCancelado = 'pedido_cancelado';
    case VendaDesfeita = 'venda_desfeita';
    case VendaBalcao = 'venda_balcao';
    case VendaCaixa = 'venda_caixa';
    case VendaManual = 'venda_manual';
    case VendaExcluida = 'venda_excluida';
    case CupomPedido = 'cupom_pedido';
    case Whatsapp = 'whatsapp';
    case CupomEnviado = 'cupom_enviado';
    case ConviteEnviado = 'convite_enviado';
    case NumeroCadastrado = 'numero_cadastrado';
    case NumeroVinculado = 'numero_vinculado';
    case NumeroDesvinculado = 'numero_desvinculado';
    case AtendimentoCriado = 'atendimento_criado';
    case AtendimentoContato = 'atendimento_contato';
    case AtendimentoFechado = 'atendimento_fechado';
    case AtendimentoEncaminhado = 'atendimento_encaminhado';
    case PecaEnviada = 'peca_enviada';
    case PosVendaFeito = 'pos_venda_feito';
}
