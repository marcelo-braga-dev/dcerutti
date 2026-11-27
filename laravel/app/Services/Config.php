<?php

namespace App\Services;

use App\Models\Configuracao;
use Illuminate\Support\Facades\Log;

/**
 * Configurações da loja (tabela `configuracao`, uma linha por chave com valor JSON); porta de src/server/config.ts.
 * Valor salvo que não confere com o formato do padrão é ignorado e vale o padrão: a loja não quebra por um JSON torto.
 * Lido uma vez por requisição (registrado como `scoped` no container).
 */
class Config
{
    public const PADRAO = [
        'whatsappLoja' => '49988036499',
        'cepsCondicional' => ['89874-000'],
        'cidadeCondicional' => 'Maravilha/SC',
        'frete' => null,
        'parcelas' => 0,
        'diasExpiracao' => 7,
        'catalogoPublico' => false,
        'vendedorPadraoId' => '',
        'cupons' => ['ligados' => false, 'vendedorAplica' => true],
        'proximaCompra' => ['minimoParaGerar' => 150, 'diasParaComecar' => 1, 'diasValidade' => 60, 'geraComCupom' => false, 'acumula' => false],
        'historico' => ['ligado' => true, 'avisarSacola' => true, 'horasSacola' => 24],
        'atendimento' => ['ligado' => false, 'diasPosVenda' => ['entrega' => 1, 'satisfacao' => 7, 'sugestao' => 30, 'reativacao' => 90]],
        'vitrines' => ['ligadas' => false],
        'instagramLoja' => 'dcerutti_',
        'caixa' => ['descontoMaxVendedor' => 10, 'parcelasMax' => 6],
        'identidade' => ['cores' => [], 'logo' => null, 'logoClara' => null, 'favicon' => null],
        'inicio' => ['textos' => [], 'imagens' => [], 'links' => [], 'ocultas' => []],
        'fornecedores' => [],
        'pagamentoOnline' => [
            'ligado' => false, 'pix' => true, 'cartao' => true, 'pagarNaSacola' => false, 'confirmarAoPagar' => true,
            'minutosPix' => 30, 'minutosCheckout' => 60, 'parcelasMax' => 6, 'parcelasSemJuros' => 1, 'quemEstorna' => 'gestor',
        ],
    ];

    public const NOME_PADRAO = 'D’Cerutti';

    public const SLOGAN_PADRAO = 'O básico aconchego';

    /** Chaves com conteúdo livre (dicionários): aceitas como vieram, se forem objeto ou lista. */
    private const LIVRES = ['fornecedores', 'identidade.cores', 'inicio.textos', 'inicio.imagens', 'inicio.links', 'inicio.ocultas'];

    /** @var array<string, mixed>|null */
    private ?array $valores = null;

    /** @return array<string, mixed> */
    public function todas(): array
    {
        if ($this->valores !== null) {
            return $this->valores;
        }
        $valores = self::PADRAO;
        foreach (Configuracao::all() as $linha) {
            if (! array_key_exists($linha->chave, self::PADRAO)) {
                continue;
            }
            $lido = $this->conferir($linha->chave, self::PADRAO[$linha->chave], $linha->valor);
            if ($lido === null && self::PADRAO[$linha->chave] !== null && $linha->valor !== null) {
                Log::warning("Configuração \"{$linha->chave}\" inválida no banco; usando o padrão.");

                continue;
            }
            $valores[$linha->chave] = $lido;
        }

        return $this->valores = $valores;
    }

    public function get(string $chave): mixed
    {
        return data_get($this->todas(), $chave);
    }

    /** @param array<string, mixed> $parcial */
    public function salvar(array $parcial): void
    {
        foreach ($parcial as $chave => $valor) {
            Configuracao::query()->updateOrCreate(['chave' => $chave], ['valor' => $valor]);
        }
        $this->valores = null;
    }

    /** @return array{nome: string, slogan: string|null} */
    public function nomeDaLoja(): array
    {
        $id = $this->get('identidade');

        return ['nome' => ($id['nome'] ?? '') ?: self::NOME_PADRAO, 'slogan' => array_key_exists('slogan', $id) ? $id['slogan'] : self::SLOGAN_PADRAO];
    }

    /** Mesmo formato do padrão (tipos e chaves); objetos são completados com o padrão. */
    private function conferir(string $caminho, mixed $padrao, mixed $valor): mixed
    {
        if (in_array($caminho, self::LIVRES, true)) {
            return is_array($valor) ? $valor : null;
        }
        if ($caminho === 'frete') {
            return is_array($valor) && is_numeric($valor['valor'] ?? null) && is_numeric($valor['gratisAcima'] ?? null) ? ['valor' => (float) $valor['valor'], 'gratisAcima' => (float) $valor['gratisAcima']] : null;
        }
        if ($caminho === 'whatsappLoja') {
            return is_string($valor) && preg_match('/^\d{10,13}$/', $valor) ? $valor : null;
        }
        if (is_array($padrao) && array_is_list($padrao)) {
            return is_array($valor) && array_is_list($valor) ? $valor : null;
        }
        if (is_array($padrao) || $padrao === null && is_array($valor)) {
            if (! is_array($valor)) {
                return null;
            }
            $saida = $padrao ?? [];
            foreach ($valor as $k => $v) {
                if (! is_array($padrao) || ! array_key_exists($k, $padrao)) {
                    $saida[$k] = $v;

                    continue;
                }
                $ok = $this->conferir("{$caminho}.{$k}", $padrao[$k], $v);
                if ($ok !== null || $padrao[$k] === null) {
                    $saida[$k] = $ok;
                }
            }

            return $saida;
        }
        if (is_bool($padrao)) {
            return is_bool($valor) ? $valor : null;
        }
        if (is_int($padrao) || is_float($padrao)) {
            return is_int($valor) || is_float($valor) ? $valor : null;
        }
        if (is_string($padrao)) {
            return is_string($valor) ? $valor : null;
        }

        return $valor;
    }
}
