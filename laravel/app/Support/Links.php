<?php

namespace App\Support;

use RuntimeException;

/**
 * Links públicos assinados (D-20, D-27, docs/26, docs/27; porta de src/server/link-pedido.ts). HMAC-SHA256 do código
 * com o segredo do servidor, em base64url, 16 caracteres. Mesmo segredo e formato do sistema em Next: os links que já
 * circularam no WhatsApp continuam abrindo.
 */
class Links
{
    private const PEDIDO = '/^(PED|COND)-\d{6,}$/';

    private static function segredo(): string
    {
        $s = (string) config('services.links.segredo');
        if ($s === '') {
            throw new RuntimeException('Defina LINK_PEDIDO_SEGREDO para assinar os links públicos.');
        }

        return $s;
    }

    private static function assinar(string $mensagem): string
    {
        $bruto = hash_hmac('sha256', $mensagem, self::segredo(), true);

        return substr(rtrim(strtr(base64_encode($bruto), '+/', '-_'), '='), 0, 16);
    }

    private static function confere(string $mensagem, string $recebido): bool
    {
        return hash_equals(self::assinar($mensagem), $recebido);
    }

    /** "PED-000123.Xy3…" */
    public static function chaveDoPedido(string $codigo): string
    {
        if (! preg_match(self::PEDIDO, $codigo)) {
            throw new RuntimeException("Código de pedido inválido: {$codigo}");
        }

        return $codigo.'.'.self::assinar("pedido:{$codigo}");
    }

    public static function codigoDaChave(?string $chave): ?string
    {
        if (! preg_match('/^((?:PED|COND)-\d{6,})\.([A-Za-z0-9_-]{16})$/', (string) $chave, $m)) {
            return null;
        }

        return self::confere("pedido:{$m[1]}", $m[2]) ? $m[1] : null;
    }

    public static function chaveDaSugestao(string $codigo): string
    {
        if (! preg_match('/^SUG-\d{6,}$/', $codigo)) {
            throw new RuntimeException("Código de sugestão inválido: {$codigo}");
        }

        return $codigo.'.'.self::assinar("sugestao:{$codigo}");
    }

    public static function codigoDaChaveSugestao(?string $chave): ?string
    {
        if (! preg_match('/^(SUG-\d{6,})\.([A-Za-z0-9_-]{16})$/', (string) $chave, $m)) {
            return null;
        }

        return self::confere("sugestao:{$m[1]}", $m[2]) ? $m[1] : null;
    }

    /** Link da peça: /peca/<REF>~<vendedor>.<assinatura>; diz quem enviou, sem coluna nova. */
    public static function chaveDaPeca(string $referencia, string $vendedorId): string
    {
        return "{$referencia}~{$vendedorId}.".self::assinar("peca:{$referencia}:{$vendedorId}");
    }

    /** @return ?array{referencia: string, vendedorId: string} */
    public static function dadosDaChavePeca(?string $chave): ?array
    {
        if (! preg_match('/^([^~\/]{1,20})~([\w-]{1,40})\.([\w-]{16})$/', (string) $chave, $m)) {
            return null;
        }

        return self::confere("peca:{$m[1]}:{$m[2]}", $m[3]) ? ['referencia' => $m[1], 'vendedorId' => $m[2]] : null;
    }

    public static function chaveDoPagamento(string $codigo): string
    {
        if (! preg_match(self::PEDIDO, $codigo)) {
            throw new RuntimeException("Código de pedido inválido: {$codigo}");
        }

        return $codigo.'.'.self::assinar("pagar:{$codigo}");
    }

    public static function codigoDaChavePagamento(?string $chave): ?string
    {
        if (! preg_match('/^((?:PED|COND)-\d{6,})\.([A-Za-z0-9_-]{16})$/', (string) $chave, $m)) {
            return null;
        }

        return self::confere("pagar:{$m[1]}", $m[2]) ? $m[1] : null;
    }

    public static function publicoDoPedido(string $site, string $codigo): string
    {
        return rtrim($site, '/').'/p/'.self::chaveDoPedido($codigo);
    }

    public static function daSugestao(string $site, string $codigo): string
    {
        return rtrim($site, '/').'/s/'.self::chaveDaSugestao($codigo);
    }

    public static function daPeca(string $site, string $referencia, string $vendedorId): string
    {
        return rtrim($site, '/').'/peca/'.rawurlencode(self::chaveDaPeca($referencia, $vendedorId));
    }

    public static function dePagamento(string $site, string $codigo): string
    {
        return rtrim($site, '/').'/pagar/'.self::chaveDoPagamento($codigo);
    }
}
