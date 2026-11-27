<?php

namespace App\Support;

/** "@Fulana", "instagram.com/fulana/" e "fulana" viram "fulana"; inválido ou vazio = null (src/lib/atendimento.ts). */
class Instagram
{
    public static function normalizar(?string $v): ?string
    {
        $t = mb_strtolower(trim((string) $v));
        if (preg_match('#(?:instagram\.com|instagr\.am)/([^/?\#\s]+)#', $t, $m)) {
            $t = $m[1];
        }
        $t = rtrim(ltrim($t, '@'), '/');

        return preg_match('/^[a-z0-9._]{1,30}$/', $t) ? $t : null;
    }
}
