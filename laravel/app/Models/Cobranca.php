<?php

namespace App\Models;

use App\Enums\MetodoCobranca;
use App\Enums\StatusCobranca;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Tabela `cobranca` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - valor: Valor pedido ao Mercado Pago, calculado no servidor (RP-01).
 * - chave: Chave de idempotência da criação: a mesma tentativa nunca vira duas cobranças no Mercado Pago.
 * - expiraEm: Fim da validade: Pix vencido ou checkout abandonado. A reserva da peça vai até aqui.
 * - reservou: O estoque das peças está reservado por esta cobrança (RP-03).
 * - semEstoque: Aprovada quando as peças já não estavam disponíveis (RP-07): a equipe troca a peça ou estorna.
 * - meio: Meio usado na aprovação: pix, visa, master, account_money…
 * - criadaPorId: Quem gerou: vendedora, gestor ou cliente; null = pelo link, sem login.
 * - consultadaEm: Última consulta ao Mercado Pago (conciliação e página do Pix).
 */
class Cobranca extends Modelo
{
    use TemCuid;

    protected $table = 'cobranca';

    const CREATED_AT = 'criadaEm';

    const UPDATED_AT = 'atualizadaEm';

    protected function casts(): array
    {
        return [
            'metodo' => MetodoCobranca::class,
            'status' => StatusCobranca::class,
            'valor' => 'decimal:2',
            'expiraEm' => 'datetime',
            'reservou' => 'boolean',
            'semEstoque' => 'boolean',
            'aprovadaEm' => 'datetime',
            'parcelas' => 'integer',
            'taxa' => 'decimal:2',
            'valorEstornado' => 'decimal:2',
            'consultadaEm' => 'datetime',
            'criadaEm' => 'datetime',
            'atualizadaEm' => 'datetime',
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function eventos(): HasMany
    {
        return $this->hasMany(EventoPagamento::class, 'cobrancaId');
    }

    public function pagamento(): HasOne
    {
        return $this->hasOne(Pagamento::class, 'cobrancaId');
    }
}
