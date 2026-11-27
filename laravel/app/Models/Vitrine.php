<?php

namespace App\Models;

use App\Enums\StatusVitrine;
use App\Enums\TipoVitrine;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `vitrine` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - ofertaAte: O preço especial vale até aqui; sem data, enquanto a vitrine estiver ativa.
 * - visitas: Visitas de clientes, sem IP; robôs e equipe não contam.
 */
class Vitrine extends Modelo
{
    use TemCuid;

    protected $table = 'vitrine';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'tipo' => TipoVitrine::class,
            'status' => StatusVitrine::class,
            'inicioPrevisto' => 'datetime',
            'inicioEm' => 'datetime',
            'fimEm' => 'datetime',
            'ofertaAte' => 'datetime',
            'visitas' => 'integer',
            'criadoEm' => 'datetime',
            'atualizadoEm' => 'datetime',
        ];
    }

    public function responsavel(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsavelId');
    }

    public function pecas(): HasMany
    {
        return $this->hasMany(VitrinePeca::class, 'vitrineId');
    }

    public function atendimentos(): HasMany
    {
        return $this->hasMany(Atendimento::class, 'vitrineId');
    }

    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'vitrineId');
    }
}
