<?php

namespace App\Support;

/**
 * Contas do caixa (src/lib/caixa.ts → calcularVenda, dentroDoLimite, conferirPagamentos). As mesmas da tela; o servidor
 * confere tudo de novo antes de gravar. Contas em centavos para não acumular arredondamento.
 */
class CalculoCaixa
{
    /**
     * Preço final de cada peça: o desconto geral vira um percentual aplicado ao preço combinado de cada unidade
     * (arredondado ao centavo) e o total é a soma desses preços.
     *
     * @param  list<array{varianteId: int, preco: float, quantidade: int, precoCombinado?: ?float}>  $linhas
     * @param  ?array{tipo: string, valor: float}  $geral
     * @return array{subtotal: float, desconto: float, descontoParte: float, precos: array<int, float>, total: float}
     */
    public static function venda(array $linhas, ?array $geral = null): array
    {
        $c = fn ($r) => (int) round(((float) $r) * 100);
        $combinado = function (array $l) use ($c): int {
            $p = $l['precoCombinado'] ?? null;

            return $c($p !== null && $p >= 0 && $p < $l['preco'] ? $p : $l['preco']);
        };
        $subtotal = array_sum(array_map(fn ($l) => $c($l['preco']) * $l['quantidade'], $linhas));
        $base = array_sum(array_map(fn ($l) => $combinado($l) * $l['quantidade'], $linhas));
        $fator = 1.0;
        if ($geral && $geral['valor'] > 0 && $base > 0) {
            $fator = $geral['tipo'] === 'percentual' ? 1 - min(100, $geral['valor']) / 100 : max(0, 1 - min($c($geral['valor']), $base) / $base);
        }
        $precos = [];
        $total = 0;
        foreach ($linhas as $l) {
            $unit = max(0, (int) round($combinado($l) * $fator));
            $precos[$l['varianteId']] = $unit / 100;
            $total += $unit * $l['quantidade'];
        }
        $desconto = $subtotal - $total;

        return ['subtotal' => $subtotal / 100, 'desconto' => $desconto / 100, 'descontoParte' => $subtotal ? $desconto / $subtotal : 0.0, 'precos' => $precos, 'total' => $total / 100];
    }

    /** O vendedor dá até `limite`% sem o gestor; o gestor não tem limite. */
    public static function dentroDoLimite(float $parte, float $limitePct, bool $gestor): bool
    {
        return $gestor || $parte <= $limitePct / 100 + 1e-9;
    }

    /**
     * Pagamentos contra o total: pago, falta, sobra e troco (só do dinheiro recebido a mais). `ok` quando bate ao centavo.
     *
     * @param  list<array{forma: string, valor: float, parcelas?: ?int, recebido?: ?float}>  $pagamentos
     * @return array{pago: float, falta: float, sobra: float, troco: float, ok: bool}
     */
    public static function conferirPagamentos(array $pagamentos, float $total): array
    {
        $c = fn ($r) => (int) round(((float) $r) * 100);
        $pago = array_sum(array_map(fn ($p) => $c($p['valor']), $pagamentos));
        $troco = array_sum(array_map(fn ($p) => $p['forma'] === 'dinheiro' && isset($p['recebido']) ? max(0, $c($p['recebido']) - $c($p['valor'])) : 0, $pagamentos));
        $falta = $c($total) - $pago;
        $invalido = collect($pagamentos)->contains(fn ($p) => ! ($p['valor'] > 0) || ($p['forma'] === 'dinheiro' && isset($p['recebido']) && $c($p['recebido']) < $c($p['valor'])));

        return ['pago' => $pago / 100, 'falta' => max(0, $falta) / 100, 'sobra' => max(0, -$falta) / 100, 'troco' => $troco / 100, 'ok' => $falta === 0 && count($pagamentos) > 0 && ! $invalido];
    }
}
