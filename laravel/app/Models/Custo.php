<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `custo` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Custo extends Modelo
{
    protected $table = 'custo';

    protected $primaryKey = 'produtoId';

    public $incrementing = false;

    const CREATED_AT = null;

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'produtoId' => 'integer',
            'valor' => 'decimal:2',
            'atualizadoEm' => 'datetime',
        ];
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }
}
