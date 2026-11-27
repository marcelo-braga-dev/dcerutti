<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `cupom_marca` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class CupomMarca extends Modelo
{
    protected $table = 'cupom_marca';

    /** Chave composta (cupomId, marcaId): o Eloquent não tem; grave e apague por consulta. */
    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'cupomId' => 'integer',
            'marcaId' => 'integer',
        ];
    }

    public function cupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'cupomId');
    }

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marcaId');
    }
}
