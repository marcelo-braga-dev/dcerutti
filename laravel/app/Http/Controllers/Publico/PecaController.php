<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use App\Services\CartaoPrevia;
use App\Services\Config;
use App\Services\InteressePublico;
use App\Support\Dinheiro;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Link da peça (docs/26, D-32, D-36): aberto sem login, para quem recebeu de uma vendedora. A chave assinada autoriza. */
class PecaController extends Controller
{
    public function __construct(private InteressePublico $interesse, private Config $config) {}

    public function show(string $chave): Response
    {
        $p = $this->interesse->peca($chave);
        abort_unless($p, 404);
        $loja = $this->config->nomeDaLoja()['nome'];
        $site = rtrim((string) config('app.url'), '/');

        return Inertia::render('Publico/Peca', ['chave' => $chave, 'p' => $p, 'vitrines' => (bool) $this->config->get('vitrines.ligadas')])->withViewData(['og' => [
            'titulo' => "{$p['nome']} · {$loja}", 'descricao' => Dinheiro::brl($p['preco']),
            'imagem' => "{$site}/peca/".rawurlencode($chave).'/cartao.jpg',
        ]]);
    }

    public function quero(Request $request, string $chave): JsonResponse
    {
        return response()->json($this->interesse->quererPeca($chave, $request->only(['varianteId', 'nome', 'telefone', 'aceite', 'site', 'ofertas']), $request->ip()));
    }

    /** Cartão da peça para a prévia do link: foto e preço, sem dados de cliente nem estoque. */
    public function cartao(string $chave, CartaoPrevia $cartao): \Illuminate\Http\Response
    {
        $p = $this->interesse->peca($chave);
        abort_unless($p, 404);
        $tamanhos = implode(', ', array_column($p['variantes'], 'tamanho'));

        return PedidoController::jpeg($cartao->gerar(
            ['codigo' => $p['referencia'], 'tipo' => 'compra', 'status' => 'pendente', 'pecas' => 1, 'total' => $p['preco'], 'frete' => null, 'itens' => [['id' => $p['produtoId'], 'nome' => $p['nome'], 'tamanho' => '', 'quantidade' => 1, 'preco' => $p['preco'], 'imagem' => $p['imagens'][0] ?? null]]],
            ['selo' => 'PEÇA PARA VOCÊ', 'valorRotulo' => 'Valor', 'extra' => $tamanhos ? "Tamanhos: {$tamanhos}" : 'Fale com a loja'],
        ));
    }
}
