<?php

namespace App\Jobs;

use App\Services\Pagamentos\Cobrancas;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Aviso do Mercado Pago já gravado: consulta a order e aplica. Falhou, o evento fica pendente e a conciliação reprocessa (R-04). */
class ProcessarAvisoPagamento implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $eventoId) {}

    public function handle(Cobrancas $cobrancas): void
    {
        $cobrancas->processarAvisoGravado($this->eventoId);
    }
}
