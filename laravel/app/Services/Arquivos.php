<?php

namespace App\Services;

use App\Exceptions\ErroNegocio;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\ProdutoImagem;
use App\Models\ProdutoVideo;
use Imagick;
use ImagickException;

/**
 * Fotos e vídeos gravados em armazenamento/ (D-13, D-29; porta de src/server/arquivos.ts e exclusao.ts). Os nomes nunca
 * se repetem; grava em arquivo temporário e renomeia, para ninguém ler um arquivo pela metade.
 */
class Arquivos
{
    public const PREFIXO = '/arquivos';

    public const TAMANHO_MAXIMO = 8 * 1024 * 1024;

    public const TAMANHO_MAXIMO_VIDEO = 100 * 1024 * 1024;

    private const FORMATOS = ['JPEG', 'PNG', 'WEBP', 'AVIF', 'HEIC', 'GIF'];

    public static function dir(): string
    {
        return rtrim((string) config('services.arquivos.dir'), '/');
    }

    /** Caminho absoluto dentro da pasta, ou null se a URL tentar sair dela. */
    public static function caminhoDaUrl(string $url): ?string
    {
        if (! str_starts_with($url, self::PREFIXO.'/') || str_contains($url, '..')) {
            return null;
        }

        return self::dir().'/'.substr($url, strlen(self::PREFIXO) + 1);
    }

    private static function nome(): string
    {
        return base_convert((string) (int) (microtime(true) * 1000), 10, 36).'-'.bin2hex(random_bytes(4));
    }

    private static function gravar(string $pasta, string $nome, string $dados): void
    {
        if (! is_dir($pasta)) {
            mkdir($pasta, 0775, true);
        }
        $tmp = "{$pasta}/.{$nome}.tmp";
        file_put_contents($tmp, $dados);
        rename($tmp, "{$pasta}/{$nome}");
    }

    /** Lê a imagem pelo conteúdo, gira pelo EXIF e reduz para caber em `lado` px. */
    private static function abrirImagem(string $dados, array $aceitos = self::FORMATOS): Imagick
    {
        if (strlen($dados) > self::TAMANHO_MAXIMO) {
            throw new ErroNegocio('Foto acima de 8 MB.');
        }
        try {
            $img = new Imagick;
            $img->readImageBlob($dados);
        } catch (ImagickException) {
            throw new ErroNegocio('O arquivo não é uma imagem válida.');
        }
        if (! in_array(strtoupper($img->getImageFormat()), $aceitos, true)) {
            throw new ErroNegocio('Use JPG, PNG, WebP ou AVIF.');
        }
        if ($img->getNumberImages() > 1) {
            $img = $img->coalesceImages();
            $img->setIteratorIndex(0);
            $img = $img->getImage();
        }
        $img->autoOrient();
        $img->stripImage();

        return $img;
    }

    private static function reduzir(Imagick $img, int $lado): void
    {
        if ($img->getImageWidth() > $lado || $img->getImageHeight() > $lado) {
            $img->thumbnailImage($lado, $lado, true);
        }
    }

    /** Foto de produto: no máximo 1600 px, em WebP. Devolve /arquivos/produtos/<REF>/<nome>.webp. */
    public function salvarFotoProduto(string $referencia, string $dados): string
    {
        if (! preg_match('/^[\w-]{1,20}$/', $referencia)) {
            throw new ErroNegocio('Referência inválida.');
        }
        $img = self::abrirImagem($dados);
        self::reduzir($img, 1600);
        $img->setImageFormat('webp');
        $img->setImageCompressionQuality(82);
        $ref = strtoupper($referencia);
        $nome = self::nome().'.webp';
        self::gravar(self::dir()."/produtos/{$ref}", $nome, $img->getImageBlob());

        return self::PREFIXO."/produtos/{$ref}/{$nome}";
    }

    /** Foto das páginas editáveis (editor da página inicial): até 2000 px, em WebP. */
    public function salvarImagemPagina(string $pagina, string $dados): string
    {
        if (! preg_match('/^[a-z]{2,20}$/', $pagina)) {
            throw new ErroNegocio('Página inválida.');
        }
        $img = self::abrirImagem($dados);
        self::reduzir($img, 2000);
        $img->setImageFormat('webp');
        $img->setImageCompressionQuality(84);
        $nome = "{$pagina}-".self::nome().'.webp';
        self::gravar(self::dir().'/paginas', $nome, $img->getImageBlob());

        return self::PREFIXO."/paginas/{$nome}";
    }

