<?php

namespace App\Http\Controllers\Painel;

use App\Enums\Papel;
use App\Enums\TipoNotificacao;
use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Models\Atendimento;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\PosVendaContato;
use App\Models\RespostaPronta;
use App\Models\User;
use App\Models\Variante;
use App\Models\Vitrine;
use App\Queries\Navegacao;
use App\Services\Atendimentos;
use App\Services\Config;
use App\Services\Equipe;
use App\Services\Notificacoes;
use App\Services\Sugestoes;
use App\Support\Datas;
use App\Support\Escopo;
use App\Support\Instagram;
use App\Support\Telefone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

use function Illuminate\Support\defer;

/** Atendimento online (docs/26; src/app/(painel)/painel/atendimento, acoes/atendimento.ts e consultas/atendimento.ts). */
class AtendimentoController extends Controller
{
    public const MOTIVOS_PERDA = ['preco', 'tamanho', 'sem_estoque', 'frete', 'desistiu', 'sem_resposta', 'outro'];

    public const CANAIS = ['whatsapp', 'instagram', 'loja', 'link_peca', 'vitrine', 'live', 'indicacao', 'outro'];

    private const LIMITE_POR_GRUPO = 30;

    public function __construct(private Atendimentos $atendimentos, private Equipe $equipe, private Notificacoes $notificacoes, private Config $config) {}

    private function exigirLigado(): void
    {
        abort_unless((bool) $this->config->get('atendimento.ligado'), 404);
    }

    private function avisarResponsavel(?string $responsavelId, string $feitoPor, string $id, string $codigo, string $nome): void
    {
        if ($responsavelId && $responsavelId !== $feitoPor) {
            defer(fn () => $this->notificacoes->notificar([$responsavelId], TipoNotificacao::AtendimentoNovo, "Atendimento para você: {$nome}", "{$codigo}. Veja a nota e chame a cliente.", "/painel/atendimento/{$id}", "atendimento:{$id}:{$responsavelId}"));
        }
    }

    /** O contato como a tela mostra: da ficha, se houver; senão, o que foi digitado. @return array<string, mixed> */
    public static function linha(Atendimento $a): array
    {
        return [
            'id' => $a->id, 'codigo' => $a->codigo, 'canal' => $a->canal->value, 'etapa' => $a->etapa->value, 'proximoContatoEm' => $a->proximoContatoEm?->toIso8601String(),
            'criadoEm' => $a->criadoEm->toIso8601String(), 'ultimoContatoEm' => $a->ultimoContatoEm?->toIso8601String(), 'primeiroContatoEm' => $a->primeiroContatoEm?->toIso8601String(),
            'fechadoEm' => $a->fechadoEm?->toIso8601String(), 'motivoPerda' => $a->motivoPerda, 'responsavelId' => $a->responsavelId, 'pedidoId' => $a->pedidoId,
            'clienteId' => $a->clienteId, 'responsavel' => $a->responsavel?->name, 'vitrine' => $a->vitrine ? ['id' => $a->vitrine->id, 'titulo' => $a->vitrine->titulo] : null,
            'nome' => $a->cliente?->nome ?? $a->contatoNome ?? 'Sem nome', 'telefone' => ($a->cliente?->telefone ?: $a->contatoTelefone) ?: null, 'instagram' => $a->cliente?->instagram ?? $a->contatoInstagram,
        ];
    }

    /** @return Builder<Atendimento> */
    private static function base(User $u): Builder
    {
        return Escopo::atendimento(Atendimento::query(), $u)->with(['cliente:id,nome,telefone,instagram', 'responsavel:id,name', 'vitrine:id,titulo']);
    }

    /** @return Builder<Atendimento> */
    private static function novos(User $u): Builder
    {
        return self::base($u)->whereNull('fechadoEm')->where('etapa', 'novo')->whereNull('primeiroContatoEm');
    }

    /** @return Builder<Atendimento> */
    private static function retornos(User $u): Builder
    {
        return self::base($u)->whereNull('fechadoEm')->where(fn ($q) => $q->where('etapa', '<>', 'novo')->orWhereNotNull('primeiroContatoEm'))->where('proximoContatoEm', '<=', Datas::fimDoDia(Datas::dia()));
    }

