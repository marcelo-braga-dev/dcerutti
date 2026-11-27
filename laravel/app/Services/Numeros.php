<?php

namespace App\Services;

use App\Exceptions\ErroNegocio;
use App\Models\Atendimento;
use App\Models\Cliente;
use App\Models\Pedido;
use App\Models\User;
use App\Models\VinculoNumero;
use DateTimeInterface;

/**
 * Números de WhatsApp da loja e carteiras (D-31; src/server/numeros.ts). Fase 2: transferência de carteira e
 * encerramento dos vínculos ao desativar a vendedora; a tela dos números vem com a fase 5.
 */
class Numeros
{
    /** Vínculo encerrado; conectado fica como pendência de desconectar o aparelho. */
    public function encerrar(VinculoNumero $v, string $porId, ?string $motivo, ?DateTimeInterface $agora = null): void
    {
        $agora ??= now();
        $v->update(['fimEm' => $agora, 'encerradoPorId' => $porId, 'motivoFim' => $motivo ? mb_substr($motivo, 0, 200) : null, 'desconectadoEm' => $v->conexao->value === 'conectado' ? null : $agora]);
    }

    /** Desativar a vendedora: sai de todos os números e deixa as pendências de desconexão. */
    public function encerrarVinculosDoUsuario(string $usuarioId, string $porId, string $motivo): int
    {
        $abertos = VinculoNumero::query()->where('usuarioId', $usuarioId)->whereNull('fimEm')->get();
        foreach ($abertos as $v) {
            $this->encerrar($v, $porId, $motivo);
        }
        User::query()->whereKey($usuarioId)->update(['numeroPrincipalId' => null]);

        return $abertos->count();
    }

    /** Clientes, pedidos em aberto e atendimentos abertos passam para outra vendedora ativa. */
    public function transferirCarteira(string $de, string $para): void
    {
        if ($de === $para || ! User::query()->whereKey($para)->where('papel', 'vendedor')->where('ativo', true)->exists()) {
            throw new ErroNegocio('Escolha uma vendedora ativa para receber a carteira.');
        }
        Cliente::query()->where('vendedorId', $de)->update(['vendedorId' => $para]);
        Pedido::query()->where('vendedorId', $de)->where('status', 'pendente')->update(['vendedorId' => $para]);
        Atendimento::query()->where('responsavelId', $de)->whereNull('fechadoEm')->update(['responsavelId' => $para]);
    }
}