    /**
     * Logo ou favicon (D-25). Aceita SVG, que vira imagem (nenhum SVG é servido como veio). Logos: WebP até 1200 px.
     * Favicon: PNG quadrado de 512 px com a imagem centralizada.
     *
     * @return array{url: string, largura: int, altura: int}
     */
    public function salvarArquivoMarca(string $tipo, string $dados): array
    {
        $svg = str_contains(substr($dados, 0, 1024), '<svg');
        $img = $svg ? (function () use ($dados) {
            $i = new Imagick;
            $i->setResolution(300, 300);
            $i->setBackgroundColor('transparent');
            try {
                $i->readImageBlob($dados);
            } catch (ImagickException) {
                throw new ErroNegocio('O arquivo não é uma imagem válida.');
            }

            return $i;
        })() : self::abrirImagem($dados, ['JPEG', 'PNG', 'WEBP', 'AVIF']);
        if ($tipo === 'favicon') {
            $img->thumbnailImage(512, 512, true);
            $fundo = new Imagick;
            $fundo->newImage(512, 512, 'transparent', 'png');
            $fundo->compositeImage($img, Imagick::COMPOSITE_OVER, intdiv(512 - $img->getImageWidth(), 2), intdiv(512 - $img->getImageHeight(), 2));
            $img = $fundo;
            $ext = 'png';
        } else {
            self::reduzir($img, 1200);
            $img->setImageFormat('webp');
            $img->setImageCompressionQuality(90);
            $ext = 'webp';
        }
        $nome = "{$tipo}-".self::nome().".{$ext}";
        self::gravar(self::dir().'/marca', $nome, $img->getImageBlob());

        return ['url' => self::PREFIXO."/marca/{$nome}", 'largura' => $img->getImageWidth(), 'altura' => $img->getImageHeight()];
    }

    /**
     * Vídeo de produto: grava o corpo da requisição direto no disco (sem juntar tudo na memória) e confere o formato pelo
     * conteúdo. MP4/MOV (H.264, AV1, VP9) e WebM; recusa HEVC, que não toca no Android nem no Windows.
     *
     * @param  resource  $entrada
     */
    public function salvarVideoProduto(string $referencia, $entrada): string
    {
        if (! preg_match('/^[\w-]{1,20}$/', $referencia)) {
            throw new ErroNegocio('Referência inválida.');
        }
        $ref = strtoupper($referencia);
        $pasta = self::dir()."/produtos/{$ref}";
        if (! is_dir($pasta)) {
            mkdir($pasta, 0775, true);
        }
        $base = self::nome();
        $tmp = "{$pasta}/.{$base}.tmp";
        $saida = fopen($tmp, 'wb');
        $total = 0;
        try {
            while (! feof($entrada)) {
                $parte = fread($entrada, 1024 * 1024);
                if ($parte === false) {
                    break;
                }
                $total += strlen($parte);
                if ($total > self::TAMANHO_MAXIMO_VIDEO) {
                    throw new ErroNegocio('Vídeo acima de 100 MB.');
                }
                fwrite($saida, $parte);
            }
            fclose($saida);
            $saida = null;
            if (! $total) {
                throw new ErroNegocio('Escolha um vídeo.');
            }
            $ext = self::conferirVideo($tmp);
            rename($tmp, "{$pasta}/{$base}.{$ext}");

            return self::PREFIXO."/produtos/{$ref}/{$base}.{$ext}";
        } catch (\Throwable $e) {
            if ($saida) {
                fclose($saida);
            }
            @unlink($tmp);
            throw $e;
        }
    }

