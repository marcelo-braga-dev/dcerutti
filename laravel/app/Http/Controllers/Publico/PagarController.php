<?php

namespace App\Http\Controllers\Publico;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cobranca;
use App\Models\Pedido;
use App\Queries\Pagamentos;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pagamentos\ErroCobrancaEmAndamento;
use App\Services\Pagamentos\Modo;
use App\Support\Links;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/**
 * Link de pagamento (docs/27): a vendedora manda no WhatsApp e a cliente paga sem entrar na conta. A chave assinada
 * libera só esta página: primeiro nome, peças e valores, nunca telefone, endereço ou CPF.
 */
class PagarController extends Controller
{
    private const AVISO_RETORNO = [
        'falha' => 'O pagamento não foi aprovado. Você pode tentar de novo com outro cartão ou pagar com Pix.',
        'pendente' => 'O Mercado Pago ainda está analisando o pagamento. Assim que for aprovado, a loja fica sabendo.',
    ];

    public function __construct(private Cobrancas $cobrancas, private Pagamentos $consultas) {}

    public function show(Request $request, string $chave): Response
    {
        $codigo = Links::codigoDaChavePagamento($chave);
        $p = $codigo ? $this->consultas->paraPagar($codigo) : null;
        abort_unless($p, 404);
        defer(fn () => $this->cobrancas->conciliarDoPedido($codigo));
        $r = (string) $request->query('r');
        $recusada = ($p['ultima']['status'] ?? null) === 'recusada' && ! $p['pago'];
        $aviso = isset(self::AVISO_RETORNO[$r]) && ! $p['pago'] ? self::AVISO_RETORNO[$r] : ($recusada ? self::AVISO_RETORNO['falha'] : null);

        return Inertia::render('Publico/Pagar', ['chave' => $chave, 'p' => $p, 'aviso' => $aviso, 'simulado' => Modo::simulado()]);
    }

    /** A cliente escolhe Pix ou cartão. Sem login: a chave assinada é a autorização; limite por IP e por pedido. */
    public function pagar(Request $request, string $chave): JsonResponse
    {
        $metodo = (string) $request->input('metodo');
        $email = trim((string) $request->input('email'));
        if (! in_array($metodo, ['pix', 'checkout'], true)) {
            return response()->json(['ok' => false, 'erro' => 'Link inválido.']);
        }
        if ($email !== '' && (mb_strlen($email) > 120 || ! filter_var($email, FILTER_VALIDATE_EMAIL))) {
            return response()->json(['ok' => false, 'erro' => 'Confira o e-mail.']);
        }
        $codigo = Links::codigoDaChavePagamento($chave);
        if (! $codigo) {
            return response()->json(['ok' => false, 'erro' => 'Link de pagamento inválido.']);
        }
        $porIp = 'pagar:ip:'.$request->ip();
        $porPedido = "pagar:pedido:{$codigo}";
        if (RateLimiter::tooManyAttempts($porIp, 20) || RateLimiter::tooManyAttempts($porPedido, 8)) {
            $espera = max(1, (int) ceil(max(RateLimiter::availableIn($porIp), RateLimiter::availableIn($porPedido)) / 60));

            return response()->json(['ok' => false, 'erro' => "Muitas tentativas. Tente de novo em {$espera} min."]);
        }
        $pedido = Pedido::query()->where('codigo', $codigo)->first(['id', 'pagamentoSituacao']);
        if (! $pedido) {
            return response()->json(['ok' => false, 'erro' => 'Pedido não encontrado.']);
        }
        if ($pedido->pagamentoSituacao->value === 'estornado') {
            return response()->json(['ok' => false, 'erro' => 'O pagamento deste pedido foi devolvido. Fale com a loja pelo WhatsApp.']);
        }
        try {
            // R-02: dois cliques ao mesmo tempo. O segundo espera o primeiro terminar e reaproveita a mesma cobrança.
            $c = null;
            for ($i = 0; ! $c; $i++) {
                try {
                    $c = $this->cobrancas->criar($pedido->id, $metodo, $request->user()?->id, $email ?: null, rtrim((string) config('app.url'), '/'));
                } catch (ErroCobrancaEmAndamento $e) {
                    if ($i >= 12) {
                        throw $e;
                    }
                    sleep(1);
                }
            }
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage(), 'pedirEmail' => (bool) preg_match('/e-mail/i', $e->getMessage())]);
        }
        if (! $c['reaproveitada']) {
            RateLimiter::hit($porIp, 15 * 60);
            RateLimiter::hit($porPedido, 15 * 60);
        }
        if ($c['metodo'] === 'pix') {
            return response()->json($c['pixCopiaECola']
                ? ['ok' => true, 'metodo' => 'pix', 'copiaECola' => $c['pixCopiaECola'], 'expiraEm' => $c['expiraEm'], 'valor' => $c['valor']]
                : ['ok' => false, 'erro' => 'O Mercado Pago ainda está gerando o Pix. Atualize a página em alguns segundos.']);
        }

        return response()->json($c['checkoutUrl']
            ? ['ok' => true, 'metodo' => 'checkout', 'url' => $c['checkoutUrl']]
            : ['ok' => false, 'erro' => 'O Mercado Pago não devolveu o endereço do pagamento. Tente de novo.']);
    }

    /** Ambiente de teste com o Mercado Pago simulado: "Simular pagamento aprovado". */
    public function simular(string $chave): JsonResponse
    {
        if (! Modo::simulado()) {
            return response()->json(['ok' => false, 'erro' => 'Disponível só no ambiente de teste.']);
        }
        $codigo = Links::codigoDaChavePagamento($chave);
        if (! $codigo) {
            return response()->json(['ok' => false, 'erro' => 'Link de pagamento inválido.']);
        }
        try {
            $this->cobrancas->simularPagamentoDeTeste($codigo);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }

        return response()->json(['ok' => true]);
    }

    /** Volta do checkout. Os parâmetros da URL não valem nada sozinhos: consulta a order e mostra a situação real. */
    public function retorno(Request $request, string $chave): RedirectResponse
    {
        $codigo = Links::codigoDaChavePagamento($chave);
        if (! $codigo) {
            return redirect('/');
        }
        $c = Cobranca::query()->whereHas('pedido', fn ($q) => $q->where('codigo', $codigo))->where('metodo', 'checkout')->whereNotNull('mpOrderId')->orderByDesc('criadaEm')->first(['id']);
        if ($c) {
            try {
                $this->cobrancas->sincronizar($c->id, 'retorno');
            } catch (\Throwable $e) {
                Log::error('Pagamento: falha ao conferir o retorno do checkout', ['pedido' => $codigo, 'erro' => $e->getMessage()]);
            }
        }
        $r = (string) $request->query('r');

        return redirect('/pagar/'.rawurlencode($chave).(in_array($r, ['falha', 'pendente'], true) ? "?r={$r}" : ''));
    }
}
