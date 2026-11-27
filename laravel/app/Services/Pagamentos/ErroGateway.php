<?php

namespace App\Services\Pagamentos;

use RuntimeException;

/** Erro da API com mensagem para a equipe; `definitivo` = não adianta tentar de novo. */
class ErroGateway extends RuntimeException
{
    public function __construct(string $mensagem, public readonly ?string $codigo = null, public readonly bool $definitivo = false, public readonly ?int $http = null)
    {
        parent::__construct($mensagem);
    }
}
