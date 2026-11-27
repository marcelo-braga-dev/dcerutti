<?php

namespace App\Services;

use App\Enums\Papel;
use App\Exceptions\ErroNegocio;
use App\Exceptions\ErroPedido;
use App\Models\Atendimento;
use App\Models\AtendimentoItem;
use App\Models\AtendimentoRegistro;
use App\Models\Cliente;
use App\Models\Contador;
use App\Models\RespostaPronta;
use App\Models\User;
use App\Models\Variante;
use App\Services\Pedidos\Pedidos;
use App\Support\Telefone;
use Illuminate\Support\Facades\DB;

/**
 * Atendimento online (docs/26; src/server/atendimento.ts). Carteira (D-30): cliente com ficha é atendida pela própria
 * vendedora, e quem registrou vê só o nome dela. Sem ficha, fica com quem registrou (D-32). Sem WhatsApp não há ficha.
 */
class Atendimentos
{
    public const MAX_PECAS = 40;

    public const STATUS_VITRINE_ATIVOS = ['agendada', 'no_ar', 'publicada'];

    public function __construct(private Config $config, private Pedidos $pedidos) {}

    public static function podeAtender(User $u, ?string $responsavelId): bool
    {
        return $u->ehGestor() || $responsavelId === $u->id;
    }

    /** @return list<string> */
    private static function variantes(string $t): array
    {
        return [Telefone::formatar($t), Telefone::digitos($t)];
    }

    private static function primeiroNome(string $n): string
    {
        return explode(' ', trim($n))[0];
    }

    /** AT-000123: primeira escrita da transação, a linha do contador fica travada até o commit. */
    private function proximoCodigo(): string
    {
        DB::statement("INSERT INTO contador (nome, valor) VALUES ('AT', 1) ON DUPLICATE KEY UPDATE valor = valor + 1");

        return 'AT-'.str_pad((string) Contador::query()->where('nome', 'AT')->value('valor'), 6, '0', STR_PAD_LEFT);
    }

    private function fichaPorContato(?string $telefone, ?string $instagram): ?Cliente
    {
        if (! $telefone && ! $instagram) {
            return null;
        }

        return Cliente::query()->where('telefone', '<>', '')->where(function ($q) use ($telefone, $instagram) {
            if ($telefone) {
                $q->orWhereIn('telefone', self::variantes($telefone));
            }
            if ($instagram) {
                $q->orWhere('instagram', $instagram);
            }
        })->orderBy('criadoEm')->with('vendedor:id,name,ativo')->first();
    }

    private function numeroEmUsoDe(?string $usuarioId): ?int
    {
        if (! $usuarioId) {
            return null;
        }
        $u = User::query()->with('numeroPrincipal:id,status')->find($usuarioId, ['id', 'numeroPrincipalId']);

        return $u?->numeroPrincipal?->status->value === 'ativo' ? $u->numeroPrincipal->id : null;
    }

    private function vendedoraAtiva(?string $id): ?string
    {
        return $id ? User::query()->whereKey($id)->where('papel', Papel::Vendedor)->where('ativo', true)->value('id') : null;
    }

    /** Vendedora para um contato sem dona: quem registrou; se foi o gestor, a escolhida ou a padrão. */
    private function responsavelSemFicha(User $u, ?string $escolhido): ?string
    {
        if ($u->papel === Papel::Vendedor) {
            return $u->id;
        }

        return $this->vendedoraAtiva($escolhido) ?? $this->vendedoraAtiva($this->config->get('vendedorPadraoId') ?: null);
    }

