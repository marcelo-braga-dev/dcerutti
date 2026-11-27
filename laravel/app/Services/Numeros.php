<?php

namespace App\Services;

use App\Enums\Papel;
use App\Exceptions\ErroNegocio;
use App\Models\Atendimento;
use App\Models\Cliente;
use App\Models\Configuracao;
use App\Models\NumeroWhatsApp;
use App\Models\Pedido;
use App\Models\User;
use App\Models\VinculoNumero;
use DateTimeInterface;
use Illuminate\Support\Facades\DB;

/**
 * Números de WhatsApp da loja e carteiras (D-31, docs/26; src/server/numeros.ts). Cada alteração roda em transação
 * com a linha do número travada: dois cliques não duplicam o vínculo. O histórico (`vinculo_numero`) só cresce.
 */
class Numeros
{
    /** Vínculo encerrado; conectado fica como pendência de desconectar o aparelho. */
    public function encerrar(VinculoNumero $v, string $porId, ?string $motivo, ?DateTimeInterface $agora = null): void
    {
        $agora ??= now();
        $v->update(['fimEm' => $agora, 'encerradoPorId' => $porId, 'motivoFim' => $motivo ? mb_substr($motivo, 0, 200) : null, 'desconectadoEm' => $v->conexao->value === 'conectado' ? null : $agora]);
    }

    /** Desativar a vendedora: sai de todos os números e deixa as pendências de desconexão. */
    public function encerrarVinculosDoUsuario(string $usuarioId, string $porId, string $motivo): int
    {
        $abertos = VinculoNumero::query()->where('usuarioId', $usuarioId)->whereNull('fimEm')->get();
        foreach ($abertos as $v) {
            $this->encerrar($v, $porId, $motivo);
        }
        User::query()->whereKey($usuarioId)->update(['numeroPrincipalId' => null]);

        return $abertos->count();
    }

    /** Clientes, pedidos em aberto e atendimentos abertos passam para outra vendedora ativa. */
    public function transferirCarteira(string $de, string $para): void
    {
        if ($de === $para || ! User::query()->whereKey($para)->where('papel', 'vendedor')->where('ativo', true)->exists()) {
            throw new ErroNegocio('Escolha uma vendedora ativa para receber a carteira.');
        }
        Cliente::query()->where('vendedorId', $de)->update(['vendedorId' => $para]);
        Pedido::query()->where('vendedorId', $de)->where('status', 'pendente')->update(['vendedorId' => $para]);
        Atendimento::query()->where('responsavelId', $de)->whereNull('fechadoEm')->update(['responsavelId' => $para]);
    }

    private function numeroOuErro(int $id): NumeroWhatsApp
    {
        DB::select('SELECT id FROM numero_whatsapp WHERE id = ? FOR UPDATE', [$id]);
        $n = NumeroWhatsApp::query()->find($id);
        if (! $n) {
            throw new ErroNegocio('Número não encontrado. Atualize a página.');
        }

        return $n;
    }

    /** Outro número aberto da pessoa, para assumir como principal; só número ativo atende. */
    private function outroPrincipal(string $usuarioId, int $exceto): ?int
    {
        return VinculoNumero::query()->where('usuarioId', $usuarioId)->whereNull('fimEm')->where('numeroId', '<>', $exceto)
            ->whereHas('numero', fn ($q) => $q->where('status', 'ativo'))->orderBy('inicioEm')->value('numeroId');
    }

    private function abrir(int $numeroId, string $usuarioId, string $porId): User
    {
        $pessoa = User::query()->whereKey($usuarioId)->where('ativo', true)->whereIn('papel', [Papel::Vendedor, Papel::Gestor])->with('numeroPrincipal:id,status')->first();
        if (! $pessoa) {
            throw new ErroNegocio('Pessoa não encontrada ou inativa.');
        }
        if (VinculoNumero::query()->where('numeroId', $numeroId)->where('usuarioId', $usuarioId)->whereNull('fimEm')->exists()) {
            throw new ErroNegocio('Esta pessoa já está neste número.');
        }
        VinculoNumero::query()->create(['numeroId' => $numeroId, 'usuarioId' => $usuarioId, 'vinculadoPorId' => $porId]);

        return $pessoa;
    }

