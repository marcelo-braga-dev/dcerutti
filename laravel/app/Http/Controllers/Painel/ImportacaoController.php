<?php

namespace App\Http\Controllers\Painel;

use App\Http\Controllers\Controller;
use App\Models\ImportacaoEstoque as Registro;
use App\Services\Config;
use App\Services\ImportacaoEstoque;
use App\Support\PlanilhaEstoque;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/** Importação da planilha de estoque, só o gestor (porta de painel/produtos/importar, api/importacao-estoque e acoes/importacao.ts). */
class ImportacaoController extends Controller
{
    public function __construct(private ImportacaoEstoque $importacao, private Config $config) {}

    public function index(): Response
    {
        return Inertia::render('Painel/Produtos/Importar', [
            'colunas' => PlanilhaEstoque::COLUNAS,
            'historico' => Registro::query()->with('usuario:id,name')->orderByDesc('criadoEm')->take(10)->get()->map(fn ($h) => [
                'id' => $h->id, 'nomeOriginal' => $h->nomeOriginal, 'criadoEm' => $h->criadoEm->toIso8601String(), 'usuario' => $h->usuario?->name, 'resumo' => $h->resumo,
            ]),
        ]);
    }

    /** Recebe a planilha, guarda no servidor e devolve a prévia (nada é gravado no catálogo aqui). */
    public function enviar(Request $request): JsonResponse
    {
        $arquivo = $request->file('arquivo');
        if (! $arquivo || ! $arquivo->isValid() || ! $arquivo->getSize()) {
            return response()->json(['erro' => 'Escolha a planilha (.xlsx).'], 400);
        }
        if ($arquivo->getSize() > ImportacaoEstoque::TAMANHO_MAXIMO) {
            return response()->json(['erro' => 'Planilha acima de 20 MB.'], 413);
        }
        if (! preg_match('/\.xlsx$/i', $arquivo->getClientOriginalName())) {
            return response()->json(['erro' => 'Envie a planilha no formato .xlsx (Excel).'], 400);
        }
        $r = ImportacaoEstoque::ler($arquivo->getRealPath());
        if (! $r['linhas']) {
            return response()->json(['erro' => $r['erros'][0] ?? 'Nenhuma peça encontrada na planilha.'], 400);
        }
        $id = ImportacaoEstoque::guardar($arquivo->getRealPath());
        $salvas = $this->importacao->salvas();
        $plano = $this->importacao->planejar($r['linhas'], ImportacaoEstoque::regras($r['linhas'], $salvas), $salvas);

        return response()->json(['id' => $id, 'nomeOriginal' => mb_substr($arquivo->getClientOriginalName(), 0, 200), 'aba' => $r['aba'], 'erros' => $r['erros'], 'resumo' => ImportacaoEstoque::resumir($plano)]);
    }

    /** Só aceita regras bem formadas vindas da tela. @return array<string, array{marca: string, ignorar: bool}> */
    private static function limparRegras(mixed $r): array
    {
        $out = [];
        foreach (is_array($r) ? $r : [] as $nome => $v) {
            $marca = is_array($v) && is_string($v['marca'] ?? null) ? mb_substr(trim((string) preg_replace('/\s+/', ' ', $v['marca'])), 0, 40) : '';
            if ($marca !== '') {
                $out[mb_substr((string) $nome, 0, 120)] = ['marca' => $marca, 'ignorar' => ($v['ignorar'] ?? false) === true];
            }
        }

        return $out;
    }

    private function carregar(Request $request): ?array
    {
        $caminho = ImportacaoEstoque::caminho((string) $request->input('id'));
        if (! $caminho) {
            return null;
        }
        $linhas = ImportacaoEstoque::ler($caminho)['linhas'];
        $salvas = $this->importacao->salvas();

        return ['linhas' => $linhas, 'salvas' => $salvas, 'regras' => ImportacaoEstoque::regras($linhas, $salvas, self::limparRegras($request->input('regras')))];
    }

    /** Refaz a prévia com as marcas e os fornecedores ignorados escolhidos na tela. */
    public function previa(Request $request): JsonResponse
    {
        $c = $this->carregar($request);
        if (! $c) {
            return response()->json(['ok' => false, 'erro' => 'Planilha não encontrada. Envie de novo.']);
        }

        return response()->json(['ok' => true, 'resumo' => ImportacaoEstoque::resumir($this->importacao->planejar($c['linhas'], $c['regras'], $c['salvas']))]);
    }

    /** Importa: replaneja com o banco de agora, grava tudo e guarda as regras dos fornecedores. Uma por vez. */
    public function confirmar(Request $request): JsonResponse
    {
        $trava = Cache::lock('importacao-estoque', 600);
        if (! $trava->get()) {
            return response()->json(['ok' => false, 'erro' => 'Já há uma importação em andamento. Aguarde terminar.']);
        }
        try {
            $c = $this->carregar($request);
            if (! $c) {
                return response()->json(['ok' => false, 'erro' => 'Planilha não encontrada. Envie de novo.']);
            }
            $plano = $this->importacao->planejar($c['linhas'], $c['regras'], $c['salvas']);
            $this->importacao->aplicar($plano, $request->user()->id, (string) $request->input('id'), mb_substr((string) $request->input('nomeOriginal'), 0, 200));
            $this->config->salvar(['fornecedores' => [...$c['salvas'], ...$c['regras']]]);

            return response()->json(['ok' => true, 'resumo' => ImportacaoEstoque::resumir($plano)]);
        } catch (\Throwable $e) {
            Log::error('Importação de estoque falhou', ['erro' => $e->getMessage()]);

            return response()->json(['ok' => false, 'erro' => 'A importação falhou e nada foi gravado. Tente de novo; se continuar, avise o suporte.']);
        } finally {
            $trava->release();
        }
    }
}