    /**
     * Registra a conversa. Já aberta com esta pessoa: junta a nota lá. Ficha de outra vendedora: vai para ela.
     *
     * @param  array{nome: string, telefone: ?string, instagram: ?string, canal: string, nota?: ?string, responsavelId?: ?string}  $d
     * @return array{tipo: string, id: string, codigo: string, para?: string, responsavelId?: ?string, fichaCriada?: bool, clienteId?: ?string}
     */
    public function criar(User $u, array $d): array
    {
        if (! $d['telefone'] && ! $d['instagram']) {
            throw new ErroNegocio('Informe o WhatsApp ou o @ do Instagram.');
        }

        return DB::transaction(function () use ($u, $d) {
            $codigo = $this->proximoCodigo();
            $ficha = $this->fichaPorContato($d['telefone'], $d['instagram']);
            $nota = trim((string) ($d['nota'] ?? '')) ?: null;
            $aberto = Atendimento::query()->whereNull('fechadoEm')->where(function ($q) use ($ficha, $d) {
                if ($ficha) {
                    $q->orWhere('clienteId', $ficha->id);
                }
                if ($d['telefone']) {
                    $q->orWhereIn('contatoTelefone', self::variantes($d['telefone']));
                }
                if ($d['instagram']) {
                    $q->orWhere('contatoInstagram', $d['instagram']);
                }
            })->with('responsavel:id,name')->first();
            if ($aberto) {
                if ($nota) {
                    AtendimentoRegistro::query()->create(['atendimentoId' => $aberto->id, 'tipo' => 'nota', 'texto' => $nota, 'usuarioId' => $u->id]);
                }
                if (! $aberto->responsavelId && $u->papel === Papel::Vendedor) {
                    $aberto->update(['responsavelId' => $u->id]);
                } elseif ($aberto->responsavelId && ! self::podeAtender($u, $aberto->responsavelId)) {
                    return ['tipo' => 'encaminhado', 'id' => $aberto->id, 'codigo' => $aberto->codigo, 'para' => self::primeiroNome($aberto->responsavel->name), 'responsavelId' => $aberto->responsavelId];
                }

                return ['tipo' => 'existente', 'id' => $aberto->id, 'codigo' => $aberto->codigo];
            }
            $dona = $ficha?->vendedor?->ativo ? $ficha->vendedorId : null;
            $responsavelId = $dona ?? $this->responsavelSemFicha($u, $d['responsavelId'] ?? null);
            $clienteId = $ficha?->id;
            $fichaCriada = false;
            if (! $clienteId && $d['telefone'] && $responsavelId) {
                $clienteId = Cliente::query()->create(['nome' => $d['nome'], 'telefone' => Telefone::formatar($d['telefone']), 'instagram' => $d['instagram'], 'origem' => $d['canal'], 'vendedorId' => $responsavelId])->id;
                $fichaCriada = true;
            }
            if ($ficha && $d['instagram'] && ! $ficha->instagram) {
                $ficha->update(['instagram' => $d['instagram']]);
            }
            $a = Atendimento::query()->create([
                'codigo' => $codigo, 'clienteId' => $clienteId, 'responsavelId' => $responsavelId, 'canal' => $d['canal'], 'numeroId' => $this->numeroEmUsoDe($responsavelId),
                // Com ficha, os dados vêm dela. Sem ficha, ficam aqui até haver WhatsApp e uma vendedora.
                'contatoNome' => $clienteId ? null : $d['nome'], 'contatoTelefone' => $clienteId ? null : ($d['telefone'] ? Telefone::formatar($d['telefone']) : null),
                'contatoInstagram' => $clienteId ? null : $d['instagram'],
            ]);
            if ($nota) {
                AtendimentoRegistro::query()->create(['atendimentoId' => $a->id, 'tipo' => 'nota', 'texto' => $nota, 'usuarioId' => $u->id]);
            }
            if ($dona && $dona !== $u->id && ! $u->ehGestor()) {
                return ['tipo' => 'encaminhado', 'id' => $a->id, 'codigo' => $codigo, 'para' => self::primeiroNome($ficha->vendedor->name), 'responsavelId' => $dona];
            }

            return ['tipo' => 'criado', 'id' => $a->id, 'codigo' => $codigo, 'responsavelId' => $responsavelId, 'fichaCriada' => $fichaCriada, 'clienteId' => $clienteId];
        });
    }

