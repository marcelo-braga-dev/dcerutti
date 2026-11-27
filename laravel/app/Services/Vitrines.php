<?php

namespace App\Services;

use App\Exceptions\ErroNegocio;
use App\Models\Atendimento;
use App\Models\AtendimentoItem;
use App\Models\Pedido;
use App\Models\PedidoItem;
use App\Models\Produto;
use App\Models\User;
use App\Models\Venda;
use App\Models\Vitrine;
use App\Models\VitrinePeca;
use App\Support\Contato;
use Illuminate\Support\Facades\DB;

/**
 * Vitrines (docs/26; porta de src/server/vitrines.ts e consultas/vitrines.ts): toda vendedora cria e cuida das dela;
 * o gestor, de todas. O público nunca escreve aqui além do contador de visitas. O endereço (`slug`) só é gerado ao
 * criar: depois de publicado, o link já circulou. As leituras públicas usam lista branca de campos.
 */
class Vitrines
{
    public const TIPOS = ['live' => 'Live', 'post' => 'Post do feed', 'reels' => 'Reels', 'story' => 'Story'];

    public const STATUS = ['rascunho' => 'Rascunho', 'agendada' => 'Agendada', 'no_ar' => 'No ar', 'publicada' => 'Publicada', 'encerrada' => 'Encerrada', 'arquivada' => 'Arquivada'];

    public const ATIVOS = ['agendada', 'no_ar', 'publicada'];

    /** Abaixo disso a página diz "últimas unidades", sem contar o estoque. */
    private const POUCAS = 2;

    public function __construct(private Catalogo $catalogo, private Config $config) {}

    // ---------- Regras puras ----------

    /** @return list<string> */
    public static function proximosStatus(string $tipo, string $status): array
    {
        if ($status === 'encerrada') {
            return $tipo === 'live' ? ['arquivada'] : ['arquivada', 'publicada'];
        }
        if ($status === 'arquivada') {
            return ['encerrada'];
        }
        if ($tipo === 'live') {
            return ['rascunho' => ['agendada'], 'agendada' => ['no_ar', 'rascunho'], 'no_ar' => ['encerrada']][$status] ?? [];
        }

        return ['rascunho' => ['publicada'], 'publicada' => ['encerrada']][$status] ?? [];
    }

    public static function ofertaVale(string $status, ?\DateTimeInterface $ofertaAte): bool
    {
        return in_array($status, self::ATIVOS, true) && (! $ofertaAte || $ofertaAte->getTimestamp() > time());
    }

    /** "Novidades de Inverno!" vira "novidades-de-inverno". */
    public static function gerarSlug(string $titulo): string
    {
        $s = \Normalizer::normalize($titulo, \Normalizer::FORM_D);
        $s = preg_replace('/\p{Mn}/u', '', (string) $s);
        $s = preg_replace('/[^a-z0-9]+/', '-', mb_strtolower((string) $s));
        $s = rtrim(substr(trim((string) $s, '-'), 0, 60), '-');

        return $s !== '' ? $s : 'vitrine';
    }

    /** Só endereços https do Instagram; inválido = null. */
    public static function urlInstagramValida(?string $v): ?string
    {
        $v = trim((string) $v);
        $u = parse_url($v);
        if (! $u || ($u['scheme'] ?? '') !== 'https' || ! in_array(strtolower($u['host'] ?? ''), ['instagram.com', 'www.instagram.com'], true) || isset($u['user']) || isset($u['pass']) || isset($u['port'])) {
            return null;
        }
        if (($u['path'] ?? '') === '') {
            $v .= '/';
        }

        return mb_substr($v, 0, 300);
    }

