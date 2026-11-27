<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `cupom_cliente` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class CupomCliente extends Modelo
{
    protected $table = 'cupom_cliente';

    /** Chave composta (cupomId, clienteId): o Eloquent não tem; grave e apague por consulta. */
    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'cupomId' => 'integer',
        ];
    }

    public function cupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'cupomId');
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }
}