    /**
     * Formulário público (peça e vitrine): nunca cria ficha nem pedido e não diz se o telefone já é conhecido.
     *
     * @param  array{nome: string, telefone: string, itens: list<array{varianteId: int, produtoId: int, descricao: string}>, origemId: ?string, canal: string, vitrineId?: ?string, ofertas?: bool}  $d
     * @return array{id: string, codigo: string, responsavelId: ?string, novo: bool}
     */
    public function registrarInteressePublico(array $d): array
    {
        $lista = implode('; ', array_column($d['itens'], 'descricao'));
        $texto = 'Pediu '.(! empty($d['vitrineId']) ? 'pela vitrine' : 'pelo link da peça').": {$lista}. Nome informado: {$d['nome']}.".(! empty($d['ofertas']) ? ' Marcou que aceita receber ofertas: confira com ela antes de marcar na ficha.' : '');

        return DB::transaction(function () use ($d, $texto) {
            $codigo = $this->proximoCodigo();
            $ficha = $this->fichaPorContato($d['telefone'], null);
            $aberto = Atendimento::query()->whereNull('fechadoEm')->whereNull('pedidoId')
                ->where(fn ($q) => $q->whereIn('contatoTelefone', self::variantes($d['telefone']))->when($ficha, fn ($w) => $w->orWhere('clienteId', $ficha->id)))->first();
            if ($aberto) {
                foreach ($d['itens'] as $i) {
                    AtendimentoItem::query()->firstOrCreate(['atendimentoId' => $aberto->id, 'varianteId' => $i['varianteId']], ['produtoId' => $i['produtoId']]);
                }
                AtendimentoRegistro::query()->create(['atendimentoId' => $aberto->id, 'tipo' => 'nota', 'texto' => $texto]);
                if (! empty($d['vitrineId']) && ! $aberto->vitrineId) {
                    $aberto->update(['vitrineId' => $d['vitrineId']]);
                }

                return ['id' => $aberto->id, 'codigo' => $aberto->codigo, 'responsavelId' => $aberto->responsavelId, 'novo' => false];
            }
            $dona = $ficha?->vendedor?->ativo ? $ficha->vendedorId : null;
            $responsavelId = $dona ?? $this->vendedoraAtiva($d['origemId'] ?? null) ?? $this->vendedoraAtiva($this->config->get('vendedorPadraoId') ?: null);
            $a = Atendimento::query()->create([
                'codigo' => $codigo, 'clienteId' => $ficha?->id, 'responsavelId' => $responsavelId, 'canal' => $d['canal'], 'vitrineId' => $d['vitrineId'] ?? null,
                'numeroId' => $this->numeroEmUsoDe($responsavelId), 'aceitouContatoEm' => now(), 'aceitouOfertasEm' => ! empty($d['ofertas']) ? now() : null,
                'contatoNome' => $ficha ? null : $d['nome'], 'contatoTelefone' => $ficha ? null : Telefone::formatar($d['telefone']),
            ]);
            $a->itens()->createMany(array_map(fn ($i) => ['varianteId' => $i['varianteId'], 'produtoId' => $i['produtoId']], $d['itens']));
            AtendimentoRegistro::query()->create(['atendimentoId' => $a->id, 'tipo' => 'nota', 'texto' => $texto]);

            return ['id' => $a->id, 'codigo' => $codigo, 'responsavelId' => $responsavelId, 'novo' => true];
        });
    }

    /** Atendimento com a permissão conferida. Sem permissão, a mesma resposta de quem não existe. */
    public function doEscopo(User $u, string $id): Atendimento
    {
        $a = Atendimento::query()->find($id);
        if (! $a || ! self::podeAtender($u, $a->responsavelId)) {
            throw new ErroNegocio('Atendimento não encontrado.');
        }

        return $a;
    }

    private function registro(string $id, string $tipo, ?string $texto, ?string $usuarioId): void
    {
        AtendimentoRegistro::query()->create(['atendimentoId' => $id, 'tipo' => $tipo, 'texto' => $texto, 'usuarioId' => $usuarioId]);
    }

    public function registrarEnvioDePeca(User $u, string $id, string $descricao): void
    {
        $this->doEscopo($u, $id);
        $this->registro($id, 'envio_peca', $descricao, $u->id);
    }

    /** Etapas manuais. Toda conversa aberta precisa de próximo contato; perder exige motivo. @return array{fechou: bool, atendimento: Atendimento} */
    public function mudarEtapa(User $u, string $id, string $etapa, ?\DateTimeInterface $proximo, ?string $motivo = null): array
    {
        return DB::transaction(function () use ($u, $id, $etapa, $proximo, $motivo) {
            $a = $this->doEscopo($u, $id);
            if ($a->etapa->value === 'ganho') {
                throw new ErroNegocio('Este atendimento já virou venda. Para mudar, desfaça a venda no pedido.');
            }
            if ($a->pedidoId) {
                throw new ErroNegocio('Há um pedido em aberto neste atendimento. Confirme ou cancele o pedido primeiro.');
            }
            if ($etapa === 'perdido') {
                if (! $motivo) {
                    throw new ErroNegocio('Escolha o motivo.');
                }
                $a->update(['etapa' => 'perdido', 'motivoPerda' => $motivo, 'fechadoEm' => now(), 'proximoContatoEm' => null]);
                $this->registro($id, 'etapa', "Perdido: {$motivo}", $u->id);

                return ['fechou' => true, 'atendimento' => $a];
            }
            if (! in_array($etapa, ['em_conversa', 'proposta'], true)) {
                throw new ErroNegocio('Esta etapa vem do pedido.');
            }
            if (! $proximo) {
                throw new ErroNegocio('Marque a data do próximo contato.');
            }
            $a->update(['etapa' => $etapa, 'motivoPerda' => null, 'fechadoEm' => null, 'proximoContatoEm' => $proximo]);
            $this->registro($id, 'etapa', 'Etapa: '.($etapa === 'proposta' ? 'Proposta' : 'Em conversa'), $u->id);

            return ['fechou' => false, 'atendimento' => $a];
        });
    }

