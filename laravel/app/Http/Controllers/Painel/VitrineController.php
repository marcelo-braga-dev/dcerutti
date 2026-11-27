<?php

namespace App\Http\Controllers\Painel;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Queries\Equipe as ConsultasEquipe;
use App\Services\Catalogo;
use App\Services\Vitrines;
use App\Support\Datas;
use App\Support\Dinheiro;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Vitrines no painel (docs/26, D-36; porta de painel/vitrines e acoes/vitrines.ts). */
class VitrineController extends Controller
{
    public function __construct(private Vitrines $vitrines) {}

    private static function site(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    private function ligadas(): void
    {
        abort_unless($this->vitrines->ligadas(), 404);
    }

    public function index(Request $request): Response
    {
        $this->ligadas();
        $status = array_key_exists((string) $request->query('status'), Vitrines::STATUS) ? (string) $request->query('status') : null;

        return Inertia::render('Painel/Vitrines/Index', [...$this->vitrines->listar($request->user(), $status), 'status' => $status, 'site' => self::site()]);
    }

    public function create(Request $request): Response
    {
        $this->ligadas();

        return Inertia::render('Painel/Vitrines/Nova', ['vendedoras' => $request->user()->ehGestor() ? ConsultasEquipe::vendedoresAtivos() : null]);
    }

    public function show(Request $request, string $id): Response
    {
        $this->ligadas();
        $u = $request->user();
        $v = $this->vitrines->paraEdicao($u, $id);
        $r = $v ? $this->vitrines->resultado($u, $id) : null;
        abort_unless($v && $r, 404);
        $site = self::site();

        return Inertia::render('Painel/Vitrines/Show', [
            'vitrine' => $v, 'resultado' => $r, 'site' => $site, 'vendedoras' => $u->ehGestor() ? ConsultasEquipe::vendedoresAtivos() : null,
            'legendaSugerida' => Vitrines::legendaSugerida($v['tipo'], $v['titulo'], preg_replace('#^https?://#', '', $site)),
            'proximos' => Vitrines::proximosStatus($v['tipo'], $v['status']),
        ]);
    }

    /** Valida o formulário. @return array<string, mixed> */
    private static function dados(Request $request, bool $novo): array
    {
        $erros = [];
        $tipo = (string) $request->input('tipo');
        if ($novo && ! array_key_exists($tipo, Vitrines::TIPOS)) {
            $erros['tipo'] = 'Escolha o tipo.';
        }
        $titulo = trim((string) $request->input('titulo'));
        if (mb_strlen($titulo) < 3) {
            $erros['titulo'] = 'Informe o título.';
        } elseif (mb_strlen($titulo) > 120) {
            $erros['titulo'] = 'No máximo 120 caracteres.';
        }
        $descricao = mb_substr(trim((string) $request->input('descricao')), 0, 2000);
        $url = trim((string) $request->input('urlInstagram'));
        $urlValida = $url === '' ? null : Vitrines::urlInstagramValida($url);
        if ($url !== '' && ! $urlValida) {
            $erros['urlInstagram'] = 'Use um link do Instagram, começando com https://www.instagram.com/';
        }
        $legenda = trim((string) $request->input('legenda'));
        if (mb_strlen($legenda) > 2200) {
            $erros['legenda'] = 'O Instagram aceita até 2.200 caracteres.';
        }
        $datas = [];
        foreach (['inicioPrevisto', 'ofertaAte'] as $campo) {
            $v = trim((string) $request->input($campo));
            if ($v !== '' && ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $v)) {
                $erros[$campo] = 'Data inválida.';
            }
            $datas[$campo] = $v !== '' && ! isset($erros[$campo]) ? CarbonImmutable::createFromFormat('Y-m-d\TH:i', $v, Datas::FUSO)->utc() : null;
        }
        if ($erros) {
            throw ValidationException::withMessages($erros);
        }

        return [
            'tipo' => $tipo, 'titulo' => $titulo, 'descricao' => $descricao ?: null, 'urlInstagram' => $urlValida, 'legenda' => $legenda ?: null,
            ...$datas, 'responsavelId' => mb_substr((string) $request->input('responsavelId'), 0, 40) ?: null,
        ];
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ligadas();
        $d = self::dados($request, true);
        try {
            $v = $this->vitrines->criar($request->user(), $d);
        } catch (ErroNegocio $e) {
            throw ValidationException::withMessages(str_contains($e->getMessage(), 'responsável') ? ['responsavelId' => $e->getMessage()] : ['erro' => $e->getMessage()]);
        }

        return redirect("/painel/vitrines/{$v->id}");
    }

    public function update(Request $request, string $id): RedirectResponse
    {
        $this->ligadas();
        $d = self::dados($request, false);
        $this->tentar(fn () => $this->vitrines->atualizar($request->user(), $id, $d));

        return back()->with('sucesso', 'Vitrine salva.');
    }

    public function pecaAdicionar(Request $request, string $id): RedirectResponse
    {
        $produtoId = $request->input('produtoId');
        if (! is_numeric($produtoId)) {
            $this->falhar('Peça inválida.');
        }
        $this->tentar(fn () => $this->vitrines->adicionarPeca($request->user(), $id, (int) $produtoId));

        return back();
    }

    public function pecaRemover(Request $request, string $id, int $pecaId): RedirectResponse
    {
        $this->tentar(fn () => $this->vitrines->removerPeca($request->user(), $id, $pecaId));

        return back();
    }

    public function pecaMover(Request $request, string $id, int $pecaId): RedirectResponse
    {
        $this->tentar(fn () => $this->vitrines->moverPeca($request->user(), $id, $pecaId, (int) $request->input('direcao') === -1 ? -1 : 1));

        return back();
    }

    /** Texto em branco tira o preço especial. */
    public function oferta(Request $request, string $id, int $pecaId): RedirectResponse
    {
        $texto = trim((string) $request->input('oferta'));
        $preco = $texto === '' ? null : Dinheiro::lerValor($texto);
        if ($preco !== null && ! is_finite($preco)) {
            $this->falhar('Informe o preço em reais.');
        }
        $this->tentar(fn () => $this->vitrines->definirOferta($request->user(), $id, $pecaId, $preco));

        return back();
    }

    public function status(Request $request, string $id): RedirectResponse
    {
        $novo = (string) $request->input('status');
        if (! array_key_exists($novo, Vitrines::STATUS)) {
            $this->falhar('Situação inválida.');
        }
        $this->tentar(fn () => $this->vitrines->mudarStatus($request->user(), $id, $novo));

        return back();
    }

    public function duplicar(Request $request, string $id): RedirectResponse
    {
        $nova = $this->tentar(fn () => $this->vitrines->duplicar($request->user(), $id));

        return redirect("/painel/vitrines/{$nova->id}");
    }

    /** Busca para "Adicionar peça" (as mesmas do montador). */
    public function pecas(Request $request, Catalogo $catalogo): JsonResponse
    {
        return response()->json($catalogo->buscarPecas((string) $request->query('q')));
    }
}
