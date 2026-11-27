<?php

namespace App\Models;

use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `venda` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class Venda extends Modelo
{
    use TemCuid;

    protected $table = 'venda';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'valor' => 'decimal:2',
            'custo' => 'decimal:2',
            'data' => 'datetime',
            'criadoEm' => 'datetime',
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedorId');
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }
}
