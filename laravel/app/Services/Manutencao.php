<?php

namespace App\Services;

use App\Enums\TipoNotificacao;
use App\Models\Atendimento;
use App\Models\Atividade;
use App\Models\AtividadeEquipe;
use App\Models\Meta;
use App\Models\MovimentoEstoque;
use App\Models\Notificacao;
use App\Models\Pedido;
use App\Models\PosVendaContato;
use App\Models\SacolaCliente;
use App\Models\SessaoEquipe;
use App\Models\Sugestao;
use App\Models\User;
use App\Models\Variante;
use App\Models\Venda;
use App\Support\Datas;
use App\Support\Dinheiro;
use App\Support\Texto;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Manutenção periódica (porta de navegacao.ts manutencaoHistorico/talvezManutencao, equipe.ts limparAcompanhamento,
 * atendimento-pedido.ts limparAtendimentos e notificacoes.ts verificarNotificacoes). Roda pelo agendador a cada hora;
 * cada passo é independente e nunca derruba os outros.
 */
class Manutencao
{
    public const MESES_RETENCAO_HISTORICO = 12;

    public const MESES_RETENCAO_EQUIPE = 13;

    public const MESES_RETENCAO_ATENDIMENTO = 12;

    public const MESES_RETENCAO_NOTIFICACOES = 6;

    public function __construct(private Config $config, private Notificacoes $notificacoes) {}

    /** @return array<string, int> */
    public function rodar(?CarbonImmutable $agora = null): array
    {
        $agora ??= CarbonImmutable::now();
        $r = [];
        foreach (['historico' => 'limparHistorico', 'sacolas' => 'avisarSacolasParadas', 'equipe' => 'limparAcompanhamento', 'atendimentos' => 'limparAtendimentos', 'notificacoes' => 'verificarNotificacoes'] as $nome => $passo) {
            try {
                $r[$nome] = $this->{$passo}($agora);
            } catch (\Throwable $e) {
                Log::error("Manutenção: falha em {$nome}", ['erro' => $e->getMessage()]);
                $r[$nome] = -1;
            }
        }

        return $r;
    }

    /** Histórico das clientes com mais de 12 meses sai (D-18). */
    public function limparHistorico(CarbonImmutable $agora): int
    {
        return Atividade::query()->where('criadoEm', '<', $agora->subMonths(self::MESES_RETENCAO_HISTORICO))->delete();
    }

    /** Sacolas com peças, paradas há `horasSacola` (até 7 dias), sem pedido depois e ainda não avisadas. */
    public function avisarSacolasParadas(CarbonImmutable $agora): int
    {
        $cfg = (array) $this->config->get('historico');
        if (! $cfg['ligado'] || ! $cfg['avisarSacola']) {
            return 0;
        }
        $site = rtrim((string) config('app.url'), '/');
        $sacolas = SacolaCliente::query()->with('cliente:id,nome,telefone,vendedorId')->whereNull('avisadoEm')
            ->where('atualizadoEm', '<=', $agora->subHours((int) $cfg['horasSacola']))->where('atualizadoEm', '>=', $agora->subDays(7))->take(100)->get();
        $enviados = 0;
        foreach ($sacolas as $s) {
            // Marca antes de enviar: com dois processos, um só avisa.
            if (! SacolaCliente::query()->where('clienteId', $s->clienteId)->whereNull('avisadoEm')->where('atualizadoEm', $s->getRawOriginal('atualizadoEm'))->toBase()->update(['avisadoEm' => $agora])) {
                continue;
            }
            $itens = is_array($s->itens) ? $s->itens : [];
            if (! $itens || ! $s->cliente?->telefone || Pedido::query()->where('clienteId', $s->clienteId)->where('criadoEm', '>=', $s->atualizadoEm)->exists()) {
                continue;
            }
            $variantes = Variante::query()->with('produto:id,nome,referencia,preco')->whereIn('id', array_column($itens, 'varianteId'))->get()->keyBy('id');
            $linhas = [];
            $total = 0.0;
            $pecas = 0;
            foreach ($itens as $i) {
                $v = $variantes[$i['varianteId']] ?? null;
                if (! $v) {
                    continue;
                }
                $total += (float) $v->produto->preco * $i['quantidade'];
                $pecas += $i['quantidade'];
                $linhas[] = "- {$i['quantidade']}× {$v->produto->nome} (Ref. {$v->produto->referencia}, tam. {$v->tamanho}) · ".Dinheiro::brl((float) $v->produto->preco * $i['quantidade']);
            }
            if (! $linhas) {
                continue;
            }
            $qtd = Texto::plural($pecas, 'peça', 'peças');
            $texto = implode("\n", [
                "{$s->cliente->nome} separou {$qtd} na sacola (".Dinheiro::brl($total).') e não enviou o pedido:', '', ...$linhas, '',
                "Ficha e histórico: {$site}/painel/clientes/{$s->clienteId}", '', 'Que tal chamar a cliente no WhatsApp para ajudar a fechar?',
            ]);
            $this->notificacoes->notificar(Notificacoes::responsaveis($s->cliente->vendedorId), TipoNotificacao::SacolaParada, "Sacola parada · {$s->cliente->nome}",
                "{$qtd} · ".Dinheiro::brl($total).' sem enviar o pedido.', "/painel/clientes/{$s->clienteId}", "sacola:{$s->clienteId}:".$s->atualizadoEm->toIso8601String(),
                ['assunto' => "Sacola parada · {$s->cliente->nome}", 'texto' => $texto]);
            $enviados++;
        }

        return $enviados;
    }

