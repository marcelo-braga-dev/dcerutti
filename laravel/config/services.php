<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /** Fotos, vídeos e arquivos gravados (D-13): a mesma pasta do sistema em Next. */
    'arquivos' => [
        'dir' => env('ARMAZENAMENTO_DIR', base_path('../armazenamento')),
    ],

    /**
     * Pagamento online (docs/27). `gateway` = 'falso' liga o Mercado Pago simulado (nunca vale na produção: `producao`
     * ou banco terminado em _producao). Credenciais só no .env.
     */
    'pagamento' => [
        'gateway' => env('PAGAMENTO_GATEWAY'),
        'producao' => (bool) env('PAGAMENTO_PRODUCAO', false),
        'ambiente' => env('MP_AMBIENTE'),
        'token' => env('MP_ACCESS_TOKEN'),
        'segredo' => env('MP_WEBHOOK_SECRET'),
        'segredo_anterior' => env('MP_WEBHOOK_SECRET_ANTERIOR'),
        'api' => env('MP_API_URL', 'https://api.mercadopago.com'),
    ],

    /** Segredo dos links públicos assinados (pedido, sugestão, peça, pagamento): o mesmo do sistema em Next. */
    'links' => [
        'segredo' => env('LINK_PEDIDO_SEGREDO'),
    ],

    /** Node: confere as senhas antigas do Better Auth (App\Auth\HasherDeTransicao). */
    'node' => [
        'binario' => env('NODE_BINARY', 'node'),
    ],

];
