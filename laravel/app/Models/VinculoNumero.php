<?php

namespace App\Models;

use App\Enums\ConexaoVinculo;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `vinculo_numero` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - conectadoEm: Confirmação manual da gestora: sem a API, o sistema não vê o aparelho.
 * - desconectadoEm: Encerrado e ainda sem esta data = pendência de desconectar o aparelho.
 */
class VinculoNumero extends Modelo
{
    protected $table = 'vinculo_numero';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'numeroId' => 'integer',
            'conexao' => ConexaoVinculo::class,
            'inicioEm' => 'datetime',
            'conectadoEm' => 'datetime',
            'fimEm' => 'datetime',
            'desconectadoEm' => 'datetime',
        ];
    }

    public function numero(): BelongsTo
    {
        return $this->belongsTo(NumeroWhatsApp::class, 'numeroId');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
