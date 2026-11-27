<?php

namespace App\Models;

/**
 * Tabela `configuracao` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Configuracao extends Modelo
{
    protected $table = 'configuracao';

    protected $primaryKey = 'chave';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'valor' => 'array',
        ];
    }
}
