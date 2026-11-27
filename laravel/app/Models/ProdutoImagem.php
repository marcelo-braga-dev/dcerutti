<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `produto_imagem` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class ProdutoImagem extends Modelo
{
    protected $table = 'produto_imagem';

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
