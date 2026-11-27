<?php

namespace Tests\Concerns;

use App\Enums\MotivoEstoque;
use App\Models\Categoria;
use App\Models\Cliente;
use App\Models\Custo;
use App\Models\Marca;
use App\Models\MovimentoEstoque;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\User;
use App\Models\Variante;
use App\Services\Catalogo;
use App\Services\Pedidos\Pedidos;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Mundo mínimo para os testes de regra (o equivalente de tests/integracao/suporte/ajuda.ts): marca, categoria, uma
 * vendedora, uma gestora, uma cliente e produtos isolados por teste, com o estoque inicial no histórico.
 */
trait MundoDeTeste
{
    protected User $vendedora;

    protected User $gestora;

    protected Cliente $cliente;

    protected function criarMundo(): void
    {
        $this->vendedora = User::factory()->vendedor()->create(['name' => 'Ana Paula']);
        $this->gestora = User::factory()->gestor()->create(['name' => 'Gestora']);
        $this->cliente = Cliente::query()->create(['vendedorId' => $this->vendedora->id, 'nome' => 'Juliana Ferreira', 'telefone' => '(49) 99876-5432']);
    }

    /**
     * Produto isolado. `estoque` = [tamanho => quantidade]. Devolve o produto, o mapa tamanho → id e a referência.
     *
     * @param  array<string, int>  $estoque
     * @return array{produto: Produto, v: array<string, int>, ref: string}
     */
    protected function produtoDeTeste(array $estoque = ['P' => 5, 'M' => 5, 'G' => 5], float $preco = 100, ?float $custo = 40, bool $ativo = true): array
    {
        $ref = 'T'.Str::upper(Str::random(8));
        $marca = Marca::query()->firstOrCreate(['slug' => 'hering'], ['nome' => 'Hering']);
        $categoria = Categoria::query()->firstOrCreate(['slug' => 'camisetas'], ['nome' => 'Camisetas']);
        $produto = Produto::query()->create([
            'referencia' => $ref, 'nome' => "Produto de teste {$ref}", 'marcaId' => $marca->id, 'categoriaId' => $categoria->id, 'genero' => 'unissex',
            'preco' => $preco, 'precoCheio' => $preco, 'ativo' => $ativo,
        ]);
        if ($custo !== null) {
            Custo::query()->create(['produtoId' => $produto->id, 'valor' => $custo]);
        }
        $v = [];
        $ordem = 0;
        foreach ($estoque as $tamanho => $q) {
            $var = Variante::query()->create(['produtoId' => $produto->id, 'tamanho' => (string) $tamanho, 'estoque' => $q, 'ordem' => $ordem++, 'codigoInterno' => substr("C{$ref}{$tamanho}", 0, 20)]);
            if ($q > 0) {
                MovimentoEstoque::query()->create(['varianteId' => $var->id, 'delta' => $q, 'motivo' => MotivoEstoque::Entrada, 'observacao' => 'Estoque inicial (teste)']);
            }
            $v[(string) $tamanho] = $var->id;
        }

        app(Catalogo::class)->invalidar();

        return ['produto' => $produto, 'v' => $v, 'ref' => $ref];
    }

    protected function variante(int $id): Variante
    {
        return Variante::query()->findOrFail($id);
    }

    /** @return array<string, string> */
    protected function base(): array
    {
        return ['clienteId' => $this->cliente->id, 'vendedorId' => $this->cliente->vendedorId, 'nomeCliente' => $this->cliente->nome, 'telefoneCliente' => $this->cliente->telefone];
    }

    protected function pedidos(): Pedidos
    {
        return app(Pedidos::class);
    }

    /**
     * Cria pedido de compra (ou outro tipo) pela loja.
     *
     * @param  list<array{varianteId: int, quantidade: int}>  $linhas
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function criarPedido(array $linhas, string $tipo = 'compra', array $extra = []): array
    {
        return $this->pedidos()->criar([...$this->base(), 'tipo' => $tipo, 'origem' => 'loja', 'linhas' => $linhas, ...$extra]);
    }

    /** @return Collection<int, PedidoItem> */
    protected function itensDe(string $pedidoId)
    {
        return PedidoItem::query()->where('pedidoId', $pedidoId)->orderBy('id')->get();
    }

    protected function pedido(string $id): Pedido
    {
        return Pedido::query()->findOrFail($id);
    }
}
