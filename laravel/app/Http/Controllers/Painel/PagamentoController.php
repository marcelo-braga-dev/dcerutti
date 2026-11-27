<?php

namespace App\Http\Controllers\Painel;

use App\Enums\AcaoPedido;
use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Cobranca;
use App\Models\Pedido;
use App\Models\User;
use App\Queries\Pagamentos;
use App\Services\Config;
use App\Services\Equipe;
use App\Services\Pagamentos\Cobrancas;
use App\Services\Pagamentos\ErroGateway;
use App\Services\Pagamentos\Modo;
use App\Services\Pagamentos\Travas;
use App\Services\Pedidos\Historico;
use App\Support\Datas;
use App\Support\Dinheiro;
use App\Support\Escopo;
use App\Support\Links;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Pagamento online no painel (docs/27; porta de acoes/pagamentos.ts e das páginas Pagamentos e Configurações). */
class PagamentoController extends Controller
{
    public function __construct(private Cobrancas $cobrancas, private Config $config, private Equipe $equipe, private Historico $historico) {}

    private static function site(): string
    {
        return rtrim((string) config('app.url'), '/');
    }

    private function pedidoDaEquipe(User $u, string $id): Pedido
    {
        $p = Escopo::vendedor(Pedido::query(), $u)->with(['venda:id,pedidoId,valor', 'vendedor:id,name'])->find($id);
        if (! $p) {
            throw new ErroNegocio('Pedido não encontrado.');
        }

        return $p;
    }

    private function cobrancaDaEquipe(User $u, string $id): Cobranca
    {
        $c = Cobranca::query()->with('pedido:id,vendedorId,codigo,clienteId,nomeCliente,criadoEm')->find($id);
        if (! $c || ! Escopo::podeAcessar($u, $c->pedido->vendedorId)) {
            throw new ErroNegocio('Cobrança não encontrada.');
        }

        return $c;
    }

    private function editado(User $u, Pedido $p, string $descricao, ?float $valor = null): void
    {
        defer(fn () => $this->equipe->registrar($u->id, 'pedido_editado', ['clienteId' => $p->clienteId, 'pedidoId' => $p->id, 'valor' => $valor, 'descricao' => "{$p->nomeCliente} · {$p->codigo} · {$descricao}"]));
    }

