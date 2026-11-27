<?php

namespace App\Models;

use App\Enums\Papel;
use App\Models\Concerns\TemCuid;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Tabela `user` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).
 * - aceitouPrivacidadeEm: LGPD: quando a pessoa aceitou a política de privacidade (null = ainda não aceitou).
 * - preferenciasNotificacao: D-28: tipos de notificação desligados no painel e por e-mail ({ painel: [...], email: [...] }); vazio = padrão.
 * - numeroPrincipalId: D-31: número da loja que atende as clientes desta vendedora (um só por pessoa); sem ele, vale o número padrão.
 * - ultimoLoginEm: Acompanhamento da equipe (D-26): último login e último sinal do painel ou do caixa aberto.
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, TemCuid;

    protected $table = 'user';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = 'updatedAt';

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $hidden = ['remember_token'];

    /** A senha fica em `account` (provider "credential"), como o Better Auth deixou. */
    public function getAuthPassword(): string
    {
        return (string) $this->accounts()->where('providerId', 'credential')->value('password');
    }

    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function ehEquipe(): bool
    {
        return in_array($this->papel, [Papel::Vendedor, Papel::Gestor], true);
    }

    public function ehGestor(): bool
    {
        return $this->papel === Papel::Gestor;
    }

    protected function casts(): array
    {
        return [
            'emailVerified' => 'boolean',
            'papel' => Papel::class,
            'ativo' => 'boolean',
            'aceitouPrivacidadeEm' => 'datetime',
            'createdAt' => 'datetime',
            'updatedAt' => 'datetime',
            'preferenciasNotificacao' => 'array',
            'numeroPrincipalId' => 'integer',
            'ultimoLoginEm' => 'datetime',
            'ultimoAcessoEm' => 'datetime',
        ];
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(Session::class, 'userId');
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(Account::class, 'userId');
    }

    public function cliente(): HasOne
    {
        return $this->hasOne(Cliente::class, 'userId');
    }

    public function clientes(): HasMany
    {
        return $this->hasMany(Cliente::class, 'vendedorId');
    }

    public function metas(): HasMany
    {
        return $this->hasMany(Meta::class, 'vendedorId');
    }

    public function pedidos(): HasMany
    {
        return $this->hasMany(Pedido::class, 'vendedorId');
    }

    public function sugestoes(): HasMany
    {
        return $this->hasMany(Sugestao::class, 'vendedorId');
    }

    public function notificacoes(): HasMany
    {
        return $this->hasMany(Notificacao::class, 'usuarioId');
    }

    public function vendas(): HasMany
    {
        return $this->hasMany(Venda::class, 'vendedorId');
    }

    public function movimentos(): HasMany
    {
        return $this->hasMany(MovimentoEstoque::class, 'usuarioId');
    }

    public function importacoesEstoque(): HasMany
    {
        return $this->hasMany(ImportacaoEstoque::class, 'usuarioId');
    }

    public function numeroPrincipal(): BelongsTo
    {
        return $this->belongsTo(NumeroWhatsApp::class, 'numeroPrincipalId');
    }

    public function numerosCriados(): HasMany
    {
        return $this->hasMany(NumeroWhatsApp::class, 'criadoPorId');
    }

    public function vinculosNumero(): HasMany
    {
        return $this->hasMany(VinculoNumero::class, 'usuarioId');
    }

    public function atendimentos(): HasMany
    {
        return $this->hasMany(Atendimento::class, 'responsavelId');
    }

    public function registrosAtendimento(): HasMany
    {
        return $this->hasMany(AtendimentoRegistro::class, 'usuarioId');
    }

    public function respostasProntas(): HasMany
    {
        return $this->hasMany(RespostaPronta::class, 'usuarioId');
    }

    public function vitrines(): HasMany
    {
        return $this->hasMany(Vitrine::class, 'responsavelId');
    }

    public function historicoPedidos(): HasMany
    {
        return $this->hasMany(PedidoHistorico::class, 'usuarioId');
    }

    public function cuponsCriados(): HasMany
    {
        return $this->hasMany(Cupom::class, 'criadoPorId');
    }

    public function sessoesEquipe(): HasMany
    {
        return $this->hasMany(SessaoEquipe::class, 'usuarioId');
    }

    public function atividadesEquipe(): HasMany
    {
        return $this->hasMany(AtividadeEquipe::class, 'usuarioId');
    }
}
