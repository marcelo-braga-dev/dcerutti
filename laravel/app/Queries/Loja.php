<?php

namespace App\Queries;

use App\Enums\Papel;
use App\Models\Cliente;
use App\Models\Favorito;
use App\Models\User;
use App\Services\Config;
use App\Support\Contato;
use App\Support\FiltroCatalogo;

/** Consultas da loja e da conta da cliente (src/server/consultas/clientes.ts, parte da loja). */
class Loja
{
    public function __construct(private Config $config) {}

    /**
     * Peça como o card da vitrine precisa (sem descrição, destaques, composição e vídeos).
     *
     * @param  array<string, mixed>  $p
     * @return array<string, mixed>
     */
    public static function cartao(array $p): array
    {
        return [
            'id' => $p['id'], 'referencia' => $p['referencia'], 'nome' => $p['nome'], 'marca' => $p['marca'], 'marcaSlug' => $p['marcaSlug'],
            'categoria' => $p['categoria'], 'categoriaSlug' => $p['categoriaSlug'], 'genero' => $p['genero'], 'cor' => $p['cor'],
            'preco' => $p['preco'], 'precoCheio' => $p['precoCheio'], 'imperdivel' => $p['imperdivel'], 'imagens' => array_slice($p['imagens'], 0, 2),
            'variantes' => $p['variantes'], 'modelo' => $p['modelo'] ?? null, 'corNome' => $p['corNome'] ?? null, 'cores' => $p['cores'] ?? [],
        ];
    }

    /**
     * Menu do celular e atalhos da busca: as 10 categorias com mais peças disponíveis.
     *
     * @param  list<array<string, mixed>>  $lista
     * @return list<array{rotulo: string, href: string}>
     */
    public static function atalhos(array $lista): array
    {
        $porCategoria = [];
        foreach ($lista as $p) {
            if (! FiltroCatalogo::emEstoque($p)) {
                continue;
            }
            $porCategoria[$p['categoriaSlug']] ??= ['rotulo' => $p['categoria'], 'href' => "/catalogo?categoria={$p['categoriaSlug']}", 'n' => 0];
            $porCategoria[$p['categoriaSlug']]['n']++;
        }
        $l = array_values($porCategoria);
        usort($l, fn ($a, $b) => $b['n'] <=> $a['n']);

        return array_map(fn ($c) => ['rotulo' => $c['rotulo'], 'href' => $c['href']], array_slice($l, 0, 10));
    }

    public static function ehCliente(?User $u): bool
    {
        return $u?->papel === Papel::Cliente;
    }

    /** Ficha da cliente logada, com a vendedora e o número dela. */
    public function ficha(?User $u): ?Cliente
    {
        if (! self::ehCliente($u)) {
            return null;
        }

        return Cliente::query()->where('userId', $u->id)->with(['vendedor:id,name,ativo,numeroPrincipalId', 'vendedor.'.Contato::COM])->first();
    }

    /** @return list<int> Produtos favoritos da cliente logada, do mais recente para o mais antigo. */
    public function favoritos(?User $u): array
    {
        if (! self::ehCliente($u)) {
            return [];
        }
        $clienteId = Cliente::query()->where('userId', $u->id)->value('id');

        return $clienteId ? Favorito::query()->where('clienteId', $clienteId)->orderByDesc('criadoEm')->pluck('produtoId')->map(fn ($id) => (int) $id)->all() : [];
    }

    /** Quem atende a cliente logada (nome e WhatsApp), ou null quando é a loja. @return ?array{nome: string, telefone: string} */
    public function atendimento(?User $u): ?array
    {
        $c = $this->ficha($u);
        $contato = $c ? Contato::de($c->vendedor, '') : null;

        return $contato && $contato['nome'] ? ['nome' => $contato['nome'], 'telefone' => $contato['telefone']] : null;
    }
}
