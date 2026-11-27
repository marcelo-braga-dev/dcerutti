<?php

namespace App\Models;

use App\Enums\StatusNumero;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `numero_whatsapp` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - telefone: Só dígitos, com DDD.
 * - padrao: Recebe quem está sem número e fica copiado em `configuracao.whatsappLoja`. Só um, garantido em definirPadrao.
 */
class NumeroWhatsApp extends Modelo
{
    protected $table = 'numero_whatsapp';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'status' => StatusNumero::class,
            'padrao' => 'boolean',
            'criadoEm' => 'datetime',
            'atualizadoEm' => 'datetime',
        ];
    }

    public function criadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'criadoPorId');
    }

    public function vinculos(): HasMany
    {
        return $this->hasMany(VinculoNumero::class, 'numeroId');
    }

    public function principalDe(): HasMany
    {
        return $this->hasMany(User::class, 'numeroPrincipalId');
    }

    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'numeroId');
    }
}