    /** @param list<array{nome: string, imagens: int, videos: int, tamanhos: int, ativa: bool}> $pecas @return list<string> */
    public static function conferir(string $tipo, ?string $urlInstagram, mixed $inicioPrevisto, ?string $legenda, array $pecas): array
    {
        $avisos = [];
        if (! $pecas) {
            $avisos[] = 'Adicione pelo menos uma peça.';
        }
        if ($tipo === 'live' && ! $inicioPrevisto) {
            $avisos[] = 'Marque a data e a hora da live.';
        }
        if ($tipo !== 'live' && ! $urlInstagram) {
            $avisos[] = 'Falta o link da publicação no Instagram.';
        }
        if ($tipo !== 'live' && trim((string) $legenda) === '') {
            $avisos[] = 'Falta a legenda da publicação.';
        }
        foreach ($pecas as $p) {
            if (! $p['ativa']) {
                $avisos[] = "{$p['nome']}: fora do catálogo; não aparece na página.";
            } elseif (! $p['tamanhos']) {
                $avisos[] = "{$p['nome']}: sem estoque.";
            } elseif ($p['tamanhos'] === 1) {
                $avisos[] = "{$p['nome']}: só um tamanho disponível.";
            }
            if ($p['ativa'] && ! $p['imagens']) {
                $avisos[] = "{$p['nome']}: sem foto.";
            }
            if ($p['ativa'] && $tipo === 'live' && ! $p['videos']) {
                $avisos[] = "{$p['nome']}: sem vídeo (opcional).";
            }
        }

        return $avisos;
    }

    public static function legendaSugerida(string $tipo, string $titulo, string $dominio): string
    {
        return $tipo === 'live'
            ? "{$titulo}\n\nVem com a gente na live! As peças ficam em {$dominio}/live (link na bio)."
            : "{$titulo}\n\nGostou? Veja as peças e os tamanhos pelo link na bio: {$dominio}/vitrines";
    }

    private static function precoQueVale(float $catalogo, ?float $oferta, bool $vencida): float
    {
        return ! $vencida && $oferta !== null && $oferta > 0 && $oferta < $catalogo ? $oferta : $catalogo;
    }

    public static function descontoPct(float $preco, float $cheio): int
    {
        return $cheio > 0 && $preco < $cheio ? (int) round((1 - $preco / $cheio) * 100) : 0;
    }

    // ---------- Escrita (equipe) ----------

    public function ligadas(): bool
    {
        return (bool) $this->config->get('vitrines.ligadas');
    }

    private function doEscopo(User $u, string $id, bool $travar = false): Vitrine
    {
        $v = Vitrine::query()->when($travar, fn ($q) => $q->lockForUpdate())->find($id);
        if (! $v || ! Atendimentos::podeAtender($u, $v->responsavelId)) {
            throw new ErroNegocio('Vitrine não encontrada.');
        }

        return $v;
    }

    private function slugLivre(string $titulo): string
    {
        $base = self::gerarSlug($titulo);
        for ($i = 1; $i < 200; $i++) {
            $s = $i === 1 ? $base : "{$base}-{$i}";
            if (! Vitrine::query()->where('slug', $s)->exists()) {
                return $s;
            }
        }

        return $base.'-'.base_convert((string) (int) (microtime(true) * 1000), 10, 36);
    }

    private function responsavelValido(User $u, ?string $escolhido): string
    {
        if (! $u->ehGestor()) {
            return $u->id;
        }
        if ($escolhido && User::query()->whereKey($escolhido)->where('papel', 'vendedor')->where('ativo', true)->exists()) {
            return $escolhido;
        }
        throw new ErroNegocio('Escolha a pessoa responsável.');
    }

    /** @param array{tipo: string, titulo: string, descricao: ?string, urlInstagram: ?string, legenda: ?string, inicioPrevisto: mixed, ofertaAte: mixed, responsavelId?: ?string} $d */
    public function criar(User $u, array $d): Vitrine
    {
        return DB::transaction(function () use ($u, $d) {
            $responsavelId = $this->responsavelValido($u, $d['responsavelId'] ?? null);
            unset($d['responsavelId']);

            return Vitrine::query()->create([...$d, 'responsavelId' => $responsavelId, 'slug' => $this->slugLivre($d['titulo']), 'status' => 'rascunho']);
        });
    }

