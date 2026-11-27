<?php

namespace App\Models;

/**
 * Tabela `contador` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Contador extends Modelo
{
    protected $table = 'contador';

    protected $primaryKey = 'nome';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'valor' => 'integer',
        ];
    }
}
