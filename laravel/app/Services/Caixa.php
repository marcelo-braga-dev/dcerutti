<?php

namespace App\Services;

use App\Enums\Papel;
use App\Exceptions\ErroCaixa;
use App\Exceptions\ErroNegocio;
use App\Models\Cliente;
use App\Models\Pagamento;
use App\Models\User;
use App\Models\Venda;
use App\Services\Cupons\AvaliadorDeCupom;
use App\Services\Cupons\CupomNoPedido;
use App\Services\Pedidos\Pedidos;
use App\Support\CalculoCaixa;
use App\Support\Cpf;
use App\Support\Dinheiro;
use App\Support\Escopo;
use App\Support\Telefone;
use Illuminate\Support\Facades\DB;

/**
 * Caixa da loja física (D-23, docs/22-caixa.md; src/server/acoes/caixa.ts). Tudo o que a tela calcula é conferido de
 * novo: preços do catálogo, limite de desconto do vendedor, cupom, parcelas e a soma dos pagamentos. A venda entra
 * confirmada (baixa o estoque, grava o custo e conta na meta), com origem `balcao`.
 */
class Caixa
{
    public const CONSUMIDOR_EMAIL = 'consumidor-final@dcerutti.local';

    public function __construct(private Catalogo $catalogo, private Config $config, private Pedidos $pedidos, private CupomNoPedido $cupons, private Equipe $equipe) {}

    /** Ficha "Consumidor final" para vendas sem identificar a cliente. Telefone vazio: fica fora das listas de clientes. */
    public function consumidorFinal(): Cliente
    {
        $ja = Cliente::query()->where('email', self::CONSUMIDOR_EMAIL)->whereNull('userId')->first(['id', 'nome']);
        if ($ja) {
            return $ja;
        }
        $vendedor = User::query()->where('papel', Papel::Vendedor)->where('ativo', true)->orderBy('createdAt')->value('id');
        if (! $vendedor) {
            throw new ErroNegocio('Cadastre um vendedor antes de usar o caixa.');
        }

        return Cliente::query()->create(['nome' => 'Consumidor final', 'telefone' => '', 'email' => self::CONSUMIDOR_EMAIL, 'vendedorId' => $vendedor]);
    }

    /** @return array{id: string, nome: string, telefone: string, vendedor: string} */
    public static function clienteCaixa(Cliente $c): array
    {
        return ['id' => $c->id, 'nome' => $c->nome, 'telefone' => $c->telefone, 'vendedor' => $c->vendedor?->name ?? ''];
    }

    /**
     * Busca da cliente: nome, final do WhatsApp ou CPF. O vendedor vê as clientes dele; o gestor, todas.
     *
     * @return list<array{id: string, nome: string, telefone: string, vendedor: string}>
     */
    public function buscarClientes(User $u, string $termo): array
    {
        $q = mb_substr(trim($termo), 0, 60);
        if (mb_strlen($q) < 2) {
            return [];
        }
        $digitos = Telefone::digitos($q);
        $r = Escopo::vendedor(Cliente::query(), $u)->where('telefone', '<>', '')
            ->where(function ($w) use ($q, $digitos) {
                $w->where('nome', 'like', '%'.addcslashes($q, '%_').'%');
                if (strlen($digitos) >= 4) {
                    $w->orWhere('telefone', 'like', '%'.substr($digitos, -4).'%');
                }
                if (strlen($digitos) === 11) {
                    $w->orWhere('cpf', Cpf::formatar($digitos));
                }
            })->with('vendedor:id,name')->orderBy('nome')->take(8)->get(['id', 'nome', 'telefone', 'cpf', 'vendedorId']);

        return $r->filter(fn ($c) => strlen($digitos) < 4 || str_contains(Telefone::digitos($c->telefone), $digitos) || Telefone::digitos($c->cpf) === $digitos || str_contains(mb_strtolower($c->nome), mb_strtolower($q)))
            ->map(self::clienteCaixa(...))->values()->all();
    }

