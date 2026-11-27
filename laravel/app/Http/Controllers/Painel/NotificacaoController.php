<?php

namespace App\Http\Controllers\Painel;

use App\Enums\TipoNotificacao;
use App\Http\Controllers\Controller;
use App\Models\Notificacao;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Notificações da equipe (D-28; porta de painel/notificacoes e acoes/notificacoes.ts): lista, lidas e preferências. */
class NotificacaoController extends Controller
{
    /** @return list<string> */
    private static function tipos(): array
    {
        return array_map(fn ($c) => $c->value, TipoNotificacao::cases());
    }

    /** @return array{painel: list<string>, email: list<string>} */
    public static function preferencias(mixed $v): array
    {
        $o = is_array($v) ? $v : [];
        $lista = fn ($x) => array_values(array_intersect(is_array($x) ? $x : [], self::tipos()));

        return ['painel' => $lista($o['painel'] ?? []), 'email' => $lista($o['email'] ?? [])];
    }

    public function index(Request $request): Response
    {
        $u = $request->user();
        $tipo = in_array($request->query('tipo'), self::tipos(), true) ? (string) $request->query('tipo') : null;
        $naoLidas = $request->query('ver') === 'nao-lidas';
        $pagina = min(20, max(1, (int) $request->query('pagina', 1)));
        $base = Notificacao::query()->where('usuarioId', $u->id)->when($tipo, fn ($q) => $q->where('tipo', $tipo))->when($naoLidas, fn ($q) => $q->whereNull('lidaEm'));

        return Inertia::render('Painel/Notificacoes', [
            'lista' => (clone $base)->orderByDesc('criadaEm')->orderByDesc('id')->take(50 * $pagina)->get()->map(fn ($n) => [
                'id' => (string) $n->id, 'tipo' => $n->tipo->value ?? $n->tipo, 'titulo' => $n->titulo, 'texto' => $n->texto, 'link' => $n->link,
                'lidaEm' => $n->lidaEm?->toIso8601String(), 'criadaEm' => $n->criadaEm->toIso8601String(),
            ]),
            'total' => (clone $base)->count(),
            'naoLidas' => Notificacao::query()->where('usuarioId', $u->id)->whereNull('lidaEm')->count(),
            'filtros' => ['tipo' => $tipo, 'naoLidas' => $naoLidas, 'pagina' => $pagina],
            'preferencias' => self::preferencias($u->preferenciasNotificacao),
        ]);
    }

    /** Marca uma (ou todas, sem `id`) como lida. */
    public function lidas(Request $request): RedirectResponse
    {
        $id = $request->input('id');
        if ($id !== null && ! preg_match('/^\d{1,20}$/', (string) $id)) {
            return back();
        }
        Notificacao::query()->where('usuarioId', $request->user()->id)->whereNull('lidaEm')->when($id, fn ($q) => $q->whereKey($id))->update(['lidaEm' => now()]);

        return back();
    }

    /** Preferências: os tipos desligados no painel e a escolha de e-mail contrária ao padrão. */
    public function salvarPreferencias(Request $request): RedirectResponse
    {
        $request->user()->update(['preferenciasNotificacao' => self::preferencias($request->only(['painel', 'email']))]);

        return back()->with('sucesso', 'Preferências salvas.');
    }
}
