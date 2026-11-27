<?php

namespace App\Models;

use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `session` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Session extends Modelo
{
    use TemCuid;

    protected $table = 'session';

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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
