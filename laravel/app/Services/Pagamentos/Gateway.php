<?php

namespace App\Services\Pagamentos;

/**
 * O Mercado Pago visto pelo resto do sistema (docs/27; porta de src/server/pagamentos/gateway.ts). Nada fora daqui fala
 * com a API: trocar a API ou testar com o simulado não muda as regras.
 */
interface Gateway
{
    public function nome(): string;

    /** @param array{chave: string, referencia: string, valor: float, descricao: string, pagador: array{email: string, nome: string, telefone?: ?string, cpf?: ?string}, minutos: int, urlAviso: ?string} $p */
    public function criarPix(array $p): SituacaoOrder;

    /**
     * @param  array{chave: string, referencia: string, valor: float, descricao: string, itens: list<array{titulo: string, quantidade: int, preco: float, codigo?: ?string}>, pagador: array{email: ?string, nome: string, telefone?: ?string, cpf?: ?string}, nomeNaFatura: string, urls: array{sucesso: string, falha: string, pendente: string}, parcelasMax: int, semJurosAte: int, minutos: int, urlAviso: ?string}  $p
     */
    public function criarCheckout(array $p): SituacaoOrder;

    public function consultar(string $orderId): SituacaoOrder;

    /** Só enquanto ninguém pagou (created / action_required). */
    public function cancelar(string $orderId, string $chave): SituacaoOrder;

    /** Sem `parcial`: estorno total. @param ?array{pagamentoId: string, valor: float} $parcial */
    public function estornar(string $orderId, string $chave, ?array $parcial = null): SituacaoOrder;

    /** Confere as credenciais e diz de qual conta são. @return array{id: string, apelido: ?string, pais: ?string, teste: bool} */
    public function testarConexao(): array;
}
