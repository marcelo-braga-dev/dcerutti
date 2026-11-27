<?php

namespace App\Http\Controllers\Painel;

use App\Exceptions\ErroNegocio;
use App\Http\Controllers\Controller;
use App\Queries\Equipe as ConsultasEquipe;
use App\Services\Arquivos;
use App\Services\Config;
use App\Support\Dinheiro;
use App\Support\Instagram;
use App\Support\Telefone;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Configurações e identidade visual da loja, só o gestor (porta de painel/configuracoes, painel/identidade, acoes/gestao.ts e acoes/identidade.ts). */
class LojaController extends Controller
{
    private const TOKENS = ['marrom-950', 'caramelo', 'creme', 'card', 'marrom-900', 'oliva', 'imperdivel', 'suave', 'vermelho', 'areia', 'bege', 'borda', 'borda-forte', 'marrom-700'];

    private const CORES_PADRAO = [
        'marrom-950' => '#2e2520', 'caramelo' => '#6d402a', 'creme' => '#f6f2ec', 'card' => '#fffdf9', 'marrom-900' => '#3a2e27', 'oliva' => '#5e6b43', 'imperdivel' => '#e3261b',
        'suave' => '#76685d', 'vermelho' => '#b8462f', 'areia' => '#ddcdb3', 'bege' => '#efe4d6', 'borda' => '#e6dccd', 'borda-forte' => '#cfc2b2', 'marrom-700' => '#4a2b1c',
    ];

    private const ARQUIVOS = ['logo' => 'logo', 'logoClara' => 'logo para fundo escuro', 'favicon' => 'favicon'];

    public function __construct(private Config $config, private Arquivos $arquivos) {}

    public function configuracoes(): Response
    {
        return Inertia::render('Painel/Configuracoes/Index', ['cfg' => $this->config->todas(), 'vendedores' => ConsultasEquipe::vendedoresAtivos()]);
    }

    public function salvarConfiguracoes(Request $request): RedirectResponse
    {
        $erros = [];
        $inteiro = function (string $campo, int $min, int $max, string $msg, bool $opcional = false) use ($request, &$erros): ?int {
            $v = trim((string) $request->input($campo));
            if ($v === '' && $opcional) {
                return null;
            }
            if (! preg_match('/^-?\d+$/', $v) || (int) $v < $min || (int) $v > $max) {
                $erros[$campo] = $msg;

                return null;
            }

            return (int) $v;
        };
        $cidade = trim((string) $request->input('cidadeCondicional'));
        if (mb_strlen($cidade) < 2) {
            $erros['cidadeCondicional'] = 'Informe a cidade.';
        }
        $parcelas = $inteiro('parcelas', 0, 12, 'De 0 a 12.');
        $dias = $inteiro('diasExpiracao', 0, 90, 'De 0 (nunca vence) a 90 dias.');
        $horas = $inteiro('horasSacola', 1, 168, 'De 1 a 168 horas (7 dias).', true);
        $parcelasMax = $inteiro('parcelasMax', 1, 24, 'De 1 a 24.', true);
        $posVenda = [];
        foreach (['entrega' => 'diasEntrega', 'satisfacao' => 'diasSatisfacao', 'sugestao' => 'diasSugestao', 'reativacao' => 'diasReativacao'] as $k => $campo) {
            $posVenda[$k] = $inteiro($campo, 1, 365, 'De 1 a 365 dias.', true);
        }
        $desconto = trim((string) $request->input('descontoMaxVendedor'));
        if ($desconto !== '' && (! is_numeric($desconto) || (float) $desconto < 0 || (float) $desconto > 100)) {
            $erros['descontoMaxVendedor'] = 'De 0 a 100.';
        }
        $insta = trim((string) $request->input('instagramLoja'));
        $instaOk = $insta === '' ? null : Instagram::normalizar($insta);
        if ($insta !== '' && ! $instaOk) {
            $erros['instagramLoja'] = 'Informe um @ válido do Instagram.';
        }
        // C-03: sem "Cobrar frete pelo site", o frete fica a combinar com o vendedor.
        $frete = null;
        if ($request->boolean('cobrarFrete')) {
            $valor = Dinheiro::lerValor((string) $request->input('freteValor'));
            $gratis = trim((string) $request->input('freteGratisAcima')) === '' ? 0 : Dinheiro::lerValor((string) $request->input('freteGratisAcima'));
            if (! (is_finite($valor) && $valor >= 0) || trim((string) $request->input('freteValor')) === '') {
                $erros['freteValor'] = 'Informe o valor do frete.';
            }
            if (! (is_finite($gratis) && $gratis >= 0)) {
                $erros['freteGratisAcima'] = 'Valor inválido (0 = nunca grátis).';
            }
            $frete = ['valor' => $valor, 'gratisAcima' => $gratis];
        }
        $ceps = array_values(array_filter(array_map(fn ($c) => Telefone::formatarCep($c), preg_split('/[\s,;]+/', (string) $request->input('cepsCondicional')) ?: [])));
        if (collect($ceps)->contains(fn ($c) => strlen($c) !== 9)) {
            $erros['cepsCondicional'] = 'Cada CEP precisa ter 8 números.';
        }
        if ($erros) {
            throw ValidationException::withMessages($erros);
        }
        $atual = $this->config->todas();
        $this->config->salvar([
            'cepsCondicional' => $ceps, 'cidadeCondicional' => $cidade, 'frete' => $frete, 'parcelas' => $parcelas, 'diasExpiracao' => $dias,
            'catalogoPublico' => $request->boolean('catalogoPublico'), 'vendedorPadraoId' => (string) $request->input('vendedorPadraoId', ''),
            'cupons' => ['ligados' => $request->boolean('cuponsLigados'), 'vendedorAplica' => $request->boolean('vendedorAplicaCupom')],
            'historico' => ['ligado' => $request->boolean('historicoLigado'), 'avisarSacola' => $request->boolean('avisarSacola'), 'horasSacola' => $horas ?? $atual['historico']['horasSacola']],
            'atendimento' => ['ligado' => $request->boolean('atendimentoLigado'), 'diasPosVenda' => array_map(fn ($k) => $posVenda[$k] ?? $atual['atendimento']['diasPosVenda'][$k], array_combine(array_keys($posVenda), array_keys($posVenda)))],
            'vitrines' => ['ligadas' => $request->boolean('vitrinesLigadas')],
            'instagramLoja' => $instaOk ?? $atual['instagramLoja'],
            'caixa' => ['descontoMaxVendedor' => $desconto !== '' ? (float) $desconto : $atual['caixa']['descontoMaxVendedor'], 'parcelasMax' => $parcelasMax ?? $atual['caixa']['parcelasMax']],
        ]);

        return back()->with('sucesso', 'Configurações salvas.');
    }

