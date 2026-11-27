<?php

namespace App\Models;

use App\Enums\CanalAtendimento;
use App\Models\Concerns\TemCuid;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Tabela `cliente` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - cpf: Opcional, com a máscara 000.000.000-00 (validado pelos dígitos verificadores).
 * - ultimoLoginEm: Histórico de navegação (docs/21): último login e última página aberta na loja.
 * - instagram: Atendimento online (docs/26): @ do Instagram, sem a arroba, e por onde o contato chegou.
 * - aceitaOfertasEm: Consentimento de ofertas (docs/26): quando aceitou e quando pediu para sair. Contato sobre o próprio pedido não depende disso.
 */
class Cliente extends Modelo
{
    use TemCuid;

    protected $table = 'cliente';

    const CREATED_AT = 'criadoEm';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'criadoEm' => 'datetime',
            'ultimoLoginEm' => 'datetime',
            'ultimoAcessoEm' => 'datetime',
            'origem' => CanalAtendimento::class,
            'aceitaOfertasEm' => 'datetime',
            'descadastradaEm' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function vendedor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedorId');
    }

    public function atendimentos(): HasMany
    {
        return $this->hasMany(Atendimento::class, 'clienteId');
    }

    public function posVenda(): HasMany
    {
        return $this->hasMany(PosVendaContato::class, 'clienteId');
    }

    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'clienteId');
    }

    public function vendas(): HasMany
    {
        return $this->hasMany(Venda::class, 'clienteId');
    }

    public function cupons(): HasMany
    {
        return $this->hasMany(CupomCliente::class, 'clienteId');
    }

    public function atividades(): HasMany
    {
        return $this->hasMany(Atividade::class, 'clienteId');
    }

    public function favoritos(): HasMany
    {
        return $this->hasMany(Favorito::class, 'clienteId');
    }

    public function sacola(): HasOne
    {
        return $this->hasOne(SacolaCliente::class, 'clienteId');
    }

    public function sugestoes(): HasMany
    {
        return $this->hasMany(Sugestao::class, 'clienteId');
    }
}