    /** Só adia o retorno (Novo vira Em conversa: alguém já olhou). */
    public function reagendar(User $u, string $id, \DateTimeInterface $quando): void
    {
        $a = $this->doEscopo($u, $id);
        if ($a->fechadoEm) {
            throw new ErroNegocio('Este atendimento está encerrado.');
        }
        $a->update(['proximoContatoEm' => $quando, ...($a->etapa->value === 'novo' ? ['etapa' => 'em_conversa'] : [])]);
    }

    public function adicionarNota(User $u, string $id, string $texto): void
    {
        $this->doEscopo($u, $id);
        $this->registro($id, 'nota', $texto, $u->id);
    }

    /** Clique em WhatsApp ou Direct: conta como contato (mede o clique, não a resposta). @return array{numeroId: ?int, codigo: string} */
    public function registrarContato(User $u, string $id, string $canal): array
    {
        return DB::transaction(function () use ($u, $id, $canal) {
            $a = $this->doEscopo($u, $id);
            $agora = now();
            $numeroId = $canal === 'whatsapp' ? $this->numeroEmUsoDe($u->id) : null;
            $a->update([
                'ultimoContatoEm' => $agora, 'primeiroContatoEm' => $a->primeiroContatoEm ?? $agora,
                ...($a->etapa->value === 'novo' ? ['etapa' => 'em_conversa'] : []), ...($numeroId ? ['numeroId' => $numeroId] : []),
                ...(! $a->fechadoEm && ! $a->pedidoId && (! $a->proximoContatoEm || $a->proximoContatoEm <= $agora) ? ['proximoContatoEm' => $agora->copy()->addDay()] : []),
            ]);
            $this->registro($id, $canal === 'whatsapp' ? 'contato_whatsapp' : 'contato_direct', null, $u->id);

            return ['numeroId' => $numeroId, 'codigo' => $a->codigo];
        });
    }

    /** Chegou o WhatsApp ou o @ depois: vincula à ficha existente (que pode ser de outra vendedora) ou cria a ficha. @return array{encaminhadoPara: ?string, responsavelId: ?string} */
    public function informarContato(User $u, string $id, ?string $telefone, ?string $instagram): array
    {
        return DB::transaction(function () use ($u, $id, $telefone, $instagram) {
            $a = $this->doEscopo($u, $id);
            if ($a->clienteId) {
                if ($instagram) {
                    Cliente::query()->whereKey($a->clienteId)->update(['instagram' => $instagram]);
                }
                if ($telefone) {
                    throw new ErroNegocio('Este atendimento já tem ficha. Corrija o WhatsApp na ficha da cliente.');
                }

                return ['encaminhadoPara' => null, 'responsavelId' => $a->responsavelId];
            }
            if (! $telefone) {
                $a->update(['contatoInstagram' => $instagram]);

                return ['encaminhadoPara' => null, 'responsavelId' => $a->responsavelId];
            }
            $instagram ??= $a->contatoInstagram;
            $ficha = $this->fichaPorContato($telefone, null);
            if ($ficha) {
                $dona = $ficha->vendedor?->ativo ? $ficha->vendedorId : $a->responsavelId;
                if ($instagram && ! $ficha->instagram) {
                    $ficha->update(['instagram' => $instagram]);
                }
                $antes = $a->responsavelId;
                $a->update(['clienteId' => $ficha->id, 'responsavelId' => $dona, 'contatoNome' => null, 'contatoTelefone' => null, 'contatoInstagram' => null, 'numeroId' => $this->numeroEmUsoDe($dona)]);
                if ($dona !== $antes) {
                    $this->registro($id, 'transferencia', 'Este WhatsApp já tem ficha: o atendimento foi para a vendedora dela.', $u->id);
                }

                return ['encaminhadoPara' => $dona !== $antes && $dona !== $u->id ? self::primeiroNome($ficha->vendedor->name) : null, 'responsavelId' => $dona];
            }
            if (! $a->responsavelId) {
                $a->update(['contatoTelefone' => Telefone::formatar($telefone), 'contatoInstagram' => $instagram]);

                return ['encaminhadoPara' => null, 'responsavelId' => null];
            }
            $nova = Cliente::query()->create(['nome' => $a->contatoNome ?? 'Cliente', 'telefone' => Telefone::formatar($telefone), 'instagram' => $instagram, 'origem' => $a->canal, 'vendedorId' => $a->responsavelId, 'aceitaOfertasEm' => $a->aceitouOfertasEm]);
            $a->update(['clienteId' => $nova->id, 'contatoNome' => null, 'contatoTelefone' => null, 'contatoInstagram' => null]);

            return ['encaminhadoPara' => null, 'responsavelId' => $a->responsavelId];
        });
    }