    public function vincular(int $numeroId, string $usuarioId, string $porId): NumeroWhatsApp
    {
        return DB::transaction(function () use ($numeroId, $usuarioId, $porId) {
            $n = $this->numeroOuErro($numeroId);
            if ($n->status->value === 'desativado') {
                throw new ErroNegocio('Este número está desativado. Reative antes de ligar alguém.');
            }
            $pessoa = $this->abrir($numeroId, $usuarioId, $porId);
            // Vendedora sem número em uso: este passa a ser o principal. A gestora tem acesso, mas não carteira (Q-08).
            if ($pessoa->papel === Papel::Vendedor && $n->status->value === 'ativo' && $pessoa->numeroPrincipal?->status->value !== 'ativo') {
                $pessoa->update(['numeroPrincipalId' => $numeroId]);
            }

            return $n;
        });
    }

    /** @return array{numero: NumeroWhatsApp, pendenteDesconectar: bool} */
    public function desvincular(int $numeroId, string $usuarioId, string $porId, ?string $motivo = null, ?string $transferirPara = null): array
    {
        return DB::transaction(function () use ($numeroId, $usuarioId, $porId, $motivo, $transferirPara) {
            $n = $this->numeroOuErro($numeroId);
            $v = VinculoNumero::query()->where('numeroId', $numeroId)->where('usuarioId', $usuarioId)->whereNull('fimEm')->first();
            if (! $v) {
                throw new ErroNegocio('Esta pessoa já saiu deste número. Atualize a página.');
            }
            $pendente = $v->conexao->value === 'conectado';
            $this->encerrar($v, $porId, $motivo);
            if (User::query()->whereKey($usuarioId)->value('numeroPrincipalId') === $numeroId) {
                User::query()->whereKey($usuarioId)->update(['numeroPrincipalId' => $this->outroPrincipal($usuarioId, $numeroId)]);
            }
            if ($transferirPara) {
                $this->transferirCarteira($usuarioId, $transferirPara);
            }

            return ['numero' => $n, 'pendenteDesconectar' => $pendente];
        });
    }

    /** @return array{destino: NumeroWhatsApp, pendenteDesconectar: bool} */
    public function mover(int $origemId, int $destinoId, string $usuarioId, string $porId): array
    {
        if ($origemId === $destinoId) {
            throw new ErroNegocio('Escolha outro número.');
        }

        return DB::transaction(function () use ($origemId, $destinoId, $usuarioId, $porId) {
            // Sempre na mesma ordem: dois movimentos cruzados não travam um ao outro.
            foreach ([min($origemId, $destinoId), max($origemId, $destinoId)] as $id) {
                DB::select('SELECT id FROM numero_whatsapp WHERE id = ? FOR UPDATE', [$id]);
            }
            $destino = NumeroWhatsApp::query()->find($destinoId);
            if (! $destino || $destino->status->value === 'desativado') {
                throw new ErroNegocio('O número de destino está desativado.');
            }
            $v = VinculoNumero::query()->where('numeroId', $origemId)->where('usuarioId', $usuarioId)->whereNull('fimEm')->first();
            if (! $v) {
                throw new ErroNegocio('Esta pessoa já saiu deste número. Atualize a página.');
            }
            $pessoa = $this->abrir($destinoId, $usuarioId, $porId);
            $pendente = $v->conexao->value === 'conectado';
            $this->encerrar($v, $porId, "Mudou para {$destino->apelido}");
            if ($pessoa->papel === Papel::Vendedor && User::query()->whereKey($usuarioId)->value('numeroPrincipalId') === $origemId) {
                User::query()->whereKey($usuarioId)->update(['numeroPrincipalId' => $destino->status->value === 'ativo' ? $destinoId : $this->outroPrincipal($usuarioId, $origemId)]);
            }

            return ['destino' => $destino, 'pendenteDesconectar' => $pendente];
        });
    }

    public function definirPrincipal(int $numeroId, string $usuarioId): void
    {
        DB::transaction(function () use ($numeroId, $usuarioId) {
            $n = $this->numeroOuErro($numeroId);
            if ($n->status->value !== 'ativo') {
                throw new ErroNegocio('Só um número ativo pode ser o principal.');
            }
            if (User::query()->whereKey($usuarioId)->value('papel') !== Papel::Vendedor) {
                throw new ErroNegocio('Só quem vende tem número principal: o gestor não fica com carteira.');
            }
            if (! VinculoNumero::query()->where('numeroId', $numeroId)->where('usuarioId', $usuarioId)->whereNull('fimEm')->exists()) {
                throw new ErroNegocio('Ligue a pessoa a este número primeiro.');
            }
            User::query()->whereKey($usuarioId)->update(['numeroPrincipalId' => $numeroId]);
        });
    }

