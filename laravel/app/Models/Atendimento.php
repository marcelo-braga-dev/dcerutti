<?php

namespace App\Models;

use App\Enums\CanalAtendimento;
use App\Enums\EtapaAtendimento;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `atendimento` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - codigo: AT-000123, pelo contador (a mesma escrita serializa a criação, para não duplicar ficha).
 * - contatoNome: Dados de quem ainda não tem ficha; apagados ao anonimizar.
 * - responsavelId: Sempre uma vendedora; null = fila da gestora.
 * - numeroId: Por qual número da loja a conversa acontece (D-31).
 * - pedidoId: Pedido gerado; único para impedir conversão dupla.
 * - aceitouContatoEm: Quando aceitou ser contatada no formulário público.
 * - aceitouOfertasEm: Marcou a caixa opcional de ofertas no formulário público; passa para a ficha quando ela nasce.
 */
class Atendimento extends Modelo
{
    use TemCuid;

    protected $table = 'atendimento';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'numeroId' => 'integer',
            'canal' => CanalAtendimento::class,
            'etapa' => EtapaAtendimento::class,
            'proximoContatoEm' => 'datetime',
            'primeiroContatoEm' => 'datetime',
            'ultimoContatoEm' => 'datetime',
            'aceitouContatoEm' => 'datetime',
            'aceitouOfertasEm' => 'datetime',
            'criadoEm' => 'datetime',
            'atualizadoEm' => 'datetime',
            'fechadoEm' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }

    public function responsavel(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsavelId');
    }

    public function vitrine(): BelongsTo
    {
        return $this->belongsTo(Vitrine::class, 'vitrineId');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(AtendimentoItem::class, 'atendimentoId');
    }

    public function registros(): HasMany
    {
        return $this->hasMany(AtendimentoRegistro::class, 'atendimentoId');
    }
}
