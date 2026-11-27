<?php

namespace App\Models;

use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `meta` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Meta extends Modelo
{
    use TemCuid;

    protected $table = 'meta';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'valor' => 'decimal:2',
        ];
    }

    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedorId');
    }
}
