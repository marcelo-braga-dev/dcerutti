<?php

namespace App\Models;

use App\Enums\TipoAtividade;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela `atividade` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - caminho: Página com os filtros, ex.: /catalogo?categoria=blusas.
 * - produtoId: Sem chave estrangeira: produto excluído não apaga o histórico.
 * - termo: Termo da busca, código do cupom ou tamanho escolhido.
 * - dados: Filtros do catálogo, quantidade de resultados, peças a mais ou a menos na sacola, resultado do cupom.
 * - duracaoSeg: Tempo com a página aberta e visível, em segundos.
 * - aparelho: celular, tablet ou computador.
 * - ref: Identifica a página aberta no navegador, para somar o tempo depois.
 */
class Atividade extends Modelo
{
    protected $table = 'atividade';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => TipoAtividade::class,
            'produtoId' => 'integer',
            'varianteId' => 'integer',
            'dados' => 'array',
            'duracaoSeg' => 'integer',
            'criadoEm' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'clienteId');
    }
}