    /** D-26: sessões e ações da equipe com mais de 13 meses saem. */
    public function limparAcompanhamento(CarbonImmutable $agora): int
    {
        $corte = $agora->subMonths(self::MESES_RETENCAO_EQUIPE);

        return SessaoEquipe::query()->where('fimEm', '<', $corte)->delete() + AtividadeEquipe::query()->where('criadoEm', '<', $corte)->delete();
    }

    /** Atendimentos sem ficha e fechados há mais de 12 meses saem (docs/26). */
    public function limparAtendimentos(CarbonImmutable $agora): int
    {
        return Atendimento::query()->whereNull('clienteId')->where('fechadoEm', '<', $agora->subMonths(self::MESES_RETENCAO_ATENDIMENTO))->delete();
    }

    /** D-28: prazos, peças esgotadas, metas, sugestões vencendo, retornos e pós-venda; e a retenção de 6 meses. */
    public function verificarNotificacoes(CarbonImmutable $agora): int
    {
        foreach (['prazosVencendo', 'pecasEsgotadas', 'metasBatidas', 'sugestoesVencendo', 'retornosDeAtendimento', 'posVendaDeHoje'] as $f) {
            try {
                $this->{$f}($agora);
            } catch (\Throwable $e) {
                Log::error("Manutenção: falha na verificação {$f}", ['erro' => $e->getMessage()]);
            }
        }

        return Notificacao::query()->where('criadaEm', '<', $agora->subMonths(self::MESES_RETENCAO_NOTIFICACOES))->delete();
    }

    /** Pedidos em aberto que vencem nas próximas 24 horas: avisa o vendedor uma vez por pedido. */
    private function prazosVencendo(CarbonImmutable $agora): void
    {
        $dias = (int) $this->config->get('diasExpiracao');
        if (! $dias) {
            return;
        }
        $pedidos = Pedido::query()->where('status', 'pendente')->where('criadoEm', '<=', $agora->subDays($dias - 1))->where('criadoEm', '>', $agora->subDays($dias))
            ->take(200)->get(['id', 'codigo', 'nomeCliente', 'vendedorId', 'criadoEm']);
        $semana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
        foreach ($pedidos as $p) {
            $fim = CarbonImmutable::parse($p->criadoEm)->addDays($dias)->setTimezone(Datas::FUSO);
            $this->notificacoes->notificar(Notificacoes::responsaveis($p->vendedorId), TipoNotificacao::PrazoVencendo, "{$p->codigo} vence {$semana[$fim->dayOfWeek]} {$fim->format('H:i')}",
                "{$p->nomeCliente}: confirme ou cancele antes de vencer.", "/painel/pedidos/{$p->id}", "prazo:{$p->codigo}");
        }
    }

    /** Tamanhos que zeraram o estoque por venda nas últimas 2 horas: avisa os gestores uma vez por tamanho e dia. */
    private function pecasEsgotadas(CarbonImmutable $agora): void
    {
        $ids = MovimentoEstoque::query()->where('motivo', 'venda')->where('criadoEm', '>=', $agora->subHours(2))->distinct()->take(200)->pluck('varianteId');
        if ($ids->isEmpty()) {
            return;
        }
        $gestores = Notificacoes::gestoresAtivos();
        $dia = $agora->setTimezone(Datas::FUSO)->toDateString();
        Variante::query()->with('produto:id,nome,referencia,ativo')->whereIn('id', $ids)->whereHas('produto', fn ($q) => $q->where('ativo', true))->get()
            ->filter(fn ($v) => $v->estoque - $v->reservado <= 0)
            ->each(fn ($v) => $this->notificacoes->notificar($gestores, TipoNotificacao::PecaEsgotada, "Esgotou: {$v->produto->nome} · tam. {$v->tamanho}",
                "Ref. {$v->produto->referencia}. Reponha ou desative o tamanho.", "/painel/produtos/{$v->produto->id}", "esgotou:{$v->id}:{$dia}"));
    }

