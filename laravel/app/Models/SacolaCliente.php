<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `sacola_cliente` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - itens: [{ varianteId, quantidade }]
 * - avisadoEm: Quando o vendedor foi avisado de que a sacola ficou parada (null = ainda não).
 */
class SacolaCliente extends Modelo
{
    protected $table = 'sacola_cliente';

    protected $primaryKey = 'clienteId';

    protected $keyType = 'string';

    public $incrementing = false;

    const CREATED_AT = null;

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'itens' => 'array',
            'atualizadoEm' => 'datetime',
            'avisadoEm' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }
}
