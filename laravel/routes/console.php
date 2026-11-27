<?php

use App\Services\Config;
use App\Services\ImportacaoEstoque;
use App\Services\Manutencao;
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

/** Manutenção (D-18, D-26, D-28): retenção dos históricos, sacolas paradas e as verificações das notificações. */
Artisan::command('manutencao', function (Manutencao $m) {
    $this->info(json_encode($m->rodar()));
})->purpose('Retenção dos históricos, sacolas paradas e verificações das notificações');

Schedule::command('manutencao')->hourly()->withoutOverlapping();

/** Importa a planilha de estoque (.xlsx do sistema da loja), o mesmo que Produtos → Importar estoque (docs/25). */
Artisan::command('estoque:importar {arquivo} {--confirmar : Grava (sem isto, só mostra o que faria)}', function (ImportacaoEstoque $imp, Config $config) {
    $arquivo = (string) $this->argument('arquivo');
    if (! is_file($arquivo)) {
        $this->error("Arquivo não encontrado: {$arquivo}");

        return 1;
    }
    $r = ImportacaoEstoque::ler($arquivo);
    if (! $r['linhas']) {
        $this->error($r['erros'][0] ?? 'Nenhuma peça na planilha.');

        return 1;
    }
    $salvas = $imp->salvas();
    $regras = ImportacaoEstoque::regras($r['linhas'], $salvas);
    $plano = $imp->planejar($r['linhas'], $regras, $salvas);
    $res = ImportacaoEstoque::resumir($plano, 15);
    $this->info("Aba \"{$r['aba']}\": {$res['linhas']} linhas, {$res['totais']['pecasPlanilha']} peças.");
    $this->line(json_encode($res['contagens'], JSON_UNESCAPED_UNICODE));
    $this->line("Peças no site: {$res['totais']['pecasSiteAntes']} → {$res['totais']['pecasSiteDepois']}");
    if (! $this->option('confirmar')) {
        $this->comment('Nada foi gravado. Rode de novo com --confirmar para importar.');

        return 0;
    }
    $imp->aplicar($plano, null, ImportacaoEstoque::guardar($arquivo), basename($arquivo));
    $config->salvar(['fornecedores' => [...$salvas, ...$regras]]);
    $this->info('Importação gravada.');

    return 0;
})->purpose('Importa a planilha de estoque do sistema da loja');
