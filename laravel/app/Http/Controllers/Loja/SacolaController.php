<?php

namespace App\Http\Controllers\Loja;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\SacolaCliente;
use App\Models\Variante;
use App\Queries\Cupons;
use App\Queries\Loja;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Cupons\AvaliadorDeCupom;
use App\Services\Cupons\CupomNoPedido;
use App\Services\Loja\AvisosDePedido;
use App\Services\Loja\Navegacao;
use App\Services\Pedidos\Pedidos;
use App\Support\Contato;
use App\Support\Links;
use App\Support\Telefone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Sacola (src/app/(loja)/sacola, acoes/pedidos.ts → enviarPedido, previaCupom, conferirSacola; acoes/recompra.ts). */
class SacolaController extends Controller
{
    /** Códigos de cupom errados por cliente (CUPOM_POR_CLIENTE): 10 a cada 15 minutos. */
    private const CUPONS_ERRADOS = 10;

    private const REGRAS_LINHAS = [
        'linhas' => ['required', 'array', 'min:1', 'max:40'], 'linhas.*.varianteId' => ['required', 'integer'], 'linhas.*.quantidade' => ['required', 'integer', 'min:1', 'max:20'],
    ];

    public function show(Request $request, Config $config, Loja $loja, Cupons $cupons): Response
    {
        $u = $request->user();
        $ficha = $loja->ficha($u);
        // Cupons que a própria cliente pode aplicar agora (primeira compra, pessoais, criados para ela).
        $ofertas = $ficha ? collect($cupons->daFicha($ficha->id))->filter(fn ($c) => $c['situacao'] === 'disponivel' && $c['quemAplica'] !== 'equipe')
            ->map(fn ($c) => ['codigo' => $c['codigo'], 'regra' => $c['regra'], 'primeiraCompra' => $c['origem'] === 'primeiraCompra'])->values()->all() : [];

        return Inertia::render('Loja/Sacola', [
            'frete' => $config->get('frete'),
            'cepsCondicional' => $config->get('cepsCondicional'),
            'cepInicial' => $ficha?->cep,
            'cuponsLigados' => (bool) $config->get('cupons.ligados'),
            'ofertasCupom' => $ofertas,
            'destino' => $ficha ? ['nome' => Contato::de($ficha->vendedor, '')['nome']] : null,
        ]);
    }

    /**
     * Q-02/B-06: confere a sacola do navegador com o catálogo atual. Para cada tamanho, o preço e o disponível de agora,
     * ou null se saiu do catálogo. Não grava nada.
     */
    public function conferir(Request $request, Catalogo $catalogo): JsonResponse
    {
        $ids = array_slice(array_values(array_unique(array_filter((array) $request->input('ids', []), fn ($v) => is_int($v)))), 0, 60);
        $r = array_fill_keys($ids, null);
        foreach ($catalogo->lista() as $p) {
            foreach ($p['variantes'] as $v) {
                if (array_key_exists($v['id'], $r)) {
                    $r[$v['id']] = ['preco' => $p['preco'], 'disponivel' => $v['disponivel']];
                }
            }
        }

        return response()->json((object) $r);
    }

    /** Confere o cupom com as peças e o tipo do pedido, sem gravar. Código inexistente conta como tentativa. */
    public function previaCupom(Request $request, Config $config, CupomNoPedido $cupons, Navegacao $navegacao): JsonResponse
    {
        $u = $request->user();
        if (! $config->get('cupons.ligados')) {
            return response()->json(['ok' => false, 'erro' => 'Os cupons não estão disponíveis agora.']);
        }
        $chave = "cupom:{$u->id}";
        if (RateLimiter::tooManyAttempts($chave, self::CUPONS_ERRADOS)) {
            return response()->json(['ok' => false, 'erro' => 'Muitos códigos errados. Tente de novo em '.max(1, (int) ceil(RateLimiter::availableIn($chave) / 60)).' min.']);
        }
        $d = validator($request->all(), self::REGRAS_LINHAS);
        if ($d->fails()) {
            return response()->json(['ok' => false, 'erro' => 'A sacola está vazia.']);
        }
        $linhas = $d->validated()['linhas'];
        $clienteId = Cliente::query()->where('userId', $u->id)->value('id');
        if (! $clienteId) {
            return response()->json(['ok' => false, 'erro' => 'Seu cadastro de cliente não foi encontrado. Fale com a loja.']);
        }
        $codigo = (string) $request->input('codigo', '');
        $anotar = fn (array $r) => defer(fn () => rescue(fn () => $navegacao->registrarCupom($clienteId, $codigo, $r)));
        $cupom = $cupons->buscar($codigo);
        if (! $cupom) {
            RateLimiter::hit($chave, 15 * 60);
            $anotar(['ok' => false, 'erro' => 'não existe']);

            return response()->json(['ok' => false, 'erro' => 'Cupom não encontrado. Confira as letras e os números.']);
        }
        $variantes = Variante::query()->with('produto:id,preco')->whereIn('id', array_column($linhas, 'varianteId'))->get(['id', 'produtoId'])->keyBy('id');
        $pecas = $cupons->pecas(array_values(array_map(fn ($l) => [
            'chave' => (int) $l['varianteId'], 'produtoId' => $variantes[$l['varianteId']]->produtoId, 'preco' => (float) $variantes[$l['varianteId']]->produto->preco, 'quantidade' => (int) $l['quantidade'],
        ], array_filter($linhas, fn ($l) => $variantes->has($l['varianteId'])))));
        $r = AvaliadorDeCupom::avaliar(CupomNoPedido::regraDe($cupom), $pecas, [
            'agora' => now(), 'quem' => 'cliente', 'clienteId' => $clienteId, 'tipoPedido' => $request->input('tipo') === 'condicional' ? 'condicional' : 'compra',
            ...$cupons->contexto($cupom->id, $clienteId),
        ]);
        $anotar($r['ok'] ? ['ok' => true] : ['ok' => false, 'erro' => $r['mensagem']]);
        if (! $r['ok']) {
            return response()->json(['ok' => false, 'erro' => $r['mensagem']]);
        }

        return response()->json([
            'ok' => true, 'codigo' => $cupom->codigo, 'desconto' => $r['desconto'], 'freteGratis' => $r['freteGratis'],
            'regra' => AvaliadorDeCupom::regraEmPalavras(CupomNoPedido::regraDe($cupom), CupomNoPedido::nomesDosAlvos($cupom)),
        ]);
    }

