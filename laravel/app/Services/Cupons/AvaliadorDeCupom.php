<?php

namespace App\Services\Cupons;

use App\Support\Datas;
use App\Support\Dinheiro;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * Regras do cupom (docs/20-cupons.md; porta de src/lib/cupom.ts), sem banco. Dinheiro em centavos inteiros por dentro,
 * para a soma das partes bater com o total.
 *
 * Regra: ['codigo','tipo','valor','tetoDesconto','minimoCompra','inicioEm','fimEm','limiteTotal','limitePorCliente',
 *         'somentePrimeiraCompra','valePromocao','quemAplica','ativo','categorias','marcas','produtos','clientes','diasAposCadastro']
 * Peça: ['chave','produtoId','categoriaId','marcaId','emPromocao','preco' (reais),'quantidade']
 * Contexto: ['agora','quem','clienteId','usosTotal','usosCliente','jaComprou','clienteDesde','tipoPedido','jaAplicado']
 */
class AvaliadorDeCupom
{
    public static function normalizarCodigo(string $t): string
    {
        return (string) preg_replace('/\s+/', '', mb_strtoupper(trim($t)));
    }

    public static function codigoValido(string $t): bool
    {
        return preg_match('/^[A-Z0-9][A-Z0-9-]{2,29}$/', $t) === 1;
    }

    /** @param array<string, mixed> $c @param array<string, mixed> $p */
    public static function pecaElegivel(array $c, array $p): bool
    {
        if ($p['emPromocao'] && ! $c['valePromocao']) {
            return false;
        }
        if (count($c['categorias']) + count($c['marcas']) + count($c['produtos']) === 0) {
            return true;
        }

        return in_array($p['produtoId'], $c['produtos'], true) || in_array($p['categoriaId'], $c['categorias'], true) || in_array($p['marcaId'], $c['marcas'], true);
    }

    /**
     * Confere o cupom e calcula o desconto de cada linha (em reais), ou devolve o motivo da recusa.
     *
     * @param  array<string, mixed>  $c
     * @param  list<array<string, mixed>>  $pecas
     * @param  array<string, mixed>  $ctx
     * @return array{ok: true, desconto: float, descontos: list<array{chave: mixed, valor: float}>, freteGratis: bool}|array{ok: false, recusa: string, mensagem: string}
     */
    public static function avaliar(array $c, array $pecas, array $ctx): array
    {
        $nao = fn (string $recusa, string $mensagem) => ['ok' => false, 'recusa' => $recusa, 'mensagem' => $mensagem];
        /** @var DateTimeInterface $agora */
        $agora = $ctx['agora'];
        if (empty($ctx['jaAplicado'])) {
            if (! $c['ativo']) {
                return $nao('desativado', 'Este cupom não está mais disponível.');
            }
            if ($c['quemAplica'] !== 'ambos' && $c['quemAplica'] !== $ctx['quem']) {
                return $nao('quem', $ctx['quem'] === 'cliente' ? 'Este cupom só pode ser aplicado pelo seu vendedor.' : 'Este cupom é só para a cliente usar na sacola.');
            }
            if ($agora < $c['inicioEm']) {
                return $nao('agendado', 'Este cupom começa em '.Datas::formatar($c['inicioEm']).'.');
            }
            if ($c['fimEm'] && $agora > $c['fimEm']) {
                return $nao('expirado', 'Este cupom expirou em '.Datas::formatar($c['fimEm']).'.');
            }
            if (count($c['clientes']) && ! in_array($ctx['clienteId'], $c['clientes'], true)) {
                return $nao('cliente', 'Este cupom não está disponível para esta cliente.');
            }
            if ($c['somentePrimeiraCompra'] && $ctx['jaComprou']) {
                return $nao('primeiraCompra', 'Este cupom é só para a primeira compra.');
            }
            $prazo = self::prazoAposCadastro($c, $ctx['clienteDesde'] ?? null);
            if ($prazo && $agora > $prazo) {
                return $nao('expirado', 'Seu cupom de primeira compra venceu em '.Datas::formatar($prazo).'.');
            }
            if ($c['limiteTotal'] !== null && $ctx['usosTotal'] >= $c['limiteTotal']) {
                return $nao('esgotado', 'Este cupom esgotou.');
            }
            if ($c['limitePorCliente'] !== null && $ctx['usosCliente'] >= $c['limitePorCliente']) {
                return $nao('jaUsou', $c['limitePorCliente'] === 1 ? 'Este cupom já foi usado por esta cliente.' : "Este cupom já foi usado {$c['limitePorCliente']} vezes por esta cliente.");
            }
        }
        if ($c['tipo'] === 'freteGratis' && $ctx['tipoPedido'] !== 'compra') {
            return $nao('semFrete', 'Este cupom vale só para pedido com entrega.');
        }

        // P-08: o mínimo é sobre o pedido todo (peças com o desconto do vendedor, sem frete).
        $subtotal = array_sum(array_map(fn ($p) => Dinheiro::centavos($p['preco']) * $p['quantidade'], $pecas));
        if ($c['minimoCompra'] !== null && $subtotal < Dinheiro::centavos($c['minimoCompra'])) {
            $falta = (Dinheiro::centavos($c['minimoCompra']) - $subtotal) / 100;

            return $nao('minimo', 'Faltam '.Dinheiro::brl($falta).' para usar este cupom (mínimo de '.Dinheiro::brl($c['minimoCompra']).').');
        }

        $elegiveis = [];
        foreach ($pecas as $p) {
            if (self::pecaElegivel($c, $p)) {
                $elegiveis[] = ['chave' => $p['chave'], 'valor' => Dinheiro::centavos($p['preco']) * $p['quantidade']];
            }
        }
        if (! array_filter($elegiveis, fn ($e) => $e['valor'] > 0)) {
            return $nao('semPecas', 'Este cupom não vale para as peças deste pedido.');
        }

        if ($c['tipo'] === 'freteGratis') {
            return ['ok' => true, 'desconto' => 0.0, 'descontos' => array_map(fn ($p) => ['chave' => $p['chave'], 'valor' => 0.0], $pecas), 'freteGratis' => true];
        }

        $base = array_sum(array_column($elegiveis, 'valor'));
        $desconto = $c['tipo'] === 'percentual' ? (int) round($base * ((float) ($c['valor'] ?? 0)) / 100) : Dinheiro::centavos($c['valor'] ?? 0);
        if ($c['tipo'] === 'percentual' && $c['tetoDesconto'] !== null) {
            $desconto = min($desconto, Dinheiro::centavos($c['tetoDesconto']));
        }
        $desconto = max(0, min($desconto, $base));

        $porChave = [];
        foreach (self::distribuir($elegiveis, $desconto) as $d) {
            $porChave[(string) $d['chave']] = $d['valor'];
        }

        return [
            'ok' => true,
            'desconto' => $desconto / 100,
            'descontos' => array_map(fn ($p) => ['chave' => $p['chave'], 'valor' => ($porChave[(string) $p['chave']] ?? 0) / 100], $pecas),
            'freteGratis' => false,
        ];
    }

