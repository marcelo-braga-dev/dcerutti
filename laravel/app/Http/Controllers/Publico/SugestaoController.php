<?php

namespace App\Http\Controllers\Publico;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Sugestao;
use App\Queries\Loja;
use App\Services\Config;
use App\Services\Loja\AvisosDePedido;
use App\Services\Sugestoes;
use App\Support\Contato;
use App\Support\Links;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** A página da sugestão que a cliente abre pelo WhatsApp (/s/…), sem login: a chave assinada autoriza (D-27). */
class SugestaoController extends Controller
{
    public const ROBO = '/whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview|curl|wget/i';

    public function __construct(private Sugestoes $sugestoes, private Config $config) {}

    /** Código da chave, com limite por sugestão (o link pode ter sido encaminhado). */
    private function codigo(string $chave, bool $limitar = true): ?string
    {
        $codigo = Links::codigoDaChaveSugestao($chave);
        if (! $codigo || ! $limitar) {
            return $codigo;
        }
        $k = "sugestao:{$codigo}";
        if (RateLimiter::tooManyAttempts($k, 60)) {
            return null;
        }
        RateLimiter::hit($k, 60);

        return $codigo;
    }

    public function show(Request $request, string $chave): Response
    {
        $codigo = $this->codigo($chave, false);
        $s = $codigo ? $this->sugestoes->publica($codigo) : null;
        abort_unless($s, 404);
        $u = $request->user();
        if (! $u?->ehEquipe() && ! preg_match(self::ROBO, (string) $request->userAgent())) {
            rescue(fn () => $this->sugestoes->registrarVista($codigo));
            $s = $this->sugestoes->publica($codigo);
        }
        $loja = $this->config->nomeDaLoja()['nome'];
        $titulo = "{$s['nomeVendedor']} separou ".count($s['itens']).' '.(count($s['itens']) === 1 ? 'peça' : 'peças')." para você · {$loja}";
        $imagem = collect($s['itens'])->map(fn ($i) => collect($i['cores'])->firstWhere('produtoId', $i['corInicial'])['imagem'] ?? null)->filter()->first();

        return Inertia::render('Publico/Sugestao', ['chave' => $chave, 's' => $s])
            ->withViewData(['og' => ['titulo' => $titulo, 'descricao' => $s['titulo'], 'imagem' => $imagem ? (str_starts_with($imagem, '/') ? rtrim((string) config('app.url'), '/').$imagem : $imagem) : null]]);
    }

    public function escolhas(Request $request, string $chave): JsonResponse
    {
        $codigo = $this->codigo($chave);
        $escolhas = $request->input('escolhas');
        if (! $codigo || ! is_array($escolhas) || count($escolhas) > 60) {
            return response()->json(['ok' => false]);
        }

        return response()->json(['ok' => $this->sugestoes->salvarEscolhas($codigo, $escolhas)]);
    }

    /** A cliente devolve as escolhas; devolve o WhatsApp de quem atende (a tela monta a mensagem do pedido). */
    public function responder(Request $request, string $chave, AvisosDePedido $avisos): JsonResponse
    {
        $codigo = $this->codigo($chave);
        if (! $codigo) {
            return response()->json(['ok' => false, 'erro' => 'Link inválido ou muitas tentativas. Espere um minuto e tente de novo.']);
        }
        $modo = (string) $request->input('modo');
        if (! in_array($modo, ['pensando', 'compra', 'condicional'], true)) {
            return response()->json(['ok' => false, 'erro' => 'Escolha uma opção.']);
        }
        $u = $request->user();
        try {
            $r = $this->sugestoes->responder($codigo, $modo, array_slice((array) $request->input('escolhas', []), 0, 60), $request->input('cep'), Loja::ehCliente($u) ? $u->id : null);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        $s = Sugestao::query()->with(['cliente:id,nome,cep', 'vendedor:id,name,ativo,numeroPrincipalId', 'vendedor.'.Contato::COM])->find($r['sugestao']->id);
        $contato = Contato::de($s->vendedor, $this->config->get('whatsappLoja'));
        $destinatario = Contato::primeiroNome($contato['nome']);
        $p = $r['pedido'];
        if (! $p) {
            return response()->json(['ok' => true, 'telefone' => $contato['telefone'], 'destinatario' => $destinatario, 'codigo' => null, 'sugestao' => $s->codigo]);
        }
        $site = rtrim((string) config('app.url'), '/');
        defer(fn () => rescue(fn () => $avisos->avisar($p['id'], 'novo', $site)));

        return response()->json([
            'ok' => true, 'telefone' => $contato['telefone'], 'destinatario' => $destinatario, 'codigo' => $p['codigo'], 'tipo' => $modo, 'itens' => $p['itens'],
            'nomeCliente' => $s->cliente->nome, 'nomeVendedor' => $contato['nome'], 'cep' => $modo === 'condicional' ? $s->cliente->cep : null,
            'cidadeCondicional' => $this->config->get('cidadeCondicional'), 'frete' => $modo === 'compra' ? $p['frete'] : null, 'cupom' => $p['cupom'], 'site' => $site,
            'linkPedido' => "{$site}/painel/pedidos/{$p['id']}", 'linkPublico' => Links::publicoDoPedido($site, $p['codigo']),
        ]);
    }

    public function adicionar(Request $request, string $chave): JsonResponse
    {
        $codigo = $this->codigo($chave);
        if (! $codigo) {
            return response()->json(['ok' => false, 'erro' => 'Link inválido.']);
        }
        try {
            $item = $this->sugestoes->adicionar($codigo, (int) $request->input('produtoId'));
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }

        return response()->json($item ? ['ok' => true, 'item' => $item] : ['ok' => false, 'erro' => 'Não foi possível pôr a peça.']);
    }
}
