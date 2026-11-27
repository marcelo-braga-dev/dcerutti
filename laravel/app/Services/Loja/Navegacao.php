<?php

namespace App\Services\Loja;

use App\Models\Atividade;
use App\Models\Cliente;
use App\Models\Favorito;
use App\Models\Produto;
use App\Models\SacolaCliente;
use App\Models\Variante;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Equipe;
use App\Support\FiltroCatalogo;
use Illuminate\Support\Carbon;

/**
 * Histórico da cliente na loja (docs/21; src/server/navegacao.ts): grava a navegação para a vendedora e o gestor.
 * Só clientes com ficha; equipe e visitantes não são registrados. Sem IP (D-18). Quem chama trata os erros.
 */
class Navegacao
{
    /** Uma visita termina depois de 30 minutos sem página aberta. */
    public const MINUTOS_VISITA = 30;

    /** Mesmo produto, busca ou página aberto de novo nesse tempo (recarregar) não conta outra vez. */
    private const REPETICAO_SEG = 10;

    public function __construct(private Config $config, private Catalogo $catalogo) {}

    /** Caminho da loja que vale registrar: interno, sem painel, API ou arquivos. */
    public static function caminhoValido(mixed $c): bool
    {
        return is_string($c) && strlen($c) <= 300 && str_starts_with($c, '/') && ! str_starts_with($c, '//')
            && ! preg_match('#^/(painel|api|arquivos|_next|build)(/|$|\?)#', $c);
    }

    /**
     * Filtros escolhidos (sem ordem e página), no formato guardado em `dados.filtros`.
     *
     * @param  array<string, mixed>  $f
     * @return array<string, mixed>
     */
    public static function filtrosAtivos(array $f): array
    {
        $r = [];
        foreach (['marca', 'genero', 'categoria', 'tamanho', 'preco', 'estacao'] as $k) {
            if ($f[$k]) {
                $r[$k] = $f[$k];
            }
        }
        if ($f['estoque'] !== 'todos') {
            $r['estoque'] = $f['estoque'];
        }
        if ($f['promo']) {
            $r['promo'] = true;
        }
        if ($f['imperdivel']) {
            $r['imperdivel'] = true;
        }

        return $r;
    }

    /**
     * Que tipo de página é: peça, busca no catálogo, catálogo filtrado ou outra.
     *
     * @return array{tipo: string, referencia?: string, termo?: string, filtros?: array<string, mixed>, filtrosCatalogo?: array<string, mixed>}
     */
    public static function classificar(string $caminho): array
    {
        $partes = parse_url('http://loja'.$caminho) ?: [];
        $rota = $partes['path'] ?? '/';
        if (preg_match('#^/produto/([^/]+)/?$#', $rota, $m)) {
            return ['tipo' => 'produto', 'referencia' => mb_substr(rawurldecode($m[1]), 0, 20)];
        }
        if ($rota === '/catalogo') {
            parse_str($partes['query'] ?? '', $q);
            $f = FiltroCatalogo::ler($q);
            $filtros = self::filtrosAtivos($f);
            if (trim($f['q']) !== '') {
                return ['tipo' => 'busca', 'termo' => mb_substr(trim($f['q']), 0, 100), 'filtros' => $filtros, 'filtrosCatalogo' => $f];
            }
            if ($filtros) {
                return ['tipo' => 'filtro', 'filtros' => $filtros];
            }
        }

        return ['tipo' => 'pagina'];
    }

    /** Ficha da conta logada, ou null quando não há ficha ou o histórico está desligado. */
    private function clienteParaRegistrar(string $userId): ?Cliente
    {
        if (! $this->config->get('historico.ligado')) {
            return null;
        }

        return Cliente::query()->where('userId', $userId)->first(['id', 'ultimoAcessoEm']);
    }

