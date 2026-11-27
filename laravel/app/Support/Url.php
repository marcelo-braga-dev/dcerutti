<?php

namespace App\Support;

/** Porta de src/lib/url.ts. */
class Url
{
    /** Caminho interno seguro para redirecionar ("/painel?x=1"); externo, "//outro" ou com caracteres de controle = null. */
    public static function caminhoInterno(?string $valor): ?string
    {
        $s = (string) $valor;
        if (! preg_match('#^/(?![/\\\\])#', $s) || preg_match('/[\\\\\x00-\x1f]/', $s)) {
            return null;
        }

        return $s;
    }
}
