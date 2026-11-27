<?php

namespace App\Models;

use App\Enums\Estacao;
use App\Enums\Genero;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Tabela `produto` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - fornecedor: Fornecedor como vem na planilha de estoque (docs/25). Produto cadastrado à mão fica sem.
 */
class Produto extends Modelo
{
    protected $table = 'produto';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'marcaId' => 'integer',
            'categoriaId' => 'integer',
            'genero' => Genero::class,
            'estacao' => Estacao::class,
            'destaques' => 'array',
            'preco' => 'decimal:2',
            'precoCheio' => 'decimal:2',
            'imperdivel' => 'boolean',
            'ativo' => 'boolean',
            'criadoEm' => 'datetime',
            'atualizadoEm' => 'datetime',
        ];
    }

    public function marca(): BelongsTo
    {
        return $this->belongsTo(Marca::class, 'marcaId');
    }

    public function categoria(): BelongsTo
    {
        return $this->belongsTo(Categoria::class, 'categoriaId');
    }

    public function imagens(): HasMany
    {
        return $this->hasMany(ProdutoImagem::class, 'produtoId');
    }

    public function videos(): HasMany
    {
        return $this->hasMany(ProdutoVideo::class, 'produtoId');
    }

    public function variantes(): HasMany
    {
        return $this->hasMany(Variante::class, 'produtoId');
    }

    public function custo(): HasOne
    {
        return $this->hasOne(Custo::class, 'produtoId');
    }

    public function cupons(): HasMany
    {
        return $this->hasMany(CupomProduto::class, 'produtoId');
    }

    public function favoritos(): HasMany
    {
        return $this->hasMany(Favorito::class, 'produtoId');
    }

    public function vitrines(): HasMany
    {
        return $this->hasMany(VitrinePeca::class, 'produtoId');
    }
}
