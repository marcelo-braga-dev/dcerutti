<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUniqueStringIds;

/**
 * Chave primária texto no formato do Prisma `cuid()`: "c" + 24 caracteres em base 36 (25 no total), gerada no PHP como
 * o Prisma fazia no Node. As chaves antigas continuam valendo; o banco só exige que seja única.
 */
trait TemCuid
{
    use HasUniqueStringIds;

    public function newUniqueId(): string
    {
        $tempo = base_convert((string) (int) (microtime(true) * 1000), 10, 36);
        $aleatorio = '';
        while (strlen($aleatorio) < 24) {
            $aleatorio .= base_convert((string) random_int(0, PHP_INT_MAX), 10, 36);
        }

        return 'c'.substr(str_pad($tempo, 8, '0', STR_PAD_LEFT).$aleatorio, 0, 24);
    }

    protected function isValidUniqueId($value): bool
    {
        return is_string($value) && preg_match('/^[a-z0-9]{20,32}$/', $value) === 1;
    }
}
