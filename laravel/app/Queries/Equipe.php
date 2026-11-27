<?php

namespace App\Queries;

use App\Models\AtividadeEquipe;
use App\Models\Cliente;
use App\Models\Meta;
use App\Models\Pedido;
use App\Models\User;
use App\Models\Venda;
use App\Support\Datas;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/** Consultas da equipe (src/server/consultas/equipe.ts e trechos de src/server/relatorios.ts). */
class Equipe
{
    /** D-26: online = sinal do painel ou do caixa nos últimos 3 minutos. */
    public static function online(?DateTimeInterface $ultimoAcesso): bool
    {
        return $ultimoAcesso !== null && now()->getTimestamp() - $ultimoAcesso->getTimestamp() < 180;
    }

    /** Meta de cada vendedora no mês: a do mês, ou a mais recente anterior. @param list<string> $ids @return array<string, float> */
    public function metasDoMes(array $ids, string $mes): array
    {
        $m = [];
        foreach (Meta::query()->whereIn('vendedorId', $ids)->where('mes', '<=', $mes)->orderByDesc('mes')->get(['vendedorId', 'valor']) as $x) {
            $m[$x->vendedorId] ??= (float) $x->valor;
        }

        return $m;
    }

    /** @return array<string, array{valor: float, n: int}> */
    public function vendidoPorVendedor(string $mes, ?string $vendedorId = null): array
    {
        [$de, $ate] = Datas::intervaloDoMes($mes);

        return Venda::query()->where('data', '>=', $de)->where('data', '<', $ate)->when($vendedorId, fn ($q) => $q->where('vendedorId', $vendedorId))
            ->selectRaw('vendedorId, sum(valor) as valor, count(*) as n')->groupBy('vendedorId')->get()
            ->mapWithKeys(fn ($g) => [$g->vendedorId => ['valor' => (float) $g->valor, 'n' => (int) $g->n]])->all();
    }

    /**
     * Perfil da vendedora para o gestor: números do mês, carteira (melhores, nunca compraram, paradas há 90 dias),
     * pedidos em aberto e vendas recentes.
     *
     * @return array<string, mixed>
     */
    public function perfil(string $id, string $mes): array
    {
        [$de, $ate] = Datas::intervaloDoMes($mes);
        $clientes = fn () => Cliente::query()->where('vendedorId', $id)->where('telefone', '<>', '');
        $doMes = Venda::query()->where('vendedorId', $id)->where('data', '>=', $de)->where('data', '<', $ate)->selectRaw('coalesce(sum(valor),0) as v, count(*) as n')->first();
        $totais = Venda::query()->whereNotNull('clienteId')->whereIn('clienteId', $clientes()->select('id'))->selectRaw('clienteId, sum(valor) as total, max(data) as ultima')->groupBy('clienteId')->get();
        $nClientes = $clientes()->count();
        $melhores = $totais->sortByDesc(fn ($t) => (float) $t->total)->take(8);
        $nomes = Cliente::query()->whereIn('id', $melhores->pluck('clienteId'))->pluck('nome', 'id');
        $corte = now()->subDays(90)->format('Y-m-d H:i:s');

        return [
            'vendidoMes' => (float) $doMes->v, 'vendasMes' => (int) $doMes->n, 'clientes' => $nClientes, 'comAcesso' => $clientes()->whereNotNull('userId')->count(),
            'compraram' => $totais->count(), 'nuncaCompraram' => max(0, $nClientes - $totais->count()), 'paradas' => $totais->filter(fn ($t) => $t->ultima < $corte)->count(),
            'melhores' => $melhores->filter(fn ($m) => isset($nomes[$m->clienteId]))->map(fn ($m) => ['id' => $m->clienteId, 'nome' => $nomes[$m->clienteId], 'total' => (float) $m->total, 'ultima' => CarbonImmutable::parse($m->ultima, 'UTC')->toIso8601String()])->values()->all(),
            'abertos' => Pedido::query()->where('vendedorId', $id)->where('status', 'pendente')->orderByDesc('criadoEm')->limit(6)->get(['id', 'codigo', 'tipo', 'nomeCliente', 'clienteId', 'total', 'criadoEm'])
                ->map(fn ($o) => ['id' => $o->id, 'codigo' => $o->codigo, 'tipo' => $o->tipo->value, 'nomeCliente' => $o->nomeCliente, 'clienteId' => $o->clienteId, 'total' => (float) $o->total, 'criadoEm' => $o->criadoEm->toIso8601String()])->all(),
            'nAbertos' => Pedido::query()->where('vendedorId', $id)->where('status', 'pendente')->count(),
            'recentes' => Venda::query()->where('vendedorId', $id)->with(['cliente:id,nome', 'pedido:id,codigo'])->orderByDesc('data')->limit(6)->get()
                ->map(fn ($x) => ['id' => $x->id, 'valor' => (float) $x->valor, 'data' => $x->data->toIso8601String(), 'observacao' => $x->observacao, 'cliente' => $x->cliente ? ['id' => $x->cliente->id, 'nome' => $x->cliente->nome] : null, 'pedido' => $x->pedido ? ['id' => $x->pedido->id, 'codigo' => $x->pedido->codigo] : null])->all(),
        ];
    }

    /** Últimas ações de uma pessoa. @return list<array<string, mixed>> */
    public function ultimasAcoes(string $usuarioId, int $quantas = 12): array
    {
        return AtividadeEquipe::query()->where('usuarioId', $usuarioId)->orderByDesc('criadoEm')->orderByDesc('id')->limit($quantas)->get()
            ->map(fn ($a) => ['id' => (string) $a->id, 'tipo' => $a->tipo->value, 'descricao' => $a->descricao, 'clienteId' => $a->clienteId, 'criadoEm' => $a->criadoEm->toIso8601String()])->all();
    }

    /** @return list<array{id: string, nome: string}> */
    public static function vendedoresAtivos(): array
    {
        return User::query()->where('papel', 'vendedor')->where('ativo', true)->orderBy('name')->get(['id', 'name'])->map(fn ($v) => ['id' => $v->id, 'nome' => $v->name])->all();
    }
}