    /** MP4/MOV (caixa `ftyp`, codec no `moov`) ou WebM (EBML com docType "webm"). */
    private static function conferirVideo(string $arquivo): string
    {
        $f = fopen($arquivo, 'rb');
        try {
            $tamanho = filesize($arquivo);
            $inicio = fread($f, 64);
            if (strlen($inicio) >= 4 && unpack('N', $inicio)[1] === 0x1A45DFA3) {
                if (! str_contains($inicio, 'webm')) {
                    throw new ErroNegocio('Use vídeo MP4, MOV ou WebM.');
                }

                return 'webm';
            }
            if (substr($inicio, 4, 4) !== 'ftyp') {
                throw new ErroNegocio('O arquivo não é um vídeo válido. Use MP4, MOV ou WebM.');
            }
            $pos = 0;
            while ($pos + 8 <= $tamanho) {
                fseek($f, $pos);
                $cab = fread($f, 16);
                $tam = unpack('N', substr($cab, 0, 4))[1];
                $cabecalho = 8;
                if ($tam === 1) {
                    $tam = unpack('J', substr($cab, 8, 8))[1];
                    $cabecalho = 16;
                } elseif ($tam === 0) {
                    $tam = $tamanho - $pos;
                }
                if ($tam < $cabecalho) {
                    break;
                }
                if (substr($cab, 4, 4) === 'moov') {
                    if ($pos + $tam > $tamanho) {
                        break;
                    }
                    fseek($f, $pos);
                    $moov = fread($f, min($tam, 64 * 1024 * 1024));
                    if (str_contains($moov, 'hvc1') || str_contains($moov, 'hev1')) {
                        throw new ErroNegocio('Vídeo em HEVC (padrão do iPhone) não toca em Android nem Windows. No iPhone, use Ajustes > Câmera > Formatos > Mais Compatível, ou exporte em H.264.');
                    }
                    foreach (['avc1', 'avc3', 'av01', 'vp09'] as $c) {
                        if (str_contains($moov, $c)) {
                            return 'mp4';
                        }
                    }
                    throw new ErroNegocio('Codec de vídeo não aceito. Use MP4 com H.264.');
                }
                $pos += $tam;
            }
            throw new ErroNegocio('O vídeo está incompleto (sem índice). Exporte de novo e tente outra vez.');
        } finally {
            fclose($f);
        }
    }

    /** Apaga do disco os arquivos que nada mais usa (fotos, vídeos e capas de produtos e a foto copiada nos pedidos). @param list<string> $urls */
    public function removerSemUso(array $urls): int
    {
        $locais = array_values(array_unique(array_filter($urls, fn ($u) => str_starts_with((string) $u, self::PREFIXO.'/'))));
        if (! $locais) {
            return 0;
        }
        $emUso = collect()
            ->merge(ProdutoImagem::query()->whereIn('url', $locais)->pluck('url'))
            ->merge(ProdutoVideo::query()->whereIn('url', $locais)->orWhereIn('capa', $locais)->get(['url', 'capa'])->flatMap(fn ($v) => [$v->url, $v->capa]))
            ->merge(PedidoItem::query()->whereIn('imagem', $locais)->pluck('imagem'))
            ->filter()->unique()->all();
        $removidos = 0;
        foreach ($locais as $url) {
            if (in_array($url, $emUso, true)) {
                continue;
            }
            $alvo = self::caminhoDaUrl($url);
            if ($alvo && is_file($alvo) && @unlink($alvo)) {
                $removidos++;
                @rmdir(dirname($alvo)); // só sai se estiver vazia
            }
        }

        return $removidos;
    }

    /**
     * Exclui o produto e tudo que depende dele (fotos e vídeos, tamanhos, custo, histórico de estoque). Produto que já
     * entrou em pedido não é excluído: desative no catálogo.
     */
    public function excluirProduto(int $produtoId): string
    {
        $p = Produto::query()->with(['imagens:id,produtoId,url', 'videos:id,produtoId,url,capa'])->find($produtoId);
        if (! $p) {
            throw new ErroNegocio('Produto não encontrado.');
        }
        $emPedidos = PedidoItem::query()->where('produtoId', $produtoId)->orWhereHas('variante', fn ($q) => $q->where('produtoId', $produtoId))->count();
        if ($emPedidos) {
            throw new ErroNegocio("Este produto aparece em {$emPedidos} item(ns) de pedido e não pode ser excluído. Desmarque \"Ativo no catálogo\" para escondê-lo.");
        }
        $p->delete(); // cascata no banco: imagens, vídeos, variantes (e movimentos), custo
        $this->removerSemUso([...$p->imagens->pluck('url')->all(), ...$p->videos->flatMap(fn ($v) => array_filter([$v->url, $v->capa]))->all()]);

        return $p->referencia;
    }
}
