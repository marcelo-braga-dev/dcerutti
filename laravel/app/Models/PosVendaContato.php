<?php

namespace App\Models;

use App\Enums\TipoPosVenda;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `pos_venda_contato` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 */
class PosVendaContato extends Modelo
{
    protected $table = 'pos_venda_contato';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => TipoPosVenda::class,
            'venceEm' => 'datetime',
            'feitoEm' => 'datetime',
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }
}