    /** @param array<string, mixed> $d */
    public function atualizar(User $u, string $id, array $d): void
    {
        DB::transaction(function () use ($u, $id, $d) {
            $v = $this->doEscopo($u, $id);
            $escolhido = $d['responsavelId'] ?? null;
            unset($d['responsavelId'], $d['tipo']);
            $responsavelId = $u->ehGestor() && $escolhido && $escolhido !== $v->responsavelId ? $this->responsavelValido($u, $escolhido) : $v->responsavelId;
            $v->update([...$d, 'responsavelId' => $responsavelId]);
        });
    }

    public function adicionarPeca(User $u, string $id, int $produtoId): void
    {
        DB::transaction(function () use ($u, $id, $produtoId) {
            $this->doEscopo($u, $id);
            if (! Produto::query()->whereKey($produtoId)->where('ativo', true)->exists()) {
                throw new ErroNegocio('Peça não encontrada.');
            }
            if (VitrinePeca::query()->where('vitrineId', $id)->where('produtoId', $produtoId)->exists()) {
                throw new ErroNegocio('Esta peça já está na vitrine.');
            }
            $max = VitrinePeca::query()->where('vitrineId', $id)->max('ordem');
            VitrinePeca::query()->create(['vitrineId' => $id, 'produtoId' => $produtoId, 'ordem' => $max === null ? 0 : $max + 1]);
        });
    }

    public function removerPeca(User $u, string $id, int $pecaId): void
    {
        DB::transaction(function () use ($u, $id, $pecaId) {
            $this->doEscopo($u, $id);
            VitrinePeca::query()->whereKey($pecaId)->where('vitrineId', $id)->delete();
        });
    }

    public function moverPeca(User $u, string $id, int $pecaId, int $direcao): void
    {
        DB::transaction(function () use ($u, $id, $pecaId, $direcao) {
            $this->doEscopo($u, $id);
            $lista = VitrinePeca::query()->where('vitrineId', $id)->orderBy('ordem')->orderBy('id')->pluck('id')->all();
            $i = array_search($pecaId, $lista, true);
            $j = $i === false ? -1 : $i + ($direcao < 0 ? -1 : 1);
            if ($i === false || $j < 0 || $j >= count($lista)) {
                return;
            }
            [$lista[$i], $lista[$j]] = [$lista[$j], $lista[$i]];
            foreach ($lista as $ordem => $pid) {
                VitrinePeca::query()->whereKey($pid)->update(['ordem' => $ordem]);
            }
        });
    }

    /** Preço especial: abaixo do catálogo e, para a vendedora, dentro do limite de desconto da loja (o mesmo do caixa). */
    public function definirOferta(User $u, string $id, int $pecaId, ?float $preco): void
    {
        DB::transaction(function () use ($u, $id, $pecaId, $preco) {
            $this->doEscopo($u, $id);
            $p = VitrinePeca::query()->with('produto:id,preco')->whereKey($pecaId)->where('vitrineId', $id)->first();
            if (! $p) {
                throw new ErroNegocio('Peça não encontrada.');
            }
            if ($preco !== null) {
                $catalogo = (float) $p->produto->preco;
                if (! ($preco > 0) || $preco >= $catalogo) {
                    throw new ErroNegocio('O preço especial precisa ser menor que o do catálogo.');
                }
                if (! $u->ehGestor()) {
                    $limite = (float) $this->config->get('caixa.descontoMaxVendedor');
                    $minimo = round($catalogo * (100 - $limite)) / 100;
                    if ($preco < $minimo) {
                        throw new ErroNegocio('O desconto máximo é de '.rtrim(rtrim(number_format($limite, 2, ',', ''), '0'), ',').'%. Para mais, fale com a gestão.');
                    }
                }
            }
            $p->update(['precoOferta' => $preco]);
        });
    }

