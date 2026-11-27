<?php

namespace App\Support;

/**
 * Pagamento online (docs/27; porta de src/lib/pagamento.ts) — regras puras: situação de cada cobrança, a ordem em que
 * ela pode mudar, a tradução da situação do Mercado Pago, o valor a cobrar e os textos.
 */
class Pagamento
{
    /** Cobrança ainda pode ser paga (e segura a reserva das peças). */
    public const ATIVAS = ['criada', 'pendente'];

    /** Dinheiro entrou e não saiu por inteiro. */
    public const PAGAS = ['aprovada', 'estornada_parcial', 'contestada'];

    public const ROTULO_STATUS = [
        'criada' => 'Criando', 'pendente' => 'Aguardando pagamento', 'aprovada' => 'Pago', 'recusada' => 'Recusado', 'expirada' => 'Vencido',
        'cancelada' => 'Cancelado', 'estornada' => 'Estornado', 'estornada_parcial' => 'Estornado em parte', 'contestada' => 'Contestado',
    ];

    /**
     * Mudanças permitidas. O Mercado Pago é a fonte da verdade: um Pix pago no último segundo vence o "vencido" e uma
     * contestação ganha pela loja volta a "aprovada". Estorno total é final. Mesma situação = só atualiza os detalhes.
     */
    private const PROXIMOS = [
        'criada' => ['pendente', 'aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
        'pendente' => ['aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
        'recusada' => ['pendente', 'aprovada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada'],
        'expirada' => ['aprovada', 'estornada', 'estornada_parcial', 'contestada'],
        'cancelada' => ['aprovada', 'estornada', 'estornada_parcial', 'contestada'],
        'aprovada' => ['estornada', 'estornada_parcial', 'contestada'],
        'estornada_parcial' => ['estornada', 'contestada'],
        'contestada' => ['aprovada', 'estornada', 'estornada_parcial'],
        'estornada' => [],
    ];

    private const NOMES_MEIO = [
        'pix' => 'Pix', 'visa' => 'Visa', 'master' => 'Mastercard', 'amex' => 'Amex', 'elo' => 'Elo', 'hipercard' => 'Hipercard', 'debvisa' => 'Visa Débito',
        'debmaster' => 'Mastercard Débito', 'debelo' => 'Elo Débito', 'account_money' => 'Saldo Mercado Pago', 'bolbradesco' => 'Boleto', 'pec' => 'Lotérica',
    ];

    public static function ehAtiva(string $s): bool
    {
        return in_array($s, self::ATIVAS, true);
    }

    public static function ehPaga(string $s): bool
    {
        return in_array($s, self::PAGAS, true);
    }

    public static function podeMudar(string $de, string $para): bool
    {
        return $de === $para || in_array($para, self::PROXIMOS[$de] ?? [], true);
    }

    /** Situação da order (status + status_detail, API Orders) traduzida. */
    public static function traduzirStatusMp(?string $status, ?string $detalhe): string
    {
        $s = strtolower((string) $status);
        $d = strtolower((string) $detalhe);

        return match ($s) {
            'created', 'processing', 'action_required' => 'pendente',
            'processed' => $d === 'partially_refunded' ? 'estornada_parcial' : 'aprovada',
            'refunded' => 'estornada',
            'charged_back' => $d === 'reimbursed' ? 'aprovada' : 'contestada',
            'canceled', 'cancelled' => $d === 'expired' ? 'expirada' : 'cancelada',
            'expired' => 'expirada',
            'failed' => $d === 'expired' ? 'expirada' : 'recusada',
            default => 'pendente',
        };
    }

    /** Forma gravada na tabela `pagamento`, a mesma do caixa (relatório por forma). */
    public static function formaDoMeio(?string $meio, ?string $tipo): string
    {
        $m = strtolower((string) $meio);
        $t = strtolower((string) $tipo);
        if ($m === 'pix') {
            return 'pix';
        }
        if ($t === 'credit_card') {
            return 'credito';
        }

        return in_array($t, ['debit_card', 'prepaid_card'], true) ? 'debito' : 'mercado_pago';
    }

    public static function nomeDoMeio(?string $meio): string
    {
        return $meio ? (self::NOMES_MEIO[strtolower($meio)] ?? $meio) : '—';
    }

    /** "Visa em 3×", "Pix". */
    public static function descreverMeio(?string $meio, ?int $parcelas): string
    {
        $nome = self::nomeDoMeio($meio);

        return $parcelas && $parcelas > 1 ? "{$nome} em {$parcelas}×" : $nome;
    }

    private static function centavos(float $n): float
    {
        return round($n * 100) / 100;
    }

    /**
     * Quanto cobrar do pedido agora, sempre a partir do banco (RP-01, RP-02). Compra: peças (já com cupom) + frete; com
     * frete "a combinar" a equipe precisa informar o frete. Condicional: só depois de fechado, o valor do que ficou.
     *
     * @param  array{tipo: string, status: string, origem: string, total: float, frete: ?float, pagamentoSituacao: string, venda: ?float}  $p
     * @return array{ok: true, valor: float}|array{ok: false, motivo: string, precisaFrete?: bool}
     */
    public static function valorACobrar(array $p): array
    {
        if ($p['origem'] === 'balcao') {
            return ['ok' => false, 'motivo' => 'Venda na loja: o pagamento é registrado no caixa.'];
        }
        if ($p['status'] === 'cancelado') {
            return ['ok' => false, 'motivo' => 'Pedido cancelado.'];
        }
        if ($p['pagamentoSituacao'] === 'pago') {
            return ['ok' => false, 'motivo' => 'Este pedido já está pago.'];
        }
        if ($p['tipo'] === 'condicional') {
            if ($p['status'] !== 'confirmado') {
                return ['ok' => false, 'motivo' => 'No condicional, a cobrança é do que ficou: feche o condicional primeiro.'];
            }
            if (! $p['venda'] || $p['venda'] <= 0) {
                return ['ok' => false, 'motivo' => 'Nenhuma peça ficou com a cliente.'];
            }

            return ['ok' => true, 'valor' => self::centavos($p['venda'])];
        }
        if ($p['frete'] === null) {
            return ['ok' => false, 'motivo' => 'O frete está a combinar. Informe o frete (0 para retirada ou frete grátis) antes de cobrar.', 'precisaFrete' => true];
        }
        $valor = self::centavos(($p['status'] === 'confirmado' && $p['venda'] !== null ? $p['venda'] : $p['total']) + $p['frete']);
        if (! ($valor > 0)) {
            return ['ok' => false, 'motivo' => 'O pedido não tem valor a cobrar.'];
        }

        return ['ok' => true, 'valor' => $valor];
    }

    /** "123.45": formato de valor da API do Mercado Pago. */
    public static function valorMp(float $n): string
    {
        return number_format(self::centavos($n), 2, '.', '');
    }

    /** Valor em reais de um texto da API ("123.45"), ou null. */
    public static function lerValorMp(mixed $v): ?float
    {
        if ($v === null || $v === '' || ! is_numeric($v)) {
            return null;
        }

        return self::centavos((float) $v);
    }

    /** O-06: nome na fatura do cartão, só letras e números, até 13 caracteres ("D'Cerutti" → "DCERUTTI"). */
    public static function nomeNaFatura(?string $nomeDaLoja): string
    {
        $s = \Normalizer::normalize((string) ($nomeDaLoja ?: "D'Cerutti"), \Normalizer::FORM_D);
        $limpo = strtoupper(trim((string) preg_replace('/\s+/', ' ', (string) preg_replace('/[^A-Za-z0-9 ]/', '', (string) $s))));

        return substr($limpo !== '' ? $limpo : 'DCERUTTI', 0, 13);
    }
}