    /** @param array<string, mixed> $c */
    public static function prazoAposCadastro(array $c, ?DateTimeInterface $clienteDesde): ?DateTimeInterface
    {
        if (($c['diasAposCadastro'] ?? null) === null || ! $clienteDesde) {
            return null;
        }

        return CarbonImmutable::instance($clienteDesde)->addSeconds($c['diasAposCadastro'] * 86400);
    }

    /** "10% de desconto" / "R$ 20,00 de desconto" / "Frete grátis". @param array<string, mixed> $c */
    public static function beneficio(array $c): string
    {
        if ($c['tipo'] === 'freteGratis') {
            return 'Frete grátis';
        }
        if ($c['tipo'] === 'valor') {
            return Dinheiro::brl($c['valor'] ?? 0).' de desconto';
        }
        $pct = str_replace('.', ',', (string) (0 + (float) ($c['valor'] ?? 0))).'%';

        return "{$pct} de desconto".($c['tetoDesconto'] !== null ? ' (até '.Dinheiro::brl($c['tetoDesconto']).')' : '');
    }

    /**
     * Regra em palavras, para o vendedor divulgar e a cliente entender.
     *
     * @param  array<string, mixed>  $c
     * @param  list<string>  $nomes
     */
    public static function regraEmPalavras(array $c, array $nomes = []): string
    {
        $partes = [self::beneficio($c)];
        if ($nomes) {
            $partes[] = 'em '.implode(', ', $nomes);
        }
        if ($c['minimoCompra'] !== null) {
            $partes[] = 'em compras a partir de '.Dinheiro::brl($c['minimoCompra']);
        }
        if (! $c['valePromocao']) {
            $partes[] = 'não vale para produtos em promoção';
        }
        if ($c['somentePrimeiraCompra']) {
            $partes[] = ($c['diasAposCadastro'] ?? null) !== null ? "só na primeira compra, até {$c['diasAposCadastro']} dias depois do cadastro" : 'só na primeira compra';
        }
        if ($c['limitePorCliente'] !== null) {
            $partes[] = $c['limitePorCliente'] === 1 ? 'uma vez por cliente' : "até {$c['limitePorCliente']} vezes por cliente";
        }
        if ($c['fimEm']) {
            $partes[] = 'até '.Datas::formatar($c['fimEm']);
        }

        return implode(' · ', $partes);
    }

    /**
     * Divide `total` (centavos) na proporção de cada linha; a sobra do arredondamento vai para a linha de maior valor.
     *
     * @param  list<array{chave: mixed, valor: int}>  $linhas
     * @return list<array{chave: mixed, valor: int}>
     */
    private static function distribuir(array $linhas, int $total): array
    {
        $base = array_sum(array_column($linhas, 'valor'));
        if (! $base || ! $total) {
            return array_map(fn ($l) => ['chave' => $l['chave'], 'valor' => 0], $linhas);
        }
        $partes = array_map(fn ($l) => ['chave' => $l['chave'], 'valor' => intdiv($total * $l['valor'], $base), 'peso' => $l['valor']], $linhas);
        $sobra = $total - array_sum(array_column($partes, 'valor'));
        $maior = 0;
        foreach ($partes as $i => $p) {
            if ($p['peso'] > $partes[$maior]['peso']) {
                $maior = $i;
            }
        }
        $partes[$maior]['valor'] += $sobra;

        return array_map(fn ($p) => ['chave' => $p['chave'], 'valor' => $p['valor']], $partes);
    }
}
