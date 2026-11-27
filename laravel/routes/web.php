<?php

use App\Http\Controllers\Api\AtividadeController;
use App\Http\Controllers\Api\PagamentoController as PagamentoApi;
use App\Http\Controllers\Api\SinalEquipeController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\CaixaController;
use App\Http\Controllers\Conta\CadastroController;
use App\Http\Controllers\Conta\EntrarController;
use App\Http\Controllers\Conta\PrivacidadeController;
use App\Http\Controllers\Conta\SenhaController;
use App\Http\Controllers\Loja\CatalogoController;
use App\Http\Controllers\Loja\InicioController as LojaInicio;
use App\Http\Controllers\Loja\MinhaContaController;
use App\Http\Controllers\Loja\ProdutoController as LojaProduto;
use App\Http\Controllers\Loja\SacolaController;
use App\Http\Controllers\Painel\AtendimentoController;
use App\Http\Controllers\Painel\BuscaController;
use App\Http\Controllers\Painel\ClienteController;
use App\Http\Controllers\Painel\CupomController;
use App\Http\Controllers\Painel\DetalhePedidoController;
use App\Http\Controllers\Painel\EnvioPecaController;
use App\Http\Controllers\Painel\EquipeController;
use App\Http\Controllers\Painel\FichaClienteController;
use App\Http\Controllers\Painel\ImportacaoController;
use App\Http\Controllers\Painel\InicioController as PainelInicio;
use App\Http\Controllers\Painel\InteresseController;
use App\Http\Controllers\Painel\LojaController;
use App\Http\Controllers\Painel\MidiaController;
use App\Http\Controllers\Painel\NotificacaoController;
use App\Http\Controllers\Painel\NovoPedidoController;
use App\Http\Controllers\Painel\NumeroController;
use App\Http\Controllers\Painel\PagamentoController as PagamentoPainel;
use App\Http\Controllers\Painel\PedidoController;
use App\Http\Controllers\Painel\PosVendaController;
use App\Http\Controllers\Painel\ProdutoController;
use App\Http\Controllers\Painel\ResultadosController;
use App\Http\Controllers\Painel\SugestaoController;
use App\Http\Controllers\Painel\VendaController;
use App\Http\Controllers\Painel\VendedorController;
use App\Http\Controllers\Painel\VitrineController;
use App\Http\Controllers\Publico\ArquivoController;
use App\Http\Controllers\Publico\PagarController;
use App\Http\Controllers\Publico\PecaController as PecaPublica;
use App\Http\Controllers\Publico\PedidoController as PedidoPublico;
use App\Http\Controllers\Publico\SugestaoController as SugestaoPublica;
use App\Http\Controllers\Publico\VitrineController as VitrinePublica;
use App\Services\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ---------- Arquivos públicos (fotos e vídeos) ----------
Route::get('/arquivos/{caminho}', ArquivoController::class)->where('caminho', '.*')->name('arquivos');

// ---------- Sinal da equipe (presença e envios pelo WhatsApp) ----------
Route::post('/api/equipe', SinalEquipeController::class)->name('api.equipe');
// Monitor externo: 200 com o banco respondendo, 503 sem banco. Não expõe detalhes.
Route::get('/api/saude', function () {
    try {
        DB::select('SELECT 1');

        return response()->json(['ok' => true], 200, ['Cache-Control' => 'no-store']);
    } catch (Throwable) {
        return response()->json(['ok' => false], 503, ['Cache-Control' => 'no-store']);
    }
})->name('api.saude');
Route::post('/api/atividade', AtividadeController::class)->name('api.atividade');

// ---------- Pagamento online (docs/27): aviso do Mercado Pago e o link /pagar (sem login; a chave assinada autoriza) ----------
Route::post('/api/pagamentos/mercadopago', [PagamentoApi::class, 'aviso'])->name('api.pagamentos.aviso');
Route::get('/api/pagamentos/situacao', [PagamentoApi::class, 'situacao'])->name('api.pagamentos.situacao');
Route::get('/pagar/{chave}', [PagarController::class, 'show'])->name('pagar');
Route::post('/pagar/{chave}', [PagarController::class, 'pagar']);
Route::post('/pagar/{chave}/simular', [PagarController::class, 'simular']);
Route::get('/pagar/{chave}/retorno', [PagarController::class, 'retorno'])->name('pagar.retorno');

