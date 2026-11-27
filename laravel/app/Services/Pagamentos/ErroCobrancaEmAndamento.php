<?php

namespace App\Services\Pagamentos;

use App\Exceptions\ErroPagamento;

/** R-02: outro clique está gerando a cobrança agora; quem chama espera e tenta de novo (reaproveita a mesma). */
class ErroCobrancaEmAndamento extends ErroPagamento {}
