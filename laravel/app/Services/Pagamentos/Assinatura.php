<?php

namespace App\Services\Pagamentos;

/**
 * Assinatura dos avisos (webhooks) do Mercado Pago (docs/27; porta de src/server/pagamentos/assinatura.ts).
 * Cabeçalho `x-signature: ts=<horário>,v1=<hmac>`; HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
 * omitindo os pares sem valor (regra do SDK oficial). O `data.id` vale como veio ou em minúsculas.
 */
class Assinatura
{
    /** Diferença máxima entre o horário do aviso e o do servidor. */
    public const TOLERANCIA_SEGUNDOS = 15 * 60;

    /** @return array{ts?: string, v1?: string} */
    public static function lerCabecalho(string $cabecalho): array
    {
        $r = [];
        foreach (explode(',', $cabecalho) as $parte) {
            $i = strpos($parte, '=');
            if ($i === false) {
                continue;
            }
            $chave = strtolower(trim(substr($parte, 0, $i)));
            $valor = trim(substr($parte, $i + 1));
            if (in_array($chave, ['ts', 'v1'], true) && $valor !== '') {
                $r[$chave] = $valor;
            }
        }

        return $r;
    }

    public static function manifesto(?string $dataId, ?string $requestId, string $ts): string
    {
        $partes = [];
        if ($dataId) {
            $partes[] = "id:{$dataId}";
        }
        if ($requestId) {
            $partes[] = "request-id:{$requestId}";
        }
        $partes[] = "ts:{$ts}";

        return implode(';', $partes).';';
    }

    /** `ts` em segundos (SDK) ou milissegundos (exemplos da documentação). */
    public static function horarioMs(string $ts): float
    {
        $n = (float) $ts;

        return $n > 1e12 ? $n : $n * 1000;
    }

    /**
     * @param  list<?string>  $segredos  A chave atual e, durante uma troca, a anterior (R-09).
     * @return true|'sem_segredo'|'sem_cabecalho'|'malformado'|'diferente'|'fora_do_prazo'
     */
    public static function validar(array $segredos, ?string $assinatura, ?string $requestId, ?string $dataId, ?float $agoraMs = null, int $tolerancia = self::TOLERANCIA_SEGUNDOS): bool|string
    {
        $segredos = array_values(array_filter($segredos, fn ($s) => (string) $s !== ''));
        if (! $segredos) {
            return 'sem_segredo';
        }
        if (! $assinatura) {
            return 'sem_cabecalho';
        }
        $c = self::lerCabecalho($assinatura);
        $ts = $c['ts'] ?? '';
        $v1 = strtolower($c['v1'] ?? '');
        if (! preg_match('/^\d+$/', $ts) || ! preg_match('/^[0-9a-f]{64}$/', $v1)) {
            return 'malformado';
        }
        $requestId = trim((string) $requestId) ?: null;
        $dataId = trim((string) $dataId) ?: null;
        $ids = array_unique([$dataId, $dataId ? strtolower($dataId) : null]);
        $confere = false;
        foreach ($segredos as $s) {
            foreach ($ids as $id) {
                $confere = $confere || hash_equals(hash_hmac('sha256', self::manifesto($id, $requestId, $ts), $s), $v1);
            }
        }
        if (! $confere) {
            return 'diferente';
        }

        return abs(($agoraMs ?? microtime(true) * 1000) - self::horarioMs($ts)) / 1000 > $tolerancia ? 'fora_do_prazo' : true;
    }

    /** Para os testes: assina como o Mercado Pago. */
    public static function assinar(string $segredo, string $dataId, string $requestId, ?string $ts = null): string
    {
        $ts ??= (string) time();

        return "ts={$ts},v1=".hash_hmac('sha256', self::manifesto($dataId, $requestId, $ts), $segredo);
    }
}
