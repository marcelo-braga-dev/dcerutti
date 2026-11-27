<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `categoria` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Categoria extends Modelo
{
    protected $table = 'categoria';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
        ];
    }

    public function produtos(): HasMany
    {
        return $this->hasMany(Produto::class, 'categoriaId');
    }

    public function cupons(): HasMany
    {
        return $this->hasMany(CupomCategoria::class, 'categoriaId');
    }
}
