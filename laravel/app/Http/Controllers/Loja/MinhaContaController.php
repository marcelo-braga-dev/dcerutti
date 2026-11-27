<?php

namespace App\Http\Controllers\Loja;

use App\Enums\StatusPedido;
use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Atendimento;
use App\Models\AtendimentoItem;
use App\Models\AtendimentoRegistro;
use App\Models\Cliente;
use App\Models\Cobranca;
use App\Models\Favorito;
use App\Models\Pedido;
use App\Models\PosVendaContato;
use App\Models\Produto;
use App\Models\Sugestao;
use App\Models\User;
use App\Queries\Cupons;
use App\Queries\Loja;
use App\Services\Catalogo;
use App\Services\Config;
use App\Services\Loja\AvisosDePedido;
use App\Services\Loja\Navegacao;
use App\Services\Pedidos\Pedidos;
use App\Support\Consentimento;
use App\Support\Contato;
use App\Support\Cpf;
use App\Support\Links;
use App\Support\Telefone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Área da cliente (src/app/(loja)/minha-conta/*, acoes/conta.ts, favoritos.ts, recompra.ts, cancelarMeuPedido). */
class MinhaContaController extends Controller
{
    public function __construct(private Loja $loja, private Config $config, private Cupons $cupons) {}

    /** Resumo do topo da área (último pedido, favoritos, cupons, quem atende). @return array<string, mixed> */
    private function resumo(User $u, ?Cliente $c): array
    {
        $ultimo = $c ? Pedido::query()->where('clienteId', $c->id)->latest('criadoEm')->first(['codigo', 'tipo', 'status', 'criadoEm']) : null;
        $ligados = (bool) $this->config->get('cupons.ligados');
        $contato = $c ? Contato::de($c->vendedor, '') : null;

        return [
            'email' => $u->email,
            'cuponsLigados' => $ligados,
            'resumo' => $c ? [
                'ultimoPedido' => $ultimo ? ['codigo' => $ultimo->codigo, 'tipo' => $ultimo->tipo->value, 'status' => $ultimo->status->value, 'criadoEm' => $ultimo->criadoEm->toIso8601String()] : null,
                'pedidos' => Pedido::query()->where('clienteId', $c->id)->count(),
                'favoritos' => Favorito::query()->where('clienteId', $c->id)->count(),
                'cupons' => $ligados ? count(array_filter($this->cupons->daFicha($c->id), fn ($x) => $x['situacao'] === 'disponivel')) : 0,
                'atendimento' => $contato && $contato['nome'] ? ['nome' => $contato['nome'], 'telefone' => $contato['telefone']] : null,
            ] : null,
        ];
    }

    /** @param array<string, mixed> $props */
    private function tela(Request $request, string $pagina, array $props = []): Response
    {
        $u = $request->user();

        return Inertia::render("Loja/MinhaConta/{$pagina}", ['conta' => $this->resumo($u, $this->loja->ficha($u)), ...$props]);
    }

    public function dados(Request $request): Response
    {
        $u = $request->user();
        $c = $this->loja->ficha($u);
        $contato = $c ? Contato::de($c->vendedor, $this->config->get('whatsappLoja')) : null;

        return $this->tela($request, 'Dados', [
            'cliente' => $c ? [
                'nome' => $c->nome, 'telefone' => $c->telefone, 'cpf' => $c->cpf, 'cep' => $c->cep, 'endereco' => $c->endereco, 'cidade' => $c->cidade,
                'aceitaOfertas' => Consentimento::aceita($c),
            ] : null,
            'vendedor' => $c?->vendedor ? ['nome' => $c->vendedor->name, 'telefone' => $contato['telefone']] : null,
            'aceitouPrivacidadeEm' => $u->aceitouPrivacidadeEm?->toIso8601String(),
        ]);
    }

    /** U-04 (LGPD, correção): a cliente atualiza os próprios dados. O e-mail de acesso só muda pela loja. */
    public function atualizar(Request $request): RedirectResponse
    {
        $u = $request->user();
        $d = $request->validate([
            'nome' => ['required', 'string', 'min:3', 'max:120'], 'telefone' => ['required', 'string'], 'cpf' => ['nullable', 'string'],
            'endereco' => ['nullable', 'string', 'max:200'], 'cidade' => ['nullable', 'string', 'max:80'], 'cep' => ['nullable', 'string'], 'aceitaOfertas' => ['nullable', 'boolean'],
        ], ['nome.*' => 'Informe seu nome completo.', 'telefone.required' => 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.']);
        $dados = self::validarPessoa($d);
        $cep = ($d['cep'] ?? '') !== '' ? Telefone::formatarCep($d['cep']) : null;
        if ($cep !== null && strlen($cep) !== 9) {
            throw ValidationException::withMessages(['cep' => 'CEP inválido.']);
        }
        $atual = Cliente::query()->where('userId', $u->id)->first();
        if ($dados['cpf'] && Cliente::query()->where('cpf', $dados['cpf'])->where(fn ($q) => $q->whereNull('userId')->orWhere('userId', '<>', $u->id))->exists()) {
            throw ValidationException::withMessages(['cpf' => 'Este CPF já está cadastrado. Fale com a loja.']);
        }
        DB::transaction(function () use ($u, $d, $dados, $cep, $atual) {
            $u->update(['name' => $d['nome'], 'telefone' => $dados['telefone']]);
            Cliente::query()->where('userId', $u->id)->update([
                'nome' => $d['nome'], 'telefone' => $dados['telefone'], 'cpf' => $dados['cpf'], 'endereco' => ($d['endereco'] ?? '') ?: null, 'cidade' => ($d['cidade'] ?? '') ?: null,
                'cep' => $cep, ...Consentimento::depois($atual, (bool) ($d['aceitaOfertas'] ?? false)),
            ]);
        });

        return back()->with('sucesso', 'Dados atualizados.');
    }

    /**
     * Telefone e CPF do formulário da cliente, formatados, ou erro de validação.
     *
     * @param  array<string, mixed>  $d
     * @return array{telefone: string, cpf: ?string}
     */
    public static function validarPessoa(array $d): array
    {
        if (! Telefone::celularValido($d['telefone'] ?? '')) {
            throw ValidationException::withMessages(['telefone' => 'Informe o WhatsApp com DDD, ex.: (49) 99999-9999.']);
        }
        $cpf = null;
        if (Telefone::digitos($d['cpf'] ?? '') !== '') {
            if (! Cpf::valido($d['cpf'])) {
                throw ValidationException::withMessages(['cpf' => 'CPF inválido. Confira os 11 números.']);
            }
            $cpf = Cpf::formatar($d['cpf']);
        }

        return ['telefone' => Telefone::formatar($d['telefone']), 'cpf' => $cpf];
    }

    public function pedidos(Request $request): Response
    {
        $c = $this->loja->ficha($request->user());
        $lista = $c ? Pedido::query()->where('clienteId', $c->id)->latest('criadoEm')->take(50)->with('itens')->get() : collect();

        return $this->tela($request, 'Pedidos', [
            'pedidos' => $lista->map(fn (Pedido $p) => [
                'id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'status' => $p->status->value, 'criadoEm' => $p->criadoEm->toIso8601String(),
                'total' => (float) $p->total, 'frete' => $p->frete === null ? null : (float) $p->frete, 'codigoCupom' => $p->codigoCupom, 'descontoCupom' => (float) $p->descontoCupom,
                'freteCupom' => (bool) $p->freteCupom, 'motivoCancelamento' => $p->motivoCancelamento, 'pagamentoSituacao' => $p->pagamentoSituacao?->value ?? $p->pagamentoSituacao,
                'itens' => $p->itens->map(fn ($i) => [
                    'id' => $i->id, 'nome' => $i->nome, 'tamanho' => $i->tamanho, 'cor' => $i->cor, 'imagem' => $i->imagem, 'quantidade' => $i->quantidade,
                    'precoUnitario' => (float) $i->precoUnitario, 'descontoCupom' => (float) $i->descontoCupom, 'situacao' => $i->situacao?->value ?? $i->situacao,
                ])->values(),
            ])->values(),
            'vendedor' => $c?->vendedor ? ['nome' => $c->vendedor->name, 'telefone' => Contato::de($c->vendedor, $this->config->get('whatsappLoja'))['telefone']] : null,
        ]);
    }

    /** U-05: a cliente cancela um pedido ou condicional dela ainda em aberto (a reserva volta ao estoque). */
    public function cancelarPedido(Request $request, string $id, Pedidos $pedidos, AvisosDePedido $avisos): RedirectResponse
    {
        $u = $request->user();
        $dono = Pedido::query()->whereKey($id)->whereHas('cliente', fn ($q) => $q->where('userId', $u->id))->exists();
        if (! $dono) {
            return back()->withErrors(['erro' => 'Pedido não encontrado.']);
        }
        try {
            $pedidos->cancelar($id, 'cliente', $u->id);
        } catch (ErroNegocio $e) {
            return back()->withErrors(['erro' => $e->getMessage()]);
        }
        $site = rtrim((string) config('app.url'), '/');
        defer(fn () => rescue(fn () => $avisos->avisar($id, 'cancelado', $site)));

        return back()->with('sucesso', 'Pedido cancelado. As peças voltaram a ficar disponíveis.');
    }

    /**
     * "Comprar de novo" (D-22): as peças de um pedido da cliente como estão hoje no catálogo, nos mesmos tamanhos e
     * quantidades, limitadas ao disponível. O que saiu do catálogo ou acabou volta pelo nome.
     */
    public function recomprar(Request $request, string $id, Catalogo $catalogo): JsonResponse
    {
        $p = Pedido::query()->whereKey($id)->whereHas('cliente', fn ($q) => $q->where('userId', $request->user()->id))->with('itens')->first();
        if (! $p) {
            return response()->json(null);
        }
        $porVariante = [];
        foreach ($catalogo->lista() as $prod) {
            foreach ($prod['variantes'] as $v) {
                $porVariante[$v['id']] = ['produto' => $prod, 'v' => $v];
            }
        }
        $itens = [];
        $indisponiveis = [];
        // Condicional fechado: só o que ficou (o que voltou ela já provou e devolveu).
        foreach ($p->itens->filter(fn ($i) => ($i->situacao?->value ?? $i->situacao) !== 'devolvido') as $l) {
            $x = $porVariante[$l->varianteId] ?? null;
            if (! $x || $x['v']['disponivel'] <= 0) {
                $indisponiveis[] = "{$l->nome} (tam. {$l->tamanho})";

                continue;
            }
            $prod = $x['produto'];
            $itens[] = [
                'varianteId' => $l->varianteId, 'referencia' => $prod['referencia'], 'nome' => $prod['nome'], 'marca' => $prod['marca'], 'cor' => $prod['cor'],
                'tamanho' => $x['v']['tamanho'], 'codigoInterno' => $x['v']['codigoInterno'], 'preco' => $prod['preco'], 'imagem' => $prod['imagens'][0] ?? null,
                'maximo' => $x['v']['disponivel'], 'quantidade' => min($l->quantidade, $x['v']['disponivel']),
            ];
        }

        return response()->json(['itens' => $itens, 'indisponiveis' => $indisponiveis]);
    }

    /** Peças guardadas com o coração (D-22), da mais recente para a mais antiga. As que saíram do catálogo não aparecem. */
    public function favoritos(Request $request, Catalogo $catalogo): Response
    {
        $ids = $this->loja->favoritos($request->user());
        $porId = collect($catalogo->lista())->keyBy('id');
        $produtos = collect($ids)->map(fn ($id) => $porId->get($id))->filter()->map(Loja::cartao(...))->values();

        return $this->tela($request, 'Favoritos', ['produtos' => $produtos, 'fora' => count($ids) - $produtos->count()]);
    }

    /** Coração da loja: marca ou desmarca a peça como favorita da cliente logada. */
    public function alternarFavorito(Request $request, int $produtoId): JsonResponse
    {
        $clienteId = Loja::ehCliente($request->user()) ? Cliente::query()->where('userId', $request->user()->id)->value('id') : null;
        if (! $clienteId) {
            return response()->json(null, 403);
        }
        $q = Favorito::query()->where('clienteId', $clienteId)->where('produtoId', $produtoId);
        if ($q->exists()) {
            $q->delete();

            return response()->json(['favorito' => false]);
        }
        if (! Produto::query()->whereKey($produtoId)->exists()) {
            return response()->json(null, 404);
        }
        Favorito::query()->insert(['clienteId' => $clienteId, 'produtoId' => $produtoId, 'criadoEm' => now()->format('Y-m-d H:i:s.v')]);

        return response()->json(['favorito' => true]);
    }

    public function cupons(Request $request): Response
    {
        $c = $this->loja->ficha($request->user());

        return $this->tela($request, 'Cupons', ['cupons' => $c && $this->config->get('cupons.ligados') ? $this->cupons->daFicha($c->id) : []]);
    }

    /** As sugestões que quem atende separou para a cliente (D-27); cada uma abre a página de escolher. */
    public function sugestoes(Request $request): Response
    {
        $c = $this->loja->ficha($request->user());
        $lista = $c ? Sugestao::query()->where('clienteId', $c->id)->where('status', '<>', 'cancelada')->latest('criadaEm')->take(30)
            ->with('vendedor:id,name')->withCount('itens')->get() : collect();

        return $this->tela($request, 'Sugestoes', [
            'sugestoes' => $lista->map(fn (Sugestao $s) => [
                'id' => $s->id, 'titulo' => $s->titulo, 'vendedor' => $s->vendedor?->name, 'pecas' => $s->itens_count, 'criadaEm' => $s->criadaEm->toIso8601String(),
                'validaAte' => $s->validaAte?->toIso8601String(), 'status' => $s->status->value ?? $s->status, 'vistaEm' => $s->vistaEm?->toIso8601String(),
                'respondidaEm' => $s->respondidaEm?->toIso8601String(), 'enviadaEm' => $s->enviadaEm?->toIso8601String(), 'link' => '/s/'.Links::chaveDaSugestao($s->codigo),
            ])->values(),
        ]);
    }

    /**
     * LGPD, exclusão: apaga o acesso e anonimiza a ficha e os pedidos (os valores ficam, sem identificar a pessoa). Com
     * pedido em aberto ou cobrança online aberta, recusa.
     */
    public function excluir(Request $request, Navegacao $navegacao): RedirectResponse
    {
        $u = $request->user();
        $c = Cliente::query()->where('userId', $u->id)->first(['id']);
        if ($c && Pedido::query()->where('clienteId', $c->id)->where('status', StatusPedido::Pendente)->exists()) {
            return back()->withErrors(['erro' => 'Você tem pedido ou condicional em aberto. Peça ao seu vendedor para fechar ou cancelar antes de excluir a conta.']);
        }
        if ($c && Cobranca::query()->whereIn('status', ['criada', 'pendente'])->whereHas('pedido', fn ($q) => $q->where('clienteId', $c->id))->exists()) {
            return back()->withErrors(['erro' => 'Há um pagamento online em aberto. Pague ou peça ao seu vendedor para cancelar a cobrança antes de excluir a conta.']);
        }
        $anonimo = 'Cliente removido';
        DB::transaction(function () use ($c, $u, $anonimo, $navegacao) {
            if ($c) {
                Pedido::query()->where('clienteId', $c->id)->update(['nomeCliente' => $anonimo, 'telefoneCliente' => '', 'cep' => null]);
                $navegacao->apagarHistorico($c->id);
                // Atendimento online (docs/26): notas, peças e contato saem; fica só o que os relatórios precisam.
                $atendimentos = Atendimento::query()->where('clienteId', $c->id)->pluck('id');
                AtendimentoRegistro::query()->whereIn('atendimentoId', $atendimentos)->delete();
                AtendimentoItem::query()->whereIn('atendimentoId', $atendimentos)->delete();
                Atendimento::query()->whereIn('id', $atendimentos)->update(['contatoNome' => null, 'contatoTelefone' => null, 'contatoInstagram' => null, 'proximoContatoEm' => null, 'aceitouOfertasEm' => null]);
                PosVendaContato::query()->where('clienteId', $c->id)->delete();
                Cliente::query()->whereKey($c->id)->update([
                    'nome' => $anonimo, 'telefone' => '', 'cpf' => null, 'email' => null, 'endereco' => null, 'cidade' => null, 'cep' => null, 'preferencias' => null,
                    'instagram' => null, 'aceitaOfertasEm' => null, 'descadastradaEm' => null, 'userId' => null, 'ultimoLoginEm' => null, 'ultimoAcessoEm' => null,
                ]);
            }
            $u->delete(); // sessões e credencial saem em cascata
        });
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/entrar')->with('sucesso', 'Sua conta e seus dados pessoais foram excluídos.');
    }
}
