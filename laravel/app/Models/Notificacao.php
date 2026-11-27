<?php

namespace App\Models;

use App\Enums\TipoNotificacao;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `notificacao` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - link: Caminho do painel para abrir ("/painel/pedidos/…").
 * - chave: Evita a mesma notificação duas vezes para a mesma pessoa (ex.: "prazo:PED-000123").
 */
class Notificacao extends Modelo
{
    protected $table = 'notificacao';

    const CREATED_AT = 'criadaEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => TipoNotificacao::class,
            'lidaEm' => 'datetime',
            'criadaEm' => 'datetime',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
