<?php

namespace App\Models;

use App\Enums\SituacaoItem;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `pedido_item` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - precoTabela: Preço do catálogo quando a peça entrou no pedido; abaixo dele, `precoUnitario` tem desconto do vendedor.
 * - descontoCupom: Parte do desconto do cupom nesta linha, em R$, para a quantidade toda.
 */
class PedidoItem extends Modelo
{
    protected $table = 'pedido_item';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'varianteId' => 'integer',
            'produtoId' => 'integer',
            'quantidade' => 'integer',
            'precoUnitario' => 'decimal:2',
            'precoTabela' => 'decimal:2',
            'descontoCupom' => 'decimal:2',
            'custoUnitario' => 'decimal:2',
            'situacao' => SituacaoItem::class,
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function variante(): BelongsTo
    {
        return $this->belongsTo(Variante::class, 'varianteId');
    }
}
