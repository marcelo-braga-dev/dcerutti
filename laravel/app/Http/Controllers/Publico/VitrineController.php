<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use App\Services\Config;
use App\Services\InteressePublico;
use App\Services\Vitrines;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Vitrines abertas ao público (docs/26, D-32, D-36): a página da bio, a vitrine, o formulário e o atalho /live. */
class VitrineController extends Controller
{
    public function __construct(private Vitrines $vitrines, private Config $config) {}

    private function ligadas(): void
    {
        abort_unless($this->vitrines->ligadas(), 404);
    }

    public function index(): Response
    {
        $this->ligadas();

        return Inertia::render('Publico/Vitrines', [
            ...$this->vitrines->publicas(), 'instagram' => (string) $this->config->get('instagramLoja'), 'whatsapp' => (string) $this->config->get('whatsappLoja'),
        ]);
    }

    public function show(Request $request, string $slug): Response
    {
        $this->ligadas();
        $equipe = (bool) $request->user()?->ehEquipe();
        $v = $this->vitrines->publica($slug, $equipe);
        abort_unless($v, 404);
        if (! $equipe && $v['status'] !== 'rascunho' && ! preg_match(SugestaoController::ROBO, (string) $request->userAgent())) {
            $this->vitrines->registrarVisita($v['id']);
        }
        $loja = $this->config->nomeDaLoja()['nome'];
        $n = count($v['pecas']);
        $foto = collect($v['pecas'])->pluck('imagem')->filter()->first();
        $site = rtrim((string) config('app.url'), '/');

        return Inertia::render('Publico/Vitrine', ['v' => $v])->withViewData(['og' => [
            'titulo' => "{$v['titulo']} · {$loja}",
            'descricao' => $v['descricao'] ? mb_substr($v['descricao'], 0, 160) : "{$n} ".($n === 1 ? 'peça' : 'peças').' para escolher o tamanho e pedir pelo WhatsApp.',
            'imagem' => $foto ? (str_starts_with($foto, 'http') ? $foto : $site.$foto) : null,
        ]]);
    }

    public function interesse(Request $request, string $slug, InteressePublico $interesse): JsonResponse
    {
        $this->ligadas();

        return response()->json($interesse->quererDaVitrine($slug, $request->only(['variantes', 'nome', 'telefone', 'aceite', 'site', 'ofertas']), $request->ip()));
    }

    /** Endereço curto para falar na live: leva à live no ar, à próxima ou a /vitrines. */
    public function live(): RedirectResponse
    {
        $this->ligadas();

        return redirect($this->vitrines->destinoDaLive(), 307)->withHeaders(['Cache-Control' => 'no-store', 'X-Robots-Tag' => 'noindex']);
    }
}
