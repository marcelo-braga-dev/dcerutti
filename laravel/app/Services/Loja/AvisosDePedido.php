<?php

namespace App\Services\Loja;

use App\Enums\TipoNotificacao;
use App\Models\Pedido;
use App\Services\Notificacoes;
use App\Support\Dinheiro;
use App\Support\Texto;

/**
 * L-13 (src/server/avisos.ts): avisa a equipe quando a cliente envia ou cancela um pedido pela loja, no sino do painel e,
 * conforme a preferência, por e-mail. Cobre o caso de a cliente fechar a aba antes de mandar o WhatsApp.
 */
class AvisosDePedido
{
    public function __construct(private Notificacoes $notificacoes) {}

    /** @param 'novo'|'cancelado' $evento */
    public function avisar(string $pedidoId, string $evento, string $site): void
    {
        $p = Pedido::query()->withSum('itens as pecas', 'quantidade')->find($pedidoId, ['id', 'codigo', 'tipo', 'nomeCliente', 'total', 'vendedorId']);
        if (! $p) {
            return;
        }
        $oque = $p->tipo->value === 'condicional' ? 'Condicional' : 'Pedido';
        $pecas = Texto::plural((int) $p->pecas, 'peça', 'peças');
        $valor = Dinheiro::brl($p->total);
        $novo = $evento === 'novo';
        $texto = trim(implode("\n", [
            $novo ? "{$p->nomeCliente} enviou o ".mb_strtolower($oque)." {$p->codigo}: {$pecas}, {$valor}."
                : "{$p->nomeCliente} cancelou o ".mb_strtolower($oque)." {$p->codigo}. As peças reservadas voltaram ao estoque.",
            '',
            "Abrir no painel: {$site}/painel/pedidos/{$p->id}",
            '',
            $novo ? 'Se a mensagem dela não chegou no seu WhatsApp, chame-a por lá a partir do pedido.' : '',
        ]));
        $cuida = Notificacoes::responsaveis($p->vendedorId);
        $this->notificacoes->notificar(
            [...$cuida, ...Notificacoes::gestoresAtivos()],
            $novo ? TipoNotificacao::PedidoNovo : TipoNotificacao::PedidoCancelado,
            $novo ? "{$oque} novo {$p->codigo} · {$p->nomeCliente}" : "{$p->nomeCliente} cancelou {$p->codigo}",
            $novo ? "{$pecas} · {$valor}" : 'As peças reservadas voltaram ao estoque.',
            "/painel/pedidos/{$p->id}",
            email: ['assunto' => $novo ? "{$oque} novo {$p->codigo} · {$p->nomeCliente}" : "{$oque} {$p->codigo} cancelado pela cliente", 'texto' => $texto],
            emailPara: $cuida,
        );
    }
}
