<?php

namespace App\Services;

use App\Enums\EtapaAtendimento;
use App\Enums\TipoNotificacao;
use App\Enums\TipoPosVenda;
use App\Models\Atendimento;
use App\Models\Pedido;
use App\Models\PosVendaContato;
use App\Models\Venda;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Support\Facades\Log;

/**
 * O que o pedido define no atendimento e no pós-venda (docs/26; src/server/atendimento-pedido.ts). Roda depois do
 * commit e nunca lança: falhar aqui não pode impedir a venda.
 */
class AtendimentoDoPedido
{
    public function __construct(private Config $config, private Notificacoes $notificacoes) {}

    public function sincronizar(string $pedidoId, string $status, ?DateTimeInterface $agora = null): void
    {
        $agora = CarbonImmutable::instance($agora ?? now());
        try {
            $a = Atendimento::query()->where('pedidoId', $pedidoId)->first(['id', 'codigo', 'responsavelId']);
            if (! $a) {
                return;
            }
            $vendeu = $status === 'confirmado' && Venda::query()->where('pedidoId', $pedidoId)->exists();
            if ($vendeu) {
                $a->update(['etapa' => EtapaAtendimento::Ganho, 'fechadoEm' => $agora, 'proximoContatoEm' => null]);
                $a->registros()->create(['tipo' => 'pedido', 'texto' => 'Pedido confirmado: venda feita.']);

                return;
            }
            // Cancelado, venda desfeita ou condicional devolvido: a conversa volta, e o atendimento pode gerar outro pedido.
            $a->update(['etapa' => EtapaAtendimento::EmConversa, 'pedidoId' => null, 'fechadoEm' => null, 'proximoContatoEm' => $agora->addDay()]);
            $a->registros()->create(['tipo' => 'pedido', 'texto' => 'O pedido não virou venda: o atendimento voltou para Em conversa.']);
            if ($a->responsavelId) {
                $this->notificacoes->notificar([$a->responsavelId], TipoNotificacao::RetornoVencendo, "O pedido do atendimento {$a->codigo} não virou venda", 'Vale retomar a conversa.', "/painel/atendimento/{$a->id}", mb_substr("sem-venda:{$a->codigo}:{$pedidoId}", 0, 100));
            }
        } catch (\Throwable $e) {
            Log::error('Falha ao atualizar o atendimento do pedido', ['pedido' => $pedidoId, 'erro' => $e->getMessage()]);
        }
    }

    /** Pós-venda: programa os contatos quando sai venda de cliente identificada. Nova compra encerra a reativação pendente. */
    public function programarPosVenda(string $pedidoId, ?DateTimeInterface $agora = null): void
    {
        $agora = CarbonImmutable::instance($agora ?? now());
        try {
            $cfg = $this->config->get('atendimento');
            if (! $cfg['ligado']) {
                return;
            }
            $p = Pedido::query()->with(['cliente:id,telefone', 'venda:id,pedidoId'])->find($pedidoId, ['id', 'origem', 'clienteId']);
            if (! $p?->venda || ! $p->cliente?->telefone) {
                return;
            }
            PosVendaContato::query()->where('clienteId', $p->clienteId)->where('tipo', TipoPosVenda::Reativacao)->whereNull('feitoEm')->where('pedidoId', '<>', $pedidoId)
                ->update(['feitoEm' => $agora, 'resultado' => 'nova_compra']);
            $tipos = $p->origem->value === 'balcao' ? ['sugestao', 'reativacao'] : ['entrega', 'satisfacao', 'sugestao', 'reativacao'];
            PosVendaContato::query()->insertOrIgnore(array_map(fn ($tipo) => [
                'pedidoId' => $pedidoId, 'clienteId' => $p->clienteId, 'tipo' => $tipo,
                'venceEm' => $agora->addSeconds($cfg['diasPosVenda'][$tipo] * 86400)->format('Y-m-d H:i:s.v'),
            ], $tipos));
        } catch (\Throwable $e) {
            Log::error('Falha ao programar o pós-venda do pedido', ['pedido' => $pedidoId, 'erro' => $e->getMessage()]);
        }
    }

    /** Venda desfeita: os contatos que faltavam saem da fila. */
    public function cancelarPosVenda(string $pedidoId): void
    {
        try {
            PosVendaContato::query()->where('pedidoId', $pedidoId)->whereNull('feitoEm')->update(['feitoEm' => now(), 'resultado' => 'venda_desfeita']);
        } catch (\Throwable $e) {
            Log::error('Falha ao cancelar o pós-venda do pedido', ['pedido' => $pedidoId, 'erro' => $e->getMessage()]);
        }
    }
}
