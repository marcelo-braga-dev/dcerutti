<?php

namespace App\Enums;

/** Gerado de prisma/schema.prisma (enum TipoNotificacao). O valor é o que está gravado no banco. */
enum TipoNotificacao: string
{
    case PedidoNovo = 'pedido_novo';
    case PedidoCancelado = 'pedido_cancelado';
    case CarrinhoVisto = 'carrinho_visto';
    case CarrinhoRespondido = 'carrinho_respondido';
    case SacolaParada = 'sacola_parada';
    case PrazoVencendo = 'prazo_vencendo';
    case PecaEsgotada = 'peca_esgotada';
    case MetaBatida = 'meta_batida';
    case ClienteNova = 'cliente_nova';
    case CarrinhoVencendo = 'carrinho_vencendo';
    case NumeroAlterado = 'numero_alterado';
    case AtendimentoNovo = 'atendimento_novo';
    case RetornoVencendo = 'retorno_vencendo';
    case PosVendaHoje = 'pos_venda_hoje';
    case PagamentoAprovado = 'pagamento_aprovado';
    case PagamentoProblema = 'pagamento_problema';
}
