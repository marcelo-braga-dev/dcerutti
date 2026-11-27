<?php

namespace App\Providers;

use App\Auth\HasherDeTransicao;
use App\Auth\ProvedorDeUsuarios;
use App\Services\Config;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Hashing\BcryptHasher;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(Config::class);
    }

    public function boot(): void
    {
        Hash::extend('transicao', fn () => new HasherDeTransicao(new BcryptHasher(config('hashing.bcrypt', []))));
        Auth::provider('dcerutti', fn ($app, array $config) => new ProvedorDeUsuarios($app['hash'], $config['model']));
        Model::preventLazyLoading(! $this->app->isProduction());
    }
}