    /**
     * A cliente fecha a sacola: grava o pedido (D-07) e devolve o que a mensagem do WhatsApp precisa (a tela monta o texto
     * com resources/js/lib/mensagem-pedido.ts, a mesma da prévia).
     */
    public function enviar(Request $request, Config $config, Pedidos $pedidos, AvisosDePedido $avisos): JsonResponse
    {
        $u = $request->user();
        $v = validator($request->all(), [...self::REGRAS_LINHAS, 'tipo' => ['required', 'in:compra,condicional'], 'cep' => ['nullable', 'string'], 'cupom' => ['nullable', 'string', 'max:40']]);
        if ($v->fails()) {
            return response()->json(['ok' => false, 'erro' => $v->errors()->first()]);
        }
        $d = $v->validated();
        $cliente = Cliente::query()->where('userId', $u->id)->with(['vendedor:id,name,ativo,numeroPrincipalId', 'vendedor.'.Contato::COM])->first();
        if (! $cliente) {
            return response()->json(['ok' => false, 'erro' => 'Seu cadastro de cliente não foi encontrado. Fale com a loja.']);
        }
        $cep = null;
        if ($d['tipo'] === 'condicional') {
            $cep = Telefone::formatarCep((string) ($d['cep'] ?? ''));
            if (strlen(Telefone::digitos($cep)) !== 8) {
                return response()->json(['ok' => false, 'erro' => 'Digite um CEP válido com 8 números.']);
            }
            if (! in_array($cep, $config->get('cepsCondicional'), true)) {
                return response()->json(['ok' => false, 'erro' => 'O condicional ainda não atende este CEP.', 'cepFora' => true]);
            }
        }
        // D-31: o pedido vai para o número da loja ligado à vendedora; sem ele, para o número padrão.
        $contato = Contato::de($cliente->vendedor, $config->get('whatsappLoja'));
        $codigoCupom = trim((string) ($d['cupom'] ?? ''));
        try {
            $p = $pedidos->criar([
                'tipo' => $d['tipo'], 'origem' => 'loja', 'clienteId' => $cliente->id, 'vendedorId' => $cliente->vendedorId,
                'nomeCliente' => $cliente->nome, 'telefoneCliente' => $cliente->telefone, 'cep' => $cep, 'regraFrete' => $config->get('frete'), 'usuarioId' => $u->id,
                'linhas' => array_map(fn ($l) => ['varianteId' => (int) $l['varianteId'], 'quantidade' => (int) $l['quantidade']], $d['linhas']),
                'cupom' => $codigoCupom !== '' && $config->get('cupons.ligados') ? ['codigo' => $codigoCupom, 'quem' => 'cliente'] : null,
            ]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        if ($cep && ! $cliente->cep) {
            $cliente->update(['cep' => $cep]);
        }
        // Histórico (docs/21): a sacola virou pedido, não fica "parada".
        SacolaCliente::query()->where('clienteId', $cliente->id)->delete();
        $site = rtrim((string) config('app.url'), '/');
        defer(fn () => rescue(fn () => $avisos->avisar($p['id'], 'novo', $site)));

        return response()->json([
            'ok' => true, 'codigo' => $p['codigo'], 'tipo' => $d['tipo'], 'telefone' => $contato['telefone'], 'destinatario' => Contato::primeiroNome($contato['nome']),
            'nomeVendedor' => $contato['nome'], 'itens' => $p['itens'], 'nomeCliente' => $cliente->nome, 'cep' => $cep, 'cupom' => $p['cupom'],
            'frete' => $d['tipo'] === 'compra' ? $p['frete'] : null, 'site' => $site, 'linkPedido' => "{$site}/painel/pedidos/{$p['id']}",
            // D-20: primeiro link da mensagem; o WhatsApp mostra o cartão com as fotos das peças.
            'linkPublico' => Links::publicoDoPedido($site, $p['codigo']),
            // Pagamento online ("Pagar agora") entra na fase 6.
            'linkPagamento' => null,
        ]);
    }
}