    public function mudarStatus(User $u, string $id, string $novo): void
    {
        DB::transaction(function () use ($u, $id, $novo) {
            $v = $this->doEscopo($u, $id, true);
            if (! in_array($novo, self::proximosStatus($v->tipo->value, $v->status->value), true)) {
                throw new ErroNegocio('Esta mudança não é possível agora. Atualize a página.');
            }
            if (in_array($novo, self::ATIVOS, true) && ! VitrinePeca::query()->where('vitrineId', $id)->exists()) {
                throw new ErroNegocio('Adicione pelo menos uma peça.');
            }
            if ($novo === 'agendada' && ! $v->inicioPrevisto) {
                throw new ErroNegocio('Marque a data e a hora da live.');
            }
            if ($novo === 'no_ar' && Vitrine::query()->where('status', 'no_ar')->whereKeyNot($id)->lockForUpdate()->exists()) {
                throw new ErroNegocio('Já há uma live no ar. Encerre a outra primeiro.');
            }
            $dados = ['status' => $novo];
            if ($novo === 'no_ar' || ($novo === 'publicada' && ! $v->inicioEm)) {
                $dados['inicioEm'] = now();
            }
            if ($novo === 'encerrada' && ! $v->fimEm) {
                $dados['fimEm'] = now();
            }
            if ($novo === 'publicada') {
                $dados['fimEm'] = null;
            }
            $v->update($dados);
        });
    }

    /** Cópia em rascunho, com as peças e os preços. Datas e link ficam em branco: são de outro momento. */
    public function duplicar(User $u, string $id): Vitrine
    {
        return DB::transaction(function () use ($u, $id) {
            $v = $this->doEscopo($u, $id);
            $titulo = mb_substr("{$v->titulo} (cópia)", 0, 120);
            $nova = Vitrine::query()->create([
                'tipo' => $v->tipo, 'status' => 'rascunho', 'titulo' => $titulo, 'descricao' => $v->descricao, 'legenda' => $v->legenda,
                'responsavelId' => $u->ehGestor() ? $v->responsavelId : $u->id, 'slug' => $this->slugLivre($titulo),
            ]);
            foreach (VitrinePeca::query()->where('vitrineId', $id)->orderBy('ordem')->orderBy('id')->get() as $p) {
                VitrinePeca::query()->create(['vitrineId' => $nova->id, 'produtoId' => $p->produtoId, 'ordem' => $p->ordem, 'precoOferta' => $p->precoOferta]);
            }

            return $nova;
        });
    }

    /** Contagem sem IP. Falhar aqui não pode derrubar a página pública. */
    public function registrarVisita(string $id): void
    {
        rescue(fn () => Vitrine::query()->whereKey($id)->increment('visitas'), report: true);
    }

    // ---------- Leitura (equipe) ----------

    /** @return array{lista: list<array<string, mixed>>, contagem: array<string, int>, emUso: int} */
    public function listar(User $u, ?string $status): array
    {
        $escopo = fn ($q) => $q->when(! $u->ehGestor(), fn ($w) => $w->where('responsavelId', $u->id));
        $lista = Vitrine::query()->tap($escopo)
            ->when($status, fn ($q) => $q->where('status', $status), fn ($q) => $q->where('status', '<>', 'arquivada'))
            ->with(['responsavel:id,name', 'pecas' => fn ($q) => $q->orderBy('ordem')->orderBy('id')])
            ->withCount(['pecas', 'atendimentos', 'pedidos'])->orderByDesc('criadoEm')->take(100)->get();
        $contagem = Vitrine::query()->tap($escopo)->groupBy('status')->selectRaw('status, count(*) as n')->pluck('n', 'status')->map(fn ($n) => (int) $n)->all();
        $fotos = collect($this->catalogo->lista())->mapWithKeys(fn ($p) => [$p['id'] => $p['imagens'][0] ?? null]);
        $vendido = Pedido::query()->whereIn('vitrineId', $lista->pluck('id'))->where('status', 'confirmado')->groupBy('vitrineId')->selectRaw('vitrineId, sum(total) as soma')->pluck('soma', 'vitrineId');

        return [
            'lista' => $lista->map(fn (Vitrine $v) => [
                'id' => $v->id, 'slug' => $v->slug, 'tipo' => $v->tipo->value, 'status' => $v->status->value, 'titulo' => $v->titulo,
                'inicioPrevisto' => $v->inicioPrevisto?->toIso8601String(), 'criadoEm' => $v->criadoEm->toIso8601String(), 'visitas' => $v->visitas,
                'responsavel' => $v->responsavel?->name, 'pecas' => $v->pecas_count, 'atendimentos' => $v->atendimentos_count, 'pedidos' => $v->pedidos_count,
                'imagens' => $v->pecas->take(6)->map(fn ($p) => $fotos[$p->produtoId] ?? null)->filter()->take(3)->values()->all(),
                'vendido' => (float) ($vendido[$v->id] ?? 0),
            ])->values()->all(),
            'contagem' => $contagem,
            'emUso' => array_sum(array_filter($contagem, fn ($k) => $k !== 'arquivada', ARRAY_FILTER_USE_KEY)),
        ];
    }

