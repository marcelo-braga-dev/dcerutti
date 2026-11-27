<?php

namespace Tests\Unit;

use App\Support\PlanilhaEstoque as P;
use PHPUnit\Framework\TestCase;

/** Regras da planilha de estoque (porta de tests/unit/planilha-estoque.test.ts). */
class PlanilhaEstoqueTest extends TestCase
{
    private static function linha(array $x = []): array
    {
        return [
            'linha' => 2, 'fornecedor' => 'CIA. HERING.', 'codigo' => '1', 'referencia' => '0201', 'codigoBarras' => '7890000000001', 'descricao' => 'CAMISETA MM MASC', 'tamanho' => 'M',
            'codigoCor' => 'N1007S', 'corVisual' => 'PRETO', 'estoque' => 1, 'condicional' => 0, 'reservadoEc' => 0, 'preco' => 79.99, ...$x,
        ];
    }

    public function test_le_o_cabecalho_e_as_linhas(): void
    {
        $r = P::lerLinhas([['Relatório'], P::COLUNAS, ['CIA. HERING.', 14122, '0111', 7890182721212, 'CAMISETA REGATA MASC', 'XXG', 'N0A00S', null, 2, 1, 0, 59.99]]);
        $this->assertSame([], $r['erros']);
        $l = $r['linhas'][0];
        $this->assertSame([3, '14122', '7890182721212', 2, 1, 59.99, ''], [$l['linha'], $l['codigo'], $l['codigoBarras'], $l['estoque'], $l['condicional'], $l['preco'], $l['corVisual']]);
        $this->assertStringContainsString('Faltam colunas', P::lerLinhas([['Fornecedor', 'Código']])['erros'][0]);
    }

    public function test_tamanhos_e_referencia_base(): void
    {
        $this->assertSame(['UNI', 'UNI', 'UNI'], array_map(P::tamanho(...), ['U', 'UN', 'uni']));
        $this->assertSame('39/40', P::tamanho('39/40'));
        $this->assertSame('020345996051', P::referenciaBase('020345996051G', 'G'));
        $this->assertSame('CAI23010919-0000', P::referenciaBase('CAI23010919-0000PP', 'XP'));
        $this->assertSame('ACT3773.107', P::referenciaBase('ACT3773.107.39', '39'));
        $this->assertSame('0201', P::referenciaBase('0201', 'M'));
    }

    public function test_estoque_e_ean(): void
    {
        $this->assertSame(1, P::estoque(['estoque' => 3, 'condicional' => 1, 'reservadoEc' => 1]));
        $this->assertSame(0, P::estoque(['estoque' => 1, 'condicional' => 2, 'reservadoEc' => 0]));
        $this->assertSame('7909719195355', P::ean('7909719195355'));
        $this->assertNull(P::ean('5105LP'));
    }

    public function test_agrupa(): void
    {
        $l = fn ($x) => self::linha($x);
        $g = P::agrupar([
            $l(['codigo' => '1', 'tamanho' => 'P']), $l(['codigo' => '2', 'tamanho' => 'M']), $l(['codigo' => '3', 'tamanho' => 'M', 'codigoCor' => 'AZ2EN', 'corVisual' => '']),
            $l(['fornecedor' => 'GARRA JEANS', 'codigo' => '4', 'referencia' => '1010L', 'tamanho' => '48', 'codigoCor' => 'PRETA', 'corVisual' => 'PRETO']),
            $l(['fornecedor' => 'GARRA JEANS', 'codigo' => '5', 'referencia' => '1010L', 'tamanho' => '50', 'codigoCor' => 'PRETO', 'corVisual' => 'PRETO']),
            ...array_map(fn ($t, $i) => $l(['fornecedor' => 'MACROPAMPA', 'codigo' => "9{$i}", 'referencia' => "10719{$i}", 'descricao' => "BLUSA CO4162 TRIFIL {$t} CR2 ML", 'tamanho' => $t, 'codigoCor' => 'BORDÔ', 'corVisual' => 'VINHO', 'preco' => 169]), ['P', 'M', 'G'], [0, 1, 2]),
        ]);
        $codigos = array_map(fn ($x) => implode(',', array_column($x['linhas'], 'codigo')), $g);
        sort($codigos);
        $this->assertSame(['1,2', '3', '4,5', '90,91,92'], $codigos);
    }

    public function test_nome_categoria_e_genero(): void
    {
        $this->assertSame('Camiseta Manga Curta Masculina - Preto', P::nome(self::linha(['descricao' => 'CAMISETA MM MASC'])));
        $this->assertSame('Shorts Natural - Bege', P::nome(self::linha(['descricao' => 'SHORTS NATURAL 07 2302 001 BEGE', 'corVisual' => 'BEGE', 'referencia' => '06.11.076863'])));
        $this->assertSame('Calcinha Lisa Básica Pereque - Verde', P::nome(self::linha(['descricao' => 'CALCINHA LISA BÁSICA PEREQUE GG VERDE', 'tamanho' => 'GG', 'corVisual' => 'VERDE', 'codigoCor' => 'VERDE'])));
        $this->assertSame('Camisas Polo', P::categoria('CAMISA POLO MM MASC'));
        $this->assertSame('Calças', P::categoria('MARION PREMIUM STR SUPER ALTA RETA BLACK'));
        $this->assertSame('Vestidos', P::categoria('VESTIDOS MULLET'));
        $this->assertSame('Calçados', P::categoria('TENIS AD UNISSEX CASUAL'));
        $this->assertSame('Outros', P::categoria('RIBANA 1X1 TUBULAR'));
        $this->assertSame('masculino', P::genero('BERMUDA MASC', 'Bermudas'));
        $this->assertSame('feminino', P::genero('VESTIDO LONGO', 'Vestidos'));
        $this->assertSame('feminino', P::genero('MARION PREMIUM STR SUPER ALTA RETA', 'Calças'));
        $this->assertSame('unissex', P::genero('TENIS AD UNISSEX', 'Calçados'));
    }

    public function test_cor_preco_referencia_e_marcas(): void
    {
        $this->assertNull(P::cor(['corVisual' => '', 'codigoCor' => 'N1007S']));
        $this->assertSame('Azul Marinho', P::cor(['corVisual' => 'AZUL MARINHO', 'codigoCor' => 'MARINHO']));
        $this->assertSame(79.99, P::preco([['preco' => 69.99], ['preco' => 79.99], ['preco' => 79.99]]));
        $ocupadas = ['1010L' => true];
        $g = P::agrupar([self::linha(['fornecedor' => 'GARRA', 'referencia' => '1010L', 'codigoCor' => 'PRETO'])])[0];
        $this->assertSame('1010L2', P::referenciaDoProduto($g, $ocupadas, false));
        $this->assertSame('1010LPRETO', P::referenciaDoProduto($g, $ocupadas, true));
        $this->assertSame(['marca' => 'Hering', 'ignorar' => false], P::regraPadrao('CIA. HERING.'));
        $this->assertSame('Garra Jeans', P::regraPadrao('GARRA JEANS INDUSTRIA E COMERCIO EIRELI')['marca']);
        $this->assertTrue(P::regraPadrao('MAKRO CENTRAL DE AVIAMENTOS LTDA')['ignorar']);
        $this->assertSame('Hering Intimates', P::marcaDoProduto('Hering', 'Cuecas'));
        $this->assertSame('Hering', P::marcaDoProduto('Hering', 'Camisetas'));
    }
}