    public function identidade(): Response
    {
        return Inertia::render('Painel/Identidade', ['inicial' => $this->config->get('identidade'), 'padrao' => ['nome' => Config::NOME_PADRAO, 'slogan' => Config::SLOGAN_PADRAO]]);
    }

    /**
     * Identidade visual (D-25). Campos: `cor:<token>` (hex), `logo`/`logoClara`/`favicon` (arquivo novo) e `remover:<tipo>`
     * (volta à marca de fábrica). As cores iguais ao padrão não são gravadas.
     */
    public function salvarIdentidade(Request $request): RedirectResponse
    {
        $atual = (array) $this->config->get('identidade');
        $cores = [];
        foreach (self::TOKENS as $t) {
            $v = trim((string) $request->input("cor:{$t}", $request->input('cores.'.$t, '')));
            if ($v === '') {
                continue;
            }
            $hex = strtolower(str_starts_with($v, '#') ? $v : "#{$v}");
            if (preg_match('/^#[0-9a-f]{3}$/', $hex)) {
                $hex = '#'.$hex[1].$hex[1].$hex[2].$hex[2].$hex[3].$hex[3];
            }
            if (! preg_match('/^#[0-9a-f]{6}$/', $hex)) {
                $this->falhar("Cor inválida ({$t}). Use o formato #2e2520.");
            }
            if ($hex !== self::CORES_PADRAO[$t]) {
                $cores[$t] = $hex;
            }
        }
        $nome = trim((string) preg_replace('/\s+/', ' ', (string) $request->input('nome')));
        $slogan = trim((string) preg_replace('/\s+/', ' ', (string) $request->input('slogan')));
        if (mb_strlen($nome) < 2 || mb_strlen($nome) > 40) {
            $this->falhar('O nome da loja precisa ter de 2 a 40 letras.');
        }
        if (mb_strlen($slogan) > 60) {
            $this->falhar('A assinatura pode ter até 60 letras.');
        }
        $nova = [...$atual, 'cores' => (object) $cores, 'nome' => $nome === Config::NOME_PADRAO ? null : $nome, 'slogan' => $slogan === Config::SLOGAN_PADRAO ? null : $slogan];
        $sobras = [];
        foreach (self::ARQUIVOS as $tipo => $rotulo) {
            $arquivo = $request->file($tipo);
            if ($arquivo && $arquivo->isValid() && $arquivo->getSize() > 0) {
                if ($arquivo->getSize() > 1.8 * 1024 * 1024) {
                    $this->falhar("A {$rotulo} passa de 1,8 MB. Reduza o arquivo e envie de novo.");
                }
                try {
                    $nova[$tipo] = $this->arquivos->salvarArquivoMarca($tipo, (string) file_get_contents($arquivo->getRealPath()));
                } catch (ErroNegocio $e) {
                    $this->falhar(ucfirst($rotulo).": {$e->getMessage()}");
                }
                if (! empty($atual[$tipo]['url'])) {
                    $sobras[] = $atual[$tipo]['url'];
                }
            } elseif ($request->input("remover:{$tipo}") === '1' && ! empty($atual[$tipo])) {
                $sobras[] = $atual[$tipo]['url'];
                $nova[$tipo] = null;
            }
        }
        $this->config->salvar(['identidade' => $nova]);
        foreach ($sobras as $url) {
            if (str_starts_with($url, Arquivos::PREFIXO.'/marca/') && ($c = Arquivos::caminhoDaUrl($url)) && is_file($c)) {
                @unlink($c);
            }
        }

        return back()->with('sucesso', 'Identidade visual salva. Já vale em todo o site.');
    }
}
