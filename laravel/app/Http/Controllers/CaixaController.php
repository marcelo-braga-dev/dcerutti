<?php

namespace App\Http\Controllers;

use App\Enums\Papel;
use App\Exceptions\ErroCaixa;
use App\Exceptions\ErroNegocio;
use App\Models\User;
use App\Queries\Caixa as ConsultasCaixa;
use App\Services\Caixa;
use App\Services\Config;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Caixa da loja física (D-23; src/app/(caixa)/caixa e acoes/caixa.ts): tela própria, sem o menu do painel. */
class CaixaController extends Controller
{
    private const LINHAS = [
        'linhas' => ['required', 'array', 'min:1', 'max:40'], 'linhas.*.varianteId' => ['required', 'integer', 'min:1'],
        'linhas.*.quantidade' => ['required', 'integer', 'min:1', 'max:20'], 'linhas.*.precoCombinado' => ['nullable', 'numeric', 'min:0'],
        'descontoGeral' => ['nullable', 'array'], 'descontoGeral.tipo' => ['required_with:descontoGeral', 'in:percentual,valor'], 'descontoGeral.valor' => ['required_with:descontoGeral', 'numeric', 'min:0', 'max:100000'],
    ];

    public function index(Request $request, ConsultasCaixa $consultas, Config $config): Response
    {
        /** @var User $u */
        $u = $request->user();
        $gestor = $u->ehGestor();

        return Inertia::render('Caixa/Index', [
            'produtos' => $consultas->produtos(),
            'vendedores' => $gestor ? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']) : null,
            'limiteDesconto' => (float) $config->get('caixa.descontoMaxVendedor'),
            'parcelasMax' => (int) $config->get('caixa.parcelasMax'),
            'cupons' => (bool) $config->get('cupons.ligados') && ($gestor || $config->get('cupons.vendedorAplica')),
            'resumo' => $consultas->resumo($u),
        ]);
    }

    public function vendas(Request $request, ConsultasCaixa $consultas): Response
    {
        return Inertia::render('Caixa/Vendas', ['r' => $consultas->vendasDoDia($request->user(), $request->query('dia'))]);
    }

    public function buscarClientes(Request $request, Caixa $caixa): JsonResponse
    {
        return response()->json($caixa->buscarClientes($request->user(), (string) $request->query('q', '')));
    }

    public function cadastrarCliente(Request $request, Caixa $caixa): JsonResponse
    {
        try {
            return response()->json(['ok' => true, ...$caixa->cadastrarCliente($request->user(), (string) $request->input('nome'), (string) $request->input('telefone'), $request->input('cpf'), $request->input('vendedorId'))]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
    }

    public function previaCupom(Request $request, Caixa $caixa): JsonResponse
    {
        $v = validator($request->all(), [...self::LINHAS, 'codigo' => ['required', 'string', 'max:30'], 'clienteId' => ['nullable', 'string', 'max:40']]);
        if ($v->fails()) {
            return response()->json(['ok' => false, 'erro' => 'A venda está vazia.']);
        }
        $d = $v->validated();
        try {
            return response()->json(['ok' => true, ...$caixa->previaCupom($request->user(), $d['codigo'], $d['clienteId'] ?? null, self::linhas($d), self::geral($d))]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
    }

    /** Registra a venda do balcão (confirmada, com os pagamentos). */
    public function registrar(Request $request, Caixa $caixa): JsonResponse
    {
        $v = validator($request->all(), [
            ...self::LINHAS, 'clienteId' => ['nullable', 'string', 'max:40'], 'cupom' => ['nullable', 'string', 'max:30'], 'vendedorId' => ['nullable', 'string', 'max:40'],
            'observacao' => ['nullable', 'string', 'max:200'], 'pagamentos' => ['required', 'array', 'min:1', 'max:4'],
            'pagamentos.*.forma' => ['required', 'in:pix,debito,credito,dinheiro'], 'pagamentos.*.valor' => ['required', 'numeric', 'gt:0', 'max:1000000'],
            'pagamentos.*.parcelas' => ['nullable', 'integer', 'min:1', 'max:24'], 'pagamentos.*.recebido' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ], ['linhas.required' => 'A venda está vazia.', 'linhas.min' => 'A venda está vazia.', 'pagamentos.required' => 'Informe como a cliente pagou.', 'pagamentos.min' => 'Informe como a cliente pagou.']);
        if ($v->fails()) {
            return response()->json(['ok' => false, 'erro' => $v->errors()->first()]);
        }
        $d = $v->validated();
        try {
            return response()->json($caixa->registrarVenda($request->user(), [
                ...$d, 'linhas' => self::linhas($d), 'descontoGeral' => self::geral($d),
                'pagamentos' => array_map(fn ($p) => ['forma' => $p['forma'], 'valor' => (float) $p['valor'], 'parcelas' => isset($p['parcelas']) ? (int) $p['parcelas'] : null, 'recebido' => isset($p['recebido']) ? (float) $p['recebido'] : null], $d['pagamentos']),
            ]));
        } catch (ErroCaixa $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage(), 'total' => $e->total]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
    }

    /** @param array<string, mixed> $d @return list<array{varianteId: int, quantidade: int, precoCombinado: ?float}> */
    private static function linhas(array $d): array
    {
        return array_map(fn ($l) => ['varianteId' => (int) $l['varianteId'], 'quantidade' => (int) $l['quantidade'], 'precoCombinado' => isset($l['precoCombinado']) ? (float) $l['precoCombinado'] : null], $d['linhas']);
    }

    /** @param array<string, mixed> $d @return ?array{tipo: string, valor: float} */
    private static function geral(array $d): ?array
    {
        return ! empty($d['descontoGeral']) ? ['tipo' => $d['descontoGeral']['tipo'], 'valor' => (float) $d['descontoGeral']['valor']] : null;
    }
}
