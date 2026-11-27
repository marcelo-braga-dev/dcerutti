<?php

namespace App\Queries;

use App\Enums\StatusPedido;
use App\Models\Cliente;
use App\Models\Cupom;
use App\Models\Pedido;
use App\Models\User;
use App\Models\Venda;
use App\Services\Config;
use App\Services\Cupons\AvaliadorDeCupom;
use App\Services\Cupons\CupomNoPedido;
use DateTimeInterface;

/** Consultas de cupom (src/server/consultas/cupons.ts). */
class Cupons
{
    public function __construct(private Config $config) {}

    /** @param list<int> $ids @return array<int, array{usos: int, desconto: float}> */
    public function usos(array $ids): array
    {
        if (! $ids) {
            return [];
        }

        return Pedido::query()->whereIn('cupomId', $ids)->where('status', '<>', StatusPedido::Cancelado)
            ->selectRaw('cupomId, count(*) as usos, coalesce(sum(descontoCupom), 0) as desconto')->groupBy('cupomId')->get()
            ->mapWithKeys(fn ($g) => [$g->cupomId => ['usos' => (int) $g->usos, 'desconto' => (float) $g->desconto]])->all();
    }

    /** @param array<string, mixed> $regra */
    public static function situacao(array $regra, int $usos, ?DateTimeInterface $agora = null): string
    {
        $agora ??= now();
        if (! $regra['ativo']) {
            return 'desativado';
        }
        if ($regra['fimEm'] && $agora > $regra['fimEm']) {
            return 'expirado';
        }
        if ($regra['limiteTotal'] !== null && $usos >= $regra['limiteTotal']) {
            return 'esgotado';
        }

        return $agora < $regra['inicioEm'] ? 'agendado' : 'ativo';
    }

    /**
     * Cupons da cliente: primeira compra (enquanto vale para ela) e os pessoais, com a situação.
     *
     * @return list<array{id: int, codigo: string, origem: string, regra: string, quemAplica: string, inicioEm: string, fimEm: ?string, situacao: string}>
     */
    public function daFicha(string $clienteId): array
    {
        if (! $this->config->get('cupons.ligados')) {
            return [];
        }
        $cliente = Cliente::query()->find($clienteId, ['id', 'telefone', 'criadoEm']);
        if (! $cliente) {
            return [];
        }
        $fichas = app(CupomNoPedido::class)->fichasDaPessoa($clienteId);
        $cupons = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->where('modelo', false)->where('ativo', true)
            ->where(fn ($q) => $q->where('origem', 'primeiraCompra')->orWhereHas('clientes', fn ($c) => $c->whereIn('clienteId', $fichas)))
            ->orderBy('fimEm')->orderByDesc('criadoEm')->get();
        if ($cupons->isEmpty()) {
            return [];
        }
        $jaComprou = Venda::query()->whereIn('clienteId', $fichas)->exists();
        $totais = $this->usos($cupons->pluck('id')->all());
        $dela = Pedido::query()->whereIn('cupomId', $cupons->pluck('id'))->whereIn('clienteId', $fichas)->where('status', '<>', StatusPedido::Cancelado)
            ->selectRaw('cupomId, count(*) as n')->groupBy('cupomId')->pluck('n', 'cupomId');
        $agora = now();
        $lista = [];
        foreach ($cupons as $c) {
            $usosDela = (int) ($dela[$c->id] ?? 0);
            $usado = $c->limitePorCliente !== null && $usosDela >= $c->limitePorCliente;
            if ($c->origem->value === 'primeiraCompra' && $jaComprou && ! $usado) {
                continue;
            }
            if (! $usado && $c->limiteTotal !== null && ($totais[$c->id]['usos'] ?? 0) >= $c->limiteTotal) {
                continue;
            }
            $prazo = $c->origem->value === 'primeiraCompra' ? AvaliadorDeCupom::prazoAposCadastro(['diasAposCadastro' => $c->diasAposCadastro], $cliente->criadoEm) : null;
            $fimEm = $prazo && (! $c->fimEm || $prazo < $c->fimEm) ? $prazo : $c->fimEm;
            $situacao = $usado ? 'usado' : ($fimEm && $agora > $fimEm ? 'expirado' : ($agora < $c->inicioEm ? 'agendado' : 'disponivel'));
            $lista[] = [
                'id' => $c->id, 'codigo' => $c->codigo, 'origem' => $c->origem->value, 'regra' => AvaliadorDeCupom::regraEmPalavras(CupomNoPedido::regraDe($c), CupomNoPedido::nomesDosAlvos($c)),
                'quemAplica' => $c->quemAplica->value, 'inicioEm' => $c->inicioEm->toIso8601String(), 'fimEm' => $fimEm?->toIso8601String(), 'situacao' => $situacao,
            ];
        }

        return $lista;
    }

    /**
     * Cupons que a pessoa pode divulgar (P-13): ativos e agendados; os de clientes específicos só se algum for da
     * carteira dela. Sem números de uso.
     *
     * @return list<array<string, mixed>>
     */
    public function paraDivulgar(User $u): array
    {
        $agora = now();
        $cupons = Cupom::query()->with(CupomNoPedido::COM_ALVOS)->where('ativo', true)->where('modelo', false)->where('origem', '<>', 'proximaCompra')
            ->where(fn ($q) => $q->whereNull('fimEm')->orWhere('fimEm', '>=', $agora))->orderBy('inicioEm')->orderBy('codigo')->get();
        $usos = $this->usos($cupons->pluck('id')->all());
        $lista = [];
        foreach ($cupons as $c) {
            $regra = CupomNoPedido::regraDe($c);
            $situacao = self::situacao($regra, $usos[$c->id]['usos'] ?? 0, $agora);
            $clientes = $c->clientes->map(fn ($x) => $x->cliente)->filter(fn ($x) => $u->ehGestor() || $x->vendedorId === $u->id)->values();
            $especifico = $c->clientes->isNotEmpty();
            if (! in_array($situacao, ['ativo', 'agendado'], true) || ($especifico && $clientes->isEmpty())) {
                continue;
            }
            $lista[] = [
                'id' => $c->id, 'codigo' => $c->codigo, 'descricao' => $c->descricao, 'tipo' => $c->tipo->value, 'quemAplica' => $c->quemAplica->value,
                'inicioEm' => $c->inicioEm->toIso8601String(), 'fimEm' => $c->fimEm?->toIso8601String(), 'temLimite' => $c->limiteTotal !== null,
                'regra' => AvaliadorDeCupom::regraEmPalavras($regra, CupomNoPedido::nomesDosAlvos($c)), 'situacao' => $situacao,
                'especifico' => $especifico, 'clientes' => $clientes->map(fn ($x) => ['id' => $x->id, 'nome' => $x->nome])->all(),
            ];
        }

        return $lista;
    }
}
