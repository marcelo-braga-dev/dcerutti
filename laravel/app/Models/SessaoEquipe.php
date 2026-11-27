<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `sessao_equipe` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - segundos: Tempo com a tela visível, em segundos (aba escondida ou computador parado não conta).
 * - aparelho: celular, tablet ou computador.
 */
class SessaoEquipe extends Modelo
{
    protected $table = 'sessao_equipe';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'inicioEm' => 'datetime',
            'fimEm' => 'datetime',
            'segundos' => 'integer',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
