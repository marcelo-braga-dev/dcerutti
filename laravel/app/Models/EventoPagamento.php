<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `evento_pagamento` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - origem: webhook, consulta, retorno, conciliacao, acao
 * - requestId: x-request-id do aviso: repetido = ignorado.
 * - dados: Resumo do que veio, sem dados de cartão nem documento do pagador.
 */
class EventoPagamento extends Modelo
{
    protected $table = 'evento_pagamento';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'dados' => 'array',
            'processadoEm' => 'datetime',
            'criadoEm' => 'datetime',
        ];
    }

    public function cobranca(): BelongsTo
    {
        return $this->belongsTo(Cobranca::class, 'cobrancaId');
    }
}
