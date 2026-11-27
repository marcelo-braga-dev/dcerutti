<?php

namespace App\Models;

use App\Enums\FormaPagamento;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `pagamento` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - parcelas: Crédito: em quantas vezes.
 * - recebido: Dinheiro: quanto a cliente entregou (troco = recebido − valor).
 * - cobrancaId: Pagamento online (docs/27): a cobrança do Mercado Pago que gerou esta linha. null = registrado no caixa.
 */
class Pagamento extends Modelo
{
    protected $table = 'pagamento';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'forma' => FormaPagamento::class,
            'valor' => 'decimal:2',
            'parcelas' => 'integer',
            'recebido' => 'decimal:2',
            'criadoEm' => 'datetime',
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function cobranca(): BelongsTo
    {
        return $this->belongsTo(Cobranca::class, 'cobrancaId');
    }
}
