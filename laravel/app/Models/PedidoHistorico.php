<?php

namespace App\Models;

use App\Enums\AcaoPedido;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `pedido_historico` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - autor: cliente, equipe ou sistema (expiração). O nome só é guardado para a equipe (LGPD: a cliente pode ser anonimizada).
 * - mudancas: Frases do que mudou ("Trocou ... por ...", "Preço de ... para ...").
 * - itens: Peças como ficaram depois da ação: [{ referencia, nome, cor, tamanho, quantidade, preco, precoTabela }].
 */
class PedidoHistorico extends Modelo
{
    protected $table = 'pedido_historico';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'acao' => AcaoPedido::class,
            'mudancas' => 'array',
            'itens' => 'array',
            'total' => 'decimal:2',
            'frete' => 'decimal:2',
            'criadoEm' => 'datetime',
        ];
    }

    public function pedido(): BelongsTo
    {
        return $this->belongsTo(Pedido::class, 'pedidoId');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuarioId');
    }
}
