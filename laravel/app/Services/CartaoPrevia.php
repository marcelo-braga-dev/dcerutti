<?php

namespace App\Services;

use App\Support\Dinheiro;
use Illuminate\Support\Facades\Http;
use Imagick;
use ImagickDraw;
use ImagickPixel;

/**
 * Cartão da prévia do link no WhatsApp (D-20; porta de src/server/cartao-pedido.ts): 1200×630, JPEG pequeno, até 4 fotos
 * das peças com o tamanho e a quantidade e, à direita, o código, as peças e o valor. Serve ao pedido (/p), à sugestão
 * (/s) e à peça (/peca). Fica em cache em disco pela "versão" (peças, valores, situação, cores e textos).
 */
class CartaoPrevia
{
    private const L = 1200;

    private const A = 630;

    private const M = 40;

    private const GAP = 16;

    private const AREA = ['x' => 40, 'y' => 40, 'w' => 720, 'h' => 550];

    private const CORES = [
        'marrom-950' => '#2e2520', 'caramelo' => '#6d402a', 'creme' => '#f6f2ec', 'bege' => '#efe4d6', 'borda' => '#e6dccd', 'suave' => '#76685d',
    ];

    private const WHATSAPP = '#187a48';

    public function __construct(private Config $config) {}

    /**
     * @param  array{codigo: string, tipo: string, status: string, pecas: int, total: float, frete: ?float, itens: list<array{id: int, nome: string, tamanho: string, quantidade: int, preco: float, imagem: ?string}>}  $p
     * @param  ?array{selo: string, valorRotulo: string, extra: string}  $textos
     */
    public function gerar(array $p, ?array $textos = null): string
    {
        $id = (array) $this->config->get('identidade');
        $cores = [...self::CORES, ...array_intersect_key((array) ($id['cores'] ?? []), self::CORES)];
        $nome = $this->config->nomeDaLoja()['nome'];
        $versao = sha1(json_encode([$p, $textos, $cores, $nome]));
        $pasta = storage_path('app/cartoes');
        $arquivo = "{$pasta}/{$versao}.jpg";
        if (is_file($arquivo)) {
            return (string) file_get_contents($arquivo);
        }
        $jpg = $this->desenhar($p, $textos, $cores, $nome);
        if (! is_dir($pasta)) {
            @mkdir($pasta, 0775, true);
        }
        @file_put_contents($arquivo, $jpg);

        return $jpg;
    }

    /** Onde vai cada foto: 1 grande; 2 lado a lado; 3 = uma alta e duas menores; 4 = grade 2×2. @return list<array{x: int, y: int, w: int, h: int}> */
    public static function quadros(int $n): array
    {
        ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h] = self::AREA;
        $meia = ($w - self::GAP) / 2;
        $q = match (true) {
            $n <= 1 => [['x' => $x + ($w - round($h * 0.75)) / 2, 'y' => $y, 'w' => round($h * 0.75), 'h' => $h]],
            $n === 2 => array_map(fn ($i) => ['x' => $x + $i * ($meia + self::GAP), 'y' => $y + ($h - round($meia / 0.75)) / 2, 'w' => $meia, 'h' => round($meia / 0.75)], [0, 1]),
            $n === 3 => [['x' => $x, 'y' => $y, 'w' => $meia, 'h' => $h], ['x' => $x + $meia + self::GAP, 'y' => $y, 'w' => $meia, 'h' => ($h - self::GAP) / 2], ['x' => $x + $meia + self::GAP, 'y' => $y + ($h - self::GAP) / 2 + self::GAP, 'w' => $meia, 'h' => ($h - self::GAP) / 2]],
            default => array_map(fn ($i) => ['x' => $x + ($i % 2) * ($meia + self::GAP), 'y' => $y + intdiv($i, 2) * (($h - self::GAP) / 2 + self::GAP), 'w' => $meia, 'h' => ($h - self::GAP) / 2], [0, 1, 2, 3]),
        };

