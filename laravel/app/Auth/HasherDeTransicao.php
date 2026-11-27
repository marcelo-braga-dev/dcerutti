<?php

namespace App\Auth;

use Illuminate\Contracts\Hashing\Hasher;
use Illuminate\Hashing\BcryptHasher;
use Symfony\Component\Process\Process;

/**
 * Senhas do Better Auth e do Laravel (docs/29, 3.2). O Better Auth grava `salt:hash` em hexadecimal: scrypt com
 * N=16384, r=16, p=1, 64 bytes, senha em NFKC e o salt usado como texto. O PHP não tem scrypt com r=16, então a
 * conferência roda no Node (que o servidor já tem para o Vite). Senha nova ou regravada é sempre bcrypt.
 */
class HasherDeTransicao implements Hasher
{
    private const FORMATO_SCRYPT = '/^[0-9a-f]{32}:[0-9a-f]{128}$/';

    public function __construct(private BcryptHasher $bcrypt) {}

    /** @param array<string, mixed> $options */
    public function info($hashedValue): array
    {
        return $this->ehScrypt($hashedValue) ? ['algo' => 'scrypt', 'algoName' => 'scrypt', 'options' => []] : $this->bcrypt->info($hashedValue);
    }

    /** @param array<string, mixed> $options */
    public function make($value, array $options = []): string
    {
        return $this->bcrypt->make($value, $options);
    }

    /** @param array<string, mixed> $options */
    public function check($value, $hashedValue, array $options = []): bool
    {
        if ($hashedValue === null || $hashedValue === '') {
            return false;
        }
        if ($this->ehScrypt($hashedValue)) {
            return $this->conferirScrypt((string) $value, $hashedValue);
        }

        return $this->bcrypt->check($value, $hashedValue, $options);
    }

    /** @param array<string, mixed> $options */
    public function needsRehash($hashedValue, array $options = []): bool
    {
        return $this->ehScrypt($hashedValue) || $this->bcrypt->needsRehash($hashedValue, $options);
    }

    public function ehScrypt(?string $hash): bool
    {
        return $hash !== null && preg_match(self::FORMATO_SCRYPT, $hash) === 1;
    }

    private function conferirScrypt(string $senha, string $hash): bool
    {
        [$salt, $esperado] = explode(':', $hash, 2);
        $script = <<<'JS'
            const { scryptSync } = require('node:crypto');
            let e = ''; process.stdin.on('data', d => (e += d)).on('end', () => {
              const { senha, salt } = JSON.parse(e);
              process.stdout.write(scryptSync(senha.normalize('NFKC'), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 }).toString('hex'));
            });
            JS;
        $processo = new Process([config('services.node.binario', 'node'), '-e', $script]);
        $processo->setInput(json_encode(['senha' => $senha, 'salt' => $salt]));
        $processo->setTimeout(15);
        $processo->run();

        return $processo->isSuccessful() && hash_equals($esperado, trim($processo->getOutput()));
    }
}
