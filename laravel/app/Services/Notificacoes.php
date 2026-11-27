<?php

namespace App\Services;

use App\Enums\TipoNotificacao;
use App\Models\Notificacao;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Notificações da equipe (D-28; src/server/notificacoes.ts): grava no painel e manda e-mail a quem quer, conforme as
 * preferências de cada um. Nunca derruba quem chama: os erros só vão para o log.
 */
class Notificacoes
{
    /** Padrão do e-mail de cada tipo (src/lib/notificacoes.ts → TIPOS_NOTIFICACAO). */
    public const EMAIL_PADRAO = [
        'pedido_novo' => true, 'pedido_cancelado' => true, 'carrinho_visto' => false, 'carrinho_respondido' => false, 'carrinho_vencendo' => false,
        'sacola_parada' => true, 'prazo_vencendo' => false, 'peca_esgotada' => false, 'meta_batida' => false, 'cliente_nova' => false,
        'atendimento_novo' => false, 'retorno_vencendo' => false, 'pos_venda_hoje' => false, 'pagamento_aprovado' => true,
        'pagamento_problema' => true, 'numero_alterado' => false,
    ];

    /** A pessoa quer este tipo neste canal? Painel: ligado por padrão. E-mail: a lista guarda o contrário do padrão. */
    public static function quer(mixed $preferencias, TipoNotificacao $tipo, string $canal): bool
    {
        $p = is_array($preferencias) ? $preferencias : [];
        $lista = fn (string $k) => array_values(array_filter((array) ($p[$k] ?? []), fn ($t) => isset(self::EMAIL_PADRAO[$t])));
        if ($canal === 'painel') {
            return ! in_array($tipo->value, $lista('painel'), true);
        }

        return self::EMAIL_PADRAO[$tipo->value] ? ! in_array($tipo->value, $lista('email'), true) : in_array($tipo->value, $lista('email'), true);
    }

    /**
     * Avisa estas pessoas. `emailPara`: quem pode receber por e-mail (padrão: todos os destinatários).
     *
     * @param  list<string|null>  $usuarioIds
     * @param  ?array{assunto: string, texto: string}  $email
     * @param  ?list<string>  $emailPara
     */
    public function notificar(array $usuarioIds, TipoNotificacao $tipo, string $titulo, ?string $texto = null, ?string $link = null, ?string $chave = null, ?array $email = null, ?array $emailPara = null): void
    {
        $ids = array_values(array_unique(array_filter($usuarioIds)));
        if (! $ids) {
            return;
        }
        try {
            $pessoas = User::query()->whereIn('id', $ids)->where('ativo', true)->get(['id', 'email', 'preferenciasNotificacao']);
            $linhas = $pessoas->filter(fn ($p) => self::quer($p->preferenciasNotificacao, $tipo, 'painel'))->map(fn ($p) => [
                'usuarioId' => $p->id, 'tipo' => $tipo->value, 'titulo' => mb_substr($titulo, 0, 140), 'texto' => $texto === null ? null : mb_substr($texto, 0, 300),
                'link' => $link, 'chave' => $chave, 'criadaEm' => now()->format('Y-m-d H:i:s.v'),
            ])->values()->all();
            if ($linhas) {
                Notificacao::query()->insertOrIgnore($linhas);
            }
            if ($email) {
                foreach ($pessoas->filter(fn ($p) => in_array($p->id, $emailPara ?? $ids, true) && self::quer($p->preferenciasNotificacao, $tipo, 'email')) as $p) {
                    Mail::raw($email['texto'], fn ($m) => $m->to($p->email)->subject($email['assunto']));
                }
            }
        } catch (\Throwable $e) {
            Log::error("Falha ao notificar {$tipo->value}", ['erro' => $e->getMessage()]);
        }
    }

    /** Quem cuida da carteira: a vendedora, se ativa; senão, os gestores. @return list<string> */
    public static function responsaveis(?string $vendedorId): array
    {
        $ativo = $vendedorId ? User::query()->whereKey($vendedorId)->where('ativo', true)->exists() : false;

        return $ativo ? [$vendedorId] : self::gestoresAtivos();
    }

    /** @return list<string> */
    public static function gestoresAtivos(): array
    {
        return User::query()->where('papel', 'gestor')->where('ativo', true)->pluck('id')->all();
    }
}