// ---------- Sugestão para a cliente (/s/…): sem login, a chave assinada autoriza ----------
Route::get('/s/{chave}', [SugestaoPublica::class, 'show'])->name('sugestao.publica');
Route::get('/s/{chave}/cartao.jpg', [SugestaoPublica::class, 'cartao']);
Route::get('/p/{chave}', [PedidoPublico::class, 'show'])->name('pedido.publico');
Route::get('/p/{chave}/cartao.jpg', [PedidoPublico::class, 'cartao']);
Route::post('/s/{chave}/escolhas', [SugestaoPublica::class, 'escolhas']);
Route::post('/s/{chave}/responder', [SugestaoPublica::class, 'responder']);
Route::post('/s/{chave}/adicionar', [SugestaoPublica::class, 'adicionar']);

// ---------- Vitrines e link da peça (docs/26): sem login ----------
Route::get('/vitrines', [VitrinePublica::class, 'index'])->name('vitrines');
Route::get('/vitrine/{slug}', [VitrinePublica::class, 'show'])->name('vitrine.publica');
Route::post('/vitrine/{slug}/interesse', [VitrinePublica::class, 'interesse']);
Route::get('/live', [VitrinePublica::class, 'live'])->name('live');
Route::get('/peca/{chave}', [PecaPublica::class, 'show'])->name('peca.publica');
Route::get('/peca/{chave}/cartao.jpg', [PecaPublica::class, 'cartao']);
Route::post('/peca/{chave}/quero', [PecaPublica::class, 'quero']);

// ---------- Conta ----------
Route::middleware('guest')->group(function () {
    Route::get('/entrar', [EntrarController::class, 'show'])->name('entrar');
    Route::post('/entrar', [EntrarController::class, 'store']);
    Route::get('/cadastro', [CadastroController::class, 'show'])->name('cadastro');
    Route::post('/cadastro', [CadastroController::class, 'store']);
});
Route::get('/esqueci-senha', [SenhaController::class, 'esqueci'])->name('senha.esqueci');
Route::post('/esqueci-senha', [SenhaController::class, 'pedir']);
Route::get('/redefinir-senha', [SenhaController::class, 'redefinir'])->name('senha.redefinir');
Route::post('/redefinir-senha', [SenhaController::class, 'salvar']);
Route::get('/privacidade', [PrivacidadeController::class, 'show'])->name('privacidade');
Route::post('/privacidade', [PrivacidadeController::class, 'aceitar'])->middleware('auth');
Route::post('/sair', [EntrarController::class, 'destroy'])->middleware('auth')->name('sair');

// ---------- Loja (catálogo privado, D-09) ----------
Route::middleware('loja')->group(function () {
    Route::get('/', [LojaInicio::class, 'index'])->name('loja.inicio');
    Route::get('/catalogo', CatalogoController::class)->name('loja.catalogo');
    Route::get('/produto/{referencia}', LojaProduto::class)->name('loja.produto');
    Route::get('/sacola', [SacolaController::class, 'show'])->name('loja.sacola');
    Route::post('/sacola/conferir', [SacolaController::class, 'conferir']);
});
// Só a cliente: enviar o pedido, cupom, favoritos e a área dela.
Route::middleware(['auth', 'papel:cliente', 'loja'])->group(function () {
    Route::post('/sacola/cupom', [SacolaController::class, 'previaCupom']);
    Route::post('/sacola/enviar', [SacolaController::class, 'enviar']);
    Route::post('/favoritos/{produtoId}', [MinhaContaController::class, 'alternarFavorito'])->whereNumber('produtoId');
    Route::get('/minha-conta', [MinhaContaController::class, 'dados'])->name('conta.dados');
    Route::put('/minha-conta', [MinhaContaController::class, 'atualizar']);
    Route::delete('/minha-conta', [MinhaContaController::class, 'excluir']);
    Route::get('/minha-conta/pedidos', [MinhaContaController::class, 'pedidos'])->name('conta.pedidos');
    Route::post('/minha-conta/pedidos/{id}/cancelar', [MinhaContaController::class, 'cancelarPedido']);
    Route::get('/minha-conta/pedidos/{id}/recomprar', [MinhaContaController::class, 'recomprar']);
    Route::get('/minha-conta/favoritos', [MinhaContaController::class, 'favoritos'])->name('conta.favoritos');
    Route::get('/minha-conta/cupons', [MinhaContaController::class, 'cupons'])->name('conta.cupons');
    Route::get('/minha-conta/sugestoes', [MinhaContaController::class, 'sugestoes'])->name('conta.sugestoes');
});
// Editor visual da página inicial (só o gestor).
Route::middleware(['auth', 'papel:gestor', 'loja'])->group(function () {
    Route::get('/editar/inicio', [LojaInicio::class, 'editar'])->name('editar.inicio');
    Route::put('/editar/inicio', [LojaInicio::class, 'salvar']);
    Route::post('/editar/inicio/imagem', [LojaInicio::class, 'enviarImagem']);
});

