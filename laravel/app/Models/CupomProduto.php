<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `cupom_produto` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class CupomProduto extends Modelo
{
    protected $table = 'cupom_produto';

    /** Chave composta (cupomId, produtoId): o Eloquent não tem; grave e apague por consulta. */
    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'cupomId' => 'integer',
            'produtoId' => 'integer',
        ];
    }

    public function cupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'cupomId');
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }
}
