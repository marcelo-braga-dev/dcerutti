<?php

namespace App\Models;

use App\Enums\EscolhaSugestao;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `sugestao_item` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - produtoId: A cor da peça (cada cor é um produto); a cliente pode trocar por outra cor do mesmo modelo.
 * - varianteId: Tamanho sugerido pelo vendedor (null = a cliente escolhe).
 * - precoOferta: Preço especial por unidade, até a validade; null = preço do catálogo.
 * - varianteEscolhidaId: Tamanho e cor que a cliente escolheu (variante de qualquer cor do modelo).
 */
class SugestaoItem extends Modelo
{
    protected $table = 'sugestao_item';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'produtoId' => 'integer',
            'varianteId' => 'integer',
            'precoOferta' => 'decimal:2',
            'ordem' => 'integer',
            'escolha' => EscolhaSugestao::class,
            'varianteEscolhidaId' => 'integer',
            'quantidade' => 'integer',
            'adicionadoPelaCliente' => 'boolean',
        ];
    }

    public function sugestao(): BelongsTo
    {
        return $this->belongsTo(Sugestao::class, 'sugestaoId');
    }
}
