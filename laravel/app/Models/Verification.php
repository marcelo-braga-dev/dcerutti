<?php

namespace App\Models;

use App\Models\Concerns\TemCuid;

/**
 * Tabela `verification` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Verification extends Modelo
{
    use TemCuid;

    protected $table = 'verification';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = 'updatedAt';

    protected function casts(): array
    {
        return [
            'expiresAt' => 'datetime',
            'createdAt' => 'datetime',
            'updatedAt' => 'datetime',
        ];
    }
}
