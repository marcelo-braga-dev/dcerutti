<?php

namespace App\Models;

use App\Enums\AcaoEquipe;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `atividade_equipe` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - valor: Valor da venda ou do pedido, quando há.
 * - descricao: Frase curta para a lista ("Fulana · PED-000123 · 3 peças").
 * - numeroId: D-31: número principal de quem clicou no link do WhatsApp. Sem chave estrangeira, como cliente e pedido.
 */
class AtividadeEquipe extends Modelo
{
    protected $table = 'atividade_equipe';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => AcaoEquipe::class,
            'valor' => 'decimal:2',
            'numeroId' => 'integer',
            'criadoEm' => 'datetime',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
