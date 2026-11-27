<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * As 46 tabelas do sistema, como o Prisma deixou (docs/29, 3.1). Em banco que já veio do sistema em Next (a VPS, a
 * cópia de desenvolvimento) as tabelas existem e nada é feito; em banco vazio (testes), o schema é criado do dump.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pedido')) {
            return;
        }
        DB::unprepared('SET FOREIGN_KEY_CHECKS=0;'.file_get_contents(database_path('schema/esquema-inicial.sql')).'SET FOREIGN_KEY_CHECKS=1;');
    }

    public function down(): void
    {
        // O schema inicial não volta: apagar as tabelas do sistema seria apagar a loja.
    }
};