// ---------- Painel e caixa (equipe) ----------
Route::middleware(['auth', 'papel:vendedor,gestor'])->group(function () {
    Route::get('/painel', PainelInicio::class)->name('painel.inicio');
    Route::get('/caixa', [CaixaController::class, 'index'])->name('caixa');
    Route::get('/caixa/vendas', [CaixaController::class, 'vendas'])->name('caixa.vendas');
    Route::get('/caixa/clientes', [CaixaController::class, 'buscarClientes']);
    Route::post('/caixa/clientes', [CaixaController::class, 'cadastrarCliente']);
    Route::post('/caixa/cupom', [CaixaController::class, 'previaCupom']);
    Route::post('/caixa/vendas', [CaixaController::class, 'registrar']);
    Route::get('/painel/busca', BuscaController::class)->name('painel.busca');
    Route::get('/painel/notificacoes', [NotificacaoController::class, 'index'])->name('painel.notificacoes');
    Route::get('/painel/interesse', InteresseController::class)->name('painel.interesse');
    Route::post('/painel/notificacoes/lidas', [NotificacaoController::class, 'lidas']);
    Route::post('/painel/notificacoes/preferencias', [NotificacaoController::class, 'salvarPreferencias']);
    Route::get('/painel/tutorial', fn (Config $c) => Inertia::render('Painel/Tutorial', [
        'gestor' => request()->user()->ehGestor(), 'atendimento' => (bool) $c->get('atendimento.ligado'), 'vitrines' => (bool) $c->get('vitrines.ligadas'), 'cupons' => (bool) $c->get('cupons.ligados'),
    ]))->name('painel.tutorial');
    Route::get('/painel/pedidos', [PedidoController::class, 'index'])->name('painel.pedidos');
    Route::get('/painel/pedidos/novo', [NovoPedidoController::class, 'create'])->name('painel.pedidos.novo');
    Route::post('/painel/pedidos', [NovoPedidoController::class, 'store'])->name('painel.pedidos.store');
    Route::get('/painel/clientes', [ClienteController::class, 'index'])->name('painel.clientes');
    Route::get('/painel/clientes/novo', [FichaClienteController::class, 'create'])->name('painel.clientes.novo');
    Route::post('/painel/clientes', [FichaClienteController::class, 'store']);
    Route::get('/painel/clientes/{id}', [FichaClienteController::class, 'show'])->name('painel.clientes.show');
    Route::put('/painel/clientes/{id}', [FichaClienteController::class, 'update']);
    Route::post('/painel/clientes/{id}/vendas', [FichaClienteController::class, 'vendaManual']);
    Route::get('/painel/clientes/{id}/historico', [FichaClienteController::class, 'historico'])->name('painel.clientes.historico');
    Route::get('/painel/vendas', [VendaController::class, 'index'])->name('painel.vendas');
    Route::get('/painel/cupons', [CupomController::class, 'index'])->name('painel.cupons');
    Route::get('/painel/atendimento', [AtendimentoController::class, 'index'])->name('painel.atendimento');
    Route::get('/painel/atendimento/lista', [AtendimentoController::class, 'lista'])->name('painel.atendimento.lista');
    Route::get('/painel/atendimento/novo', [AtendimentoController::class, 'create'])->name('painel.atendimento.novo');
    Route::get('/painel/atendimento/equipe', [AtendimentoController::class, 'equipe'])->name('painel.atendimento.equipe');
    Route::get('/painel/atendimento/respostas', [AtendimentoController::class, 'respostas'])->name('painel.atendimento.respostas');
    Route::post('/painel/atendimento/respostas', [AtendimentoController::class, 'salvarResposta']);
    Route::delete('/painel/atendimento/respostas/{id}', [AtendimentoController::class, 'excluirResposta'])->whereNumber('id');
    Route::post('/painel/atendimento', [AtendimentoController::class, 'store']);
    Route::get('/painel/atendimento/{id}', [AtendimentoController::class, 'show'])->name('painel.atendimento.show');
    Route::post('/painel/atendimento/{id}/etapa', [AtendimentoController::class, 'etapa']);
    Route::post('/painel/atendimento/{id}/adiar', [AtendimentoController::class, 'adiar']);
    Route::post('/painel/atendimento/{id}/nota', [AtendimentoController::class, 'nota']);
    Route::post('/painel/atendimento/{id}/contato-feito', [AtendimentoController::class, 'contatoFeito']);
    Route::post('/painel/atendimento/{id}/contato', [AtendimentoController::class, 'informarContato']);
    Route::post('/painel/atendimento/{id}/transferir', [AtendimentoController::class, 'transferir']);
    Route::post('/painel/atendimento/{id}/pecas', [AtendimentoController::class, 'pecaAdicionar']);
    Route::delete('/painel/atendimento/{id}/pecas/{itemId}', [AtendimentoController::class, 'pecaRemover'])->whereNumber('itemId');
    Route::post('/painel/atendimento/{id}/pedido', [AtendimentoController::class, 'pedido']);
    Route::delete('/painel/atendimento/{id}', [AtendimentoController::class, 'apagar']);
    Route::post('/painel/pos-venda/{id}/concluir', [PosVendaController::class, 'concluirContato'])->whereNumber('id');
    Route::post('/painel/pos-venda/{id}/atendimento', [PosVendaController::class, 'viraAtendimento'])->whereNumber('id');
    Route::post('/painel/clientes/{clienteId}/sem-ofertas', [PosVendaController::class, 'descadastrar']);
    Route::get('/painel/sugestoes', [SugestaoController::class, 'index'])->name('painel.sugestoes');
    Route::get('/painel/sugestoes/nova', [SugestaoController::class, 'create'])->name('painel.sugestoes.nova');
    Route::get('/painel/sugestoes/pecas', [SugestaoController::class, 'pecas']);
    Route::get('/painel/sugestoes/historico/{clienteId}', [SugestaoController::class, 'historico']);
    Route::get('/painel/sugestoes/automatica/{clienteId}', [SugestaoController::class, 'automatica']);
    Route::post('/painel/sugestoes', [SugestaoController::class, 'store']);
    Route::get('/painel/sugestoes/{id}', [SugestaoController::class, 'show'])->name('painel.sugestoes.show');
    Route::post('/painel/sugestoes/{id}/cancelar', [SugestaoController::class, 'cancelar']);
    Route::post('/painel/sugestoes/{id}/renovar', [SugestaoController::class, 'renovar']);
    Route::post('/painel/sugestoes/{id}/enviada', [SugestaoController::class, 'enviada']);
    Route::post('/painel/sugestoes/{id}/lembrar', [SugestaoController::class, 'lembrar']);
    Route::get('/painel/vitrines', [VitrineController::class, 'index'])->name('painel.vitrines');
    Route::get('/painel/vitrines/nova', [VitrineController::class, 'create'])->name('painel.vitrines.nova');
    Route::get('/painel/vitrines/pecas', [VitrineController::class, 'pecas']);
    Route::post('/painel/vitrines', [VitrineController::class, 'store']);
    Route::get('/painel/vitrines/{id}', [VitrineController::class, 'show'])->name('painel.vitrines.show');
    Route::put('/painel/vitrines/{id}', [VitrineController::class, 'update']);
    Route::post('/painel/vitrines/{id}/pecas', [VitrineController::class, 'pecaAdicionar']);
    Route::delete('/painel/vitrines/{id}/pecas/{pecaId}', [VitrineController::class, 'pecaRemover'])->whereNumber('pecaId');
    Route::post('/painel/vitrines/{id}/pecas/{pecaId}/mover', [VitrineController::class, 'pecaMover'])->whereNumber('pecaId');
    Route::post('/painel/vitrines/{id}/pecas/{pecaId}/oferta', [VitrineController::class, 'oferta'])->whereNumber('pecaId');
    Route::post('/painel/vitrines/{id}/status', [VitrineController::class, 'status']);
    Route::post('/painel/vitrines/{id}/duplicar', [VitrineController::class, 'duplicar']);
    Route::get('/painel/pecas/{referencia}/envio', [EnvioPecaController::class, 'preparar']);
    Route::post('/painel/pecas/{referencia}/enviada', [EnvioPecaController::class, 'enviada']);
    Route::post('/painel/pedidos/{id}/pagamento/link', [PagamentoPainel::class, 'link']);
    Route::post('/painel/pedidos/{id}/frete', [PagamentoPainel::class, 'frete']);
    Route::post('/painel/cobrancas/{id}/conferir', [PagamentoPainel::class, 'conferir']);
    Route::post('/painel/cobrancas/{id}/cancelar', [PagamentoPainel::class, 'cancelar']);
    Route::post('/painel/cobrancas/{id}/estornar', [PagamentoPainel::class, 'estornar']);
    Route::delete('/painel/vendas/{id}', [VendaController::class, 'destroy']);
    Route::get('/painel/produtos/{id}/midia', [MidiaController::class, 'show'])->whereNumber('id')->name('painel.produtos.midia');
    Route::put('/painel/produtos/{id}/midia', [MidiaController::class, 'update'])->whereNumber('id');
    Route::post('/api/upload', [UploadController::class, 'foto'])->name('api.upload');
    Route::post('/api/upload/video', [UploadController::class, 'video'])->name('api.upload.video');
    Route::get('/painel/pecas/busca', [DetalhePedidoController::class, 'buscarPecas'])->name('painel.pecas.busca');
    Route::get('/painel/pedidos/{id}', [DetalhePedidoController::class, 'show'])->name('painel.pedidos.show');
    Route::post('/painel/pedidos/{id}/confirmar', [DetalhePedidoController::class, 'confirmar']);
    Route::post('/painel/pedidos/{id}/itens', [DetalhePedidoController::class, 'editarItens']);
    Route::post('/painel/pedidos/{id}/cupom', [DetalhePedidoController::class, 'cupom']);
    Route::post('/painel/pedidos/{id}/cancelar', [DetalhePedidoController::class, 'cancelar']);
    Route::post('/painel/pedidos/{id}/situacao', [DetalhePedidoController::class, 'situacao']);
});

