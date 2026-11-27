<?php

namespace App\Services;

use App\Enums\MotivoEstoque;
use App\Exceptions\ErroNegocio;
use App\Models\MovimentoEstoque;
use App\Support\Texto;
use Illuminate\Support\Facades\DB;

/**
 * Única porta de alteração de estoque (src/server/estoque.ts). Toda função roda dentro de uma transação aberta por
 * quem chama e usa UPDATE condicional ou trava de linha, para duas pessoas não venderem, reservarem ou ajustarem a
 * mesma peça ao mesmo tempo. Quem chama invalida o catálogo depois do commit.
 */
class Estoque
{
    /** RN-08: reserva para condicional. Falha se outro pedido reservou a última peça antes. */
    public function reservar(int $varianteId, int $q): void
    {
        $n = DB::update('UPDATE variante SET reservado = reservado + ? WHERE id = ? AND estoque - reservado >= ?', [$q, $varianteId, $q]);
        if ($n === 0) {
            throw new ErroNegocio('Uma das peças acabou de ser reservada por outra pessoa. Atualize a sacola e tente de novo.');
        }
    }

    /** RN-09: devolve a reserva (condicional cancelado ou peça que voltou). Nunca fica negativa. */
    public function liberarReserva(int $varianteId, int $q): void
    {
        DB::update('UPDATE variante SET reservado = GREATEST(reservado - ?, 0) WHERE id = ?', [$q, $varianteId]);
    }

    /** RN-07: baixa por venda, registrada no histórico. `reservada` = a peça vinha de um condicional ou de cobrança. */
    public function baixarVenda(int $varianteId, int $q, bool $reservada, ?string $pedidoId, ?string $usuarioId, string $observacao, string $nomePeca): void
    {
        $n = $reservada
            ? DB::update('UPDATE variante SET estoque = estoque - ?, reservado = GREATEST(reservado - ?, 0) WHERE id = ? AND estoque >= ?', [$q, $q, $varianteId, $q])
            : DB::update('UPDATE variante SET estoque = estoque - ? WHERE id = ? AND estoque >= ?', [$q, $varianteId, $q]);
        if ($n === 0) {
            throw new ErroNegocio("Estoque insuficiente para {$nomePeca}. Ajuste o estoque antes de confirmar.");
        }
        MovimentoEstoque::query()->create(['varianteId' => $varianteId, 'delta' => -$q, 'motivo' => MotivoEstoque::Venda, 'pedidoId' => $pedidoId, 'usuarioId' => $usuarioId, 'observacao' => $observacao]);
    }

    /** Venda desfeita: as peças voltam ao estoque, com o motivo "estorno" no histórico. */
    public function estornarVenda(int $varianteId, int $q, string $pedidoId, string $usuarioId, string $observacao): void
    {
        DB::update('UPDATE variante SET estoque = estoque + ? WHERE id = ?', [$q, $varianteId]);
        MovimentoEstoque::query()->create(['varianteId' => $varianteId, 'delta' => $q, 'motivo' => MotivoEstoque::Estorno, 'pedidoId' => $pedidoId, 'usuarioId' => $usuarioId, 'observacao' => $observacao]);
    }

    /**
     * Entrada soma ao estoque; ajuste define a quantidade contada. Trava a linha até o commit (C-06) e nunca deixa o
     * estoque abaixo do que está reservado. Devolve o id do produto.
     */
    public function movimentar(int $varianteId, MotivoEstoque $tipo, int $quantidade, ?string $usuarioId, ?string $observacao = null): int
    {
        $v = DB::selectOne('SELECT id, produtoId, estoque, reservado FROM variante WHERE id = ? FOR UPDATE', [$varianteId]);
        if (! $v) {
            throw new ErroNegocio('Tamanho não encontrado.');
        }
        $novo = $tipo === MotivoEstoque::Entrada ? $v->estoque + $quantidade : $quantidade;
        if ($novo < $v->reservado) {
            throw new ErroNegocio('Há '.Texto::plural($v->reservado, 'peça reservada', 'peças reservadas').' em condicionais; o estoque não pode ficar abaixo disso.');
        }
        $delta = $novo - $v->estoque;
        if ($delta !== 0) {
            DB::update('UPDATE variante SET estoque = ? WHERE id = ?', [$novo, $v->id]);
            MovimentoEstoque::query()->create(['varianteId' => $v->id, 'delta' => $delta, 'motivo' => $tipo, 'usuarioId' => $usuarioId, 'observacao' => $observacao ?: null]);
        }

        return $v->produtoId;
    }

    /** Estoque inicial de um tamanho recém-criado, registrado como entrada. */
    public function registrarEstoqueInicial(int $varianteId, int $q, ?string $usuarioId): void
    {
        if ($q > 0) {
            MovimentoEstoque::query()->create(['varianteId' => $varianteId, 'delta' => $q, 'motivo' => MotivoEstoque::Entrada, 'usuarioId' => $usuarioId, 'observacao' => 'Estoque inicial']);
        }
    }
}
