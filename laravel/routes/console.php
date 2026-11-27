<?php

use App\Services\Config;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pagamentos\Modo;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

/** Pagamento online (docs/27): consulta as cobranças abertas, cancela as vencidas e reprocessa avisos que falharam. */
Artisan::command('pagamentos:conciliar', function (Cobrancas $cobrancas, Config $config) {
    if (! $config->get('pagamentoOnline.ligado') || ! Modo::configurado()) {
        $this->info('Pagamento online desligado ou sem credenciais: nada a conciliar.');

        return;
    }
    $this->info(json_encode($cobrancas->conciliar()));
})->purpose('Concilia as cobranças do pagamento online com o Mercado Pago');

Schedule::command('pagamentos:conciliar')->everyTenMinutes()->withoutOverlapping();
