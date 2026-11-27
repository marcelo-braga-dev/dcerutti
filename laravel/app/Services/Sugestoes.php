<?php

namespace App\Services;

use App\Enums\Papel;
use App\Enums\TipoNotificacao;
use App\Exceptions\ErroNegocio;
use App\Exceptions\ErroPedido;
use App\Models\Atividade;
use App\Models\Cliente;
use App\Models\Contador;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\Sugestao;
use App\Models\SugestaoItem;
use App\Models\User;
use App\Models\Variante;
use App\Queries\Navegacao;
use App\Services\Cupons\CupomNoPedido;
use App\Services\Pedidos\Pedidos;
use App\Support\Contato;
use App\Support\Links;
use App\Support\Telefone;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Sugestões para você (D-27, docs/23; src/server/sugestoes.ts): a vendedora monta, a cliente responde pelo link
 * assinado (/s/…), sem login. Não reserva estoque; vira pedido (ou condicional) quando a cliente devolve as escolhas.
 */
class Sugestoes
{
    public const DIAS_VALIDADE = [3, 7, 15, 30];

    public const DIAS_PADRAO = 7;

    public const MAX_ITENS = 30;

    public function __construct(private Catalogo $catalogo, private Config $config, private Pedidos $pedidos, private Equipe $equipe, private Notificacoes $notificacoes, private CupomNoPedido $cupons) {}

    /** Situação que depende da hora (vencida) e do envio (para enviar). */
    public static function situacao(Sugestao $s, ?CarbonInterface $agora = null): string
    {
        $status = $s->status->value;
        if (in_array($status, ['convertida', 'cancelada'], true)) {
            return $status;
        }
        if ($s->validaAte < ($agora ?? now())) {
            return 'vencida';
        }

        return $status === 'enviada' && $s->enviadaEm === null ? 'aEnviar' : $status;
    }

    public static function aberta(string $situacao): bool
    {
        return in_array($situacao, ['enviada', 'vista', 'respondida', 'aEnviar'], true);
    }

    /** A sugestão pede uma ação da vendedora agora? O motivo mais urgente, ou null. */
    public static function atencao(Sugestao $s, string $situacao, ?CarbonInterface $agora = null): ?string
    {
        $agora ??= now();
        if (! self::aberta($situacao)) {
            return null;
        }
        if ($situacao === 'aEnviar') {
            return 'enviar';
        }
        if ($s->lembradoEm && $s->lembradoEm->diffInHours($agora) < 24) {
            return null;
        }
        if ($agora->diffInHours($s->validaAte, false) < 24) {
            return 'vencendo';
        }
        if ($situacao === 'respondida') {
            return 'pensando';
        }
        if ($situacao === 'vista' && $s->vistaEm && $s->vistaEm->diffInHours($agora) > 24) {
            return 'viuSemResponder';
        }

        return $situacao === 'enviada' && $s->enviadaEm && $s->enviadaEm->diffInHours($agora) > 48 ? 'semAbrir' : null;
    }

    private static function precoQueVale(float $catalogo, ?float $oferta, bool $vencida): float
    {
        return ! $vencida && $oferta !== null && $oferta > 0 && $oferta < $catalogo ? $oferta : $catalogo;
    }

    /** @return Builder<Sugestao> */
    private static function escopo(User $u): Builder
    {
        return Sugestao::query()->when($u->papel === Papel::Vendedor, fn ($q) => $q->where('vendedorId', $u->id));
    }

    private function daEquipe(User $u, string $id): Sugestao
    {
        $s = self::escopo($u)->find($id);
        if (! $s) {
            throw new ErroNegocio('Sugestão não encontrada.');
        }

        return $s;
    }

    private function proximoCodigo(): string
    {
        Contador::query()->insertOrIgnore(['nome' => 'SUG', 'valor' => 0]);
        Contador::query()->where('nome', 'SUG')->increment('valor');

        return 'SUG-'.str_pad((string) Contador::query()->where('nome', 'SUG')->value('valor'), 6, '0', STR_PAD_LEFT);
    }

    /** @return array<int, array<string, mixed>> */
    private function porId(): array
    {
        return array_column($this->catalogo->lista(), null, 'id');
    }

