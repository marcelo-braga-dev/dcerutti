<?php

namespace App\Models;

use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `importacao_estoque` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class ImportacaoEstoque extends Modelo
{
    use TemCuid;

    protected $table = 'importacao_estoque';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'resumo' => 'array',
            'criadoEm' => 'datetime',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
