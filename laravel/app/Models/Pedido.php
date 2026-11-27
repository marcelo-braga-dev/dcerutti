<?php

namespace App\Models;

use App\Enums\OrigemPedido;
use App\Enums\SituacaoEntrega;
use App\Enums\SituacaoPagamento;
use App\Enums\StatusPedido;
use App\Enums\TipoPedido;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Tabela `pedido` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - frete: Frete do pedido de compra, gravado no envio (Q-01). null = a combinar (loja sem regra de frete, condicional, seleção do vendedor).
 * - motivoCancelamento: Quem ou o que cancelou: equipe, cliente ou expirado (Q-05).
 * - cupomId: Cupom aplicado (docs/20-cupons.md). O código é cópia: o pedido continua legível se o cupom for apagado.
 * - descontoCupom: Desconto do cupom nas peças (soma de `descontoCupom` das linhas). `total` já vem descontado.
 * - freteCupom: Frete zerado por cupom de frete grátis.
 * - numeroId: D-31: por qual número da loja a conversa do pedido acontece (null = venda no balcão ou pedido anterior aos números).
 * - vitrineId: Vitrine (live ou publicação) de onde o pedido veio, para o resultado dela (docs/26).
 * - pagamentoSituacao: Registro manual da equipe (docs/26): nada é cobrado nem rastreado pelo sistema.
 */
class Pedido extends Modelo
{
    use TemCuid;

    protected $table = 'pedido';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'tipo' => TipoPedido::class,
            'status' => StatusPedido::class,
            'origem' => OrigemPedido::class,
            'total' => 'decimal:2',
            'frete' => 'decimal:2',
            'criadoEm' => 'datetime',
            'confirmadoEm' => 'datetime',
            'canceladoEm' => 'datetime',
            'cupomId' => 'integer',
            'descontoCupom' => 'decimal:2',
            'freteCupom' => 'boolean',
            'numeroId' => 'integer',
            'pagamentoSituacao' => SituacaoPagamento::class,
            'entregaSituacao' => SituacaoEntrega::class,
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }

    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedorId');
    }

    public function cupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'cupomId');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(PedidoItem::class, 'pedidoId');
    }

    public function venda(): HasOne
    {
        return $this->hasOne(Venda::class, 'pedidoId');
    }

    public function movimentos(): HasMany
    {
        return $this->hasMany(MovimentoEstoque::class, 'pedidoId');
    }

    public function historico(): HasMany
    {
        return $this->hasMany(PedidoHistorico::class, 'pedidoId');
    }

    public function pagamentos(): HasMany
    {
        return $this->hasMany(Pagamento::class, 'pedidoId');
    }

    public function numero(): BelongsTo
    {
        return $this->belongsTo(NumeroWhatsApp::class, 'numeroId');
    }

    public function vitrine(): BelongsTo
    {
        return $this->belongsTo(Vitrine::class, 'vitrineId');
    }

    public function posVenda(): HasMany
    {
        return $this->hasMany(PosVendaContato::class, 'pedidoId');
    }

    public function cobrancas(): HasMany
    {
        return $this->hasMany(Cobranca::class, 'pedidoId');
    }
}