    /** Só o gestor (D-30). O responsável é sempre uma vendedora ativa; a carteira não muda. */
    public function transferir(User $u, string $id, string $para): User
    {
        return DB::transaction(function () use ($u, $id, $para) {
            $a = $this->doEscopo($u, $id);
            $destino = User::query()->whereKey($para)->where('papel', Papel::Vendedor)->where('ativo', true)->first(['id', 'name']);
            if (! $destino) {
                throw new ErroNegocio('Escolha uma vendedora ativa.');
            }
            if ($a->responsavelId === $para) {
                throw new ErroNegocio('Este atendimento já é dessa pessoa.');
            }
            $clienteId = $a->clienteId;
            if (! $clienteId && $a->contatoTelefone) {
                $clienteId = $this->fichaPorContato($a->contatoTelefone, null)?->id
                    ?? Cliente::query()->create(['nome' => $a->contatoNome ?? 'Cliente', 'telefone' => $a->contatoTelefone, 'instagram' => $a->contatoInstagram, 'origem' => $a->canal, 'vendedorId' => $para, 'aceitaOfertasEm' => $a->aceitouOfertasEm])->id;
            }
            $a->update(['responsavelId' => $para, 'numeroId' => $this->numeroEmUsoDe($para), 'clienteId' => $clienteId, ...($clienteId && ! $a->clienteId ? ['contatoNome' => null, 'contatoTelefone' => null, 'contatoInstagram' => null] : [])]);
            $this->registro($id, 'transferencia', "Passado para {$destino->name}.", $u->id);

            return $destino;
        });
    }

    public function adicionarPeca(User $u, string $id, int $varianteId): void
    {
        DB::transaction(function () use ($u, $id, $varianteId) {
            $a = $this->doEscopo($u, $id);
            if ($a->fechadoEm || $a->pedidoId) {
                throw new ErroNegocio('Este atendimento já tem pedido ou foi encerrado.');
            }
            $produtoId = Variante::query()->whereKey($varianteId)->value('produtoId');
            if (! $produtoId) {
                throw new ErroNegocio('Peça não encontrada.');
            }
            if (AtendimentoItem::query()->where('atendimentoId', $id)->count() >= self::MAX_PECAS) {
                throw new ErroNegocio('Peças demais neste atendimento.');
            }
            $item = AtendimentoItem::query()->where('atendimentoId', $id)->where('varianteId', $varianteId)->first();
            $item ? $item->increment('quantidade') : AtendimentoItem::query()->create(['atendimentoId' => $id, 'varianteId' => $varianteId, 'produtoId' => $produtoId]);
        });
    }

    public function removerPeca(User $u, string $id, int $itemId): void
    {
        $a = $this->doEscopo($u, $id);
        if ($a->fechadoEm || $a->pedidoId) {
            throw new ErroNegocio('Este atendimento já tem pedido ou foi encerrado.');
        }
        AtendimentoItem::query()->whereKey($itemId)->where('atendimentoId', $id)->delete();
    }

