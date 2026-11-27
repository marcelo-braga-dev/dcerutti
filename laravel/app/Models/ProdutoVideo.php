<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `produto_video` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class ProdutoVideo extends Modelo
{
    protected $table = 'produto_video';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'produtoId' => 'integer',
            'ordem' => 'integer',
        ];
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }
}
