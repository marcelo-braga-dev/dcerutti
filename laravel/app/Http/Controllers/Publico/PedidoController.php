<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use App\Models\Pedido;
use App\Services\CartaoPrevia;
use App\Services\Config;
use App\Support\Dinheiro;
use App\Support\Links;
use Illuminate\Http\Response as Resposta;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Página pública do pedido (D-20; porta de app/p/[chave]): o link que vai na mensagem do WhatsApp. A prévia mostra o
 * cartão com as fotos; ao tocar, o vendedor vê as peças grandes para separar. Sem dados pessoais da cliente.
 */
class PedidoController extends Controller
{
    public function __construct(private Config $config) {}

    /** @return ?array<string, mixed> */
    public static function publico(string $chave): ?array
    {
        $codigo = Links::codigoDaChave($chave);
        $p = $codigo ? Pedido::query()->with(['itens' => fn ($q) => $q->orderBy('id')])->where('codigo', $codigo)->first() : null;
        if (! $p) {
            return null;
        }
        $itens = $p->itens->map(fn ($i) => [
            'id' => $i->id, 'nome' => $i->nome, 'marca' => $i->marca, 'referencia' => $i->referencia, 'cor' => $i->cor, 'tamanho' => $i->tamanho, 'codigoInterno' => $i->codigoInterno,
            'quantidade' => $i->quantidade, 'preco' => (float) $i->precoUnitario, 'imagem' => $i->imagem, 'situacao' => $i->situacao->value,
        ])->values()->all();
        $frete = $p->frete === null ? null : (float) $p->frete;

        return [
            'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'criadoEm' => $p->criadoEm->toIso8601String(), 'itens' => $itens,
            'pecas' => array_sum(array_column($itens, 'quantidade')), 'subtotal' => round(array_sum(array_map(fn ($i) => $i['preco'] * $i['quantidade'], $itens)) * 100) / 100,
            'desconto' => (float) $p->descontoCupom, 'cupom' => $p->codigoCupom, 'freteCupom' => (bool) $p->freteCupom, 'frete' => $frete,
            // `total` do pedido já vem com o desconto do cupom e sem o frete.
            'total' => (float) $p->total + ($p->tipo->value === 'compra' && $frete !== null ? $frete : 0),
        ];
    }

    public function show(string $chave): Response
    {
        $p = self::publico($chave);
        abort_unless($p, 404);
        $nome = $this->config->nomeDaLoja()['nome'];
        $titulo = ($p['tipo'] === 'condicional' ? 'Condicional' : 'Pedido')." {$p['codigo']} · {$nome}";
        $site = rtrim((string) config('app.url'), '/');

        return Inertia::render('Publico/Pedido', ['p' => $p])->withViewData(['og' => [
            'titulo' => $titulo, 'descricao' => $p['pecas'].' '.($p['pecas'] === 1 ? 'peça' : 'peças').' · '.Dinheiro::brl($p['total']).($p['tipo'] === 'compra' && $p['frete'] === null ? ' + frete' : ''),
            'imagem' => "{$site}/p/".rawurlencode($chave).'/cartao.jpg',
        ]]);
    }

    public function cartao(string $chave, CartaoPrevia $cartao): Resposta
    {
        $p = self::publico($chave);
        abort_unless($p, 404);

        return self::jpeg($cartao->gerar(['codigo' => $p['codigo'], 'tipo' => $p['tipo'], 'status' => $p['status'], 'pecas' => $p['pecas'], 'total' => $p['total'], 'frete' => $p['frete'],
            'itens' => array_map(fn ($i) => array_intersect_key($i, array_flip(['id', 'nome', 'tamanho', 'quantidade', 'preco', 'imagem'])), $p['itens'])]));
    }

    /** Curto: o vendedor pode editar o pedido e o cartão muda. */
    public static function jpeg(string $dados): Resposta
    {
        return response($dados, 200, ['Content-Type' => 'image/jpeg', 'Cache-Control' => 'public, max-age=300', 'X-Content-Type-Options' => 'nosniff', 'X-Robots-Tag' => 'noindex']);
    }
}