    /** A vitrine no painel: dados, peças com o que há no catálogo agora e a conferência. Sem permissão, null. */
    public function paraEdicao(User $u, string $id): ?array
    {
        $v = Vitrine::query()->with(['pecas' => fn ($q) => $q->orderBy('ordem')->orderBy('id'), 'responsavel:id,name'])->find($id);
        if (! $v || ! Atendimentos::podeAtender($u, $v->responsavelId)) {
            return null;
        }
        $porId = collect($this->catalogo->lista())->keyBy('id');
        $fora = Produto::query()->whereIn('id', $v->pecas->pluck('produtoId')->reject(fn ($pid) => $porId->has($pid)))->get(['id', 'nome', 'preco'])->keyBy('id');
        $pecas = $v->pecas->map(function ($p) use ($porId, $fora) {
            $c = $porId->get($p->produtoId);

            return [
                'id' => $p->id, 'produtoId' => $p->produtoId, 'ativa' => (bool) $c, 'nome' => $c['nome'] ?? $fora[$p->produtoId]->nome ?? 'Peça removida',
                'referencia' => $c['referencia'] ?? '', 'imagem' => $c['imagens'][0] ?? null, 'preco' => (float) ($c['preco'] ?? $fora[$p->produtoId]->preco ?? 0),
                'oferta' => $p->precoOferta === null ? null : (float) $p->precoOferta, 'imagens' => $c ? count($c['imagens']) : 0, 'videos' => $c ? count($c['videos']) : 0,
                'tamanhos' => $c ? collect($c['variantes'])->where('disponivel', '>', 0)->pluck('tamanho')->values()->all() : [],
            ];
        })->values()->all();

        return [
            'id' => $v->id, 'slug' => $v->slug, 'tipo' => $v->tipo->value, 'status' => $v->status->value, 'titulo' => $v->titulo, 'descricao' => $v->descricao,
            'urlInstagram' => $v->urlInstagram, 'legenda' => $v->legenda, 'inicioPrevisto' => $v->inicioPrevisto?->toIso8601String(), 'ofertaAte' => $v->ofertaAte?->toIso8601String(),
            'responsavelId' => $v->responsavelId, 'responsavel' => $v->responsavel?->name, 'pecas' => $pecas,
            'avisos' => self::conferir($v->tipo->value, $v->urlInstagram, $v->inicioPrevisto, $v->legenda, array_map(fn ($p) => ['nome' => $p['nome'], 'imagens' => $p['imagens'], 'videos' => $p['videos'], 'tamanhos' => count($p['tamanhos']), 'ativa' => $p['ativa']], $pecas)),
        ];
    }