    /** Pós-venda que venceu, da carteira de quem vê. Oferta só para quem aceitou. @return Builder<PosVendaContato> */
    public static function posVendaVencido(User $u): Builder
    {
        return PosVendaContato::query()->whereNull('feitoEm')->where('venceEm', '<=', Datas::fimDoDia(Datas::dia()))
            ->whereHas('cliente', fn ($c) => Escopo::vendedor($c, $u)->where('telefone', '<>', ''))
            ->where(fn ($q) => $q->whereIn('tipo', ['entrega', 'satisfacao'])->orWhereHas('cliente', fn ($c) => $c->whereNotNull('aceitaOfertasEm')->whereNull('descadastradaEm')));
    }

    /** O número no menu: novos, retornos de hoje e pós-venda. */
    public static function contarFila(User $u): int
    {
        return self::novos($u)->count() + self::retornos($u)->count() + self::posVendaVencido($u)->count();
    }

    /** A fila "Hoje", em ordem de urgência. */
    public function index(Request $request, Sugestoes $sugestoes, Navegacao $navegacao): Response
    {
        $this->exigirLigado();
        /** @var User $u */
        $u = $request->user();
        $pedidos = Escopo::vendedor(Pedido::query(), $u)->where('status', 'pendente')->where('origem', '<>', 'balcao')->with('vendedor:id,name')->orderBy('criadoEm')->take(self::LIMITE_POR_GRUPO)
            ->get(['id', 'codigo', 'tipo', 'nomeCliente', 'telefoneCliente', 'total', 'criadoEm', 'pagamentoSituacao', 'vendedorId']);
        $pos = self::posVendaVencido($u)->with(['cliente:id,nome,telefone,vendedorId', 'cliente.vendedor:id,name', 'pedido:id,codigo'])->orderBy('venceEm')->take(self::LIMITE_POR_GRUPO)->get();

        return Inertia::render('Painel/Atendimento/Index', [
            'novos' => self::novos($u)->orderBy('criadoEm')->take(self::LIMITE_POR_GRUPO)->get()->map(self::linha(...))->values(),
            'retornos' => self::retornos($u)->orderBy('proximoContatoEm')->take(self::LIMITE_POR_GRUPO)->get()->map(self::linha(...))->values(),
            'pedidos' => $pedidos->map(fn ($p) => ['id' => $p->id, 'codigo' => $p->codigo, 'tipo' => $p->tipo->value, 'nomeCliente' => $p->nomeCliente, 'telefoneCliente' => $p->telefoneCliente, 'total' => (float) $p->total, 'criadoEm' => $p->criadoEm->toIso8601String(), 'vendedor' => $p->vendedor?->name])->values(),
            'interessados' => $this->config->get('historico.ligado') ? $navegacao->interessadosAgora($u) : [],
            'sugestoes' => collect($sugestoes->listar($u, ['pagina' => 1])['atencao'])->map(fn ($s) => ['id' => $s['id'], 'codigo' => $s['codigo'], 'titulo' => $s['titulo'], 'cliente' => $s['cliente']['nome'] ?? '', 'telefone' => $s['cliente']['telefone'] ?? '', 'atencao' => $s['atencao']])->values(),
            'posVenda' => $pos->map(fn ($p) => ['id' => $p->id, 'tipo' => $p->tipo->value ?? $p->tipo, 'venceEm' => $p->venceEm->toIso8601String(), 'pedidoId' => $p->pedidoId, 'pedido' => $p->pedido?->codigo,
                'cliente' => ['id' => $p->cliente->id, 'nome' => $p->cliente->nome, 'telefone' => $p->cliente->telefone, 'vendedor' => $p->cliente->vendedor?->name]])->values(),
        ]);
    }

