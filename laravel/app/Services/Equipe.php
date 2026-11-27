<?php

namespace App\Services;

use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\SessaoEquipe;
use App\Models\User;
use App\Support\Escopo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Acompanhamento da equipe (D-26; src/server/equipe.ts): histórico de ações. Nunca lança: falhar aqui não pode
 * desfazer o que a pessoa acabou de fazer.
 */
class Equipe
{
    /** Aparelho pelo User-Agent (src/lib/atividade.ts → aparelhoDe). */
    public static function aparelho(?string $ua): string
    {
        $s = (string) $ua;
        if (preg_match('/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i', $s)) {
            return 'tablet';
        }

        return preg_match('/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i', $s) ? 'celular' : 'computador';
    }

    /** @param array{numeroId?: ?int, clienteId?: ?string, pedidoId?: ?string, valor?: float|string|null, descricao?: ?string, aparelho?: ?string} $extra */
    public function registrar(?string $usuarioId, string $tipo, array $extra = []): void
    {
        if (! $usuarioId) {
            return;
        }
        try {
            AtividadeEquipe::query()->create([
                'usuarioId' => $usuarioId, 'tipo' => $tipo, 'criadoEm' => now(),
                'numeroId' => $extra['numeroId'] ?? null, 'clienteId' => $extra['clienteId'] ?? null, 'pedidoId' => $extra['pedidoId'] ?? null,
                'valor' => isset($extra['valor']) ? round((float) $extra['valor'], 2) : null,
                'descricao' => isset($extra['descricao']) ? mb_substr($extra['descricao'], 0, 200) : null,
                'aparelho' => $extra['aparelho'] ?? (app()->runningInConsole() ? null : self::aparelho(request()->userAgent())),
            ]);
        } catch (\Throwable $e) {
            Log::error("Falha ao registrar a ação da equipe {$tipo}", ['erro' => $e->getMessage()]);
        }
    }

    /** D-26: ação da equipe sobre um pedido, com a cliente, o código e o valor como ficaram. */
    public function registrarPedido(string $usuarioId, string $tipo, string $pedidoId, ?string $extra = null): void
    {
        $p = Pedido::query()->find($pedidoId, ['id', 'codigo', 'clienteId', 'nomeCliente', 'total']);
        if (! $p) {
            return;
        }
        $this->registrar($usuarioId, $tipo, ['clienteId' => $p->clienteId, 'pedidoId' => $pedidoId, 'valor' => $p->total, 'descricao' => implode(' · ', array_filter([$p->nomeCliente, $p->codigo, $extra]))]);
    }

    /** Uma sessão vai do primeiro ao último sinal, com até 5 min entre eles. */
    public const MINUTOS_SESSAO = 5;

    private const TIPO_DO_ENVIO = ['oferta' => 'oferta_enviada', 'cupom' => 'cupom_enviado', 'convite' => 'convite_enviado', 'pedido' => 'whatsapp', 'comprovante' => 'whatsapp', 'fechamento' => 'whatsapp', 'contato' => 'whatsapp'];

    private const TEXTO_DO_ENVIO = ['pedido' => 'Pedido atualizado', 'comprovante' => 'Comprovante do caixa', 'fechamento' => 'Fechamento do caixa'];

    /** Login da equipe: último login e a ação "login". */
    public function registrarLogin(User $u, ?string $ua): void
    {
        if (! $u->ehEquipe()) {
            return;
        }
        $this->registrar($u->id, 'login', ['aparelho' => self::aparelho($ua)]);
    }

    /**
     * Sinal do painel ou do caixa aberto (a cada minuto, e ao esconder a aba): soma o tempo visível à sessão em curso,
     * ou começa outra se o último sinal tem mais de MINUTOS_SESSAO.
     */
    public function registrarPresenca(string $usuarioId, int $segundos, ?string $ua): void
    {
        $seg = max(0, min($segundos, 600));
        $agora = now();
        DB::transaction(function () use ($usuarioId, $seg, $ua, $agora) {
            $atual = SessaoEquipe::query()->where('usuarioId', $usuarioId)->where('fimEm', '>=', $agora->copy()->subMinutes(self::MINUTOS_SESSAO))->orderByDesc('fimEm')->first(['id']);
            if ($atual) {
                SessaoEquipe::query()->whereKey($atual->id)->update(['fimEm' => $agora, 'segundos' => DB::raw('segundos + '.$seg)]);
            } else {
                SessaoEquipe::query()->create(['usuarioId' => $usuarioId, 'inicioEm' => $agora->copy()->subSeconds($seg), 'fimEm' => $agora, 'segundos' => $seg, 'aparelho' => self::aparelho($ua)]);
            }
            User::query()->whereKey($usuarioId)->update(['ultimoAcessoEm' => $agora]);
        });
    }

    /**
     * Envio pelo WhatsApp que o navegador contou (clique no link ou compartilhar do celular), ligado à cliente (pelo
     * número) e ao pedido quando a pessoa pode vê-los.
     *
     * @param  array{acao: string, telefone?: ?string, pedidoId?: ?string}  $e
     */
    public function registrarEnvio(User $u, array $e, ?string $ua): void
    {
        $pedido = ! empty($e['pedidoId']) ? Pedido::query()->find($e['pedidoId'], ['id', 'codigo', 'vendedorId', 'clienteId', 'nomeCliente', 'total']) : null;
        $pedido = $pedido && Escopo::podeAcessar($u, $pedido->vendedorId) ? $pedido : null;
        $digitos = substr((string) preg_replace('/\D/', '', (string) ($e['telefone'] ?? '')), -11);
        $cliente = ! $pedido && strlen($digitos) === 11
            ? Escopo::vendedor(Cliente::query(), $u)->whereIn('telefone', [sprintf('(%s) %s-%s', substr($digitos, 0, 2), substr($digitos, 2, 5), substr($digitos, 7)), $digitos])->first(['id', 'nome'])
            : null;
        $quem = $pedido?->nomeCliente ?? $cliente?->nome;
        $this->registrar($u->id, self::TIPO_DO_ENVIO[$e['acao']], [
            'clienteId' => $pedido?->clienteId ?? $cliente?->id, 'pedidoId' => $pedido?->id, 'valor' => $e['acao'] === 'oferta' ? $pedido?->total : null,
            'descricao' => implode(' · ', array_filter([self::TEXTO_DO_ENVIO[$e['acao']] ?? null, $quem, $pedido?->codigo])) ?: null,
            'aparelho' => self::aparelho($ua), 'numeroId' => User::query()->whereKey($u->id)->value('numeroPrincipalId'),
        ]);
    }
}