    /**
     * Cria a sugestão. Confere a cliente, as peças e o limite de desconto da vendedora (o mesmo do caixa); o gestor não tem limite.
     *
     * @param  array{clienteId: string, titulo: string, mensagem?: ?string, dias?: ?int, itens: list<array{produtoId: int, varianteId?: ?int, precoOferta?: ?float, nota?: ?string}>, cupom?: ?string, enviar?: bool}  $d
     * @return array{sugestao: Sugestao, cliente: Cliente, pecas: int, temOferta: bool}
     */
    public function criar(User $u, array $d): array
    {
        $cliente = Cliente::query()->find($d['clienteId'], ['id', 'nome', 'telefone', 'vendedorId']);
        if (! $cliente || ($u->papel === Papel::Vendedor && $cliente->vendedorId !== $u->id)) {
            throw new ErroNegocio('Escolha a cliente.');
        }
        if (! Telefone::celularValido($cliente->telefone)) {
            throw new ErroNegocio('O WhatsApp desta cliente está incompleto no cadastro.');
        }
        $titulo = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $d['titulo'])), 0, 80);
        if (mb_strlen($titulo) < 3) {
            throw new ErroNegocio('Dê um título para a sugestão, ex.: "Novidades no seu tamanho".');
        }
        if (! $d['itens']) {
            throw new ErroNegocio('Adicione pelo menos uma peça.');
        }
        if (count($d['itens']) > self::MAX_ITENS) {
            throw new ErroNegocio('Até '.self::MAX_ITENS.' peças por sugestão.');
        }
        $dias = in_array((int) ($d['dias'] ?? 0), self::DIAS_VALIDADE, true) ? (int) $d['dias'] : self::DIAS_PADRAO;
        $porId = $this->porId();
        $limite = (float) $this->config->get('caixa.descontoMaxVendedor');
        $itens = [];
        foreach (array_values($d['itens']) as $ordem => $it) {
            $p = $porId[(int) $it['produtoId']] ?? null;
            if (! $p) {
                throw new ErroNegocio('Uma das peças não está mais no catálogo.');
            }
            $v = ! empty($it['varianteId']) ? collect($p['variantes'])->firstWhere('id', (int) $it['varianteId']) : null;
            if (! empty($it['varianteId']) && ! $v) {
                throw new ErroNegocio("Tamanho inválido em {$p['nome']}.");
            }
            $oferta = isset($it['precoOferta']) && $it['precoOferta'] > 0 ? round((float) $it['precoOferta'], 2) : null;
            if ($oferta !== null && $oferta >= $p['preco']) {
                throw new ErroNegocio("O preço especial de {$p['nome']} precisa ser menor que o do catálogo.");
            }
            // O limite vale sobre o preço arredondado ao centavo (10% de R$ 79,99 = R$ 71,99).
            if ($oferta !== null && ! $u->ehGestor() && $oferta < round($p['preco'] * (100 - $limite)) / 100) {
                throw new ErroNegocio('Desconto acima de '.rtrim(rtrim(number_format($limite, 2, ',', ''), '0'), ',')."% em {$p['nome']}: só o gestor dá esse desconto.");
            }
            $itens[] = ['produtoId' => $p['id'], 'varianteId' => $v['id'] ?? null, 'precoOferta' => $oferta, 'nota' => mb_substr(trim((string) ($it['nota'] ?? '')), 0, 200) ?: null, 'ordem' => $ordem];
        }
        $cupom = ! empty($d['cupom']) ? $this->conferirCupom($u, $d['cupom']) : null;
        $enviar = $d['enviar'] ?? true;
        $s = DB::transaction(function () use ($u, $cliente, $titulo, $d, $dias, $itens, $cupom, $enviar) {
            $s = Sugestao::query()->create([
                'codigo' => $this->proximoCodigo(), 'vendedorId' => $u->papel === Papel::Vendedor ? $u->id : $cliente->vendedorId, 'clienteId' => $cliente->id,
                'titulo' => $titulo, 'mensagem' => mb_substr(trim((string) ($d['mensagem'] ?? '')), 0, 1000) ?: null, 'validaAte' => now()->addDays($dias), 'cupomCodigo' => $cupom,
                // "Criar e enviar": enviada agora. "Só criar": fica Para enviar até a vendedora tocar em Enviar.
                'enviadaEm' => $enviar ? now() : null,
            ]);
            $s->itens()->createMany($itens);

            return $s;
        });
        $pecas = count($itens);
        if ($enviar) {
            $this->equipe->registrar($u->id, 'oferta_enviada', ['clienteId' => $cliente->id, 'descricao' => "{$cliente->nome} · {$s->codigo} · {$pecas} ".($pecas === 1 ? 'peça' : 'peças').' sugeridas']);
        }

        return ['sugestao' => $s, 'cliente' => $cliente, 'pecas' => $pecas, 'temOferta' => collect($itens)->contains(fn ($i) => $i['precoOferta'] !== null)];
    }

    private function conferirCupom(User $u, string $codigo): string
    {
        if (! $this->config->get('cupons.ligados')) {
            throw new ErroNegocio('Os cupons estão desligados em Configurações.');
        }
        if ($u->papel === Papel::Vendedor && ! $this->config->get('cupons.vendedorAplica')) {
            throw new ErroNegocio('A loja não liberou vendedores para aplicar cupons.');
        }
        $c = $this->cupons->buscar($codigo);
        if (! $c || ! $c->ativo) {
            throw new ErroNegocio('O cupom '.mb_strtoupper($codigo).' não existe ou está desligado.');
        }

        return $c->codigo;
    }

    /**
     * Cores do modelo para a cliente trocar a cor: cada cor com os tamanhos e o disponível.
     *
     * @param  array<string, mixed>  $p
     * @return list<array<string, mixed>>
     */
    private function coresDoModelo(array $p): array
    {
        return array_values(array_map(fn ($x) => [
            'produtoId' => $x['id'], 'cor' => $x['corNome'] ?? $x['cor'], 'imagem' => $x['imagens'][0] ?? null, 'preco' => $x['preco'], 'precoCheio' => $x['precoCheio'],
            'variantes' => array_map(fn ($v) => ['id' => $v['id'], 'tamanho' => $v['tamanho'], 'disponivel' => $v['disponivel']], $x['variantes']),
        ], array_filter($this->catalogo->lista(), fn ($x) => $x['modelo'] === $p['modelo'])));
    }

    /** A sugestão para a página da cliente: peças com as cores do modelo, o preço que vale e as escolhas salvas. @return ?array<string, mixed> */
    public function publica(string $codigo): ?array
    {
        $s = Sugestao::query()->where('codigo', $codigo)->with(['itens' => fn ($q) => $q->orderBy('ordem')->orderBy('id'), 'cliente:id,nome,cep', 'vendedor:id,name,ativo,numeroPrincipalId', 'vendedor.'.Contato::COM])->first();
        if (! $s) {
            return null;
        }
        $situacao = self::situacao($s);
        $vencida = $situacao === 'vencida';
        $porId = $this->porId();
        $itens = [];
        foreach ($s->itens as $i) {
            $p = $porId[$i->produtoId] ?? null;
            if (! $p) {
                continue; // peça saiu do catálogo
            }
            $cores = $this->coresDoModelo($p);
            $escolhida = $i->varianteEscolhidaId ?? $i->varianteId;
            $cor = collect($cores)->first(fn ($c) => collect($c['variantes'])->contains('id', $escolhida)) ?? collect($cores)->firstWhere('produtoId', $p['id']);
            $oferta = $i->precoOferta === null ? null : (float) $i->precoOferta;
            $itens[] = [
                'id' => $i->id, 'produtoId' => $p['id'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'nota' => $i->nota, 'cores' => $cores,
                'corInicial' => $cor['produtoId'], 'varianteInicial' => $escolhida, 'escolha' => $i->escolha->value ?? $i->escolha, 'quantidade' => $i->quantidade,
                'precoCatalogo' => $p['preco'], 'precoCheio' => $p['precoCheio'], 'oferta' => $oferta, 'preco' => self::precoQueVale($p['preco'], $oferta, $vencida),
            ];
        }
        $ceps = $this->config->get('cepsCondicional');

        return [
            'id' => $s->id, 'codigo' => $s->codigo, 'titulo' => $s->titulo, 'mensagem' => $s->mensagem, 'situacao' => $situacao, 'validaAte' => $s->validaAte->toIso8601String(), 'pedidoId' => $s->pedidoId,
            'nomeCliente' => Contato::primeiroNome($s->cliente->nome, ''), 'nomeVendedor' => Contato::primeiroNome($s->vendedor->name, ''),
            'telefoneContato' => Contato::de($s->vendedor, $this->config->get('whatsappLoja'))['telefone'],
            'condicionalNoCep' => $s->cliente->cep && in_array($s->cliente->cep, $ceps, true), 'cidadeCondicional' => $this->config->get('cidadeCondicional'), 'cepCliente' => $s->cliente->cep,
            'cupom' => $s->cupomCodigo && $this->config->get('cupons.ligados') ? $s->cupomCodigo : null,
            'itens' => $itens,
            'maisParaVoce' => self::aberta($situacao) ? $this->maisParaVoce($s->itens->pluck('produtoId')->all()) : [],
        ];
    }

    /** A cliente abriu o link: a primeira abertura avisa quem enviou. */
    public function registrarVista(string $codigo): void
    {
        $s = Sugestao::query()->where('codigo', $codigo)->with('cliente:id,nome')->first();
        if (! $s) {
            return;
        }
        if (! $s->vistaEm) {
            $this->notificacoes->notificar(Notificacoes::responsaveis($s->vendedorId), TipoNotificacao::CarrinhoVisto, "{$s->cliente->nome} abriu a sugestão {$codigo}", 'Bom momento para chamar no WhatsApp.', "/painel/sugestoes/{$s->id}", "visto:{$codigo}");
        }
        $s->update(['vezesVista' => $s->vezesVista + 1, 'vistaEm' => $s->vistaEm ?? now(), 'status' => $s->status->value === 'enviada' ? 'vista' : $s->status, 'enviadaEm' => $s->enviadaEm ?? now()]);
    }

    /**
     * Confere as escolhas: o tamanho tem de ser de uma cor do mesmo modelo, quantidade de 1 a 10.
     *
     * @param  list<array{id: int, escolha: string, varianteId: ?int, quantidade: int}>  $escolhas
     * @return list<array{id: int, escolha: string, varianteId: ?int, quantidade: int}>
     */
    private function conferirEscolhas(Sugestao $s, array $escolhas): array
    {
        $porId = $this->porId();
        $itens = $s->itens->keyBy('id');
        $r = [];
        foreach ($escolhas as $e) {
            $item = $itens->get((int) ($e['id'] ?? 0));
            $p = $item ? ($porId[$item->produtoId] ?? null) : null;
            if (! $p) {
                continue;
            }
            $permitidas = collect($this->coresDoModelo($p))->flatMap(fn ($c) => array_column($c['variantes'], 'id'))->all();
            $varianteId = ! empty($e['varianteId']) && in_array((int) $e['varianteId'], $permitidas, true) ? (int) $e['varianteId'] : null;
            $escolha = in_array($e['escolha'] ?? '', ['quero', 'talvez', 'nao', 'pendente'], true) ? $e['escolha'] : 'pendente';
            $r[] = ['id' => $item->id, 'escolha' => $escolha, 'varianteId' => $varianteId, 'quantidade' => min(10, max(1, (int) round((float) ($e['quantidade'] ?? 1)) ?: 1))];
        }

        return $r;
    }

    /** Guarda as marcações enquanto a cliente escolhe. @param list<array<string, mixed>> $escolhas */
    public function salvarEscolhas(string $codigo, array $escolhas): bool
    {
        $s = Sugestao::query()->where('codigo', $codigo)->with('itens:id,sugestaoId,produtoId')->first();
        if (! $s || ! self::aberta(self::situacao($s))) {
            return false;
        }
        foreach ($this->conferirEscolhas($s, $escolhas) as $e) {
            SugestaoItem::query()->whereKey($e['id'])->update(['escolha' => $e['escolha'], 'varianteEscolhidaId' => $e['varianteId'], 'quantidade' => $e['quantidade']]);
        }

        return true;
    }

    /**
     * A cliente devolve as escolhas. "pensando" só marca como respondida. "compra" e "condicional" criam o pedido com as
     * peças Quero, nos preços especiais que ainda valem, e a sugestão vira pedido.
     *
     * @param  list<array<string, mixed>>  $escolhas
     * @return array{pedido: ?array<string, mixed>, sugestao: Sugestao}
     */
    public function responder(string $codigo, string $modo, array $escolhas, ?string $cep = null, ?string $usuarioId = null): array
    {
        $s = Sugestao::query()->where('codigo', $codigo)->with(['cliente:id,nome,telefone,cep'])->first();
        if (! $s) {
            throw new ErroNegocio('Sugestão não encontrada.');
        }
        $situacao = self::situacao($s);
        if ($situacao === 'convertida') {
            throw new ErroNegocio('Você já respondeu esta sugestão: o pedido foi enviado.');
        }
        if (! self::aberta($situacao)) {
            throw new ErroNegocio($situacao === 'vencida' ? 'Esta sugestão venceu. Fale com quem te atende para receber outra.' : 'Esta sugestão foi cancelada.');
        }
        $this->salvarEscolhas($codigo, $escolhas);
        if ($modo === 'pensando') {
            $s->update(['status' => 'respondida', 'respondidaEm' => now()]);
            $marcadas = SugestaoItem::query()->where('sugestaoId', $s->id)->whereIn('escolha', ['quero', 'talvez'])->count();
            $this->notificacoes->notificar(Notificacoes::responsaveis($s->vendedorId), TipoNotificacao::CarrinhoRespondido, "{$s->cliente->nome} respondeu a sugestão {$codigo}", "Marcou {$marcadas} ".($marcadas === 1 ? 'peça' : 'peças').' e ainda está pensando.', "/painel/sugestoes/{$s->id}");

            return ['pedido' => null, 'sugestao' => $s];
        }
        $itens = SugestaoItem::query()->where('sugestaoId', $s->id)->where('escolha', 'quero')->get();
        if ($itens->isEmpty()) {
            throw new ErroNegocio('Marque "Quero" nas peças que você quer.');
        }
        if ($itens->contains(fn ($i) => ! ($i->varianteEscolhidaId ?? $i->varianteId))) {
            throw new ErroNegocio('Escolha o tamanho das peças marcadas como "Quero".');
        }
        $cepFinal = null;
        if ($modo === 'condicional') {
            $cepFinal = Telefone::formatarCep((string) ($cep ?: $s->cliente->cep ?: ''));
            if (strlen(Telefone::digitos($cepFinal)) !== 8) {
                throw new ErroNegocio('Informe o CEP para o condicional.');
            }
            if (! in_array($cepFinal, $this->config->get('cepsCondicional'), true)) {
                throw new ErroNegocio('O condicional atende só '.$this->config->get('cidadeCondicional').'. Escolha "Quero comprar".');
            }
        }
        $porId = $this->porId();
        $vid = fn ($i) => (int) ($i->varianteEscolhidaId ?? $i->varianteId);
        $produtoDa = Variante::query()->whereIn('id', $itens->map($vid))->pluck('produtoId', 'id');
        // Preço especial: vale para a cor sugerida e para outra cor do mesmo modelo, com o mesmo preço de catálogo.
        $precos = [];
        foreach ($itens as $i) {
            $sugerido = $porId[$i->produtoId] ?? null;
            $escolhido = $porId[$produtoDa[$vid($i)] ?? -1] ?? null;
            if ($i->precoOferta !== null && $sugerido && $escolhido && $escolhido['preco'] === $sugerido['preco']) {
                $precos[$vid($i)] = (float) $i->precoOferta;
            }
        }
        $dados = [
            'tipo' => $modo, 'origem' => 'vendedor', 'clienteId' => $s->cliente->id, 'vendedorId' => $s->vendedorId, 'nomeCliente' => $s->cliente->nome,
            'telefoneCliente' => $s->cliente->telefone, 'cep' => $cepFinal, 'linhas' => $itens->map(fn ($i) => ['varianteId' => $vid($i), 'quantidade' => $i->quantidade])->values()->all(),
            'regraFrete' => $modo === 'compra' ? $this->config->get('frete') : null, 'usuarioId' => $usuarioId, 'precos' => $precos,
        ];
        // Cupom da sugestão: se não servir mais, o pedido sai sem ele em vez de travar.
        if ($s->cupomCodigo && $this->config->get('cupons.ligados')) {
            try {
                $p = $this->pedidos->criar([...$dados, 'cupom' => ['codigo' => $s->cupomCodigo, 'quem' => 'equipe']]);
            } catch (ErroPedido) {
                $p = $this->pedidos->criar($dados);
            }
        } else {
            $p = $this->pedidos->criar($dados);
        }
        $s->update(['status' => 'convertida', 'respondidaEm' => now(), 'pedidoId' => $p['id']]);
        if ($cepFinal && ! $s->cliente->cep) {
            Cliente::query()->whereKey($s->cliente->id)->update(['cep' => $cepFinal]);
        }

        return ['pedido' => $p, 'sugestao' => $s];
    }

    /**
     * Lista com filtros, contagem por situação e as que precisam de atenção agora.
     *
     * @param  array{vendedor?: ?string, cliente?: ?string, situacao?: ?string, q?: ?string, pagina: int}  $f
     * @return array<string, mixed>
     */
    public function listar(User $u, array $f): array
    {
        $q = trim((string) ($f['q'] ?? ''));
        $todas = self::escopo($u)->when($u->ehGestor() && ! empty($f['vendedor']), fn ($w) => $w->where('vendedorId', $f['vendedor']))
            ->when(! empty($f['cliente']), fn ($w) => $w->where('clienteId', $f['cliente']))
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('codigo', 'like', "%{$q}%")->orWhere('titulo', 'like', "%{$q}%")->orWhereHas('cliente', fn ($c) => $c->where('nome', 'like', "%{$q}%"))))
            ->with(['cliente:id,nome,telefone', 'vendedor:id,name', 'itens:id,sugestaoId,escolha,quantidade'])->latest('criadaEm')->take(1000)->get();
        $agora = now();
        $linhas = $todas->map(function (Sugestao $s) use ($agora) {
            $situacao = self::situacao($s, $agora);

            return ['s' => $s, 'situacao' => $situacao, 'atencao' => self::atencao($s, $situacao, $agora)];
        });
        $contagem = $linhas->countBy('situacao')->all();
        $atencao = $linhas->filter(fn ($x) => $x['atencao'])->values();
        $sit = $f['situacao'] ?? null;
        $filtradas = $sit === 'atencao' ? $atencao : ($sit ? $linhas->where('situacao', $sit)->values() : $linhas);

        return [
            'lista' => $filtradas->take(40 * max(1, $f['pagina']))->map(fn ($x) => self::resumo($x['s'], $x['situacao'], $x['atencao']))->values()->all(),
            'total' => $filtradas->count(), 'contagem' => $contagem,
            'atencao' => $atencao->take(8)->map(fn ($x) => self::resumo($x['s'], $x['situacao'], $x['atencao']))->values()->all(), 'totalAtencao' => $atencao->count(),
        ];
    }

    /** @return array<string, mixed> */
    public static function resumo(Sugestao $s, string $situacao, ?string $atencao = null): array
    {
        return [
            'id' => $s->id, 'codigo' => $s->codigo, 'titulo' => $s->titulo, 'situacao' => $situacao, 'atencao' => $atencao, 'criadaEm' => $s->criadaEm->toIso8601String(),
            'validaAte' => $s->validaAte->toIso8601String(), 'enviadaEm' => $s->enviadaEm?->toIso8601String(), 'vistaEm' => $s->vistaEm?->toIso8601String(),
            'respondidaEm' => $s->respondidaEm?->toIso8601String(), 'lembradoEm' => $s->lembradoEm?->toIso8601String(), 'vezesVista' => $s->vezesVista, 'pedidoId' => $s->pedidoId,
            'mensagem' => $s->mensagem, 'cupomCodigo' => $s->cupomCodigo, 'lembretes' => $s->lembretes, 'link' => Links::daSugestao((string) config('app.url'), $s->codigo),
            'cliente' => $s->relationLoaded('cliente') ? ['id' => $s->cliente?->id, 'nome' => $s->cliente?->nome, 'telefone' => $s->cliente?->telefone] : null,
            'vendedor' => $s->relationLoaded('vendedor') ? $s->vendedor?->name : null,
            'pecas' => $s->relationLoaded('itens') ? $s->itens->count() : null,
            'quero' => $s->relationLoaded('itens') ? $s->itens->filter(fn ($i) => ($i->escolha->value ?? $i->escolha) === 'quero')->count() : null,
            'talvez' => $s->relationLoaded('itens') ? $s->itens->filter(fn ($i) => ($i->escolha->value ?? $i->escolha) === 'talvez')->count() : null,
        ];
    }

    /** Sugestão para a página da equipe, com as peças e o que a cliente escolheu. @return ?array<string, mixed> */
    public function paraEquipe(User $u, string $id): ?array
    {
        $s = self::escopo($u)->with(['itens' => fn ($q) => $q->orderBy('ordem')->orderBy('id'), 'cliente:id,nome,telefone', 'vendedor:id,name'])->find($id);
        if (! $s) {
            return null;
        }
        $situacao = self::situacao($s);
        $porId = $this->porId();
        $variantes = [];
        foreach ($porId as $p) {
            foreach ($p['variantes'] as $v) {
                $variantes[$v['id']] = [...$v, 'produto' => ['id' => $p['id'], 'nome' => $p['nome'], 'corNome' => $p['corNome'] ?? $p['cor'], 'imagem' => $p['imagens'][0] ?? null]];
            }
        }

        return [
            ...self::resumo($s, $situacao, self::atencao($s, $situacao)),
            'itens' => $s->itens->map(function ($i) use ($porId, $variantes) {
                $p = $porId[$i->produtoId] ?? null;

                return [
                    'id' => $i->id, 'escolha' => $i->escolha->value ?? $i->escolha, 'quantidade' => $i->quantidade, 'nota' => $i->nota, 'precoOferta' => $i->precoOferta === null ? null : (float) $i->precoOferta,
                    'adicionadoPelaCliente' => (bool) $i->adicionadoPelaCliente,
                    'produto' => $p ? ['id' => $p['id'], 'nome' => $p['nome'], 'referencia' => $p['referencia'], 'marca' => $p['marca'], 'preco' => $p['preco'], 'imagem' => $p['imagens'][0] ?? null] : null,
                    'sugerida' => $i->varianteId ? ($variantes[$i->varianteId] ?? null) : null,
                    'escolhida' => $variantes[$i->varianteEscolhidaId ?? $i->varianteId ?? -1] ?? null,
                ];
            })->values()->all(),
        ];
    }

    public function marcarEnviada(User $u, string $id): void
    {
        $s = $this->daEquipe($u, $id)->load('cliente:id,nome');
        if ($s->enviadaEm) {
            return;
        }
        $s->update(['enviadaEm' => now()]);
        $this->equipe->registrar($u->id, 'oferta_enviada', ['clienteId' => $s->clienteId, 'descricao' => "{$s->cliente->nome} · {$s->codigo} · sugestão enviada"]);
    }

    /** Lembrete pelo WhatsApp: guarda quando e quantas vezes, para não insistir demais. */
    public function lembrar(User $u, string $id): void
    {
        $s = $this->daEquipe($u, $id)->load('cliente:id,nome');
        $s->update(['lembradoEm' => now(), 'lembretes' => $s->lembretes + 1]);
        $this->equipe->registrar($u->id, 'whatsapp', ['clienteId' => $s->clienteId, 'descricao' => "Lembrete da sugestão {$s->codigo} · {$s->cliente->nome}"]);
    }

    public function cancelar(User $u, string $id): void
    {
        $s = $this->daEquipe($u, $id);
        if ($s->status->value === 'convertida') {
            throw new ErroNegocio('Esta sugestão já virou pedido.');
        }
        $s->update(['status' => 'cancelada']);
    }

    /** Dá mais dias à sugestão (e aos preços especiais); serve também para reabrir uma vencida. */
    public function renovar(User $u, string $id, int $dias): void
    {
        $s = $this->daEquipe($u, $id);
        if (in_array($s->status->value, ['convertida', 'cancelada'], true)) {
            throw new ErroNegocio('Esta sugestão já foi fechada.');
        }
        $s->update(['validaAte' => now()->addDays(in_array($dias, self::DIAS_VALIDADE, true) ? $dias : self::DIAS_PADRAO)]);
    }

    /** Tamanhos que a cliente mais usa (compras e escolhas no site). @return list<string> */
    public static function tamanhosDaCliente(string $clienteId): array
    {
        $peso = [];
        $comprados = PedidoItem::query()->whereHas('pedido', fn ($q) => $q->where('clienteId', $clienteId)->where('status', 'confirmado'))->selectRaw('tamanho, sum(quantidade) as n')->groupBy('tamanho')->get();
        foreach ($comprados as $c) {
            $t = mb_strtoupper($c->tamanho);
            $peso[$t] = ($peso[$t] ?? 0) + 3 * (int) $c->n;
        }
        foreach (Atividade::query()->where('clienteId', $clienteId)->where('tipo', 'tamanho')->whereNotNull('termo')->selectRaw('termo, count(*) as n')->groupBy('termo')->get() as $e) {
            $t = mb_strtoupper($e->termo);
            $peso[$t] = ($peso[$t] ?? 0) + (int) $e->n;
        }
        arsort($peso);

        return array_slice(array_map('strval', array_keys($peso)), 0, 3);
    }

    /** @param array<string, mixed> $p @return array<string, mixed> */
    private static function paraPeca(array $p): array
    {
        return [
            'id' => $p['id'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'cor' => $p['corNome'] ?? $p['cor'], 'categoria' => $p['categoria'], 'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'],
            'imagem' => $p['imagens'][0] ?? null, 'variantes' => array_values(array_map(fn ($v) => ['id' => $v['id'], 'tamanho' => $v['tamanho'], 'disponivel' => $v['disponivel']], array_filter($p['variantes'], fn ($v) => $v['disponivel'] > 0))),
        ];
    }

    /** O que a cliente já mostrou de interesse, para a vendedora montar a sugestão. @return ?array<string, mixed> */
    public function historico(User $u, string $clienteId): ?array
    {
        $interesse = app(Navegacao::class)->interesse($u, $clienteId);
        if (! $interesse) {
            return null;
        }
        $porId = $this->porId();
        $peca = fn (int $id) => isset($porId[$id]) ? self::paraPeca($porId[$id]) : null;
        $unicos = fn ($l) => $l->unique('produtoId')->values();
        $naoFechados = $unicos(PedidoItem::query()->whereHas('pedido', fn ($q) => $q->where('clienteId', $clienteId)->where('status', 'cancelado')->whereNull('confirmadoEm'))->with('pedido:id,codigo,canceladoEm,motivoCancelamento')->latest('id')->take(30)->get(['id', 'pedidoId', 'produtoId', 'varianteId']));
        $compras = $unicos(PedidoItem::query()->whereHas('pedido', fn ($q) => $q->where('clienteId', $clienteId)->where('status', 'confirmado'))->where('situacao', '<>', 'devolvido')->with('pedido:id,codigo,confirmadoEm')->latest('id')->take(30)->get(['id', 'pedidoId', 'produtoId', 'varianteId']));
        $sacola = $interesse['sacola'];
        $horas = $sacola ? now()->diffInHours($sacola['atualizadoEm'], true) : 0;

        return [
            'tamanhos' => array_column($interesse['preferencias']['tamanhos'], 'valor'),
            'sacola' => $sacola && $sacola['linhas'] ? [
                'atualizadoEm' => $sacola['atualizadoEm'], 'parada' => $horas >= (int) $this->config->get('historico.horasSacola'), 'total' => $sacola['total'],
                'itens' => array_values(array_filter(array_map(fn ($l) => ($p = $peca($l['produto']['id'])) ? ['peca' => $p, 'varianteId' => $l['varianteId'], 'quantidade' => $l['quantidade'], 'tamanho' => $l['tamanho']] : null, $sacola['linhas']))),
            ] : null,
            'vistas' => array_values(array_filter(array_map(fn ($x) => ($p = $peca($x['produto']['id'])) ? ['peca' => $p, 'vezes' => $x['vezes'], 'ultimaVez' => $x['ultimaVez'], 'tamanhos' => $x['tamanhos'], 'situacao' => $x['situacao']] : null, $interesse['pecas']))),
            'favoritos' => array_values(array_filter(array_map(fn ($f) => ($p = $peca($f['produto']['id'])) ? ['peca' => $p, 'criadoEm' => $f['criadoEm']] : null, $interesse['favoritos']))),
            'naoFechados' => $naoFechados->map(fn ($i) => ($p = $peca($i->produtoId)) ? ['peca' => $p, 'varianteId' => $i->varianteId, 'codigo' => $i->pedido->codigo, 'quando' => $i->pedido->canceladoEm?->toIso8601String(), 'motivo' => $i->pedido->motivoCancelamento] : null)->filter()->values()->all(),
            'compras' => $compras->map(fn ($i) => ($p = $peca($i->produtoId)) ? ['peca' => $p, 'varianteId' => $i->varianteId, 'codigo' => $i->pedido->codigo, 'quando' => $i->pedido->confirmadoEm?->toIso8601String()] : null)->filter()->values()->all(),
        ];
    }

    /**
     * Sugestão automática: até 8 peças com estoque no tamanho dela (sacola, mais vistas e não compradas, favoritos, promoções nas categorias que ela olha).
     *
     * @return list<array{peca: array<string, mixed>, varianteId: ?int}>
     */
    public function automatica(User $u, string $clienteId, int $limite = 8): array
    {
        $h = $this->historico($u, $clienteId);
        if (! $h) {
            return [];
        }
        $tamanhos = array_values(array_unique(array_map('mb_strtoupper', [...$h['tamanhos'], ...self::tamanhosDaCliente($clienteId)])));
        $escolhidas = [];
        $vai = function (array $p, ?int $varianteId = null) use (&$escolhidas, $tamanhos, $limite) {
            if (count($escolhidas) >= $limite || isset($escolhidas[$p['id']]) || ! $p['variantes']) {
                return;
            }
            $v = ($varianteId ? collect($p['variantes'])->firstWhere('id', $varianteId) : null) ?? collect($p['variantes'])->first(fn ($x) => in_array(mb_strtoupper($x['tamanho']), $tamanhos, true));
            if ($tamanhos && ! $v) {
                return; // sem estoque no tamanho dela
            }
            $escolhidas[$p['id']] = ['peca' => $p, 'varianteId' => $v['id'] ?? null];
        };
        foreach ($h['sacola']['itens'] ?? [] as $i) {
            $vai($i['peca'], $i['varianteId']);
        }
        foreach ($h['vistas'] as $x) {
            if ($x['situacao'] !== 'comprou') {
                $vai($x['peca']);
            }
        }
        foreach ($h['favoritos'] as $f) {
            $vai($f['peca']);
        }
        $categorias = array_unique([...array_map(fn ($x) => $x['peca']['categoria'], $h['vistas']), ...array_map(fn ($x) => $x['peca']['categoria'], $h['compras'])]);
        foreach ($this->catalogo->lista() as $p) {
            if (($p['preco'] < $p['precoCheio'] || $p['imperdivel']) && (! $categorias || in_array($p['categoria'], $categorias, true)) && $p['imagens']) {
                $vai(self::paraPeca($p));
            }
        }

        return array_values($escolhidas);
    }

    /** "Mais para você": até 6 peças das mesmas categorias, promoções primeiro, de modelos que ainda não estão nela. @param list<int> $produtoIds @return list<array<string, mixed>> */
    private function maisParaVoce(array $produtoIds): array
    {
        $lista = $this->catalogo->lista();
        $porId = array_column($lista, null, 'id');
        $da = array_values(array_filter(array_map(fn ($id) => $porId[$id] ?? null, $produtoIds)));
        $modelos = array_column($da, 'modelo');
        $categorias = array_column($da, 'categoria');
        $generos = array_column($da, 'genero');
        $r = array_values(array_filter($lista, fn ($p) => $p['imagens'] && collect($p['variantes'])->contains(fn ($v) => $v['disponivel'] > 0) && ! in_array($p['modelo'], $modelos, true)
            && in_array($p['categoria'], $categorias, true) && (in_array($p['genero'], $generos, true) || $p['genero'] === 'unissex')));
        usort($r, fn ($a, $b) => (int) ($b['preco'] < $b['precoCheio']) <=> (int) ($a['preco'] < $a['precoCheio']));
        $vistos = [];
        $saida = [];
        foreach ($r as $p) {
            if (isset($vistos[$p['modelo']]) || count($saida) >= 6) {
                continue;
            }
            $vistos[$p['modelo']] = true;
            $saida[] = ['produtoId' => $p['id'], 'nome' => $p['nome'], 'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'], 'imagem' => $p['imagens'][0] ?? null];
        }

        return $saida;
    }

    /** A cliente põe uma peça de "Mais para você" na sugestão; devolve o item no formato da página. @return ?array<string, mixed> */
    public function adicionar(string $codigo, int $produtoId): ?array
    {
        $s = Sugestao::query()->where('codigo', $codigo)->with('itens:id,sugestaoId,produtoId')->first();
        if (! $s || ! self::aberta(self::situacao($s))) {
            throw new ErroNegocio('Esta sugestão não aceita mais peças.');
        }
        if ($s->itens->count() >= self::MAX_ITENS + 10) {
            throw new ErroNegocio('A sugestão já está cheia.');
        }
        if ($s->itens->contains('produtoId', $produtoId)) {
            throw new ErroNegocio('Esta peça já está na sugestão.');
        }
        $p = collect($this->catalogo->lista())->first(fn ($x) => $x['id'] === $produtoId && collect($x['variantes'])->contains(fn ($v) => $v['disponivel'] > 0));
        if (! $p) {
            throw new ErroNegocio('Esta peça acabou.');
        }
        SugestaoItem::query()->create(['sugestaoId' => $s->id, 'produtoId' => $p['id'], 'ordem' => 999, 'escolha' => 'quero', 'adicionadoPelaCliente' => true]);

        return collect($this->publica($codigo)['itens'] ?? [])->firstWhere('produtoId', $p['id']);
    }

    /** Funil das sugestões enviadas no período, por vendedora. @return array<string, mixed> */
    public function conversao(User $u, ?CarbonInterface $desde, ?CarbonInterface $ate = null): array
    {
        $lista = self::escopo($u)->whereNotNull('enviadaEm')->when($desde, fn ($q) => $q->where('enviadaEm', '>=', $desde))->when($ate, fn ($q) => $q->where('enviadaEm', '<', $ate))
            ->with('vendedor:id,name')->get(['id', 'vendedorId', 'vistaEm', 'respondidaEm', 'status', 'pedidoId']);
        $pedidos = Pedido::query()->whereIn('id', $lista->pluck('pedidoId')->filter())->get(['id', 'status', 'total'])->keyBy('id');
        $soma = fn ($l) => [
            'enviados' => $l->count(), 'vistos' => $l->whereNotNull('vistaEm')->count(), 'respondidos' => $l->whereNotNull('respondidaEm')->count(),
            'pedidos' => $l->filter(fn ($s) => $s->status->value === 'convertida')->count(),
            'vendido' => round($l->sum(fn ($s) => ($p = $pedidos->get($s->pedidoId)) && $p->status->value === 'confirmado' ? (float) $p->total : 0), 2),
        ];
        $porVendedor = $lista->groupBy('vendedorId')->map(fn ($l, $id) => ['id' => $id, 'nome' => $l->first()->vendedor?->name, ...$soma($l)])
            ->sort(fn ($a, $b) => ($b['vendido'] <=> $a['vendido']) ?: ($b['pedidos'] <=> $a['pedidos']))->values()->all();

        return ['total' => $soma($lista), 'porVendedor' => $porVendedor];
    }
}