    /** Login com senha da cliente. */
    public function registrarLogin(string $userId, ?string $ua): void
    {
        $c = $this->clienteParaRegistrar($userId);
        if (! $c) {
            return;
        }
        Atividade::query()->create(['clienteId' => $c->id, 'tipo' => 'login', 'aparelho' => Equipe::aparelho($ua), 'criadoEm' => now()]);
        $c->update(['ultimoLoginEm' => now()]);
    }

    /**
     * Grava um lote de eventos do navegador (já validados). Devolve quantos foram gravados.
     *
     * @param  list<array<string, mixed>>  $eventos
     */
    public function registrarEventos(string $userId, array $eventos, ?string $ua, ?Carbon $agora = null): int
    {
        $cliente = $this->clienteParaRegistrar($userId);
        if (! $cliente) {
            return 0;
        }
        $agora ??= now();
        $clienteId = $cliente->id;
        $aparelho = Equipe::aparelho($ua);
        $gravados = 0;
        $recente = fn (array $onde) => Atividade::query()->where('clienteId', $clienteId)->where('criadoEm', '>=', $agora->copy()->subSeconds(self::REPETICAO_SEG))
            ->where(function ($q) use ($onde) {
                foreach ($onde as $k => $v) {
                    is_array($v) ? $q->whereIn($k, $v) : $q->where($k, $v);
                }
            })->exists();
        $criar = function (array $dados) use ($clienteId, $aparelho, $agora, &$gravados) {
            Atividade::query()->create(['clienteId' => $clienteId, 'aparelho' => $aparelho, 'criadoEm' => $agora, ...$dados]);
            $gravados++;
        };

        // Primeira página depois de 30 min parada: começa uma visita.
        $primeira = collect($eventos)->firstWhere('tipo', 'pagina');
        $novaVisita = ! $cliente->ultimoAcessoEm || $cliente->ultimoAcessoEm->diffInSeconds($agora) > self::MINUTOS_VISITA * 60;
        if ($primeira && $novaVisita) {
            $criar(['tipo' => 'acesso', 'caminho' => $primeira['caminho']]);
        }
        $ids = collect($eventos)->flatMap(fn ($e) => isset($e['varianteId']) ? [$e['varianteId']] : ($e['tipo'] === 'carrinho' ? array_column($e['itens'], 'varianteId') : []))->unique()->values();
        $variantes = Variante::query()->whereIn('id', $ids)->get(['id', 'tamanho', 'produtoId'])->keyBy('id');

        foreach ($eventos as $e) {
            switch ($e['tipo']) {
                case 'pagina':
                    $c = self::classificar($e['caminho']);
                    if ($c['tipo'] === 'produto') {
                        $p = $this->catalogo->porReferencia($c['referencia']) ?? Produto::query()->where('referencia', $c['referencia'])->first(['id'])?->toArray();
                        if ($p) {
                            if (! $recente(['tipo' => 'produto', 'produtoId' => $p['id']])) {
                                $criar(['tipo' => 'produto', 'caminho' => $e['caminho'], 'produtoId' => $p['id'], 'ref' => $e['ref'], 'duracaoSeg' => 0]);
                            }
                            break;
                        }
                    }
                    if ($recente(['caminho' => $e['caminho'], 'tipo' => ['pagina', 'busca', 'filtro', 'produto']])) {
                        break;
                    }
                    if ($c['tipo'] === 'busca') {
                        $resultados = FiltroCatalogo::filtrar($this->catalogo->lista(), [...$c['filtrosCatalogo'], 'pagina' => 1])['total'];
                        $criar(['tipo' => 'busca', 'caminho' => $e['caminho'], 'termo' => $c['termo'], 'dados' => ['filtros' => (object) $c['filtros'], 'resultados' => $resultados], 'ref' => $e['ref'], 'duracaoSeg' => 0]);
                    } elseif ($c['tipo'] === 'filtro') {
                        $criar(['tipo' => 'filtro', 'caminho' => $e['caminho'], 'dados' => ['filtros' => $c['filtros']], 'ref' => $e['ref'], 'duracaoSeg' => 0]);
                    } else {
                        $criar(['tipo' => 'pagina', 'caminho' => $e['caminho'], 'ref' => $e['ref'], 'duracaoSeg' => 0]);
                    }
                    break;
                case 'duracao':
                    // Soma o tempo na página aberta nas últimas 6 horas com essa referência.
                    $gravados += Atividade::query()->where('clienteId', $clienteId)->where('ref', $e['ref'])->where('criadoEm', '>=', $agora->copy()->subHours(6))
                        ->increment('duracaoSeg', $e['seg']);
                    break;
                case 'tamanho':
                    $v = $variantes->get($e['varianteId']);
                    if ($v && ! $recente(['tipo' => 'tamanho', 'varianteId' => $v->id])) {
                        $criar(['tipo' => 'tamanho', 'produtoId' => $v->produtoId, 'varianteId' => $v->id, 'termo' => $v->tamanho]);
                    }
                    break;
                case 'sacola':
                    $v = $variantes->get($e['varianteId']);
                    if ($v) {
                        $criar(['tipo' => 'sacola', 'produtoId' => $v->produtoId, 'varianteId' => $v->id, 'termo' => $v->tamanho, 'dados' => ['delta' => $e['delta']]]);
                    }
                    break;
                case 'whatsapp':
                    $criar(['tipo' => 'whatsapp', 'caminho' => $e['caminho']]);
                    break;
                case 'carrinho':
                    $this->guardarSacola($clienteId, array_values(array_filter($e['itens'], fn ($i) => $variantes->has($i['varianteId']))));
                    $gravados++;
                    break;
            }
        }
        // Último acesso: no máximo uma escrita por minuto.
        if (! $cliente->ultimoAcessoEm || $cliente->ultimoAcessoEm->diffInSeconds($agora) > 60) {
            Cliente::query()->whereKey($clienteId)->update(['ultimoAcessoEm' => $agora->format('Y-m-d H:i:s.v')]);
        }

        return $gravados;
    }

