<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `variante` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Variante extends Modelo
{
    protected $table = 'variante';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'produtoId' => 'integer',
            'ordem' => 'integer',
            'estoque' => 'integer',
            'reservado' => 'integer',
        ];
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'produtoId');
    }

    public function movimentos(): HasMany
    {
        return $this->hasMany(MovimentoEstoque::class, 'varianteId');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(PedidoItem::class, 'varianteId');
    }
}
