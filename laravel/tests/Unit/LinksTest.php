<?php

namespace Tests\Unit;

use App\Support\Links;
use Tests\TestCase;

/** Links assinados iguais aos do sistema em Next (as chaves esperadas foram geradas no Node com o mesmo segredo). */
class LinksTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.links.segredo' => 'segredo-de-teste']);
    }

    public function test_assinaturas_iguais_as_do_next(): void
    {
        $this->assertSame('PED-000123.IiYyn9uKJiV0PwBR', Links::chaveDoPedido('PED-000123'));
        $this->assertSame('SUG-000007.i7A_HGvVywXpdChH', Links::chaveDaSugestao('SUG-000007'));
        $this->assertSame('REF1~cabc123.UaKtfeQGpzSuQx6j', Links::chaveDaPeca('REF1', 'cabc123'));
        $this->assertSame('COND-000045.fm9YfPOQOtRdeOt1', Links::chaveDoPagamento('COND-000045'));
    }

    public function test_confere_a_chave_e_recusa_a_adulterada(): void
    {
        $this->assertSame('PED-000123', Links::codigoDaChave('PED-000123.IiYyn9uKJiV0PwBR'));
        $this->assertNull(Links::codigoDaChave('PED-000124.IiYyn9uKJiV0PwBR'));
        $this->assertNull(Links::codigoDaChave('PED-000123.IiYyn9uKJiV0PwBX'));
        $this->assertNull(Links::codigoDaChave(null));
        $this->assertSame('SUG-000007', Links::codigoDaChaveSugestao('SUG-000007.i7A_HGvVywXpdChH'));
        $this->assertSame(['referencia' => 'REF1', 'vendedorId' => 'cabc123'], Links::dadosDaChavePeca('REF1~cabc123.UaKtfeQGpzSuQx6j'));
        $this->assertSame('COND-000045', Links::codigoDaChavePagamento('COND-000045.fm9YfPOQOtRdeOt1'));
        $this->assertNull(Links::codigoDaChavePagamento('PED-000123.IiYyn9uKJiV0PwBR'), 'a chave do pedido não abre o pagamento');
    }

    public function test_links_completos(): void
    {
        $this->assertSame('https://loja.com/p/PED-000123.IiYyn9uKJiV0PwBR', Links::publicoDoPedido('https://loja.com/', 'PED-000123'));
        $this->assertSame('https://loja.com/peca/REF1~cabc123.UaKtfeQGpzSuQx6j', Links::daPeca('https://loja.com', 'REF1', 'cabc123'));
    }
}
