<?php

namespace App\Services\Pedidos;

use App\Enums\AcaoPedido;
use App\Enums\Papel;
use App\Models\Pedido;
use App\Models\PedidoHistorico;
use App\Models\User;
use App\Support\Dinheiro;
use DateTimeInterface;

/**
 * Histórico do pedido (src/server/historico.ts): o que a cliente pediu, cada edição da equipe, a confirmação e o
 * cancelamento. Cada registro guarda as peças como ficaram depois da ação. Sempre dentro da transação da mudança.
 */
class Historico
{
    /** @param array{nome: string, cor: ?string, tamanho: string} $i */
    public static function descricaoPeca(array $i): string
    {
        return $i['nome'].($i['cor'] ? " · {$i['cor']}" : '')." · tam. {$i['tamanho']}";
    }

    /**
     * Frases do que mudou entre as peças de antes e as de depois (comparadas pelo id da linha).
     *
     * @param  list<array{id?: int, varianteId: int, nome: string, cor: ?string, tamanho: string, quantidade: int, preco: int}>  $antes  preço em centavos
     * @param  list<array{antesId?: ?int, varianteId: int, nome: string, cor: ?string, tamanho: string, quantidade: int, preco: int}>  $depois
     * @param  array{totalAntes: int, totalDepois: int, freteAntes: ?int, freteDepois: ?int}  $totais  em centavos
     * @return list<string>
     */
    public static function descreverMudancas(array $antes, array $depois, array $totais): array
    {
        $r = [];
        $porId = collect($antes)->keyBy('id');
        $mantidos = collect($depois)->pluck('antesId')->filter()->all();
        foreach ($antes as $a) {
            if (! in_array($a['id'] ?? null, $mantidos, true)) {
                $r[] = 'Retirou '.self::descricaoPeca($a)." ({$a['quantidade']} un.)";
            }
        }
        foreach ($depois as $d) {
            $a = ! empty($d['antesId']) ? $porId->get($d['antesId']) : null;
            if (! $a) {
                $r[] = 'Incluiu '.self::descricaoPeca($d)." ({$d['quantidade']} un. a ".Dinheiro::brl($d['preco'] / 100).')';

                continue;
            }
            if ($a['varianteId'] !== $d['varianteId']) {
                $r[] = 'Trocou '.self::descricaoPeca($a).' por '.self::descricaoPeca($d);
            }
            if ($a['quantidade'] !== $d['quantidade']) {
                $r[] = self::descricaoPeca($d).": quantidade de {$a['quantidade']} para {$d['quantidade']}";
            }
            if ($a['preco'] !== $d['preco']) {
                $r[] = self::descricaoPeca($d).': preço de '.Dinheiro::brl($a['preco'] / 100).' para '.Dinheiro::brl($d['preco'] / 100);
            }
        }
        if ($totais['totalAntes'] !== $totais['totalDepois']) {
            $r[] = 'Total das peças de '.Dinheiro::brl($totais['totalAntes'] / 100).' para '.Dinheiro::brl($totais['totalDepois'] / 100);
        }
        if ($totais['freteAntes'] !== $totais['freteDepois']) {
            $fmt = fn (?int $c) => $c === null ? 'a combinar' : Dinheiro::brl($c / 100);
            $r[] = "Frete de {$fmt($totais['freteAntes'])} para {$fmt($totais['freteDepois'])}";
        }

        return $r;
    }

    /**
     * Grava um registro com as peças atuais do pedido. `usuarioId` null = sistema (ex.: expiração).
     *
     * @param  list<string>  $mudancas
     */
    public function registrar(string $pedidoId, AcaoPedido $acao, ?string $usuarioId, array $mudancas = [], ?string $observacao = null, ?DateTimeInterface $criadoEm = null): void
    {
        $pedido = Pedido::query()->with(['itens' => fn ($q) => $q->orderBy('id')])->findOrFail($pedidoId);
        $usuario = $usuarioId ? User::query()->find($usuarioId, ['id', 'name', 'papel']) : null;
        $autor = ! $usuario ? 'sistema' : ($usuario->papel === Papel::Cliente ? 'cliente' : 'equipe');
        $itens = $pedido->itens->map(fn ($i) => [
            'referencia' => $i->referencia, 'nome' => $i->nome, 'cor' => $i->cor, 'tamanho' => $i->tamanho, 'quantidade' => $i->quantidade,
            'preco' => Dinheiro::numero($i->precoUnitario), 'precoTabela' => Dinheiro::numero($i->precoTabela),
        ])->all();
        $dados = [
            'pedidoId' => $pedidoId, 'acao' => $acao, 'autor' => $autor, 'usuarioId' => $usuario?->id, 'nomeUsuario' => $autor === 'equipe' ? $usuario->name : null,
            'mudancas' => $mudancas, 'itens' => $itens, 'total' => $pedido->total, 'frete' => $pedido->frete, 'observacao' => trim((string) $observacao) ?: null,
        ];
        if ($criadoEm) {
            $dados['criadoEm'] = $criadoEm;
        }
        PedidoHistorico::query()->create($dados);
    }

    /** Pedido criado antes do histórico existir: na primeira mudança, registra como ele estava, com a data de criação. */
    public function garantirRegistroInicial(string $pedidoId, DateTimeInterface $criadoEm): void
    {
        if (PedidoHistorico::query()->where('pedidoId', $pedidoId)->exists()) {
            return;
        }
        $this->registrar($pedidoId, AcaoPedido::Criado, null, ['Pedido anterior ao histórico: estas são as peças como estavam antes da primeira alteração registrada.'], null, $criadoEm);
    }
}
