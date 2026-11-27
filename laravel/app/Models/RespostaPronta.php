<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `resposta_pronta` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class RespostaPronta extends Modelo
{
    protected $table = 'resposta_pronta';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'ordem' => 'integer',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
