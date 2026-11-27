<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `marca` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Marca extends Modelo
{
    protected $table = 'marca';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
        ];
    }

    public function produtos(): HasMany
    {
        return $this->hasMany(Produto::class, 'marcaId');
    }

    public function cupons(): HasMany
    {
        return $this->hasMany(CupomMarca::class, 'marcaId');
    }
}