    /** Link de pagamento para a vendedora mandar. A cobrança só nasce quando a cliente escolhe o meio. */
    public function link(Request $request, string $id): JsonResponse
    {
        $u = $request->user();
        try {
            $cfg = (array) $this->config->get('pagamentoOnline');
            if (! $cfg['ligado']) {
                throw new ErroNegocio('O pagamento online está desligado em Configurações.');
            }
            if (! Modo::configurado()) {
                throw new ErroNegocio('O pagamento online ainda não foi configurado no servidor (credenciais do Mercado Pago).');
            }
            $p = $this->pedidoDaEquipe($u, $id);
            $valor = Cobrancas::valorDoPedido($p);
            if (! $valor['ok']) {
                return response()->json(['ok' => false, 'erro' => $valor['motivo'], 'precisaFrete' => $valor['precisaFrete'] ?? false]);
            }
            $link = Links::dePagamento(self::site(), $p->codigo);
            if (in_array($p->pagamentoSituacao->value, ['a_combinar', 'estornado'], true)) {
                $p->update(['pagamentoSituacao' => 'aguardando']);
            }
            $this->editado($u, $p, 'link de pagamento', $valor['valor']);

            return response()->json([
                'ok' => true, 'link' => $link, 'valor' => $valor['valor'], 'telefone' => $p->telefoneCliente ?: null, 'nomeCliente' => $p->nomeCliente,
                'nomeVendedor' => $u->papel->value === 'vendedor' ? $u->name : $p->vendedor->name, 'codigo' => $p->codigo, 'pix' => (bool) $cfg['pix'], 'cartao' => (bool) $cfg['cartao'],
            ]);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
    }

    /** RP-02: frete "a combinar" impede a cobrança; a equipe informa o valor combinado (0 = retirada ou grátis). */
    public function frete(Request $request, string $id): RedirectResponse
    {
        $u = $request->user();
        $texto = trim((string) $request->input('frete'));
        $valor = $texto === '' ? NAN : Dinheiro::lerValor($texto);
        if (! is_finite($valor) || $valor < 0 || $valor > 9999) {
            $this->falhar('Informe o frete em reais (0 para retirada na loja ou frete grátis).');
        }
        $p = $this->tentar(fn () => $this->pedidoDaEquipe($u, $id));
        $this->tentar(fn () => DB::transaction(function () use ($p, $valor, $u) {
            $atual = Pedido::query()->lockForUpdate()->find($p->id);
            if ($atual->status->value !== 'pendente' || $atual->tipo->value !== 'compra') {
                throw new ErroNegocio('Só dá para mudar o frete de uma compra em aberto.');
            }
            app(Travas::class)->garantirSemCobranca($p->id);
            if ($atual->freteCupom) {
                throw new ErroNegocio('O cupom deste pedido dá frete grátis.');
            }
            $this->historico->garantirRegistroInicial($p->id, $atual->criadoEm);
            $antes = $atual->frete;
            $atual->update(['frete' => number_format($valor, 2, '.', '')]);
            $this->historico->registrar($p->id, AcaoPedido::Editado, $u->id, ['Frete de '.($antes === null ? 'a combinar' : Dinheiro::brl($antes)).' para '.($valor ? Dinheiro::brl($valor) : 'grátis / retirada')]);
        }));
        $this->editado($u, $p, 'frete '.Dinheiro::brl($valor));

        return back()->with('sucesso', 'Frete salvo.');
    }

    /** "Conferir no Mercado Pago": consulta agora, sem esperar o aviso. */
    public function conferir(Request $request, string $id): RedirectResponse
    {
        $c = $this->tentar(fn () => $this->cobrancaDaEquipe($request->user(), $id));
        try {
            $this->cobrancas->sincronizar($c->id, 'acao');
        } catch (\Throwable $e) {
            $this->falhar($e->getMessage());
        }

        return back()->with('sucesso', 'Situação atualizada com o Mercado Pago.');
    }

    public function cancelar(Request $request, string $id): RedirectResponse
    {
        $u = $request->user();
        $c = $this->tentar(fn () => $this->cobrancaDaEquipe($u, $id));
        $this->tentar(fn () => $this->cobrancas->cancelar($c->id, $u->id));
        $this->editado($u, $c->pedido, 'cobrança cancelada');

        return back()->with('sucesso', 'Cobrança cancelada. A reserva das peças voltou ao estoque.');
    }

    /** RP-08: estorno total ou parcial. Gestor; vendedoras também se a loja liberar. */
    public function estornar(Request $request, string $id): RedirectResponse
    {
        $u = $request->user();
        $motivo = trim((string) $request->input('motivo'));
        if (mb_strlen($motivo) < 3) {
            throw ValidationException::withMessages(['motivo' => 'Informe o motivo do estorno.']);
        }
        if (! $u->ehGestor() && $this->config->get('pagamentoOnline.quemEstorna') !== 'equipe') {
            $this->falhar('Só o gestor pode estornar pagamentos.');
        }
        $texto = trim((string) $request->input('valor'));
        $valor = $texto !== '' ? Dinheiro::lerValor($texto) : null;
        if ($valor !== null && ! ($valor > 0)) {
            $this->falhar('Informe o valor do estorno, ou deixe em branco para estornar tudo.');
        }
        $c = $this->tentar(fn () => $this->cobrancaDaEquipe($u, $id));
        $this->tentar(fn () => $this->cobrancas->estornar($c->id, $u->id, mb_substr($motivo, 0, 300), $valor));
        DB::transaction(function () use ($c, $u, $valor, $motivo) {
            $this->historico->garantirRegistroInicial($c->pedido->id, $c->pedido->criadoEm);
            $this->historico->registrar($c->pedido->id, AcaoPedido::Editado, $u->id, ['Pagamento online estornado'.($valor !== null ? ' ('.Dinheiro::brl($valor).')' : '')], mb_substr($motivo, 0, 300));
        });
        $this->editado($u, $c->pedido, "estorno: {$motivo}");
        $status = $c->refresh()->status->value;

        return back()->with('sucesso', in_array($status, ['estornada', 'estornada_parcial'], true) ? 'Estorno feito no Mercado Pago.' : 'Estorno pedido ao Mercado Pago; a confirmação chega em instantes.');
    }

    /** Conferência do pagamento online (gestor): o que entrou, taxas, líquido, abertos e o que precisa de atenção. */
    public function index(Request $request, Pagamentos $consultas): Response
    {
        $atual = Datas::mes();
        $mes = Datas::mesValido($request->query('mes')) && $request->query('mes') <= $atual ? (string) $request->query('mes') : $atual;
        [$de, $ate] = Datas::intervaloDoMes($mes);
        $status = in_array($request->query('status'), ['pagas', 'abertas', 'estornada', 'problemas'], true) ? (string) $request->query('status') : null;
        $pagina = max(1, min(20, (int) $request->query('pagina', 1)));
        $this->cobrancas->talvezConciliar();

        return Inertia::render('Painel/Pagamentos/Index', [...$consultas->listar(['status' => $status, 'de' => $de, 'ate' => $ate, 'pagina' => $pagina]), 'mes' => $mes, 'atual' => $atual, 'status' => $status, 'pagina' => $pagina, 'configurado' => Modo::configurado()]);
    }

    public function configuracao(): Response
    {
        return Inertia::render('Painel/Configuracoes/Pagamento', ['cfg' => $this->config->get('pagamentoOnline'), 'saude' => Pagamentos::saude(self::site()), 'pronto' => Modo::configurado()]);
    }

    /** Salva só o bloco do pagamento online. Credenciais nunca passam por aqui: ficam no .env. */
    public function salvarConfiguracao(Request $request): RedirectResponse
    {
        $erros = [];
        $limites = ['minutosPix' => [10, 1440, 'minutos'], 'minutosCheckout' => [15, 1440, 'minutos'], 'parcelasMax' => [1, 12, ''], 'parcelasSemJuros' => [1, 12, '']];
        $n = [];
        foreach ($limites as $campo => [$min, $max]) {
            $v = $request->input($campo);
            if (! is_numeric($v) || (int) $v != $v) {
                $erros[$campo] = 'Use um número inteiro.';

                continue;
            }
            $n[$campo] = (int) $v;
            if ($n[$campo] < $min) {
                $erros[$campo] = "No mínimo {$min}".($campo === 'minutosPix' || $campo === 'minutosCheckout' ? ' minutos.' : '.');
            } elseif ($n[$campo] > $max) {
                $erros[$campo] = $max === 1440 ? 'No máximo 1440 minutos (24 h).' : "No máximo {$max}.";
            }
        }
        if (! in_array($request->input('quemEstorna'), ['gestor', 'equipe'], true)) {
            $erros['quemEstorna'] = 'Escolha quem pode estornar.';
        }
        if ($erros) {
            throw ValidationException::withMessages($erros);
        }
        $nova = [
            'ligado' => $request->boolean('ligado'), 'pix' => $request->boolean('pix'), 'cartao' => $request->boolean('cartao'), 'pagarNaSacola' => $request->boolean('pagarNaSacola'),
            'confirmarAoPagar' => $request->boolean('confirmarAoPagar'), ...$n, 'quemEstorna' => $request->input('quemEstorna'),
        ];
        if (! $nova['pix'] && ! $nova['cartao']) {
            throw ValidationException::withMessages(['pix' => 'Ligue o Pix, o cartão ou os dois.']);
        }
        if ($nova['parcelasSemJuros'] > $nova['parcelasMax']) {
            throw ValidationException::withMessages(['parcelasSemJuros' => "No máximo {$nova['parcelasMax']} (o número de parcelas)."]);
        }
        if ($nova['ligado'] && ! Modo::configurado()) {
            throw ValidationException::withMessages(['ligado' => 'Ainda não dá para ligar: as credenciais do Mercado Pago não estão no servidor (veja Conexão, acima).']);
        }
        $this->config->salvar(['pagamentoOnline' => $nova]);

        return back()->with('sucesso', $nova['ligado'] ? 'Pagamento online salvo e ligado.' : 'Configuração salva. O pagamento online está desligado.');
    }

    /** "Testar conexão": confere o Access Token e diz de qual conta ele é. */
    public function testar(): JsonResponse
    {
        if (! Modo::configurado()) {
            return response()->json(['ok' => false, 'erro' => 'Sem credenciais no servidor: defina MP_ACCESS_TOKEN no .env e recarregue o app.']);
        }
        try {
            $conta = Modo::gateway()->testarConexao();
        } catch (\Throwable $e) {
            $http = $e instanceof ErroGateway ? $e->http : null;

            return response()->json(['ok' => false, 'erro' => in_array($http, [401, 403], true) ? 'O Mercado Pago recusou o Access Token (inválido, revogado ou de outra aplicação). Confira MP_ACCESS_TOKEN.' : ($e->getMessage() ?: 'Não foi possível falar com o Mercado Pago.')]);
        }
        $pais = $conta['pais'] && $conta['pais'] !== 'MLB' ? " Atenção: a conta é de outro país ({$conta['pais']}); a loja precisa de uma conta do Brasil." : '';

        return response()->json(['ok' => true, 'conta' => $conta, 'mensagem' => 'Conectado à conta '.($conta['apelido'] ?? $conta['id']).($conta['teste'] ? ' (usuário de teste)' : '').".{$pais}"]);
    }
}
