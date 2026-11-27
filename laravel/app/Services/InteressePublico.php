<?php

namespace App\Services;

use App\Enums\TipoNotificacao;
use App\Models\User;
use App\Support\Contato;
use App\Support\Dinheiro;
use App\Support\Links;
use App\Support\Telefone;
use Illuminate\Support\Facades\RateLimiter;

use function Illuminate\Support\defer;

/**
 * Pedidos públicos sem login (docs/26, D-32; porta de acoes/peca.ts, acoes/vitrines.ts, interesse.ts e
 * consultas/peca-publica.ts): link da peça ("Quero esta peça") e formulário da vitrine. Só registram um atendimento,
 * nunca ficha, pedido ou reserva, e a resposta é a mesma para qualquer telefone: o WhatsApp que abre é sempre o de
 * quem enviou o link (ou da responsável pela vitrine).
 */
class InteressePublico
{
    private const POR_IP = [10, 15 * 60];

    private const POR_TELEFONE = [5, 60 * 60];

    private const POUCAS = 2;

    public function __construct(private Catalogo $catalogo, private Config $config, private Atendimentos $atendimentos, private Vitrines $vitrines, private Notificacoes $notificacoes, private Equipe $equipe) {}

    /** Peça para o link público: lista branca de campos. Nunca custo, estoque exato, código interno ou dados de cliente. */
    public function peca(string $chave): ?array
    {
        $dados = Links::dadosDaChavePeca($chave);
        $p = $dados ? $this->catalogo->porReferencia($dados['referencia']) : null;
        if (! $p) {
            return null;
        }
        $vendedor = User::query()->whereKey($dados['vendedorId'])->whereIn('papel', ['vendedor', 'gestor'])->with(Contato::COM)->first(['id', 'name', 'ativo', 'numeroPrincipalId']);
        $contato = Contato::de($vendedor, (string) $this->config->get('whatsappLoja'));
        $refs = collect($this->catalogo->lista())->pluck('referencia')->flip();

        return [
            'produtoId' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'categoria' => $p['categoria'], 'cor' => $p['corNome'] ?? $p['cor'],
            'descricao' => $p['descricao'], 'composicao' => $p['composicao'], 'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'], 'imagens' => $p['imagens'], 'videos' => $p['videos'],
            'vendedorId' => $dados['vendedorId'],
            'variantes' => collect($p['variantes'])->where('disponivel', '>', 0)->map(fn ($v) => ['id' => $v['id'], 'tamanho' => $v['tamanho'], 'ultimas' => $v['disponivel'] <= self::POUCAS])->values()->all(),
            'tamanhos' => array_map(fn ($v) => ['tamanho' => $v['tamanho'], 'livre' => $v['disponivel'] > 0], $p['variantes']),
            'destaques' => array_slice($p['destaques'], 0, 6),
            'cores' => collect($p['cores'] ?? [])->filter(fn ($c) => $c['referencia'] !== $p['referencia'] && $c['disponivel'] && $refs->has($c['referencia']))
                ->map(fn ($c) => ['cor' => $c['cor'], 'imagem' => $c['imagem'], 'chave' => Links::chaveDaPeca($c['referencia'], $dados['vendedorId'])])->values()->all(),
            'contato' => ['telefone' => $contato['telefone'], 'nome' => $contato['nome'] ? explode(' ', $contato['nome'])[0] : null],
        ];
    }

    /** Nome, WhatsApp e aceite. @param array<string, mixed> $e @return array{nome: string, telefone: string}|string */
    private static function contato(array $e): array|string
    {
        $nome = trim((string) ($e['nome'] ?? ''));
        if (mb_strlen($nome) < 2) {
            return 'Informe seu nome.';
        }
        if (mb_strlen($nome) > 120) {
            return 'Nome longo demais.';
        }
        if (! Telefone::celularValido((string) ($e['telefone'] ?? ''))) {
            return 'Informe o WhatsApp com DDD e 9 dígitos.';
        }
        if (($e['aceite'] ?? false) !== true) {
            return 'Para continuar, aceite o contato da loja.';
        }

        return ['nome' => $nome, 'telefone' => Telefone::digitos($e['telefone'])];
    }

    /** Conta o envio e devolve a mensagem se passou do limite. O pedido público não mexe em estoque, mas não pode encher a fila. */
    private static function barrar(string $telefone, ?string $ip): ?string
    {
        $chaveIp = 'interesse:ip:'.($ip ?? '?');
        $chaveTel = "interesse:tel:{$telefone}";
        if (RateLimiter::tooManyAttempts($chaveIp, self::POR_IP[0]) || RateLimiter::tooManyAttempts($chaveTel, self::POR_TELEFONE[0])) {
            return 'Muitos pedidos em pouco tempo. Tente de novo mais tarde ou chame a loja no WhatsApp.';
        }
        RateLimiter::hit($chaveIp, self::POR_IP[1]);
        RateLimiter::hit($chaveTel, self::POR_TELEFONE[1]);

        return null;
    }

    /**
     * "Quero esta peça".
     *
     * @param  array<string, mixed>  $e
     * @return array{ok: true, telefone: string, texto: string, destinatario: string}|array{ok: false, erro: string}
     */
    public function quererPeca(string $chave, array $e, ?string $ip): array
    {
        $p = $this->peca($chave);
        if (! $p) {
            return ['ok' => false, 'erro' => 'Esta peça não está mais disponível.'];
        }
        $c = self::contato($e);
        if (is_string($c)) {
            return ['ok' => false, 'erro' => $c];
        }
        $destinatario = $p['contato']['nome'] ?? 'a loja';
        $variante = collect($p['variantes'])->firstWhere('id', (int) ($e['varianteId'] ?? 0));
        if (! $variante) {
            return ['ok' => false, 'erro' => 'Este tamanho acabou. Escolha outro.'];
        }
        $descricao = "{$p['nome']}, tam. {$variante['tamanho']}";
        $quem = $p['contato']['nome'];
        $texto = fn (?string $codigo) => 'Oi'.($quem ? ", {$quem}" : '')."! Quero esta peça: {$descricao}.".($codigo ? " ({$codigo})" : '');
        $resposta = fn (?string $codigo) => ['ok' => true, 'telefone' => $p['contato']['telefone'], 'texto' => $texto($codigo), 'destinatario' => $destinatario];

        if (! empty($e['site'])) {
            return $resposta(null);
        }
        if ($bloqueado = self::barrar($c['telefone'], $ip)) {
            return ['ok' => false, 'erro' => $bloqueado];
        }
        $a = $this->atendimentos->registrarInteressePublico([
            'nome' => $c['nome'], 'telefone' => $c['telefone'], 'canal' => 'link_peca', 'origemId' => $p['vendedorId'], 'ofertas' => ($e['ofertas'] ?? false) === true,
            'itens' => [['varianteId' => $variante['id'], 'produtoId' => $p['produtoId'], 'descricao' => $descricao]],
        ]);
        if ($a['responsavelId']) {
            defer(fn () => $this->notificacoes->notificar([$a['responsavelId']], TipoNotificacao::AtendimentoNovo, "Pedido pelo link: {$p['nome']}", "{$a['codigo']}. Chame a cliente pelo WhatsApp.", "/painel/atendimento/{$a['id']}", "quero:{$a['id']}:{$variante['id']}"));
        }

        return $resposta($a['codigo']);
    }

    /**
     * Formulário público da vitrine. As peças e os preços vêm do servidor.
     *
     * @param  array<string, mixed>  $e
     * @return array{ok: true, telefone: string, texto: string, destinatario: string}|array{ok: false, erro: string}
     */
    public function quererDaVitrine(string $slug, array $e, ?string $ip): array
    {
        $v = $this->vitrines->publica($slug);
        if (! $v || ! in_array($v['status'], Vitrines::ATIVOS, true)) {
            return ['ok' => false, 'erro' => 'Esta vitrine não está mais aberta. Fale com a loja.'];
        }
        $c = self::contato($e);
        if (is_string($c)) {
            return ['ok' => false, 'erro' => $c];
        }
        $ids = array_values(array_unique(array_map('intval', array_filter((array) ($e['variantes'] ?? []), 'is_numeric'))));
        if (! $ids) {
            return ['ok' => false, 'erro' => 'Escolha pelo menos uma peça.'];
        }
        if (count($ids) > 20) {
            return ['ok' => false, 'erro' => 'Peças demais de uma vez.'];
        }
        $itens = [];
        foreach ($ids as $id) {
            foreach ($v['pecas'] as $p) {
                $t = collect($p['variantes'])->firstWhere('id', $id);
                if ($t) {
                    $itens[] = ['varianteId' => $id, 'produtoId' => $p['produtoId'], 'descricao' => "{$p['nome']}, tam. {$t['tamanho']}"];
                    break;
                }
            }
        }
        if (count($itens) !== count($ids)) {
            return ['ok' => false, 'erro' => 'Uma das peças acabou. Confira e tente de novo.'];
        }
        $quem = $v['contato']['nome'];
        $lista = implode('; ', array_column($itens, 'descricao'));
        $resposta = fn (?string $codigo) => [
            'ok' => true, 'telefone' => $v['contato']['telefone'], 'destinatario' => $quem ?? 'a loja',
            'texto' => 'Oi'.($quem ? ", {$quem}" : '')."! Vi \"{$v['titulo']}\" e quero: {$lista}.".($codigo ? " ({$codigo})" : ''),
        ];

        if (! empty($e['site'])) {
            return $resposta(null);
        }
        if ($bloqueado = self::barrar($c['telefone'], $ip)) {
            return ['ok' => false, 'erro' => $bloqueado];
        }
        $a = $this->atendimentos->registrarInteressePublico([
            'nome' => $c['nome'], 'telefone' => $c['telefone'], 'itens' => $itens, 'canal' => $v['tipo'] === 'live' ? 'live' : 'vitrine',
            'vitrineId' => $v['id'], 'origemId' => $v['responsavelId'], 'ofertas' => ($e['ofertas'] ?? false) === true,
        ]);
        if ($a['responsavelId']) {
            defer(fn () => $this->notificacoes->notificar([$a['responsavelId']], TipoNotificacao::AtendimentoNovo, mb_substr("Pedido pela vitrine: {$v['titulo']}", 0, 140), "{$a['codigo']}. Chame a cliente pelo WhatsApp.", "/painel/atendimento/{$a['id']}", mb_substr("vitrine:{$a['id']}:".implode('-', $ids), 0, 100)));
        }

        return $resposta($a['codigo']);
    }

    /** Painel: o link assinado de quem está enviando, o texto pronto e os arquivos para compartilhar. */
    public function prepararEnvio(User $u, string $referencia, string $site): ?array
    {
        $p = $this->catalogo->porReferencia(mb_substr($referencia, 0, 20));
        if (! $p) {
            return null;
        }
        $link = Links::daPeca($site, $p['referencia'], $u->id);
        $tamanhos = collect($p['variantes'])->where('disponivel', '>', 0)->pluck('tamanho')->all();
        $texto = implode("\n", array_filter(["*{$p['nome']}*", Dinheiro::brl($p['preco']), $tamanhos ? 'Tamanhos: '.implode(', ', $tamanhos) : null, "Veja as fotos: {$link}"]));

        return [
            'referencia' => $p['referencia'], 'produtoId' => $p['id'], 'nome' => $p['nome'], 'preco' => $p['preco'], 'link' => $link, 'texto' => $texto,
            'fotos' => $p['imagens'], 'videos' => array_column($p['videos'], 'url'), 'semEstoque' => ! $tamanhos,
        ];
    }

    /** Painel: a peça foi enviada (link, texto ou arquivo). Sem API, é o que dá para medir. */
    public function avisarEnvio(User $u, string $referencia, ?string $atendimentoId): void
    {
        $p = $this->catalogo->porReferencia(mb_substr($referencia, 0, 20));
        if (! $p) {
            return;
        }
        if ($atendimentoId) {
            rescue(fn () => $this->atendimentos->registrarEnvioDePeca($u, $atendimentoId, $p['nome']), report: false);
        }
        defer(fn () => $this->equipe->registrar($u->id, 'peca_enviada', ['descricao' => "{$p['nome']} · {$p['referencia']}"]));
    }
}