    /** A gestora confirma que conectou o aparelho. */
    public function confirmarConexao(int $vinculoId): void
    {
        $n = VinculoNumero::query()->whereKey($vinculoId)->whereNull('fimEm')->where('conexao', 'aguardando')->update(['conexao' => 'conectado', 'conectadoEm' => now()->format('Y-m-d H:i:s.v')]);
        if (! $n) {
            throw new ErroNegocio('Este vínculo já foi atualizado. Atualize a página.');
        }
    }

    /** A gestora confirma que desconectou o aparelho: a pendência sai da página. */
    public function confirmarDesconexao(int $vinculoId): void
    {
        $n = VinculoNumero::query()->whereKey($vinculoId)->whereNotNull('fimEm')->whereNull('desconectadoEm')->update(['desconectadoEm' => now()->format('Y-m-d H:i:s.v')]);
        if (! $n) {
            throw new ErroNegocio('Esta pendência já foi resolvida. Atualize a página.');
        }
    }

    /** Pausar tira o número do atendimento e mantém as pessoas; desativar também encerra os vínculos. O padrão fica protegido. */
    public function mudarStatus(int $id, string $status, string $porId): void
    {
        DB::transaction(function () use ($id, $status, $porId) {
            $n = $this->numeroOuErro($id);
            if ($status !== 'ativo' && $n->padrao) {
                throw new ErroNegocio('Este é o número padrão da loja. Defina outro como padrão antes.');
            }
            $n->update(['status' => $status]);
            if ($status === 'ativo') {
                return;
            }
            foreach (VinculoNumero::query()->where('numeroId', $id)->whereNull('fimEm')->get() as $v) {
                if ($status === 'desativado') {
                    $this->encerrar($v, $porId, 'Número desativado');
                }
                if (User::query()->whereKey($v->usuarioId)->value('numeroPrincipalId') === $id) {
                    User::query()->whereKey($v->usuarioId)->update(['numeroPrincipalId' => $this->outroPrincipal($v->usuarioId, $id)]);
                }
            }
        });
    }

    /** Troca o número padrão e copia para `whatsappLoja`, que é o que a loja lê. */
    public function definirPadrao(int $id): void
    {
        DB::transaction(function () use ($id) {
            $n = $this->numeroOuErro($id);
            if ($n->status->value !== 'ativo') {
                throw new ErroNegocio('Só um número ativo pode ser o padrão.');
            }
            NumeroWhatsApp::query()->where('padrao', true)->where('id', '<>', $id)->update(['padrao' => false]);
            $n->update(['padrao' => true]);
            Configuracao::query()->updateOrCreate(['chave' => 'whatsappLoja'], ['valor' => $n->telefone]);
        });
    }

    /**
     * Cadastra ou edita. Número que já teve alguém ligado ou pedido não troca de telefone.
     *
     * @param  array{id?: ?int, telefone: string, apelido: string, observacao: ?string}  $d
     */
    public function salvar(array $d, string $porId): NumeroWhatsApp
    {
        return DB::transaction(function () use ($d, $porId) {
            if (NumeroWhatsApp::query()->where('telefone', $d['telefone'])->when($d['id'] ?? null, fn ($q, $id) => $q->where('id', '<>', $id))->exists()) {
                throw new ErroNegocio('Este telefone já está cadastrado.');
            }
            if (empty($d['id'])) {
                return NumeroWhatsApp::query()->create(['telefone' => $d['telefone'], 'apelido' => $d['apelido'], 'observacao' => $d['observacao'], 'criadoPorId' => $porId]);
            }
            $n = $this->numeroOuErro($d['id']);
            if ($n->telefone !== $d['telefone']) {
                if (VinculoNumero::query()->where('numeroId', $n->id)->exists() || Pedido::query()->where('numeroId', $n->id)->exists()) {
                    throw new ErroNegocio('Este número já tem histórico e não pode trocar de telefone. Cadastre o novo e desative este.');
                }
                if ($n->padrao) {
                    Configuracao::query()->updateOrCreate(['chave' => 'whatsappLoja'], ['valor' => $d['telefone']]);
                }
            }
            $n->update(['telefone' => $d['telefone'], 'apelido' => $d['apelido'], 'observacao' => $d['observacao']]);

            return $n;
        });
    }
}
