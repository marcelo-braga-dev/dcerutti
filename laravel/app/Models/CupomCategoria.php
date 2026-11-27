<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `cupom_categoria` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class CupomCategoria extends Modelo
{
    protected $table = 'cupom_categoria';

    /** Chave composta (cupomId, categoriaId): o Eloquent não tem; grave e apague por consulta. */
    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'cupomId' => 'integer',
            'categoriaId' => 'integer',
        ];
    }

    public function cupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'cupomId');
    }

    public function categoria(): BelongsTo
    {
        return $this->belongsTo(Categoria::class, 'categoriaId');
    }
}
