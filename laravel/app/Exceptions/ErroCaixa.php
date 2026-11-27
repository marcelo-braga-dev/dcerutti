<?php

namespace App\Exceptions;

/** Venda do caixa recusada depois de criar o pedido (o pagamento não fechou o total): leva o total para a tela. */
class ErroCaixa extends ErroNegocio
{
    public function __construct(string $mensagem, public readonly float $total)
    {
        parent::__construct($mensagem);
    }
}
