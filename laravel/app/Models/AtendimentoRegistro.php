<?php

namespace App\Models;

use App\Enums\TipoRegistroAtendimento;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `atendimento_registro` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class AtendimentoRegistro extends Modelo
{
    protected $table = 'atendimento_registro';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => TipoRegistroAtendimento::class,
            'criadoEm' => 'datetime',
        ];
    }

    public function atendimento(): BelongsTo
    {
        return $this->belongsTo(Atendimento::class, 'atendimentoId');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
