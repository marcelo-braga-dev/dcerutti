<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** "Continuar conectado" do Laravel. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('user', 'remember_token')) {
            Schema::table('user', function (Blueprint $table) {
                $table->rememberToken();
            });
        }
    }

    public function down(): void
    {
        Schema::table('user', function (Blueprint $table) {
            $table->dropRememberToken();
        });
    }
};
