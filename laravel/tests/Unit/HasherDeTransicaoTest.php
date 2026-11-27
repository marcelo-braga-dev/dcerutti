<?php

namespace Tests\Unit;

use App\Auth\HasherDeTransicao;
use Illuminate\Hashing\BcryptHasher;
use Tests\TestCase;

/** Senhas antigas do Better Auth (scrypt) e novas (bcrypt) — docs/29, 3.2. */
class HasherDeTransicaoTest extends TestCase
{
    /** Gerado no formato do Better Auth (salt hex como texto, N=16384, r=16, p=1, 64 bytes) para a senha "Senha.Teste1". */
    private const HASH_BETTER_AUTH = 'eaf6dfafd5217d0d666273e019193b19:78176ea15f17eb5d0221791b387e44f53d3274873c4b79f48d960aeb3b28c147a788ec3c9436d537840f9623f34baa21575b1daa8216fe725c23eec26e08f19b';

    private function hasher(): HasherDeTransicao
    {
        return new HasherDeTransicao(new BcryptHasher(['rounds' => 4]));
    }

    public function test_confere_senha_do_better_auth(): void
    {
        $this->assertTrue($this->hasher()->check('Senha.Teste1', self::HASH_BETTER_AUTH));
        $this->assertFalse($this->hasher()->check('senha.teste1', self::HASH_BETTER_AUTH));
    }

    public function test_hash_antigo_pede_regravacao_e_o_novo_e_bcrypt(): void
    {
        $h = $this->hasher();
        $this->assertTrue($h->needsRehash(self::HASH_BETTER_AUTH));
        $novo = $h->make('Senha.Teste1');
        $this->assertStringStartsWith('$2y$', $novo);
        $this->assertTrue($h->check('Senha.Teste1', $novo));
        $this->assertFalse($h->needsRehash($novo));
    }

    public function test_hash_vazio_nunca_confere(): void
    {
        $this->assertFalse($this->hasher()->check('qualquer', ''));
        $this->assertFalse($this->hasher()->check('qualquer', null));
    }
}
