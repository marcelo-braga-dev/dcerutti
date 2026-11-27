<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\Produto;
use App\Services\Arquivos;
use App\Services\Catalogo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Mídia da peça (docs/26): a equipe acrescenta fotos e vídeos sem tocar em preço ou estoque. A vendedora só acrescenta,
 * e só arquivos enviados ao servidor; remover e usar endereços externos é com o gestor.
 */
class MidiaController extends Controller
{
    public function show(int $id): Response
    {
        $p = Produto::query()->with(['imagens' => fn ($q) => $q->orderBy('ordem'), 'videos' => fn ($q) => $q->orderBy('ordem')])->findOrFail($id, ['id', 'referencia', 'nome']);

        return Inertia::render('Painel/Produtos/Midia', ['produto' => [
            'id' => $p->id, 'referencia' => $p->referencia, 'nome' => $p->nome, 'imagens' => $p->imagens->pluck('url')->all(),
            'videos' => $p->videos->map(fn ($v) => ['url' => $v->url, 'capa' => $v->capa])->all(),
        ]]);
    }

    public function update(Request $request, int $id, Arquivos $arquivos, Catalogo $catalogo): RedirectResponse
    {
        $atual = Produto::query()->with(['imagens', 'videos'])->find($id);
        if (! $atual) {
            $this->falhar('Peça não encontrada.');
        }
        $gestor = $request->user()->ehGestor();
        $imagens = array_values(array_filter(array_map('trim', (array) $request->input('imagens', []))));
        $videos = (array) $request->input('videos', []);
        $local = fn ($x) => is_string($x) && preg_match('#^/arquivos/[\w./-]+$#', $x) && ! str_contains($x, '..');
        if (count($videos) > 5 || collect($videos)->contains(fn ($v) => ! $local($v['url'] ?? null) || ! preg_match('/\.(mp4|webm)$/', $v['url']) || (($v['capa'] ?? null) !== null && ! $local($v['capa'])))) {
            $this->falhar('Vídeos inválidos: no máximo 5, enviados por aqui.');
        }
        if (collect($imagens)->contains(fn ($x) => ! $local($x) && ! ($gestor && preg_match('#^https://\S+$#', $x)))) {
            $this->falhar('Use fotos enviadas por aqui.');
        }
        $fotosAntes = $atual->imagens->pluck('url')->all();
        if (! $gestor) {
            $mantidas = collect($fotosAntes)->every(fn ($x) => in_array($x, $imagens, true)) && $atual->videos->every(fn ($v) => collect($videos)->contains('url', $v->url));
            if (! $mantidas) {
                $this->falhar('Só a gestão remove fotos e vídeos da peça.');
            }
        }
        $antes = [...$fotosAntes, ...$atual->videos->flatMap(fn ($v) => array_filter([$v->url, $v->capa]))->all()];
        $agora = [...$imagens, ...collect($videos)->flatMap(fn ($v) => array_filter([$v['url'], $v['capa'] ?? null]))->all()];
        DB::transaction(function () use ($atual, $imagens, $videos) {
            $atual->imagens()->delete();
            $atual->imagens()->createMany(array_map(fn ($url, $ordem) => ['url' => $url, 'ordem' => $ordem], $imagens, array_keys($imagens)));
            $atual->videos()->delete();
            $atual->videos()->createMany(array_map(fn ($v, $ordem) => ['url' => $v['url'], 'capa' => $v['capa'] ?? null, 'ordem' => $ordem], array_values($videos), array_keys(array_values($videos))));
        });
        $arquivos->removerSemUso(array_values(array_diff($antes, $agora)));
        $catalogo->invalidar();

        return back()->with('sucesso', 'Fotos e vídeos salvos.');
    }
}