    /** Vendedor que alcançou a meta do mês: avisa ele e os gestores uma vez por mês. */
    private function metasBatidas(CarbonImmutable $agora): void
    {
        $mes = Datas::mes($agora);
        [$de, $ate] = Datas::intervaloDoMes($mes);
        $vendedores = User::query()->where('papel', 'vendedor')->where('ativo', true)->get(['id', 'name']);
        $vendido = Venda::query()->where('data', '>=', $de)->where('data', '<', $ate)->groupBy('vendedorId')->selectRaw('vendedorId, sum(valor) v')->pluck('v', 'vendedorId');
        $metas = Meta::query()->whereIn('vendedorId', $vendedores->pluck('id'))->where('mes', '<=', $mes)->orderByDesc('mes')->get();
        $gestores = Notificacoes::gestoresAtivos();
        foreach ($vendedores as $v) {
            $meta = (float) ($metas->firstWhere('vendedorId', $v->id)?->valor ?? 0);
            $feito = (float) ($vendido[$v->id] ?? 0);
            if ($meta > 0 && $feito >= $meta) {
                $this->notificacoes->notificar([$v->id, ...$gestores], TipoNotificacao::MetaBatida, explode(' ', $v->name)[0].' bateu a meta do mês! 🎉',
                    Dinheiro::brl($feito).' de '.Dinheiro::brl($meta).'.', "/painel/vendedores/{$v->id}", "meta:{$v->id}:{$mes}");
            }
        }
    }

    /** Sugestões enviadas que vencem nas próximas 24 horas sem virar pedido: avisa quem enviou, uma vez por sugestão. */
    private function sugestoesVencendo(CarbonImmutable $agora): void
    {
        Sugestao::query()->with('cliente:id,nome')->whereIn('status', ['enviada', 'vista', 'respondida'])->whereNotNull('enviadaEm')
            ->where('validaAte', '>', $agora)->where('validaAte', '<=', $agora->addDay())->take(200)->get()
            ->each(fn ($s) => $this->notificacoes->notificar(Notificacoes::responsaveis($s->vendedorId), TipoNotificacao::CarrinhoVencendo, "Sugestão {$s->codigo} de {$s->cliente?->nome} vence nas próximas 24 h",
                $s->vistaEm ? 'Ela viu e ainda não pediu: vale um lembrete.' : 'Ela ainda não abriu: vale um lembrete ou renovar.', "/painel/sugestoes/{$s->id}", "carrinho-vence:{$s->codigo}"));
    }

    /** Atendimentos cujo retorno chegou: avisa quem atende, uma vez para cada data marcada. */
    private function retornosDeAtendimento(CarbonImmutable $agora): void
    {
        Atendimento::query()->with('cliente:id,nome')->whereNull('fechadoEm')->whereNotNull('responsavelId')
            ->where('proximoContatoEm', '<=', $agora)->where('proximoContatoEm', '>', $agora->subDays(7))->take(200)->get()
            ->each(fn ($a) => $this->notificacoes->notificar([$a->responsavelId], TipoNotificacao::RetornoVencendo, 'Retomar '.($a->cliente?->nome ?? $a->contatoNome ?? $a->codigo),
                "Atendimento {$a->codigo}.", "/painel/atendimento/{$a->id}", mb_substr("retorno:{$a->codigo}:".CarbonImmutable::parse($a->proximoContatoEm)->toIso8601String(), 0, 100)));
    }

    /** Pós-venda do dia: um aviso por pessoa e dia, com a quantidade. Oferta só para quem aceitou. */
    private function posVendaDeHoje(CarbonImmutable $agora): void
    {
        $dia = $agora->setTimezone(Datas::FUSO)->toDateString();
        PosVendaContato::query()->whereNull('feitoEm')->where('venceEm', '<=', $agora)
            ->whereHas('cliente', fn ($q) => $q->where('telefone', '<>', ''))
            ->where(fn ($q) => $q->whereIn('tipo', ['entrega', 'satisfacao'])->orWhereHas('cliente', fn ($c) => $c->whereNotNull('aceitaOfertasEm')->whereNull('descadastradaEm')))
            ->with('cliente:id,vendedorId')->take(1000)->get()->groupBy(fn ($c) => $c->cliente->vendedorId)
            ->each(fn ($l, $id) => $this->notificacoes->notificar(Notificacoes::responsaveis($id), TipoNotificacao::PosVendaHoje,
                'Pós-venda: '.$l->count().' '.($l->count() === 1 ? 'cliente para contatar' : 'clientes para contatar'), null, '/painel/atendimento', "pos-venda:{$id}:{$dia}"));
    }
}
