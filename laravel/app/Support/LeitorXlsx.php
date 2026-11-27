<?php

namespace App\Support;

use RuntimeException;
use XMLReader;
use ZipArchive;

/**
 * Leitor mínimo de .xlsx (o formato é um zip de XMLs): devolve as abas como matriz de células, com números como float e
 * textos como string. Lê as abas em fluxo (XMLReader), para aguentar a planilha inteira da loja com pouca memória.
 */
class LeitorXlsx
{
    /** @return list<array{nome: string, matriz: list<list<mixed>>}> */
    public static function abas(string $caminho): array
    {
        $zip = new ZipArchive;
        if ($zip->open($caminho) !== true) {
            throw new RuntimeException('O arquivo não é uma planilha .xlsx válida.');
        }
        try {
            $textos = self::textosCompartilhados($zip);
            $abas = [];
            foreach (self::listaDeAbas($zip) as [$nome, $arquivo]) {
                $xml = $zip->getFromName($arquivo);
                if ($xml === false) {
                    continue;
                }
                $abas[] = ['nome' => $nome, 'matriz' => self::lerAba($xml, $textos)];
            }

            return $abas;
        } finally {
            $zip->close();
        }
    }

    /** @return list<string> */
    private static function textosCompartilhados(ZipArchive $zip): array
    {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if ($xml === false) {
            return [];
        }
        $r = new XMLReader;
        $r->XML($xml);
        $textos = [];
        $atual = null;
        while ($r->read()) {
            if ($r->nodeType === XMLReader::ELEMENT && $r->localName === 'si') {
                $atual = '';
            } elseif ($r->nodeType === XMLReader::ELEMENT && $r->localName === 't' && $atual !== null) {
                $atual .= $r->readString();
            } elseif ($r->nodeType === XMLReader::END_ELEMENT && $r->localName === 'si') {
                $textos[] = (string) $atual;
                $atual = null;
            }
        }

        return $textos;
    }

    /** @return list<array{0: string, 1: string}> nome da aba e caminho do XML, na ordem do arquivo */
    private static function listaDeAbas(ZipArchive $zip): array
    {
        $wb = @simplexml_load_string((string) $zip->getFromName('xl/workbook.xml'));
        $rels = @simplexml_load_string((string) $zip->getFromName('xl/_rels/workbook.xml.rels'));
        if (! $wb || ! $rels) {
            throw new RuntimeException('O arquivo não é uma planilha .xlsx válida.');
        }
        $alvo = [];
        foreach ($rels->Relationship as $rel) {
            $alvo[(string) $rel['Id']] = ltrim(str_replace('/xl/', '', (string) $rel['Target']), '/');
        }
        $abas = [];
        foreach ($wb->sheets->sheet as $s) {
            $id = (string) ($s->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'] ?? '');
            if (isset($alvo[$id])) {
                $abas[] = [(string) $s['name'], 'xl/'.$alvo[$id]];
            }
        }

        return $abas;
    }

    private static function coluna(string $ref): int
    {
        $letras = preg_replace('/\d+/', '', $ref);
        $n = 0;
        foreach (str_split((string) $letras) as $c) {
            $n = $n * 26 + (ord($c) - 64);
        }

        return $n - 1;
    }

    /** @param list<string> $textos @return list<list<mixed>> */
    private static function lerAba(string $xml, array $textos): array
    {
        $r = new XMLReader;
        $r->XML($xml);
        $matriz = [];
        $linha = -1;
        $col = 0;
        $tipo = '';
        $valor = null;
        $dentro = false;
        while ($r->read()) {
            if ($r->nodeType === XMLReader::ELEMENT) {
                if ($r->localName === 'row') {
                    $linha = ((int) $r->getAttribute('r') ?: $linha + 2) - 1;
                    $matriz[$linha] = [];
                    $col = 0;
                } elseif ($r->localName === 'c') {
                    $ref = (string) $r->getAttribute('r');
                    $col = $ref !== '' ? self::coluna($ref) : $col + 1;
                    $tipo = (string) $r->getAttribute('t');
                    $valor = null;
                    $dentro = ! $r->isEmptyElement;
                    if (! $dentro) {
                        $matriz[$linha][$col] = null;
                    }
                } elseif ($dentro && ($r->localName === 'v' || $r->localName === 't')) {
                    $valor = ($valor ?? '').$r->readString();
                }
            } elseif ($r->nodeType === XMLReader::END_ELEMENT && $r->localName === 'c' && $dentro) {
                $matriz[$linha][$col] = match ($tipo) {
                    's' => $textos[(int) $valor] ?? '',
                    'inlineStr', 'str' => (string) $valor,
                    'b' => $valor === '1',
                    default => $valor === null || $valor === '' ? null : (is_numeric($valor) ? (float) $valor : $valor),
                };
                $dentro = false;
            }
        }
        if (! $matriz) {
            return [];
        }
        $resultado = [];
        $ultima = max(array_keys($matriz));
        for ($i = 0; $i <= $ultima; $i++) {
            $l = $matriz[$i] ?? [];
            $resultado[] = $l ? array_replace(array_fill(0, max(array_keys($l)) + 1, null), $l) : [];
        }

        return $resultado;
    }
}
