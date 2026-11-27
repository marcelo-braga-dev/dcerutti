<?php

namespace App\Services;

use App\Models\Produto;
use App\Support\Pecas;
use Illuminate\Support\Facades\Cache;

/**
 * Catálogo ativo em cache (src/server/catalogo.ts). São poucas centenas de produtos: carregar tudo e filtrar em
 * memória é mais simples que montar consultas por filtro. Nunca inclui custo (RN-16). Os filtros da loja vêm na fase 3.
 */
class Catalogo
{
    public const CHAVE = 'catalogo';

    private const TTL = 300;

    /** @return list<array<string, mixed>> */
    public function lista(): array
    {
        return Cache::remember(self::CHAVE, self::TTL, fn () => $this->carregar());
    }

    /** Chamar depois de qualquer alteração em produto, imagem, variante, estoque ou reserva. */
    public function invalidar(): void
    {
        Cache::forget(self::CHAVE);
    }

    /** @return ?array<string, mixed> */
    public function porReferencia(string $referencia): ?array
    {
        foreach ($this->lista() as $p) {
            if (mb_strtolower($p['referencia']) === mb_strtolower($referencia)) {
                return $p;
            }
        }

        return null;
    }

    /**
     * Busca do montador e do "Incluir peça": até 12 peças com estoque; sem termo, as que têm foto.
     *
     * @return list<array<string, mixed>>
     */
    public function buscarPecas(string $termo): array
    {
        $termos = array_values(array_filter(preg_split('/\s+/', Pecas::normalizar(mb_substr($termo, 0, 80))) ?: []));

        return collect($this->lista())->filter(function ($p) use ($termos) {
            if (! collect($p['variantes'])->contains(fn ($v) => $v['disponivel'] > 0)) {
                return false;
            }
            if (! $termos) {
                return count($p['imagens']) > 0;
            }
            $alvo = Pecas::normalizar("{$p['nome']} {$p['referencia']} {$p['categoria']} ".($p['cor'] ?? ''));

            return collect($termos)->every(fn ($t) => str_contains($alvo, $t));
        })->take(12)->map(fn ($p) => [
            'id' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'cor' => $p['cor'], 'categoria' => $p['categoria'],
            'preco' => $p['preco'], 'imagem' => $p['imagens'][0] ?? null, 'variantes' => array_values(array_filter($p['variantes'], fn ($v) => $v['disponivel'] > 0)),
        ])->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function carregar(): array
    {
        $produtos = Produto::query()->where('ativo', true)->orderBy('id')->with([
            'marca:id,nome,slug', 'categoria:id,nome,slug',
            'imagens' => fn ($q) => $q->orderBy('ordem'), 'videos' => fn ($q) => $q->orderBy('ordem'),
            'variantes:id,produtoId,tamanho,estoque,reservado,codigoInterno,ordem',
        ])->get();
        $lista = $produtos->map(function (Produto $p) {
            $variantes = $p->variantes->sort(fn ($a, $b) => [$a->ordem, Pecas::posicaoTamanho($a->tamanho)] <=> [$b->ordem, Pecas::posicaoTamanho($b->tamanho)])->values();

            return [
                'id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'marca' => $p->marca->nome, 'marcaSlug' => $p->marca->slug,
                'categoria' => $p->categoria->nome, 'categoriaSlug' => $p->categoria->slug, 'subcategoria' => $p->subcategoria,
                'genero' => $p->genero->value, 'estacao' => $p->estacao?->value, 'cor' => $p->cor, 'composicao' => $p->composicao, 'descricao' => $p->descricao,
                'destaques' => is_array($p->destaques) ? $p->destaques : [], 'preco' => (float) $p->preco, 'precoCheio' => (float) $p->precoCheio,
                'imperdivel' => $p->imperdivel, 'imagens' => $p->imagens->pluck('url')->all(),
                'videos' => $p->videos->map(fn ($v) => ['url' => $v->url, 'capa' => $v->capa])->all(),
                'variantes' => $variantes->map(fn ($v) => ['id' => $v->id, 'tamanho' => Pecas::normalizarTamanho($v->tamanho), 'disponivel' => max(0, $v->estoque - $v->reservado), 'codigoInterno' => $v->codigoInterno])->all(),
            ];
        })->all();
        // Cores do mesmo modelo: um card por modelo na vitrine e "outras cores" na página da peça.
        $modelos = [];
        foreach ($lista as $i => $p) {
            $lista[$i]['modelo'] = Pecas::chaveDoModelo($p['nome'], $p['referencia'], $p['marcaSlug'], $p['categoriaSlug'], $p['genero']);
            $lista[$i]['corNome'] = Pecas::nomeDaCor($p['nome'], $p['cor']);
            $modelos[$lista[$i]['modelo']][] = [
                'referencia' => $p['referencia'], 'cor' => $lista[$i]['corNome'], 'imagem' => $p['imagens'][0] ?? null,
                'disponivel' => collect($p['variantes'])->contains(fn ($v) => $v['disponivel'] > 0),
            ];
        }
        foreach ($lista as $i => $p) {
            $lista[$i]['cores'] = $modelos[$p['modelo']];
        }

        return $lista;
    }
}
