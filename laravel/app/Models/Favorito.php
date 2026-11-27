<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `favorito` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Favorito extends Modelo
{
    protected $table = 'favorito';

    /** Chave composta (clienteId, produtoId): o Eloquent não tem; grave e apague por consulta. */
    protected $primaryKey = null;

    public $incrementing = false;

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'produtoId' => 'integer',
            'criadoEm' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }
}
