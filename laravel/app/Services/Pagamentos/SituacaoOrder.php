<?php

namespace App\Services\Pagamentos;

use Carbon\CarbonImmutable;

/** Situação de uma order do Mercado Pago, já lida da API. Valores em reais. */
final class SituacaoOrder
{
    public function __construct(
        public string $orderId,
        public string $status,
        public string $statusDetalhe,
        public ?string $referencia = null,
        public ?float $valorTotal = null,
        public ?float $valorPago = null,
        public ?string $moeda = null,
        public ?string $pagamentoId = null,
        public ?string $meio = null,
        public ?string $tipoMeio = null,
        public ?int $parcelas = null,
        public ?float $taxa = null,
        public float $valorEstornado = 0,
        public ?string $pixCopiaECola = null,
        public ?string $checkoutUrl = null,
        public ?CarbonImmutable $expiraEm = null,
    ) {}

    /** Resumo para o registro: sem o código do Pix (longo) e sem nada do pagador. @return array<string, mixed> */
    public function resumo(): array
    {
        return [
            'status' => $this->status, 'detalhe' => $this->statusDetalhe, 'referencia' => $this->referencia, 'total' => $this->valorTotal, 'pago' => $this->valorPago,
            'moeda' => $this->moeda, 'meio' => $this->meio, 'tipo' => $this->tipoMeio, 'parcelas' => $this->parcelas, 'taxa' => $this->taxa, 'estornado' => $this->valorEstornado,
        ];
    }

    /** @return array<string, mixed> */
    public function paraArray(): array
    {
        return [...get_object_vars($this), 'expiraEm' => $this->expiraEm?->toIso8601String()];
    }

    /** @param array<string, mixed> $a */
    public static function deArray(array $a): self
    {
        return new self(...[...$a, 'expiraEm' => isset($a['expiraEm']) ? CarbonImmutable::parse($a['expiraEm']) : null]);
    }
}