    /**
     * Cópia da sacola do navegador. Vazia, apaga. Mudou, o aviso de sacola parada pode sair de novo.
     *
     * @param  list<array{varianteId: int, quantidade: int}>  $itens
     */
    public function guardarSacola(string $clienteId, array $itens): void
    {
        if (! $itens) {
            SacolaCliente::query()->where('clienteId', $clienteId)->delete();

            return;
        }
        $json = array_map(fn ($i) => ['varianteId' => (int) $i['varianteId'], 'quantidade' => (int) $i['quantidade']], $itens);
        SacolaCliente::query()->updateOrCreate(['clienteId' => $clienteId], ['itens' => $json, 'avisadoEm' => null]);
    }

    /** Tentativa de cupom na sacola: o mesmo código só conta uma vez a cada 30 min. @param array{ok: bool, erro?: string} $resultado */
    public function registrarCupom(string $clienteId, string $codigo, array $resultado): void
    {
        if (! $this->config->get('historico.ligado')) {
            return;
        }
        $termo = mb_substr(mb_strtoupper(trim($codigo)), 0, 100);
        if ($termo === '') {
            return;
        }
        $ja = Atividade::query()->where('clienteId', $clienteId)->where('tipo', 'cupom')->where('termo', $termo)->where('criadoEm', '>=', now()->subMinutes(30))->exists();
        if (! $ja) {
            Atividade::query()->create(['clienteId' => $clienteId, 'tipo' => 'cupom', 'termo' => $termo, 'dados' => $resultado['ok'] ? ['ok' => true] : ['ok' => false, 'erro' => $resultado['erro'] ?? ''], 'criadoEm' => now()]);
        }
    }

    /** LGPD: apaga o histórico, a sacola guardada e os favoritos da cliente (exclusão da conta). */
    public function apagarHistorico(string $clienteId): void
    {
        Atividade::query()->where('clienteId', $clienteId)->delete();
        SacolaCliente::query()->where('clienteId', $clienteId)->delete();
        Favorito::query()->where('clienteId', $clienteId)->delete();
    }
}
