<?php

use App\Http\Controllers\Api\AtividadeController;
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
use App\Http\Controllers\Painel\FichaClienteController;
use App\Http\Controllers\Painel\InicioController as PainelInicio;
use App\Http\Controllers\Painel\MidiaController;
use App\Http\Controllers\Painel\NovoPedidoController;
use App\Http\Controllers\Painel\NumeroController;
use App\Http\Controllers\Painel\PedidoController;
use App\Http\Controllers\Painel\PosVendaController;
use App\Http\Controllers\Painel\ProdutoController;
use App\Http\Controllers\Painel\SugestaoController;
use App\Http\Controllers\Painel\VendaController;
use App\Http\Controllers\Painel\VendedorController;
use App\Http\Controllers\Publico\ArquivoController;
use App\Http\Controllers\Publico\SugestaoController as SugestaoPublica;
use App\Services\Config;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ---------- Arquivos públicos (fotos e vídeos) ----------
Route::get('/arquivos/{caminho}', ArquivoController::class)->where('caminho', '.*')->name('arquivos');

// ---------- Sinal da equipe (presença e envios pelo WhatsApp) ----------
Route::post('/api/equipe', SinalEquipeController::class)->name('api.equipe');
Route::post('/api/atividade', AtividadeController::class)->name('api.atividade');

// ---------- Sugestão para a cliente (/s/…): sem login, a chave assinada autoriza ----------
Route::get('/s/{chave}', [SugestaoPublica::class, 'show'])->name('sugestao.publica');
Route::post('/s/{chave}/escolhas', [SugestaoPublica::class, 'escolhas']);
Route::post('/s/{chave}/responder', [SugestaoPublica::class, 'responder']);
Route::post('/s/{chave}/adicionar', [SugestaoPublica::class, 'adicionar']);

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
    Route::get('/painel/produtos', [ProdutoController::class, 'index'])->name('painel.produtos');
    Route::get('/painel/produtos/novo', [ProdutoController::class, 'create'])->name('painel.produtos.novo');
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
