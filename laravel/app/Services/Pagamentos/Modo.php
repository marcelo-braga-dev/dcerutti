<?php

namespace App\Services\Pagamentos;

use Illuminate\Support\Facades\Log;

/** Em que modo o pagamento roda (docs/27, docs/28 R-01): Mercado Pago, simulado ou bloqueado. */
class Modo
{
    /** Banco de produção (D-15: `…_producao`) ou PAGAMENTO_PRODUCAO=1: nele o simulado nunca vale. */
    public static function ambienteDeProducao(): bool
    {
        return (bool) config('services.pagamento.producao') || str_ends_with((string) config('database.connections.'.config('database.default').'.database'), '_producao');
    }

    /** @return 'mercadopago'|'simulado'|'bloqueado' */
    public static function atual(): string
    {
        if (config('services.pagamento.gateway') !== 'falso') {
            return 'mercadopago';
        }

        return self::ambienteDeProducao() ? 'bloqueado' : 'simulado';
    }

    public static function simulado(): bool
    {
        return self::atual() === 'simulado';
    }

    /** Pronto para cobrar? Sem credenciais (ou com o simulado bloqueado), o painel avisa e nada é cobrado. */
    public static function configurado(): bool
    {
        return match (self::atual()) {
            'bloqueado' => false,
            'simulado' => true,
            default => (string) config('services.pagamento.token') !== '',
        };
    }

    /** Gateway em uso: o simulado nos testes e no ambiente de teste; senão o Mercado Pago. */
    public static function gateway(): Gateway
    {
        $modo = self::atual();
        if ($modo === 'bloqueado') {
            Log::error('Pagamento: PAGAMENTO_GATEWAY=falso ignorado no banco de produção. Retire a linha do .env.');
            throw new ErroGateway('O pagamento online está bloqueado: o modo simulado foi pedido na produção. Retire PAGAMENTO_GATEWAY do .env.', 'simulado_na_producao', true);
        }

        return app($modo === 'simulado' ? GatewayFalso::class : GatewayMercadoPago::class);
    }
}
