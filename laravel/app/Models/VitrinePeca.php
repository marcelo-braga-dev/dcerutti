<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `vitrine_peca` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class VitrinePeca extends Modelo
{
    protected $table = 'vitrine_peca';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'produtoId' => 'integer',
            'ordem' => 'integer',
            'precoOferta' => 'decimal:2',
        ];
    }

    public function vitrine(): BelongsTo
    {
        return $this->belongsTo(Vitrine::class, 'vitrineId');
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }
}
