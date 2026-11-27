<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `atendimento_item` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - produtoId: Sem chave estrangeira: produto excluído não apaga o histórico.
 */
class AtendimentoItem extends Modelo
{
    protected $table = 'atendimento_item';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'produtoId' => 'integer',
            'varianteId' => 'integer',
            'quantidade' => 'integer',
        ];
    }

    public function atendimento(): BelongsTo
    {
        return $this->belongsTo(Atendimento::class, 'atendimentoId');
    }
}