        return array_map(fn ($a) => array_map(fn ($v) => (int) round($v), $a), $q);
    }

    /** Foto do servidor (do disco) ou de outro endereço https (até 4 s e 8 MB); qualquer falha vira "sem foto". */
    private static function foto(?string $url): ?Imagick
    {
        if (! $url) {
            return null;
        }
        try {
            $dados = null;
            if (str_starts_with($url, Arquivos::PREFIXO.'/')) {
                $caminho = Arquivos::caminhoDaUrl($url);
                $dados = $caminho && is_file($caminho) ? file_get_contents($caminho) : null;
            } elseif (str_starts_with($url, 'https://')) {
                $r = Http::timeout(4)->get($url);
                $dados = $r->successful() && strlen($r->body()) <= 8 * 1024 * 1024 ? $r->body() : null;
            }
            if (! $dados) {
                return null;
            }
            $img = new Imagick;
            $img->readImageBlob($dados);
            $img->setIteratorIndex(0);
            $img->autoOrient();

            return $img;
        } catch (\Throwable) {
            return null;
        }
    }

    private static function fonte(bool $negrito): string
    {
        $f = $negrito ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

        return is_file($f) ? $f : 'DejaVu-Sans'.($negrito ? '-Bold' : '');
    }

    private static function texto(Imagick $c, string $t, int $x, int $y, int $tam, string $cor, bool $negrito = false, string $alinhar = 'esquerda', float $espaco = 0): void
    {
        $d = new ImagickDraw;
        $d->setFont(self::fonte($negrito));
        $d->setFontSize($tam);
        $d->setFillColor(new ImagickPixel($cor));
        $d->setTextKerning($espaco);
        $d->setTextAntialias(true);
        if ($alinhar === 'centro') {
            $d->setTextAlignment(Imagick::ALIGN_CENTER);
        }
        $c->annotateImage($d, $x, $y, 0, $t);
    }

    private static function retangulo(Imagick $c, int $x, int $y, int $w, int $h, string $cor, float $opacidade = 1): void
    {
        $d = new ImagickDraw;
        $d->setFillColor(new ImagickPixel($cor));
        $d->setFillOpacity($opacidade);
        $d->rectangle($x, $y, $x + $w - 1, $y + $h - 1);
        $c->drawImage($d);
    }

    private function desenhar(array $p, ?array $textos, array $cor, string $nome): string
    {
        $c = new Imagick;
        $c->newImage(self::L, self::A, new ImagickPixel($cor['creme']));
        $c->setImageFormat('jpeg');
        $mostrar = array_slice($p['itens'], 0, 4);
        $restantes = count($p['itens']) - count($mostrar);
        $qs = self::quadros(count($mostrar));
        foreach ($mostrar as $i => $item) {
            $q = $qs[$i];
            $f = self::foto($item['imagem']);
            if ($f) {
                $f->cropThumbnailImage($q['w'], $q['h']);
                $c->compositeImage($f, Imagick::COMPOSITE_OVER, $q['x'], $q['y']);
                $f->clear();
            } else {
                self::retangulo($c, $q['x'], $q['y'], $q['w'], $q['h'], $cor['bege']);
                self::texto($c, mb_substr($item['nome'], 0, 26), $q['x'] + intdiv($q['w'], 2), $q['y'] + intdiv($q['h'], 2), 22, $cor['suave'], false, 'centro');
            }
            if ($i === count($mostrar) - 1 && $restantes > 0) {
                // No quadro do "+N", a etiqueta sai: ficaria apagada por baixo da cobertura.
                self::retangulo($c, $q['x'], $q['y'], $q['w'], $q['h'], $cor['marrom-950'], 0.62);
                self::texto($c, "+{$restantes}", $q['x'] + intdiv($q['w'], 2), $q['y'] + intdiv($q['h'], 2) + 6, 56, '#ffffff', true, 'centro');
                self::texto($c, $restantes === 1 ? 'peça' : 'peças', $q['x'] + intdiv($q['w'], 2), $q['y'] + intdiv($q['h'], 2) + 44, 22, '#ffffff', true, 'centro');
            } else {
                $rotulo = $item['tamanho'] !== '' ? "Tam. {$item['tamanho']}".($item['quantidade'] > 1 ? "  ×{$item['quantidade']}" : '') : 'Escolha o tamanho';
                self::retangulo($c, $q['x'], $q['y'] + $q['h'] - 46, $q['w'], 46, $cor['marrom-950'], 0.78);
                self::texto($c, $rotulo, $q['x'] + 16, $q['y'] + $q['h'] - 15, 22, '#ffffff', true);
            }
        }
        $cond = $p['tipo'] === 'condicional';
        $x = 800;
        $valorRotulo = $textos['valorRotulo'] ?? ($cond ? 'Valor das peças' : 'Total');
        $extra = $textos ? $textos['extra'] : ($cond ? 'Pague só o que ficar' : ($p['frete'] === null ? '+ frete a combinar' : ((float) $p['frete'] === 0.0 ? 'Frete grátis' : 'com frete de '.Dinheiro::brl($p['frete']))));
        self::texto($c, mb_strtoupper($nome), $x, 96, 26, $cor['caramelo'], true, 'esquerda', 5);
        self::retangulo($c, $x, 119, self::L - self::M - $x, 2, $cor['borda']);
        self::texto($c, $textos['selo'] ?? ($cond ? 'CONDICIONAL' : 'PEDIDO'), $x, 176, 21, $cor['suave'], true, 'esquerda', 3);
        self::texto($c, $p['codigo'], $x, 226, 40, $cor['marrom-950'], true);
        self::texto($c, $p['pecas'].' '.($p['pecas'] === 1 ? 'peça' : 'peças'), $x, 276, 28, $cor['marrom-950']);
        self::texto($c, mb_strtoupper($valorRotulo), $x, 400, 20, $cor['suave'], true, 'esquerda', 2);
        self::texto($c, Dinheiro::brl($p['total']), $x, 458, 48, $cor['marrom-950'], true);
        self::texto($c, $extra, $x, 498, 20, $cor['suave']);
        self::texto($c, 'Toque para ver as peças ›', $x, self::A - self::M - 4, 20, self::WHATSAPP, true);
        $c->setImageCompressionQuality(82);
        $c->stripImage();
        $jpg = $c->getImagesBlob();
        $c->clear();

        return $jpg;
    }
}