    public function lista(Request $request): Response
    {
        $this->exigirLigado();
        $u = $request->user();
        $f = ['vitrine' => $request->query('vitrine'), 'etapa' => $request->query('etapa'), 'canal' => $request->query('canal'), 'vendedor' => $request->query('vendedor'), 'q' => mb_substr((string) $request->query('q'), 0, 60), 'pagina' => max(1, (int) $request->query('pagina', 1))];
        $q = ltrim(trim($f['q']), '@');
        $base = fn () => self::base($u)
            ->when($u->ehGestor() && $f['vendedor'], fn ($w) => $f['vendedor'] === 'nenhum' ? $w->whereNull('responsavelId') : $w->where('responsavelId', $f['vendedor']))
            ->when(in_array($f['canal'], self::CANAIS, true), fn ($w) => $w->where('canal', $f['canal']))->when($f['vitrine'], fn ($w) => $w->where('vitrineId', $f['vitrine']))
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('codigo', 'like', "%{$q}%")->orWhere('contatoNome', 'like', "%{$q}%")->orWhere('contatoTelefone', 'like', "%{$q}%")->orWhere('contatoInstagram', 'like', "%{$q}%")
                ->orWhereHas('cliente', fn ($c) => $c->where('nome', 'like', "%{$q}%")->orWhere('telefone', 'like', "%{$q}%")->orWhere('instagram', 'like', "%{$q}%"))));
        $consulta = $base()->when($f['etapa'], fn ($w) => $w->where('etapa', $f['etapa']));

        return Inertia::render('Painel/Atendimento/Lista', [
            'filtros' => $f, 'total' => (clone $consulta)->count(),
            'lista' => $consulta->orderByRaw('fechadoEm is not null, fechadoEm')->orderByRaw('proximoContatoEm is null, proximoContatoEm')->orderByDesc('criadoEm')->take(40 * $f['pagina'])->get()->map(self::linha(...))->values(),
            'contagem' => $base()->reorder()->selectRaw('etapa, count(*) as n')->groupBy('etapa')->pluck('n', 'etapa'),
            'vendedores' => $u->ehGestor() ? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']) : [],
            'vitrines' => Vitrine::query()->orderByDesc('criadaEm')->take(30)->get(['id', 'titulo']),
        ]);
    }

    public function create(Request $request): Response
    {
        $this->exigirLigado();

        return Inertia::render('Painel/Atendimento/Novo', [
            'vendedores' => $request->user()->ehGestor() ? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']) : null,
            'telefone' => (string) $request->query('telefone', ''), 'nome' => (string) $request->query('nome', ''),
        ]);
    }

    /** @return array{telefone: ?string, instagram: ?string} */
    private static function contato(Request $request): array
    {
        $tel = trim((string) $request->input('telefone'));
        $ig = trim((string) $request->input('instagram'));
        $erros = [];
        if ($tel !== '' && ! Telefone::celularValido($tel)) {
            $erros['telefone'] = 'Informe o WhatsApp com DDD e 9 dígitos.';
        }
        if ($ig !== '' && ! Instagram::normalizar($ig)) {
            $erros['instagram'] = 'Informe um @ válido do Instagram.';
        }
        if ($erros) {
            throw ValidationException::withMessages($erros);
        }

        return ['telefone' => $tel !== '' ? Telefone::digitos($tel) : null, 'instagram' => $ig !== '' ? Instagram::normalizar($ig) : null];
    }

    /** A resposta diz de quem é o contato: com limite, para não varrer a carteira das outras vendedoras. */
    private function limiteAlheio(User $u): string
    {
        $chave = "contato-alheio:{$u->id}";
        if (RateLimiter::tooManyAttempts($chave, 30)) {
            throw ValidationException::withMessages(['erro' => 'Muitos contatos de outras carteiras. Tente de novo em '.max(1, (int) ceil(RateLimiter::availableIn($chave) / 60)).' min.']);
        }

        return $chave;
    }

    public function store(Request $request): RedirectResponse
    {
        $this->exigirLigado();
        $u = $request->user();
        $d = $request->validate(['nome' => ['required', 'string', 'min:2', 'max:120'], 'canal' => ['required', 'in:'.implode(',', self::CANAIS)], 'nota' => ['nullable', 'string', 'max:2000'], 'responsavelId' => ['nullable', 'string', 'max:40']],
            ['nome.*' => 'Informe o nome.', 'canal.*' => 'Escolha o canal.']);
        $c = self::contato($request);
        if (! $c['telefone'] && ! $c['instagram']) {
            throw ValidationException::withMessages(['telefone' => 'Informe o WhatsApp ou o @ do Instagram.']);
        }
        $chave = $this->limiteAlheio($u);
        $a = $this->tentar(fn () => $this->atendimentos->criar($u, [...$d, ...$c, 'responsavelId' => $u->ehGestor() ? ($d['responsavelId'] ?? null) : null]));
        if ($a['tipo'] === 'encaminhado') {
            RateLimiter::hit($chave, 3600);
            $this->equipe->registrar($u->id, 'atendimento_encaminhado', ['descricao' => "{$a['codigo']} · para {$a['para']}"]);
            $this->avisarResponsavel($a['responsavelId'], $u->id, $a['id'], $a['codigo'], $d['nome']);

            return back()->with('sucesso', "Este contato é de {$a['para']}. O atendimento {$a['codigo']} foi encaminhado, com a sua nota.");
        }
        if ($a['tipo'] === 'criado') {
            $this->equipe->registrar($u->id, 'atendimento_criado', ['clienteId' => $a['clienteId'], 'descricao' => "{$a['codigo']} · {$d['nome']}"]);
            if ($a['fichaCriada']) {
                $this->equipe->registrar($u->id, 'cliente_cadastrado', ['clienteId' => $a['clienteId'], 'descricao' => $d['nome']]);
            }
            $this->avisarResponsavel($a['responsavelId'], $u->id, $a['id'], $a['codigo'], $d['nome']);
        }

        return redirect("/painel/atendimento/{$a['id']}");
    }

    public function show(Request $request, string $id): Response
    {
        $this->exigirLigado();
        $u = $request->user();
        $a = Atendimento::query()->with(['cliente:id,nome,telefone,instagram', 'responsavel:id,name', 'vitrine:id,titulo,status,ofertaAte', 'vitrine.pecas:id,vitrineId,produtoId,precoOferta', 'itens' => fn ($q) => $q->orderBy('id'),
            'registros' => fn ($q) => $q->orderByDesc('id')->take(200)->with('usuario:id,name')])->find($id);
        abort_if(! $a || ! Atendimentos::podeAtender($u, $a->responsavelId), 404);
        $variantes = Variante::query()->whereIn('id', $a->itens->pluck('varianteId'))->with(['produto:id,nome,referencia,preco', 'produto.imagens' => fn ($q) => $q->orderBy('ordem'), 'produto.variantes:id,produtoId,tamanho,estoque,reservado,ordem'])->get()->keyBy('id');
        $v = $a->vitrine;
        $ofertas = $v && in_array($v->status->value ?? $v->status, Atendimentos::STATUS_VITRINE_ATIVOS, true) && (! $v->ofertaAte || $v->ofertaAte->isFuture()) ? $v->pecas->pluck('precoOferta', 'produtoId') : collect();
        $eu = User::query()->with('numeroPrincipal:id,apelido,telefone,status')->find($u->id);

        return Inertia::render('Painel/Atendimento/Show', [
            'atendimento' => [
                ...self::linha($a), 'numeroId' => $a->numeroId,
                'registros' => $a->registros->map(fn ($r) => ['id' => (string) $r->id, 'tipo' => $r->tipo->value ?? $r->tipo, 'texto' => $r->texto, 'criadoEm' => $r->criadoEm->toIso8601String(), 'usuario' => $r->usuario?->name])->values(),
                'pecas' => $a->itens->map(function ($i) use ($variantes, $ofertas) {
                    $x = $variantes->get($i->varianteId);
                    if (! $x) {
                        return null;
                    }
                    $preco = (float) $x->produto->preco;
                    $oferta = $ofertas[$i->produtoId] ?? null;

                    return [
                        'id' => $i->id, 'varianteId' => $i->varianteId, 'quantidade' => $i->quantidade, 'nome' => $x->produto->nome, 'referencia' => $x->produto->referencia, 'tamanho' => $x->tamanho,
                        'preco' => $oferta !== null && (float) $oferta > 0 && (float) $oferta < $preco ? (float) $oferta : $preco, 'imagem' => $x->produto->imagens->first()?->url,
                        'disponivel' => $x->estoque - $x->reservado, 'tamanhos' => $x->produto->variantes->sortBy('ordem')->filter(fn ($y) => $y->estoque - $y->reservado > 0)->pluck('tamanho')->values(),
                    ];
                })->filter()->values(),
            ],
            'pedido' => $a->pedidoId ? Pedido::query()->find($a->pedidoId, ['id', 'codigo', 'status', 'total'])?->only(['id', 'codigo', 'status', 'total']) : null,
            'numero' => $a->numeroId ? NumeroWhatsApp::query()->find($a->numeroId, ['apelido', 'telefone']) : null,
            'meuNumero' => $eu?->numeroPrincipal?->status->value === 'ativo' ? ['apelido' => $eu->numeroPrincipal->apelido, 'telefone' => $eu->numeroPrincipal->telefone] : null,
            'respostas' => self::respostasPara($u),
            'vendedores' => $u->ehGestor() ? User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->get(['id', 'name']) : null,
            'loja' => $this->config->nomeDaLoja()['nome'],
        ]);
    }

    /** @return list<array<string, mixed>> As respostas da loja e as pessoais de quem está vendo. */
    public static function respostasPara(User $u): array
    {
        return RespostaPronta::query()->where(fn ($q) => $q->whereNull('usuarioId')->orWhere('usuarioId', $u->id))->orderByRaw('usuarioId is not null')->orderBy('ordem')->orderBy('id')->get(['id', 'titulo', 'texto', 'usuarioId'])->toArray();
    }

    public function etapa(Request $request, string $id): RedirectResponse
    {
        $u = $request->user();
        $etapa = (string) $request->input('etapa');
        $dia = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $request->input('proximoContato')) ? $request->input('proximoContato') : null;
        $motivo = $request->input('motivoPerda');
        if ($etapa !== 'perdido' && ! $dia) {
            throw ValidationException::withMessages(['proximoContato' => 'Marque a data do próximo contato.']);
        }
        if ($etapa !== 'perdido' && $dia < Datas::dia()) {
            throw ValidationException::withMessages(['proximoContato' => 'A data não pode estar no passado.']);
        }
        if ($etapa === 'perdido' && ! in_array($motivo, self::MOTIVOS_PERDA, true)) {
            throw ValidationException::withMessages(['motivoPerda' => 'Escolha o motivo.']);
        }
        $r = $this->tentar(fn () => $this->atendimentos->mudarEtapa($u, $id, $etapa, $dia ? Datas::inicioDoDia($dia)->addHours(12) : null, $motivo));
        if ($r['fechou']) {
            $this->equipe->registrar($u->id, 'atendimento_fechado', ['clienteId' => $r['atendimento']->clienteId, 'descricao' => "{$r['atendimento']->codigo} · perdido"]);
        }

        return back()->with('sucesso', 'Atendimento atualizado.');
    }

    /** "Amanhã", na fila: adia sem abrir o atendimento. */
    public function adiar(Request $request, string $id): RedirectResponse
    {
        $dias = min(max((int) $request->input('dias', 1), 1), 30);
        $this->tentar(fn () => $this->atendimentos->reagendar($request->user(), $id, Datas::inicioDoDia(Datas::somarDiaIso($dias))->addHours(12)));

        return back();
    }

    public function nota(Request $request, string $id): RedirectResponse
    {
        $texto = mb_substr(trim((string) $request->input('texto')), 0, 2000);
        if ($texto === '') {
            throw ValidationException::withMessages(['texto' => 'Escreva a nota.']);
        }
        $this->tentar(fn () => $this->atendimentos->adicionarNota($request->user(), $id, $texto));

        return back();
    }

    public function contatoFeito(Request $request, string $id): JsonResponse
    {
        $canal = $request->input('canal');
        if (! in_array($canal, ['whatsapp', 'instagram'], true)) {
            return response()->json(['ok' => false, 'erro' => 'Canal inválido.']);
        }
        try {
            $r = $this->atendimentos->registrarContato($request->user(), $id, $canal);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        $this->equipe->registrar($request->user()->id, 'atendimento_contato', ['numeroId' => $r['numeroId'], 'descricao' => "{$r['codigo']} · ".($canal === 'whatsapp' ? 'WhatsApp' : 'Direct')]);

        return response()->json(['ok' => true]);
    }

    public function informarContato(Request $request, string $id): RedirectResponse
    {
        $u = $request->user();
        $c = self::contato($request);
        if (! $c['telefone'] && ! $c['instagram']) {
            throw ValidationException::withMessages(['telefone' => 'Informe o WhatsApp ou o @.']);
        }
        $chave = $this->limiteAlheio($u);
        $r = $this->tentar(fn () => $this->atendimentos->informarContato($u, $id, $c['telefone'], $c['instagram']));
        if ($r['encaminhadoPara']) {
            RateLimiter::hit($chave, 3600);
            $this->equipe->registrar($u->id, 'atendimento_encaminhado', ['descricao' => "Para {$r['encaminhadoPara']}"]);
            $this->avisarResponsavel($r['responsavelId'], $u->id, $id, 'Contato com ficha', 'cliente da sua carteira');
            if (! $u->ehGestor()) {
                return redirect('/painel/atendimento')->with('sucesso', "Este WhatsApp já tem ficha: o atendimento foi para {$r['encaminhadoPara']}.");
            }

            return back()->with('sucesso', "Este WhatsApp já tem ficha: o atendimento foi para {$r['encaminhadoPara']}.");
        }

        return back()->with('sucesso', 'Contato salvo.');
    }

    public function transferir(Request $request, string $id): RedirectResponse
    {
        abort_unless($request->user()->ehGestor(), 403);
        $para = (string) $request->input('para');
        if ($para === '') {
            throw ValidationException::withMessages(['para' => 'Escolha a vendedora.']);
        }
        $d = $this->tentar(fn () => $this->atendimentos->transferir($request->user(), $id, $para));
        $this->avisarResponsavel($para, $request->user()->id, $id, 'Transferido pela gestão', 'atendimento transferido');

        return back()->with('sucesso', "Passado para {$d->name}.");
    }

    public function pecaAdicionar(Request $request, string $id): RedirectResponse
    {
        $this->tentar(fn () => $this->atendimentos->adicionarPeca($request->user(), $id, (int) $request->input('varianteId')));

        return back();
    }

    public function pecaRemover(Request $request, string $id, int $itemId): RedirectResponse
    {
        $this->tentar(fn () => $this->atendimentos->removerPeca($request->user(), $id, $itemId));

        return back();
    }

    /** Converte em pedido e devolve o que a mensagem do WhatsApp precisa. */
    public function pedido(Request $request, string $id): JsonResponse
    {
        $tipo = $request->input('tipo');
        if (! in_array($tipo, ['compra', 'condicional'], true)) {
            return response()->json(['ok' => false, 'erro' => 'Escolha o tipo do pedido.']);
        }
        try {
            $r = $this->atendimentos->converterEmPedido($request->user(), $id, $tipo);
        } catch (ErroNegocio $e) {
            return response()->json(['ok' => false, 'erro' => $e->getMessage()]);
        }
        $p = $r['pedido'];
        $pecas = array_sum(array_column($p['itens'], 'quantidade'));
        $this->equipe->registrar($request->user()->id, 'pedido_criado', ['clienteId' => $r['cliente']->id, 'pedidoId' => $p['id'], 'valor' => $p['total'], 'descricao' => "{$r['cliente']->nome} · {$p['codigo']} · {$pecas} ".($pecas === 1 ? 'peça' : 'peças')]);

        return response()->json(['ok' => true, 'pedidoId' => $p['id'], 'codigo' => $p['codigo'], 'itens' => $p['itens'], 'cupom' => $p['cupom'], 'telefone' => $r['cliente']->telefone, 'nomeCliente' => $r['cliente']->nome, 'nomeVendedor' => $r['nomeVendedor'], 'tipo' => $tipo]);
    }

    public function apagar(Request $request, string $id): RedirectResponse
    {
        abort_unless($request->user()->ehGestor(), 403);
        $this->tentar(fn () => $this->atendimentos->apagarContato($request->user(), $id));

        return redirect('/painel/atendimento/lista')->with('sucesso', 'Dados do contato apagados.');
    }

    /** Visão da equipe: o que está aberto com cada vendedora e o que está sem responsável. */
    public function equipe(Request $request): Response
    {
        $this->exigirLigado();
        abort_unless($request->user()->ehGestor(), 403);
        $agora = now();
        $fim = Datas::fimDoDia(Datas::dia());
        $grupo = fn ($q) => $q->selectRaw('responsavelId, count(*) as n')->groupBy('responsavelId')->pluck('n', 'responsavelId');
        $abertos = $grupo(Atendimento::query()->whereNull('fechadoEm'));
        $novos = $grupo(Atendimento::query()->whereNull('fechadoEm')->where('etapa', 'novo')->whereNull('primeiroContatoEm'));
        $vencidos = $grupo(Atendimento::query()->whereNull('fechadoEm')->where('proximoContatoEm', '<', $agora));
        $hoje = $grupo(Atendimento::query()->whereNull('fechadoEm')->where('proximoContatoEm', '<=', $fim));
        $recentes = Atendimento::query()->where('criadoEm', '>=', $agora->copy()->subDays(30))->take(5000)->get(['responsavelId', 'etapa', 'criadoEm', 'primeiroContatoEm']);

        return Inertia::render('Painel/Atendimento/Equipe', [
            'linhas' => User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('name')->with('numeroPrincipal:id,apelido,status')->get(['id', 'name', 'numeroPrincipalId'])
                ->map(fn ($p) => [...self::desempenho($recentes->where('responsavelId', $p->id)), 'id' => $p->id, 'nome' => $p->name, 'numero' => $p->numeroPrincipal?->status->value === 'ativo' ? $p->numeroPrincipal->apelido : null,
                    'abertos' => (int) ($abertos[$p->id] ?? 0), 'novos' => (int) ($novos[$p->id] ?? 0), 'vencidos' => (int) ($vencidos[$p->id] ?? 0), 'hoje' => (int) ($hoje[$p->id] ?? 0)])->values(),
            'semResponsavel' => Atendimento::query()->whereNull('fechadoEm')->whereNull('responsavelId')->with(['cliente:id,nome,telefone,instagram', 'responsavel:id,name', 'vitrine:id,titulo'])->orderBy('criadoEm')->take(self::LIMITE_POR_GRUPO)->get()->map(self::linha(...))->values(),
        ]);
    }

    /** Conversão e tempo até o 1º contato (mede o clique no painel). @param iterable<Atendimento> $lista @return array<string, mixed> */
    public static function desempenho(iterable $lista): array
    {
        $l = collect($lista);
        $ganhos = $l->filter(fn ($a) => $a->etapa->value === 'ganho')->count();
        $perdidos = $l->filter(fn ($a) => $a->etapa->value === 'perdido')->count();
        $tempos = $l->filter(fn ($a) => $a->primeiroContatoEm)->map(fn ($a) => $a->primeiroContatoEm->getTimestamp() - $a->criadoEm->getTimestamp())->filter(fn ($t) => $t >= 0);

        return [
            'criados' => $l->count(), 'ganhos' => $ganhos, 'perdidos' => $perdidos, 'conversao' => $ganhos + $perdidos ? (int) round($ganhos / ($ganhos + $perdidos) * 100) : null,
            'minutosPrimeiroContato' => $tempos->count() ? (int) round($tempos->avg() / 60) : null,
        ];
    }

    public function respostas(Request $request): Response
    {
        $this->exigirLigado();

        return Inertia::render('Painel/Atendimento/Respostas', ['respostas' => self::respostasPara($request->user())]);
    }

    public function salvarResposta(Request $request): RedirectResponse
    {
        $d = $request->validate(['id' => ['nullable', 'integer'], 'titulo' => ['required', 'string', 'min:2', 'max:80'], 'texto' => ['required', 'string', 'min:2', 'max:2000']],
            ['titulo.*' => 'Dê um título (até 80 caracteres).', 'texto.*' => 'Escreva o texto (até 2.000 caracteres).']);
        preg_match_all('/\{([^{}\s]+)\}/', $d['texto'], $m);
        $validas = ['nome', 'vendedora', 'loja', 'peca', 'preco', 'tamanhos'];
        if ($erradas = array_values(array_diff($m[1], $validas))) {
            throw ValidationException::withMessages(['texto' => "Não existe {{$erradas[0]}}. Use: ".implode(', ', array_map(fn ($v) => "{{$v}}", $validas)).'.']);
        }
        $this->tentar(fn () => $this->atendimentos->salvarResposta($request->user(), [...$d, 'daLoja' => $request->boolean('daLoja')]));

        return back()->with('sucesso', 'Resposta salva.');
    }

    public function excluirResposta(Request $request, int $id): RedirectResponse
    {
        $this->tentar(fn () => $this->atendimentos->excluirResposta($request->user(), $id));

        return back();
    }
}
