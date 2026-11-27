<?php

namespace App\Models;

use App\Enums\MotivoEstoque;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `movimento_estoque` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class MovimentoEstoque extends Modelo
{
    protected $table = 'movimento_estoque';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'varianteId' => 'integer',
            'delta' => 'integer',
            'motivo' => MotivoEstoque::class,
            'criadoEm' => 'datetime',
        ];
    }

    public function variante(): BelongsTo
    {
        return $this->belongsTo(Variante::class, 'varianteId');
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