// ---------- Gestão (só o gestor) ----------
Route::middleware(['auth', 'papel:gestor'])->group(function () {
    Route::get('/painel/pagamentos', [PagamentoPainel::class, 'index'])->name('painel.pagamentos');
    Route::get('/painel/resultados', ResultadosController::class)->name('painel.resultados');
    Route::get('/painel/equipe', EquipeController::class)->name('painel.equipe');
    Route::get('/painel/configuracoes', [LojaController::class, 'configuracoes'])->name('painel.configuracoes');
    Route::put('/painel/configuracoes', [LojaController::class, 'salvarConfiguracoes']);
    Route::get('/painel/identidade', [LojaController::class, 'identidade'])->name('painel.identidade');
    Route::post('/painel/identidade', [LojaController::class, 'salvarIdentidade']);
    Route::get('/painel/configuracoes/pagamento', [PagamentoPainel::class, 'configuracao'])->name('painel.configuracoes.pagamento');
    Route::put('/painel/configuracoes/pagamento', [PagamentoPainel::class, 'salvarConfiguracao']);
    Route::post('/painel/configuracoes/pagamento/testar', [PagamentoPainel::class, 'testar']);
    Route::get('/painel/produtos', [ProdutoController::class, 'index'])->name('painel.produtos');
    Route::get('/painel/produtos/novo', [ProdutoController::class, 'create'])->name('painel.produtos.novo');
    Route::get('/painel/produtos/importar', [ImportacaoController::class, 'index'])->name('painel.produtos.importar');
    Route::post('/painel/produtos/importar', [ImportacaoController::class, 'enviar']);
    Route::post('/painel/produtos/importar/previa', [ImportacaoController::class, 'previa']);
    Route::post('/painel/produtos/importar/confirmar', [ImportacaoController::class, 'confirmar']);
    Route::post('/painel/produtos', [ProdutoController::class, 'store']);
    Route::get('/painel/produtos/{id}', [ProdutoController::class, 'show'])->whereNumber('id')->name('painel.produtos.show');
    Route::put('/painel/produtos/{id}', [ProdutoController::class, 'update'])->whereNumber('id');
    Route::delete('/painel/produtos/{id}', [ProdutoController::class, 'destroy'])->whereNumber('id');
    Route::post('/painel/produtos/{id}/variantes', [ProdutoController::class, 'adicionarVariante'])->whereNumber('id');
    Route::delete('/painel/produtos/{id}/variantes/{varianteId}', [ProdutoController::class, 'removerVariante'])->whereNumber(['id', 'varianteId']);
    Route::post('/painel/produtos/{id}/estoque', [ProdutoController::class, 'ajustarEstoque'])->whereNumber('id');
    Route::get('/painel/cupons/novo', [CupomController::class, 'create'])->name('painel.cupons.novo');
    Route::get('/painel/cupons/campanhas', [CupomController::class, 'campanhas'])->name('painel.cupons.campanhas');
    Route::post('/painel/cupons/campanhas', [CupomController::class, 'salvarCampanha']);
    Route::post('/painel/cupons', [CupomController::class, 'store']);
    Route::get('/painel/cupons/{id}', [CupomController::class, 'show'])->whereNumber('id')->name('painel.cupons.show');
    Route::put('/painel/cupons/{id}', [CupomController::class, 'update'])->whereNumber('id');
    Route::post('/painel/cupons/{id}/ativo', [CupomController::class, 'alternar'])->whereNumber('id');
    Route::delete('/painel/cupons/{id}', [CupomController::class, 'destroy'])->whereNumber('id');
    Route::get('/painel/numeros', [NumeroController::class, 'index'])->name('painel.numeros');
    Route::post('/painel/numeros', [NumeroController::class, 'salvar']);
    Route::get('/painel/numeros/{id}', [NumeroController::class, 'show'])->whereNumber('id')->name('painel.numeros.show');
    Route::put('/painel/numeros/{id}', [NumeroController::class, 'salvar'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/ligar', [NumeroController::class, 'ligar'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/tirar', [NumeroController::class, 'tirar'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/mover', [NumeroController::class, 'mover'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/principal', [NumeroController::class, 'principal'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/status', [NumeroController::class, 'status'])->whereNumber('id');
    Route::post('/painel/numeros/{id}/padrao', [NumeroController::class, 'padrao'])->whereNumber('id');
    Route::get('/painel/numeros/{id}/impacto', [NumeroController::class, 'impacto'])->whereNumber('id');
    Route::post('/painel/numeros/vinculos/{vinculoId}/conexao', [NumeroController::class, 'conexao'])->whereNumber('vinculoId');
    Route::get('/painel/vendedores', [VendedorController::class, 'index'])->name('painel.vendedores');
    Route::get('/painel/vendedores/novo', [VendedorController::class, 'create'])->name('painel.vendedores.novo');
    Route::post('/painel/vendedores', [VendedorController::class, 'store']);
    Route::get('/painel/vendedores/{id}', [VendedorController::class, 'show'])->name('painel.vendedores.show');
    Route::put('/painel/vendedores/{id}', [VendedorController::class, 'update']);
    Route::post('/painel/vendedores/{id}/desativar', [VendedorController::class, 'desativar']);
    Route::post('/painel/vendedores/{id}/reativar', [VendedorController::class, 'reativar']);
    Route::post('/painel/vendedores/{id}/metas', [VendedorController::class, 'meta']);
});