    /**
     * Cadastro rápido no balcão. WhatsApp ou CPF que já é de uma cliente devolve a ficha dela (se puder ver).
     *
     * @return array{cliente: array<string, string>, existente: bool}
     */
    public function cadastrarCliente(User $u, string $nome, string $telefone, ?string $cpf, ?string $vendedorId): array
    {
        $nome = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $nome)), 0, 120);
        if (mb_strlen($nome) < 3) {
            throw new ErroNegocio('Informe o nome da cliente.');
        }
        if (! Telefone::celularValido($telefone)) {
            throw new ErroNegocio('Informe o WhatsApp com DDD, ex.: (49) 99999-9999.');
        }
        $telefone = Telefone::formatar($telefone);
        $cpfFormatado = null;
        if (Telefone::digitos($cpf) !== '') {
            if (! Cpf::valido($cpf)) {
                throw new ErroNegocio('CPF inválido. Confira os 11 números, ou deixe em branco.');
            }
            $cpfFormatado = Cpf::formatar($cpf);
        }
        $existente = Cliente::query()->whereIn('telefone', [$telefone, Telefone::digitos($telefone)])->with('vendedor:id,name')->first();
        if ($existente) {
            if (! Escopo::podeAcessar($u, $existente->vendedorId)) {
                throw new ErroNegocio("Este WhatsApp já é cliente de {$existente->vendedor->name}. Peça ao gestor, ou venda sem identificar.");
            }

            return ['cliente' => self::clienteCaixa($existente), 'existente' => true];
        }
        if ($cpfFormatado) {
            $dono = Cliente::query()->where('cpf', $cpfFormatado)->with('vendedor:id,name')->first();
            if ($dono) {
                if (! Escopo::podeAcessar($u, $dono->vendedorId)) {
                    throw new ErroNegocio("Este CPF já é cliente de {$dono->vendedor->name}. Peça ao gestor, ou venda sem identificar.");
                }

                return ['cliente' => self::clienteCaixa($dono), 'existente' => true];
            }
        }
        $vendedor = $u->papel === Papel::Vendedor ? $u->id : $this->vendedorValido($vendedorId);
        if (! $vendedor) {
            throw new ErroNegocio('Escolha quem está vendendo antes de cadastrar a cliente.');
        }
        $c = Cliente::query()->create(['nome' => $nome, 'telefone' => $telefone, 'cpf' => $cpfFormatado, 'vendedorId' => $vendedor])->load('vendedor:id,name');
        $this->equipe->registrar($u->id, 'cliente_cadastrado', ['clienteId' => $c->id, 'descricao' => "{$c->nome} · no caixa"]);

        return ['cliente' => self::clienteCaixa($c), 'existente' => false];
    }

    private function vendedorValido(?string $id): ?string
    {
        return $id ? User::query()->whereKey($id)->where('papel', Papel::Vendedor)->where('ativo', true)->value('id') : null;
    }

    /**
     * Preços do catálogo para as linhas, já com o desconto do vendedor; recusa o que saiu do catálogo.
     *
     * @param  list<array{varianteId: int, quantidade: int, precoCombinado?: ?float}>  $linhas
     * @param  ?array{tipo: string, valor: float}  $geral
     * @return array{calc: array<string, mixed>, porVariante: array<int, array{preco: float, produtoId: int}>}
     */
    private function montarVenda(array $linhas, ?array $geral): array
    {
        $porVariante = [];
        foreach ($this->catalogo->lista() as $p) {
            foreach ($p['variantes'] as $v) {
                $porVariante[$v['id']] = ['preco' => $p['preco'], 'produtoId' => $p['id']];
            }
        }
        foreach ($linhas as $l) {
            if (! isset($porVariante[$l['varianteId']])) {
                throw new ErroNegocio('Uma peça da venda saiu do catálogo. Tire da venda e tente de novo.');
            }
        }
        $calc = CalculoCaixa::venda(array_map(fn ($l) => [
            'varianteId' => $l['varianteId'], 'quantidade' => $l['quantidade'], 'preco' => $porVariante[$l['varianteId']]['preco'], 'precoCombinado' => $l['precoCombinado'] ?? null,
        ], $linhas), $geral);

        return ['calc' => $calc, 'porVariante' => $porVariante];
    }

    private function bloqueioDoCupom(User $u): ?string
    {
        if (! $this->config->get('cupons.ligados')) {
            return 'Os cupons estão desligados em Configurações.';
        }

        return $u->papel === Papel::Vendedor && ! $this->config->get('cupons.vendedorAplica') ? 'A loja não liberou vendedores para aplicar cupons.' : null;
    }

    /**
     * Prévia do cupom, sobre os preços já com o desconto do vendedor (o cupom vem depois, P-11).
     *
     * @param  list<array<string, mixed>>  $linhas
     * @return array{codigo: string, desconto: float, regra: string}
     */
    public function previaCupom(User $u, string $codigo, ?string $clienteId, array $linhas, ?array $geral): array
    {
        if ($b = $this->bloqueioDoCupom($u)) {
            throw new ErroNegocio($b);
        }
        $cupom = $this->cupons->buscar($codigo);
        if (! $cupom) {
            throw new ErroNegocio('Cupom não encontrado.');
        }
        ['calc' => $calc, 'porVariante' => $porVariante] = $this->montarVenda($linhas, $geral);
        $clienteId = $clienteId ?: $this->consumidorFinal()->id;
        $pecas = $this->cupons->pecas(array_map(fn ($l) => [
            'chave' => $l['varianteId'], 'produtoId' => $porVariante[$l['varianteId']]['produtoId'], 'preco' => $calc['precos'][$l['varianteId']], 'quantidade' => $l['quantidade'],
        ], $linhas));
        $r = AvaliadorDeCupom::avaliar(CupomNoPedido::regraDe($cupom), $pecas, ['agora' => now(), 'quem' => 'equipe', 'clienteId' => $clienteId, 'tipoPedido' => 'balcao', ...$this->cupons->contexto($cupom->id, $clienteId)]);
        if (! $r['ok']) {
            throw new ErroNegocio($r['mensagem']);
        }

        return ['codigo' => $cupom->codigo, 'desconto' => $r['desconto'], 'regra' => AvaliadorDeCupom::regraEmPalavras(CupomNoPedido::regraDe($cupom), CupomNoPedido::nomesDosAlvos($cupom))];
    }

    /**
     * Registra a venda do balcão: cria o pedido com os preços combinados, aplica o cupom, confere os pagamentos,
     * confirma e grava os pagamentos. Pagamento que não fecha o total cancela o pedido antes de confirmar.
     *
     * @param  array{linhas: list<array<string, mixed>>, descontoGeral?: ?array, clienteId?: ?string, cupom?: ?string, pagamentos: list<array<string, mixed>>, vendedorId?: ?string, observacao?: ?string}  $d
     * @return array<string, mixed>
     */
    public function registrarVenda(User $u, array $d): array
    {
        $gestor = $u->ehGestor();
        ['calc' => $calc] = $this->montarVenda($d['linhas'], $d['descontoGeral'] ?? null);
        $limite = (float) $this->config->get('caixa.descontoMaxVendedor');
        if (! CalculoCaixa::dentroDoLimite($calc['descontoParte'], $limite, $gestor)) {
            throw new ErroNegocio('Desconto acima de '.rtrim(rtrim(number_format($limite, 2, ',', ''), '0'), ',').'%: só o gestor pode registrar.');
        }
        $parcelasMax = (int) $this->config->get('caixa.parcelasMax');
        foreach ($d['pagamentos'] as $p) {
            if ($p['forma'] === 'credito' && ($p['parcelas'] ?? 1) > $parcelasMax) {
                throw new ErroNegocio("O crédito vai até {$parcelasMax}x.");
            }
        }
        $codigoCupom = trim((string) ($d['cupom'] ?? ''));
        if ($codigoCupom !== '' && ($b = $this->bloqueioDoCupom($u))) {
            throw new ErroNegocio($b);
        }
        $cliente = null;
        if (! empty($d['clienteId'])) {
            $cliente = Cliente::query()->find($d['clienteId'], ['id', 'nome', 'telefone', 'vendedorId']);
            if (! $cliente || ! $cliente->telefone || ! Escopo::podeAcessar($u, $cliente->vendedorId)) {
                throw new ErroNegocio('Cliente não encontrada. Busque de novo ou venda sem identificar.');
            }
        }
        $ficha = $cliente ?? $this->consumidorFinal();
        $vendedorId = $u->papel === Papel::Vendedor ? $u->id : ($this->vendedorValido($d['vendedorId'] ?? null) ?? $cliente?->vendedorId);
        if (! $vendedorId) {
            throw new ErroNegocio('Escolha quem fez a venda (Vendido por).');
        }
        $p = $this->pedidos->criar([
            'tipo' => 'compra', 'origem' => 'balcao', 'clienteId' => $ficha->id, 'vendedorId' => $vendedorId, 'nomeCliente' => $ficha->nome, 'telefoneCliente' => $cliente?->telefone ?? '',
            'linhas' => array_map(fn ($l) => ['varianteId' => $l['varianteId'], 'quantidade' => $l['quantidade']], $d['linhas']), 'usuarioId' => $u->id, 'precos' => $calc['precos'],
            'cupom' => $codigoCupom !== '' ? ['codigo' => $codigoCupom, 'quem' => 'equipe'] : null,
        ]);
        $total = round($p['total'], 2);
        $conferido = CalculoCaixa::conferirPagamentos($d['pagamentos'], $total);
        if (! $conferido['ok']) {
            rescue(fn () => $this->pedidos->cancelar($p['id'], 'equipe', $u->id, 'Caixa: pagamento não conferiu com o total'));
            throw new ErroCaixa('O total da venda é '.Dinheiro::brl($total).' e os pagamentos somam '.Dinheiro::brl($conferido['pago']).'. Ajuste e cobre de novo.', $total);
        }
        try {
            $this->pedidos->confirmar($p['id'], [], $u->id);
        } catch (\Throwable $e) {
            rescue(fn () => $this->pedidos->cancelar($p['id'], 'equipe', $u->id, 'Caixa: a confirmação falhou'));
            throw $e;
        }
        DB::transaction(function () use ($d, $p) {
            foreach ($d['pagamentos'] as $x) {
                Pagamento::query()->create([
                    'pedidoId' => $p['id'], 'forma' => $x['forma'], 'valor' => $x['valor'],
                    'parcelas' => $x['forma'] === 'credito' ? ($x['parcelas'] ?? 1) : null, 'recebido' => $x['forma'] === 'dinheiro' ? ($x['recebido'] ?? null) : null,
                ]);
            }
            Venda::query()->where('pedidoId', $p['id'])->update(['observacao' => ($d['observacao'] ?? '') ?: 'Caixa da loja']);
        });
        $nomeVendedor = User::query()->whereKey($vendedorId)->value('name') ?? $u->name;
        $this->equipe->registrar($u->id, 'venda_caixa', [
            'clienteId' => $cliente?->id, 'pedidoId' => $p['id'], 'valor' => $total,
            'descricao' => implode(' · ', array_filter([$cliente?->nome ?? 'Consumidor final', $p['codigo'], implode(' + ', array_column($d['pagamentos'], 'forma')), $vendedorId !== $u->id ? "vendida por {$nomeVendedor}" : null])),
        ]);

        return [
            'ok' => true, 'pedidoId' => $p['id'], 'codigo' => $p['codigo'], 'total' => $total, 'troco' => $conferido['troco'], 'telefone' => $cliente?->telefone, 'nomeCliente' => $cliente?->nome,
            // O que o comprovante precisa (a tela monta o texto com resources/js/lib/caixa.ts).
            'nomeVendedor' => $nomeVendedor, 'subtotal' => $calc['subtotal'], 'desconto' => $calc['desconto'],
            'itens' => array_map(fn ($i) => ['nome' => $i['nome'], 'tamanho' => $i['tamanho'], 'quantidade' => $i['quantidade'], 'preco' => $i['preco']], $p['itens']),
            'cupom' => $p['cupom'] && ! $p['cupom']['freteGratis'] ? ['codigo' => $p['cupom']['codigo'], 'desconto' => $p['cupom']['desconto']] : null,
            'pagamentos' => $d['pagamentos'],
        ];
    }
}