    /** Resultado da vitrine. O valor vendido vem da tabela `venda`, a mesma das metas. */
    public function resultado(User $u, string $id): ?array
    {
        $v = Vitrine::query()->with('pecas.produto:id,nome')->find($id);
        if (! $v || ! Atendimentos::podeAtender($u, $v->responsavelId)) {
            return null;
        }
        $atendimentos = Atendimento::query()->where('vitrineId', $id)->count();
        $ganhos = Atendimento::query()->where('vitrineId', $id)->where('etapa', 'ganho')->count();
        $vendas = Venda::query()->whereHas('pedido', fn ($q) => $q->where('vitrineId', $id));
        $pedidas = AtendimentoItem::query()->whereHas('atendimento', fn ($q) => $q->where('vitrineId', $id))->groupBy('produtoId')->selectRaw('produtoId, sum(quantidade) as n')->pluck('n', 'produtoId');
        $vendidas = PedidoItem::query()->where('situacao', 'vendido')->whereHas('pedido', fn ($q) => $q->where('vitrineId', $id))->groupBy('produtoId')->selectRaw('produtoId, sum(quantidade) as n')->pluck('n', 'produtoId');

        return [
            'visitas' => $v->visitas, 'atendimentos' => $atendimentos, 'ganhos' => $ganhos, 'perdidos' => Atendimento::query()->where('vitrineId', $id)->where('etapa', 'perdido')->count(),
            'pedidos' => Pedido::query()->where('vitrineId', $id)->count(), 'vendas' => (clone $vendas)->count(),
            'valorAberto' => (float) Pedido::query()->where('vitrineId', $id)->where('status', 'pendente')->sum('total'), 'valorVendido' => (float) (clone $vendas)->sum('valor'),
            'conversao' => $atendimentos ? (int) round($ganhos / $atendimentos * 100) : 0,
            'pecas' => $v->pecas->map(fn ($p) => ['produtoId' => $p->produtoId, 'nome' => $p->produto?->nome ?? 'Peça removida', 'pedidas' => (int) ($pedidas[$p->produtoId] ?? 0), 'vendidas' => (int) ($vendidas[$p->produtoId] ?? 0)])
                ->sort(fn ($a, $b) => [$b['pedidas'], $b['vendidas']] <=> [$a['pedidas'], $a['vendidas']])->values()->all(),
        ];
    }

    // ---------- Público ----------

