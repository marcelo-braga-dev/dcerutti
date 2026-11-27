<?php

namespace App\Models;

use App\Enums\OrigemCupom;
use App\Enums\QuemAplica;
use App\Enums\TipoCupom;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tabela `cupom` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - codigo: Letras, números e hífen, em maiúsculas.
 * - valor: % (percentual) ou R$ (valor); null no frete grátis.
 * - tetoDesconto: Só no percentual: o desconto não passa disto.
 * - minimoCompra: Soma de todas as peças do pedido (com o desconto do vendedor, sem frete), antes do cupom.
 * - origem: Campanhas (fase 4): de onde veio o cupom.
 * - modelo: Modelo da campanha de próxima compra: guarda as opções copiadas para cada cupom pessoal; nunca é aplicado.
 * - modeloId: Cupom pessoal de próxima compra: o modelo que o gerou e a venda que o originou.
 * - diasAposCadastro: Primeira compra: vale até N dias depois do cadastro da cliente (null = até a primeira compra).
 */
class Cupom extends Modelo
{
    protected $table = 'cupom';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = 'atualizadoEm';

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'tipo' => TipoCupom::class,
            'valor' => 'decimal:2',
            'tetoDesconto' => 'decimal:2',
            'minimoCompra' => 'decimal:2',
            'inicioEm' => 'datetime',
            'fimEm' => 'datetime',
            'limiteTotal' => 'integer',
            'limitePorCliente' => 'integer',
            'somentePrimeiraCompra' => 'boolean',
            'valePromocao' => 'boolean',
            'quemAplica' => QuemAplica::class,
            'ativo' => 'boolean',
            'origem' => OrigemCupom::class,
            'modelo' => 'boolean',
            'modeloId' => 'integer',
            'diasAposCadastro' => 'integer',
            'criadoEm' => 'datetime',
            'atualizadoEm' => 'datetime',
        ];
    }

    public function modeloCupom(): BelongsTo
    {
        return $this->belongsTo(Cupom::class, 'modeloId');
    }

    public function gerados(): HasMany
    {
        return $this->hasMany(Cupom::class, 'modeloId');
    }

    public function criadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'criadoPorId');
    }

    public function categorias(): HasMany
    {
        return $this->hasMany(CupomCategoria::class, 'cupomId');
    }

    public function marcas(): HasMany
    {
        return $this->hasMany(CupomMarca::class, 'cupomId');
    }

    public function produtos(): HasMany
    {
        return $this->hasMany(CupomProduto::class, 'cupomId');
    }

    public function clientes(): HasMany
    {
        return $this->hasMany(CupomCliente::class, 'cupomId');
    }

    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'cupomId');
    }
}
