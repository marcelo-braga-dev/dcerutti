<?php

namespace App\Support;

/**
 * Planilha de estoque ("Relatório de Produtos" do sistema da loja; porta de src/lib/planilha-estoque.ts). Uma linha =
 * uma peça num tamanho (SKU). Só interpreta a planilha (sem banco): agrupa as linhas em produtos e deduz nome,
 * categoria, gênero, estação e referência dos produtos novos (docs/25).
 *
 * Linha: ['linha', 'fornecedor', 'codigo', 'referencia', 'codigoBarras', 'descricao', 'tamanho', 'codigoCor', 'corVisual', 'estoque', 'condicional', 'reservadoEc', 'preco'].
 */
class PlanilhaEstoque
{
    public const COLUNAS = ['Fornecedor', 'Código', 'Refer.', 'Cód. Barras', 'Descrição', 'Tam.', 'Cód. Cor', 'Cor Visual', 'Estoq.', 'Cond.', 'Res. EC', 'Preço Venda'];

    private const EQUIVALENTES = ['XP' => ['XP', 'PP'], 'PP' => ['PP', 'XP'], 'UNI' => ['UNI', 'UN', 'U']];

    private const MINUSCULAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'em', 'para', 'a', 'o', 'no', 'na'];

    private const SIGLAS = ['UV', 'GG', 'XG', 'XXG', 'EXG', 'PP', 'XP', 'P', 'M', 'G', '3D', 'II', 'III'];

    private const ABREVIACOES = [
        ['/\bMM\b/', 'MANGA CURTA'], ['/\bM\/C\b/', 'MANGA CURTA'], ['/\bML\b/', 'MANGA LONGA'], ['/\bM\/L\b/', 'MANGA LONGA'],
        ['/\bAD\b/', 'ADULTO'], ['/\bEST\b/', 'ESTAMPADO'], ['/\bC\/\s*/', 'COM '], ['/\bS\/\s*/', 'SEM '], ['/\bINF\b/', 'INFANTIL'],
        ['/\bCALCA\b/', 'CALÇA'], ['/\bCALCAS\b/', 'CALÇAS'], ['/\bCALCADOS?\b/', ''], ['/\bSUTIA\b/', 'SUTIÃ'], ['/\bTRICOT\b/', 'TRICÔ'],
        ['/\bBASICA\b/', 'BÁSICA'], ['/\bBASICO\b/', 'BÁSICO'], ['/\bTERMICA\b/', 'TÉRMICA'], ['/\bALCA\b/', 'ALÇA'], ['/\bALCAS\b/', 'ALÇAS'],
        ['/\bBOTAO\b/', 'BOTÃO'], ['/\bLA\b/', 'LÃ'], ['/\bMACACAO\b/', 'MACACÃO'], ['/\bBLUSAO\b/', 'BLUSÃO'], ['/\bCETIM\b/', 'CETIM'],
        ['/\bTSHIRT\b/', 'T-SHIRT'], ['/\bVISCOSE\b/', 'VISCOSE'], ['/\bSARJA\b/', 'SARJA'], ['/\bAMARRACAO\b/', 'AMARRAÇÃO'],
    ];

    private const CATEGORIAS = [
        ['/\bPOLO\b/', 'Camisas Polo'],
        ['/\b(CUECA|BOXER|SUNGA|SLIP)\b/', 'Cuecas'],
        ['/\bCALCINHA/', 'Calcinhas'], ['/\bSUTIA/', 'Sutiãs'], ['/\bSEGUNDA PELE\b|\bCEROULA/', 'Roupas íntimas'], ['/\bPIJAMA/', 'Pijamas'],
        ['/^\s*(MEIA CALCA|MEIA|MEIAS)\b/', 'Meias'],
        ['/^\s*KIT\b/', 'Kits'],
        ['/^\s*(REGATA)\b|\bCAMISETA REGATA\b/', 'Regatas'],
        ['/^\s*(CAMISETA|TSHIRT|T-SHIRT|BLUSINHA)\b/', 'Camisetas'],
        ['/^\s*CAMISA\b/', 'Camisas'],
        ['/^\s*(CALCA|SLIM|SKINNY|RIDER|WIDE|HOXIE|MALONE|CHICAGO|MOM|RETA|FLARE|JOGGER|101|505|JEANS|PANTALONA|ALFAIATARIA)\b/', 'Calças'],
        ['/^\s*LEGGING/', 'Leggings'],
        ['/^\s*BERMUDA/', 'Bermudas'], ['/^\s*SHORTS?\b/', 'Shorts'], ['/^\s*SAIA\b/', 'Saias'],
        ['/^\s*(VESTIDOS?|CHEMISE)\b/', 'Vestidos'], ['/^\s*(MACACAO|MACAQUINHO|JARDINEIRA)\b/', 'Macacões'],
        ['/^\s*(BLUSAS?|CROPPED|BATA|TUNICA|CAMISETE)\b/', 'Blusas'],
        ['/^\s*(TOP|BODY)\b/', 'Tops'],
        ['/^\s*(JAQUETA|CORTA VENTO|PARKA|BOMBER)\b/', 'Jaquetas'], ['/^\s*(CASACO|KABAN|SOBRETUDO|CASAQUETO|TRENCH)\b/', 'Casacos'],
        ['/^\s*BLAZER/', 'Blazers'], ['/^\s*COLETE/', 'Coletes'], ['/^\s*(MOLETOM|BLUSAO)\b/', 'Moletons'],
        ['/^\s*(TRICOT|TRICO|SUETER|CARDIGAN|PULLOVER|SUETER)\b/', 'Tricôs'],
        ['/^\s*(CALCADOS|SANDALIA|TENIS|SAPATO|SAPATENIS|BOTA|CHINELO|RASTEIRA|MULE|SCARPIN|MOCASSIM)\b/', 'Calçados'],
        ['/^\s*CINTO/', 'Cintos'], ['/^\s*(BOLSA|MOCHILA|CARTEIRA|NECESSAIRE|PASTA)\b/', 'Bolsas'],
        ['/^\s*(BONE|CHAPEU|VISEIRA)\b/', 'Bonés'], ['/^\s*(GORRO|TOUCA)\b/', 'Gorros'], ['/^\s*(LENCO|ECHARPE|CACHECOL|MANTA|PASHMINA)\b/', 'Lenços'],
        ['/^\s*(ANEL|GARGANTILHA|COLAR|BRINCO|PULSEIRA|MAXI|OCULOS|RELOGIO|CHAVEIRO)\b/', 'Acessórios'],
        ['/\b(SKINNY|STRAIGHT|STRECH|STRETCH|PREMIUM STR|REGULAR FIT|SLIM FIT|SUPER SK|BOYFRIEND|BAGGY|CIGARRETE|PANTALONA)\b/', 'Calças'],
    ];

    private const SO_FEMININAS = ['Vestidos', 'Saias', 'Calcinhas', 'Sutiãs', 'Tops', 'Leggings', 'Macacões', 'Bolsas'];

    private const INTIMAS = ['Cuecas', 'Calcinhas', 'Sutiãs', 'Roupas íntimas', 'Pijamas', 'Meias'];

    public static function semAcento(string $t): string
    {
        return (string) preg_replace('/\p{Mn}/u', '', (string) \Normalizer::normalize($t, \Normalizer::FORM_D));
    }

    public static function chaveTexto(string $t): string
    {
        return trim((string) preg_replace('/\s+/', ' ', mb_strtoupper(self::semAcento($t))));
    }

    /** U, UN e UNI viram UNI; o resto, em maiúsculas e sem espaços (até 5 letras). */
    public static function tamanho(string $t): string
    {
        $v = (string) preg_replace('/\s+/', '', self::chaveTexto($t));
        if (in_array($v, ['U', 'UN', 'UNI', 'UNICO', 'UNICA'], true)) {
            return 'UNI';
        }

        return substr($v, 0, 5) ?: 'UNI';
    }

    /** Referência sem o tamanho no fim (Actum "020345996051G", Carlota "CAI23010919-0000PP", Randall "ACT3773.107.39"). */
    public static function referenciaBase(string $referencia, string $tamanho): string
    {
        $ref = trim($referencia);
        foreach (self::EQUIVALENTES[$tamanho] ?? [$tamanho] as $t) {
            if (strlen($ref) > strlen($t) + 2 && str_ends_with(strtoupper($ref), $t)) {
                return (string) preg_replace('/[.\-_\/\s]+$/', '', substr($ref, 0, -strlen($t)));
            }
        }

        return $ref;
    }

    /** Cor do produto: a "Cor Visual" ou, sem ela, o código de cor quando é um nome. */
    public static function cor(array $l): ?string
    {
        $nome = trim($l['corVisual'] ?: (preg_match('/[A-Za-zÀ-ú]{3}/u', $l['codigoCor']) && ! preg_match('/\d/', $l['codigoCor']) ? $l['codigoCor'] : ''));

        return $nome !== '' ? self::titulo($nome) : null;
    }

    /** "CALCA JEANS SKINNY" → "Calca Jeans Skinny" (preposições em minúsculas, siglas como estão). */
    public static function titulo(string $t): string
    {
        $partes = array_values(array_filter(preg_split('/\s+/u', mb_strtolower($t)) ?: [], fn ($p) => $p !== ''));

        return implode(' ', array_map(function ($p, $i) {
            if (in_array(mb_strtoupper($p), self::SIGLAS, true)) {
                return mb_strtoupper($p);
            }
            if ($i > 0 && in_array($p, self::MINUSCULAS, true)) {
                return $p;
            }
            $p = (string) preg_replace_callback('/^\p{L}/u', fn ($m) => mb_strtoupper($m[0]), $p);

            return (string) preg_replace_callback('/([-\/])(\p{L})/u', fn ($m) => $m[1].mb_strtoupper($m[2]), $p);
        }, $partes, array_keys($partes)));
    }

    /** Nome do produto novo a partir da descrição: sem tamanho, códigos e repetições, abreviações por extenso, cor no fim. */
    public static function nome(array $l): string
    {
        $d = ' '.self::chaveTexto($l['descricao']).' ';
        $tam = self::chaveTexto($l['tamanho']);
        $q = preg_quote($tam, '/');
        $d = (string) preg_replace("/[\\s\\/\\-]+(TAM\\.?\\s*)?{$q}\\s*$/", ' ', $d);
        if ($l['referencia'] !== '') {
            $d = str_replace(self::chaveTexto($l['referencia']), ' ', $d);
        }
        if (strlen($tam) <= 3 && ! preg_match('/^\d+$/', $tam) && $tam !== '') {
            $d = (string) preg_replace("/\\s{$q}(?=\\s)/", ' ', $d);
        }
        $d = (string) preg_replace(['/\bT\s?SHIRT\b/', '/\bM\.?\s+LONGA\b/', '/\bM\.?\s+CURTA\b/'], ['TSHIRT', 'ML', 'MM'], $d);
        $d = (string) preg_replace([
            '/\bREF\.?\s*\S+/', '/\b\d{2}\s\d{4}\s\d{3}\b/', '/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b/', '/\b\d{5,}\b/', '/\b[A-Z]{1,3}\d{1,2}\b/',
            '/(^|\s)\d{2}(?=\s|$)/', '/\bTAMANHO:?\s*$/', '/\bTRIFIL\b|\bACOSTAMENTO\b|\bPECA UNICA\b/', '/\s+[-\/]\s+/', '/\s+/',
        ], [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], $d);
        foreach (self::ABREVIACOES as [$r, $s]) {
            $d = (string) preg_replace($r, $s, $d);
        }
        $d = (string) preg_replace('/\b(.{6,}?)\s+\1\b/', '$1', $d);
        $feminina = (bool) preg_match('/^(\s*)(CAMISETA|CAMISA|CALÇA|BLUSA|BERMUDA|SAIA|JAQUETA|REGATA|MEIA|CUECA|CALCINHA|BOLSA|SANDALIA|BLUSINHA|BATA|REGATA|POLO|T-SHIRT|JARDINEIRA|LEGGING|TOP)\b/', $d);
        $d = (string) preg_replace('/\bMASC(ULINO|ULINA)?\.?(?=\s|$)/', $feminina ? 'MASCULINA' : 'MASCULINO', $d);
        $d = (string) preg_replace('/\bFEM(ININO|ININA)?\.?(?=\s|$)/', $feminina ? 'FEMININA' : 'FEMININO', $d);
        $cor = self::cor($l);
        $nome = self::titulo(trim((string) preg_replace('/\s+/', ' ', $d)));
        if ($cor) {
            $nome = (string) preg_replace('/\s+'.preg_quote(self::chaveTexto($cor), '/').'$/iu', '', $nome);
        }
        if ($nome === '') {
            $nome = 'Peça';
        }

        return mb_substr($cor ? "{$nome} - {$cor}" : $nome, 0, 160);
    }

    public static function categoria(string $descricao): string
    {
        $d = str_replace('T SHIRT', 'TSHIRT', ' '.self::chaveTexto($descricao));
        foreach (self::CATEGORIAS as [$r, $c]) {
            if (preg_match($r, $d)) {
                return $c;
            }
        }

        return 'Outros';
    }

    public static function genero(string $descricao, string $categoria): string
    {
        $d = ' '.self::chaveTexto($descricao).' ';
        if (preg_match('/\bUNISSEX\b|\bUNISEX\b/', $d)) {
            return 'unissex';
        }
        if (preg_match('/\bMASC(ULINO|ULINA)?\b|\bMASC\./', $d)) {
            return 'masculino';
        }
        if (preg_match('/\bFEM(ININO|ININA)?\b|\bFEM\./', $d)) {
            return 'feminino';
        }
        if (in_array($categoria, self::SO_FEMININAS, true)) {
            return 'feminino';
        }
        if ($categoria === 'Calças' && preg_match('/\b(ALTA|SKINNY|SUPER SK|MOM|FLARE|WIDE|PANTALONA|CIGARRETE|BOYFRIEND)\b/', $d)) {
            return 'feminino';
        }

        return $categoria === 'Cuecas' ? 'masculino' : 'unissex';
    }

    public static function estacao(string $descricao, string $categoria): ?string
    {
        $t = mb_strtolower(self::semAcento("{$descricao} {$categoria}"));
        if (preg_match('/manga longa|\bml\b|moletom|trico|tricot|blusao|jaqueta|casaco|cardigan|sueter|gola alta|termic|colete|gorro|ceroula|flanel|kaban|\bla\b|veludo|segunda pele|meia calca/', $t)) {
            return 'inverno';
        }

        return preg_match('/manga curta|\bmm\b|regata|short|bermuda|sunga|biquini|linho|\btop\b|cropped|vestido|saia|bata|camiseta|sandalia|rasteir/', $t) ? 'verao' : null;
    }

    public static function ean(string $codigoBarras): ?string
    {
        return preg_match('/^\d{8,14}$/', trim($codigoBarras)) ? trim($codigoBarras) : null;
    }

    /** Estoque que o site pode vender: o da loja menos o condicional e o reservado no e-commerce do sistema. */
    public static function estoque(array $l): int
    {
        return max(0, $l['estoque'] - $l['condicional'] - $l['reservadoEc']);
    }

    private static function corDoAgrupamento(array $l): string
    {
        return self::chaveTexto(preg_match('/\d/', $l['codigoCor']) ? $l['codigoCor'] : ($l['corVisual'] ?: ($l['codigoCor'] ?: '')));
    }

    /**
     * Junta as linhas em produtos: fornecedor + referência (sem o tamanho) + cor. Nos fornecedores com referência por
     * tamanho, as linhas soltas com a mesma descrição (sem tamanho), cor e preço também se juntam.
     *
     * @return list<array{chave: string, fornecedor: string, referenciaBase: string, cor: ?string, linhas: list<array>}>
     */
    public static function agrupar(array $linhas): array
    {
        $grupos = [];
        foreach ($linhas as $l) {
            $base = self::referenciaBase($l['referencia'], self::tamanho($l['tamanho']));
            $chave = self::chaveTexto($l['fornecedor']).'|'.self::chaveTexto($base).'|'.self::corDoAgrupamento($l);
            $grupos[$chave] ??= ['chave' => $chave, 'fornecedor' => $l['fornecedor'], 'referenciaBase' => $base, 'cor' => self::cor($l), 'linhas' => []];
            $grupos[$chave]['linhas'][] = $l;
        }
        $porFornecedor = [];
        foreach ($grupos as $g) {
            $porFornecedor[$g['fornecedor']][] = $g;
        }
        $resultado = [];
        foreach ($porFornecedor as $lista) {
            $soltos = count(array_filter($lista, fn ($g) => count($g['linhas']) === 1));
            if (! (count($lista) >= 3 && $soltos / count($lista) > 0.6)) {
                array_push($resultado, ...$lista);

                continue;
            }
            $juntos = [];
            foreach ($lista as $g) {
                if (count($g['linhas']) > 1) {
                    $resultado[] = $g;

                    continue;
                }
                $l = $g['linhas'][0];
                $tam = preg_quote(self::chaveTexto($l['tamanho']), '/');
                $desc = trim((string) preg_replace('/\s+/', ' ', (string) preg_replace("/\\s{$tam}\\s/", ' ', ' '.self::chaveTexto($l['descricao']).' ')));
                $k = "{$desc}|".self::corDoAgrupamento($l).'|'.$l['preco'];
                if (isset($juntos[$k])) {
                    $juntos[$k]['linhas'][] = $l;
                } else {
                    $juntos[$k] = [...$g, 'chave' => "{$g['chave']}|d:{$k}", 'linhas' => [$l]];
                }
            }
            array_push($resultado, ...array_values($juntos));
        }

        return $resultado;
    }

    /** Referência do produto novo (até 20 letras, única): a da planilha sem o tamanho e, se precisar, a cor. @param array<string, true> $ocupadas */
    public static function referenciaDoProduto(array $g, array &$ocupadas, bool $precisaCor): string
    {
        $limpa = fn ($t) => (string) preg_replace('/[^A-Z0-9]/', '', strtoupper(self::semAcento((string) $t)));
        $base = $limpa($g['referenciaBase']) ?: $limpa($g['linhas'][0]['codigo']);
        if ($precisaCor) {
            $base .= substr($limpa($g['linhas'][0]['codigoCor'] ?: ($g['cor'] ?? '')), 0, 6);
        }
        $base = substr($base, 0, 20);
        $ref = $base;
        $n = 2;
        while (isset($ocupadas[$ref])) {
            $s = (string) $n++;
            $ref = substr($base, 0, 20 - strlen($s)).$s;
        }
        $ocupadas[$ref] = true;

        return $ref;
    }

    /** Preço do produto: o mais comum entre os tamanhos (empate: o maior). */
    public static function preco(array $linhas): float
    {
        $n = [];
        foreach ($linhas as $l) {
            $k = (string) $l['preco'];
            $n[$k] = ($n[$k] ?? 0) + 1;
        }
        uksort($n, fn ($a, $b) => [$n[$b], (float) $b] <=> [$n[$a], (float) $a]);

        return (float) array_key_first($n);
    }

    /** Lê as linhas de uma planilha já convertida em matriz (a primeira linha com os cabeçalhos). @return array{linhas: list<array>, erros: list<string>} */
    public static function lerLinhas(array $matriz): array
    {
        $inicio = null;
        foreach ($matriz as $i => $r) {
            $cel = array_map(fn ($c) => trim((string) $c), $r);
            if (in_array('Código', $cel, true) && in_array('Fornecedor', $cel, true)) {
                $inicio = $i;
                break;
            }
        }
        if ($inicio === null) {
            return ['linhas' => [], 'erros' => ['Cabeçalho não encontrado. A planilha precisa das colunas: '.implode(', ', self::COLUNAS).'.']];
        }
        $cab = array_map(fn ($c) => trim((string) $c), $matriz[$inicio]);
        $faltam = array_values(array_diff(self::COLUNAS, $cab));
        if ($faltam) {
            return ['linhas' => [], 'erros' => ['Faltam colunas: '.implode(', ', $faltam).'.']];
        }
        $col = array_combine(self::COLUNAS, array_map(fn ($c) => array_search($c, $cab, true), self::COLUNAS));
        $texto = fn ($v) => trim($v === null ? '' : (is_float($v) || is_int($v) ? (string) (round($v * 1e6) / 1e6) : (string) $v));
        $numero = fn ($v) => is_int($v) || is_float($v) ? (float) $v : (float) str_replace(',', '.', str_replace('.', '', (string) $v));
        $linhas = [];
        $erros = [];
        $total = count($matriz);
        for ($i = $inicio + 1; $i < $total; $i++) {
            $r = $matriz[$i] ?? [];
            $codigo = $texto($r[$col['Código']] ?? null);
            if ($codigo === '') {
                continue;
            }
            $l = [
                'linha' => $i + 1, 'fornecedor' => $texto($r[$col['Fornecedor']] ?? null), 'codigo' => $codigo, 'referencia' => $texto($r[$col['Refer.']] ?? null),
                'codigoBarras' => $texto($r[$col['Cód. Barras']] ?? null), 'descricao' => $texto($r[$col['Descrição']] ?? null), 'tamanho' => $texto($r[$col['Tam.']] ?? null),
                'codigoCor' => $texto($r[$col['Cód. Cor']] ?? null), 'corVisual' => $texto($r[$col['Cor Visual']] ?? null),
                'estoque' => (int) round($numero($r[$col['Estoq.']] ?? 0)), 'condicional' => (int) round($numero($r[$col['Cond.']] ?? 0)),
                'reservadoEc' => (int) round($numero($r[$col['Res. EC']] ?? 0)), 'preco' => round($numero($r[$col['Preço Venda']] ?? 0) * 100) / 100,
            ];
            if ($l['descricao'] === '') {
                $erros[] = "Linha {$l['linha']}: sem descrição.";
            } else {
                $linhas[] = $l;
            }
        }

        return ['linhas' => $linhas, 'erros' => $erros];
    }

    /** Sugestão para um fornecedor ainda sem regra: marca conhecida ou o nome fantasia. @return array{marca: string, ignorar: bool} */
    public static function regraPadrao(string $fornecedor): array
    {
        $f = self::chaveTexto($fornecedor);
        $conhecida = null;
        foreach ([['/HERING/', 'Hering'], ['/VESTE S\.?A/', 'John John'], ['/D\s?CERUTTI/', "D'Cerutti"], ['/PASQUINI|RANDALL/', 'Acostamento']] as [$r, $m]) {
            if (preg_match($r, $f)) {
                $conhecida = $m;
                break;
            }
        }
        $limpo = trim((string) preg_replace('/\s+/', ' ', (string) preg_replace('/&|\d+/', ' ', (string) preg_replace(
            '/\b(LTDA|S\.?\s?A|EIRELI|ME|EPP|CIA|IND(USTRIA)?|COM(ERCIO)?|E|DE|DO|DA|FABRICACAO|CONFECCOES|VESTUARIO|DISTRIBUIDORA|TEXTIL|ARTIGOS|COURO|CALCADOS|ACESS|FILIAL)\b\.?/',
            ' ', (string) preg_replace('/\(.*?\)/', ' ', $f)))));

        return ['marca' => $conhecida ?? mb_substr(self::titulo($limpo ?: $f), 0, 40), 'ignorar' => (bool) preg_match('/AVIAMENTOS|LUNELLI TEXTIL/', $f)];
    }

    /** Marca do produto novo: a do fornecedor; peças íntimas da Hering vão para a Hering Intimates. */
    public static function marcaDoProduto(string $marca, string $categoria): string
    {
        return $marca === 'Hering' && in_array($categoria, self::INTIMAS, true) ? 'Hering Intimates' : $marca;
    }
}
