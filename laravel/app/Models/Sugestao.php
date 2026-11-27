<?php

namespace App\Models;

use App\Enums\StatusSugestao;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `sugestao` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - codigo: SUG-000001; o link é /s/<codigo>.<assinatura> (link-pedido.ts).
 * - validaAte: Depois disso a sugestão vence: o link só leva a falar com o vendedor, e os preços especiais deixam de valer.
 * - pedidoId: Pedido ou condicional gerado quando a cliente devolve as escolhas.
 * - enviadaEm: Quando o link foi mandado; null = criado com "Só criar", ainda para enviar.
 * - cupomCodigo: Cupom que a sugestão aplica ao virar pedido (fase 2).
 * - lembradoEm: Lembrete pelo WhatsApp ("viu as peças?"): o último e quantos já foram.
 */
class Sugestao extends Modelo
{
    use TemCuid;

    protected $table = 'sugestao';

    const CREATED_AT = 'criadaEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'status' => StatusSugestao::class,
            'validaAte' => 'datetime',
            'criadaEm' => 'datetime',
            'vistaEm' => 'datetime',
            'vezesVista' => 'integer',
            'respondidaEm' => 'datetime',
            'enviadaEm' => 'datetime',
            'lembradoEm' => 'datetime',
            'lembretes' => 'integer',
        ];
    }

    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedorId');
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(SugestaoItem::class, 'sugestaoId');
    }
}