    /** A vitrine como o público vê. Rascunho só a equipe abre, para conferir; arquivada não abre. */
    public function publica(string $slug, bool $equipe = false): ?array
    {
        $v = Vitrine::query()->with(['pecas' => fn ($q) => $q->orderBy('ordem')->orderBy('id'), 'responsavel:id,name,ativo,numeroPrincipalId', 'responsavel.'.Contato::COM])->where('slug', $slug)->first();
        if (! $v || $v->status->value === 'arquivada' || ($v->status->value === 'rascunho' && ! $equipe)) {
            return null;
        }
        $porId = collect($this->catalogo->lista())->keyBy('id');
        $vale = self::ofertaVale($v->status->value, $v->ofertaAte);
        $contato = Contato::de($v->responsavel, (string) $this->config->get('whatsappLoja'));

        return [
            'id' => $v->id, 'slug' => $v->slug, 'tipo' => $v->tipo->value, 'status' => $v->status->value, 'titulo' => $v->titulo, 'descricao' => $v->descricao,
            'urlInstagram' => $v->urlInstagram, 'inicioPrevisto' => $v->inicioPrevisto?->toIso8601String(), 'ofertaAte' => $vale ? $v->ofertaAte?->toIso8601String() : null,
            'responsavelId' => $v->responsavelId,
            'contato' => ['telefone' => $contato['telefone'], 'nome' => $contato['nome'] ? explode(' ', $contato['nome'])[0] : null],
            'pedidosRecebidos' => Atendimento::query()->where('vitrineId', $v->id)->count(),
            'pecas' => $v->pecas->flatMap(function ($x) use ($porId, $vale) {
                $p = $porId->get($x->produtoId);
                if (! $p) {
                    return [];
                }
                $preco = self::precoQueVale($p['preco'], $x->precoOferta === null ? null : (float) $x->precoOferta, ! $vale);
                $cheio = max($p['precoCheio'], $p['preco']);
                $variantes = collect($p['variantes'])->where('disponivel', '>', 0)->map(fn ($t) => ['id' => $t['id'], 'tamanho' => $t['tamanho'], 'ultimas' => $t['disponivel'] <= self::POUCAS])->values();

                return [[
                    'produtoId' => $p['id'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'cor' => $p['corNome'] ?? $p['cor'], 'categoria' => $p['categoria'],
                    'imagem' => $p['imagens'][0] ?? null, 'imagens' => array_slice($p['imagens'], 0, 6),
                    'descricao' => $p['descricao'], 'composicao' => $p['composicao'], 'destaques' => array_slice($p['destaques'], 0, 6),
                    'video' => $p['videos'][0] ?? null,
                    'preco' => $preco, 'precoCheio' => $cheio, 'desconto' => self::descontoPct($preco, $cheio), 'especial' => $preco < $p['preco'],
                    'variantes' => $variantes->all(),
                    'tamanhos' => array_map(fn ($t) => ['tamanho' => $t['tamanho'], 'livre' => $t['disponivel'] > 0], $p['variantes']),
                    'ultimas' => $variantes->isNotEmpty() && $variantes->every(fn ($t) => $t['ultimas']),
                ]];
            })->values()->all(),
        ];
    }

    /** A página da bio: a live no ar ou a próxima, e as publicações ativas. */
    public function publicas(): array
    {
        $lista = Vitrine::query()->whereIn('status', self::ATIVOS)->with(['pecas' => fn ($q) => $q->orderBy('ordem')->orderBy('id')])
            ->orderByRaw('inicioPrevisto is null, inicioPrevisto')->orderByDesc('criadoEm')->take(50)->get();
        $porId = collect($this->catalogo->lista())->keyBy('id');
        $comFoto = $lista->map(function (Vitrine $v) use ($porId) {
            $vale = self::ofertaVale($v->status->value, $v->ofertaAte);
            $pecas = $v->pecas->filter(fn ($p) => $porId->has($p->produtoId))->map(fn ($p) => ['c' => $porId[$p->produtoId], 'oferta' => $p->precoOferta === null ? null : (float) $p->precoOferta])->values();
            $precos = $pecas->map(fn ($x) => ['preco' => self::precoQueVale($x['c']['preco'], $x['oferta'], ! $vale), 'cheio' => max($x['c']['precoCheio'], $x['c']['preco'])]);
            $fotos = $pecas->map(fn ($x) => $x['c']['imagens'][0] ?? null)->filter()->values();

            return [
                'slug' => $v->slug, 'tipo' => $v->tipo->value, 'status' => $v->status->value, 'titulo' => $v->titulo, 'descricao' => $v->descricao,
                'inicioPrevisto' => $v->inicioPrevisto?->toIso8601String(), 'urlInstagram' => $v->urlInstagram, 'ofertaAte' => $vale ? $v->ofertaAte?->toIso8601String() : null,
                'pecas' => $pecas->count(), 'imagem' => $fotos[0] ?? null, 'imagens' => $fotos->take(3)->all(),
                'aPartirDe' => $precos->isEmpty() ? null : $precos->min('preco'),
                'descontoMax' => (int) $precos->reduce(fn ($m, $p) => max($m, self::descontoPct($p['preco'], $p['cheio'])), 0),
            ];
        })->filter(fn ($v) => $v['pecas'] > 0)->values();

        return [
            'noAr' => $comFoto->firstWhere('status', 'no_ar'),
            'proximas' => $comFoto->where('status', 'agendada')->values()->all(),
            'publicadas' => $comFoto->where('status', 'publicada')->values()->all(),
        ];
    }

    /** Para onde /live leva: a live no ar; senão, a próxima agendada; senão, /vitrines. */
    public function destinoDaLive(): string
    {
        $slug = Vitrine::query()->where('tipo', 'live')->where('status', 'no_ar')->value('slug')
            ?? Vitrine::query()->where('tipo', 'live')->where('status', 'agendada')->orderBy('inicioPrevisto')->value('slug');

        return $slug ? '/vitrine/'.rawurlencode($slug) : '/vitrines';
    }
}