    /** Converte em pedido com as peças e os preços de agora (e o preço da vitrine, se ainda valer). @return array<string, mixed> */
    public function converterEmPedido(User $u, string $id, string $tipo): array
    {
        $a = Atendimento::query()->with(['itens', 'cliente:id,nome,telefone,cep,vendedorId', 'cliente.vendedor:id,name,ativo', 'vitrine:id,status,ofertaAte', 'vitrine.pecas:id,vitrineId,produtoId,precoOferta'])->find($id);
        if (! $a || ! self::podeAtender($u, $a->responsavelId)) {
            throw new ErroNegocio('Atendimento não encontrado.');
        }
        if ($a->pedidoId) {
            throw new ErroNegocio('Este atendimento já virou pedido.');
        }
        if ($a->fechadoEm) {
            throw new ErroNegocio('Este atendimento está encerrado.');
        }
        if (! $a->cliente || ! Telefone::celularValido($a->cliente->telefone)) {
            throw new ErroNegocio('Informe o WhatsApp da cliente antes de criar o pedido.');
        }
        if ($a->itens->isEmpty()) {
            throw new ErroNegocio('Adicione pelo menos uma peça.');
        }
        if (! $a->cliente->vendedor->ativo) {
            throw new ErroNegocio('A vendedora desta cliente está inativa. Transfira a cliente primeiro.');
        }
        $precos = [];
        $v = $a->vitrine;
        if ($v && in_array($v->status->value ?? $v->status, self::STATUS_VITRINE_ATIVOS, true) && (! $v->ofertaAte || $v->ofertaAte->isFuture())) {
            $ofertas = $v->pecas->pluck('precoOferta', 'produtoId');
            foreach ($a->itens as $i) {
                if (($o = $ofertas[$i->produtoId] ?? null) !== null) {
                    $precos[$i->varianteId] = (float) $o;
                }
            }
        }
        $c = $a->cliente;
        $pedido = $this->pedidos->criar([
            'precos' => $precos, 'vitrineId' => $a->vitrineId, 'tipo' => $tipo, 'origem' => 'vendedor', 'clienteId' => $c->id, 'vendedorId' => $c->vendedorId,
            'nomeCliente' => $c->nome, 'telefoneCliente' => $c->telefone, 'cep' => $tipo === 'condicional' ? $c->cep : null,
            'linhas' => $a->itens->map(fn ($i) => ['varianteId' => $i->varianteId, 'quantidade' => $i->quantidade])->all(), 'usuarioId' => $u->id,
            'aposCriar' => function (string $pedidoId) use ($id, $u) {
                $n = Atendimento::query()->whereKey($id)->whereNull('pedidoId')->whereNull('fechadoEm')->update(['pedidoId' => $pedidoId, 'etapa' => 'aguardando_pagamento', 'proximoContatoEm' => now()->addDay()->format('Y-m-d H:i:s.v')]);
                if (! $n) {
                    throw new ErroPedido('Este atendimento já virou pedido.');
                }
                $this->registro($id, 'pedido', 'Pedido criado a partir deste atendimento.', $u->id);
            },
        ]);

        return ['pedido' => $pedido, 'cliente' => $c, 'nomeVendedor' => $c->vendedor->name];
    }

    /** LGPD: apaga o contato de quem não tem ficha, a pedido da pessoa. Só o gestor. */
    public function apagarContato(User $u, string $id): void
    {
        $a = $this->doEscopo($u, $id);
        if ($a->clienteId) {
            throw new ErroNegocio('Este contato tem ficha: a exclusão é pela ficha da cliente.');
        }
        DB::transaction(function () use ($a) {
            $a->registros()->delete();
            $a->itens()->delete();
            $a->delete();
        });
    }

    /** @param array{id?: ?int, titulo: string, texto: string, daLoja: bool} $d */
    public function salvarResposta(User $u, array $d): RespostaPronta
    {
        if ($d['daLoja'] && ! $u->ehGestor()) {
            throw new ErroNegocio('Só o gestor edita as respostas da loja.');
        }
        if (! empty($d['id'])) {
            $r = RespostaPronta::query()->find($d['id']);
            if (! $r || ($r->usuarioId ? $r->usuarioId !== $u->id : ! $u->ehGestor())) {
                throw new ErroNegocio('Resposta não encontrada.');
            }
            $r->update(['titulo' => $d['titulo'], 'texto' => $d['texto']]);

            return $r;
        }

        return RespostaPronta::query()->create(['titulo' => $d['titulo'], 'texto' => $d['texto'], 'usuarioId' => $d['daLoja'] ? null : $u->id]);
    }

    public function excluirResposta(User $u, int $id): void
    {
        $r = RespostaPronta::query()->find($id);
        if (! $r || ($r->usuarioId ? $r->usuarioId !== $u->id : ! $u->ehGestor())) {
            throw new ErroNegocio('Resposta não encontrada.');
        }
        $r->delete();
    }
}
