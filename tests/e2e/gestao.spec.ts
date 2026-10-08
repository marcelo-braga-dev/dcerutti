/**
 * Painel do gestor e do vendedor, sobre o seed completo: produtos (cadastro, validação, tamanhos, estoque, exclusão,
 * filtros), vendedores e metas, configurações refletindo na loja, vendas manuais, resultados e o escopo do vendedor.
 * Cada teste cria o que vai alterar (nomes com carimbo de tempo), então a suíte pode rodar de novo sem recriar o banco.
 */
import { expect, test, type Page } from '@playwright/test';
import { entrar, SENHA } from './ajuda';

const carimbo = () => Date.now().toString(36).slice(-6).toUpperCase();
const numero = (t: string | null) => Number((t ?? '').replace(/[^\d,-]/g, '').replace(',', '.'));
const aceitarConfirmacao = (page: Page) => page.once('dialog', d => d.accept());
/** Marca, categoria e gênero não têm valor padrão no formulário de produto: o gestor sempre escolhe. */
const formTamanho = (page: Page) => page.locator('form', { has: page.locator('input[name=tamanho]') });
const formEstoque = (page: Page) => page.locator('form', { has: page.locator('select[name=tipo]') });
async function escolherBasicos(page: Page) {
  await page.selectOption('select[name=marcaId]', { label: 'Hering' });
  await page.selectOption('select[name=categoriaId]', { label: 'Camisetas' });
  await page.selectOption('select[name=genero]', 'feminino');
}

test.describe('produtos (gestor)', () => {
  test.beforeEach(({ page }) => entrar(page, 'gestor@dcerutti.local'));

  test('cadastro: erros por campo, depois sucesso; aparece na loja com o preço certo', async ({ page }) => {
    const ref = `E2E${carimbo()}`;
    await page.goto('/painel/produtos/novo');
    await page.fill('input[name=referencia]', ref);
    await page.fill('input[name=nome]', 'Ca');
    await page.fill('input[name=preco]', '0');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByText('Informe o nome.')).toBeVisible();
    await expect(page.getByText('Informe o preço de venda.')).toBeVisible();

    await escolherBasicos(page);
    await page.fill('input[name=nome]', `Camiseta Teste ${ref}`);
    await page.fill('input[name=preco]', '120');
    await page.fill('input[name=precoCheio]', '100');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByText(/preço cheio deve ser maior ou igual/)).toBeVisible();

    await page.fill('input[name=precoCheio]', '150');
    await page.fill('input[name=custo]', '45,50');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page).toHaveURL(/\/painel\/produtos\/\d+$/);

    // Sem tamanho com estoque ainda: adiciona um.
    await page.fill('input[name=tamanho]', 'm');
    await page.fill('input[name=estoque]', '4');
    await formTamanho(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Tamanho M adicionado.')).toBeVisible();
    await page.fill('input[name=tamanho]', 'M');
    await page.fill('input[name=estoque]', '1');
    await formTamanho(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Este tamanho já existe no produto.')).toBeVisible();

    const loja = await (await page.context().browser()!.newContext()).newPage();
    await entrar(loja, 'cliente.carlos@dcerutti.local');
    await loja.goto(`/produto/${ref}`);
    await expect(loja.getByRole('heading', { level: 1 })).toHaveText(`Camiseta Teste ${ref}`);
    await expect(loja.getByText('-20%').first()).toBeVisible();
    await loja.getByRole('radio', { name: 'M', exact: true }).click();
    await expect(loja.getByText('4 em estoque')).toBeVisible();
  });

  test('referência repetida é recusada', async ({ page }) => {
    await page.goto('/painel/produtos/novo');
    await page.fill('input[name=referencia]', 'fix-promo');
    await page.fill('input[name=nome]', 'Duplicado');
    await page.fill('input[name=preco]', '10');
    await escolherBasicos(page);
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByText('Já existe um produto com esta referência.')).toBeVisible();
  });

  test('entrada e contagem de estoque ficam no histórico com o nome de quem fez', async ({ page }) => {
    await page.goto('/painel/produtos/novo');
    const ref = `E2E${carimbo()}`;
    await page.fill('input[name=referencia]', ref);
    await page.fill('input[name=nome]', `Meia Teste ${ref}`);
    await page.fill('input[name=preco]', '20');
    await escolherBasicos(page);
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page).toHaveURL(/\/painel\/produtos\/\d+$/);
    await page.fill('input[name=tamanho]', 'U');
    await page.fill('input[name=estoque]', '2');
    await formTamanho(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Tamanho U adicionado.')).toBeVisible();

    // O formulário se limpa depois de cada registro: escolhe o tamanho a cada movimentação.
    await page.selectOption('select[name=varianteId]', { index: 1 });
    await page.selectOption('select[name=tipo]', 'entrada');
    await page.fill('input[name=quantidade]', '5');
    await page.fill('input[name=observacao]', 'Nota fiscal 777');
    await formEstoque(page).getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Estoque atualizado.')).toBeVisible();
    await page.selectOption('select[name=varianteId]', { index: 1 });
    await page.selectOption('select[name=tipo]', 'ajuste');
    await page.fill('input[name=quantidade]', '3');
    await formEstoque(page).getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Estoque atualizado.')).toBeVisible();
    await page.reload();
    const historico = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Histórico de estoque' }) }).last();
    // Estoque 2 (inicial) + 5 (entrada) = 7; contagem de 3 registra −4. Quem fez aparece pelo primeiro nome.
    await expect(historico).toContainText('-4 · Tam. U · Ajuste');
    await expect(historico).toContainText('+5 · Tam. U · Entrada · Nota fiscal 777');
    await expect(historico).toContainText('+2 · Tam. U · Entrada · Estoque inicial');
    await expect(historico).toContainText('Gestor');
  });

  test('excluir produto: sai do painel e a página da loja some', async ({ page }) => {
    // Cria o próprio produto (sem pedidos) para excluir: não depende do seed nem de execuções anteriores.
    const ref = `DEL${carimbo()}`;
    await page.goto('/painel/produtos/novo');
    await page.fill('input[name=referencia]', ref);
    await page.fill('input[name=nome]', `Para Excluir ${ref}`);
    await page.fill('input[name=preco]', '15');
    await escolherBasicos(page);
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page).toHaveURL(/\/painel\/produtos\/\d+$/);
    await page.fill('input[name=tamanho]', 'U');
    await page.fill('input[name=estoque]', '2');
    await formTamanho(page).getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Tamanho U adicionado.')).toBeVisible();
    expect((await page.request.get(`/produto/${ref}`)).status(), 'antes de excluir existe na loja').toBe(200);

    aceitarConfirmacao(page);
    await page.getByRole('button', { name: 'Excluir produto' }).click();
    await expect(page).toHaveURL(/\/painel\/produtos$/);
    expect((await page.goto(`/produto/${ref}`))?.status()).toBe(404);
    await page.goto(`/painel/produtos?q=${ref}`);
    await expect(page.getByRole('heading', { name: 'Produtos e custos' })).toBeVisible();
    await expect(page.getByText(ref)).toHaveCount(0);
  });

  test('produto com pedidos não pode ser excluído', async ({ page }) => {
    await page.goto('/painel/produtos?q=FIX-ESTOQUE');
    await page.getByRole('link', { name: /Camiseta Fixa Estoque Farto/ }).first().click();
    aceitarConfirmacao(page);
    await page.getByRole('button', { name: 'Excluir produto' }).click();
    await expect(page.getByText(/não pode ser excluído/).first()).toBeVisible();
  });

  test('filtros da lista de produtos', async ({ page }) => {
    for (const [filtro, ref] of [['sem-foto', 'FIX-SEMFOTO'], ['sem-custo', 'FIX-SEMCOMPRA'], ['esgotados', 'FIX-ESGOTADO'], ['inativos', 'FIX-INATIVO']]) {
      await page.goto(`/painel/produtos?filtro=${filtro}&q=${ref}`);
      await expect(page.getByText(ref).first(), filtro).toBeVisible();
    }
    await page.goto('/painel/produtos?filtro=sem-foto&q=FIX-PROMO');
    await expect(page.getByText('FIX-PROMO')).toHaveCount(0);
  });

  test('indicadores de estoque aparecem com valores', async ({ page }) => {
    await page.goto('/painel/produtos');
    for (const r of ['Peças em estoque', 'Estoque a preço de custo', 'Estoque a preço de venda', 'Lucro potencial']) await expect(page.getByText(r)).toBeVisible();
  });
});

test.describe('vendedores, metas e configurações (gestor)', () => {
  test.beforeEach(({ page }) => entrar(page, 'gestor@dcerutti.local'));

  test('novo vendedor sem meta, entra no painel dele, meta de outro mês, desativar sem clientes', async ({ page, browser }) => {
    const email = `vend.${carimbo().toLowerCase()}@exemplo.com`;
    await page.goto('/painel/vendedores/novo');
    await page.fill('input[name=nome]', 'Vendedora E2E');
    await page.fill('input[name=telefone]', `499${String(Date.now()).slice(-8)}`);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=senha]', SENHA);
    await page.getByRole('button', { name: /Cadastrar/ }).click();
    await expect(page).toHaveURL(/\/painel\/vendedores\/c/);

    const nova = await (await browser.newContext()).newPage();
    await entrar(nova, email);
    await expect(nova).toHaveURL(/\/painel$/);
    await expect(nova.getByText('Minha meta').first()).toBeVisible();

    await page.fill('input[name=mes]', '2030-05');
    await page.fill('input[name=valor]', '7.500');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Meta salva.')).toBeVisible();
    await page.getByRole('button', { name: 'Desativar vendedor' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor inativo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reativar acesso' })).toBeVisible();
    await nova.reload();
    await expect(nova, 'sessão encerrada ao desativar').toHaveURL(/\/entrar/);
  });

  test('e-mail de vendedor repetido e senha curta são recusados', async ({ page }) => {
    await page.goto('/painel/vendedores/novo');
    await page.fill('input[name=nome]', 'Repetida');
    await page.fill('input[name=telefone]', '49999990001');
    await page.fill('input[name=email]', 'ana@dcerutti.local');
    await page.fill('input[name=senha]', '123');
    await page.getByRole('button', { name: /Cadastrar/ }).click();
    await expect(page.getByText(/Este e-mail já está em uso|pelo menos 8 caracteres/).first()).toBeVisible();
  });

  test('ligar o frete nas configurações muda a sacola; desligar volta a "a combinar"', async ({ page, browser }) => {
    await page.goto('/painel/configuracoes');
    await page.locator('input[name=cobrarFrete]').check();
    await page.fill('input[name=freteValor]', '19,90');
    await page.fill('input[name=freteGratisAcima]', '999');
    await page.getByRole('button', { name: 'Salvar configurações' }).click();
    await expect(page.getByText('Configurações salvas.')).toBeVisible();
    try {
      const cliente = await (await browser.newContext()).newPage();
      await entrar(cliente, 'cliente.carlos@dcerutti.local');
      await cliente.goto('/produto/FIX-ESTOQUE');
      await cliente.getByRole('radio', { name: 'P', exact: true }).click();
      await cliente.getByRole('button', { name: 'Adicionar à sacola' }).click();
      await cliente.goto('/sacola');
      await expect(cliente.locator('aside')).toContainText('19,90');
      await expect(cliente.getByText(/para o frete grátis/)).toBeVisible();
    } finally {
      await page.goto('/painel/configuracoes');
      await page.locator('input[name=cobrarFrete]').uncheck();
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
    }
  });

  test('configurações inválidas não são salvas', async ({ page }) => {
    await page.goto('/painel/configuracoes');
    await page.fill('input[name=diasExpiracao]', '200');
    await page.fill('input[name=whatsappLoja]', '123');
    await page.getByRole('button', { name: 'Salvar configurações' }).click();
    await expect(page.getByText('No máximo 90 dias.')).toBeVisible();
    await expect(page.getByText(/WhatsApp com DDD/)).toBeVisible();
    await page.reload();
    await expect(page.locator('input[name=diasExpiracao]')).toHaveValue('7');
  });

  test('resultados: totais e quebras aparecem para todo o período', async ({ page }) => {
    await page.goto('/painel/resultados?periodo=tudo');
    for (const r of ['Faturamento', 'Custo das peças', 'Lucro bruto', 'Margem']) await expect(page.getByText(r).first()).toBeVisible();
    for (const h of ['Por vendedor', 'Lucro por categoria', 'Produtos que mais deram lucro']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
    await expect(page.getByText('Fábio Inativo'), 'quem saiu continua no histórico').toBeVisible();
  });
});

test.describe('vendas manuais e escopo do vendedor', () => {
  test('vendedor registra e exclui venda na loja; data futura é recusada', async ({ page }) => {
    await entrar(page, 'carlos@dcerutti.local');
    await page.goto('/painel/clientes?q=Roberto');
    await page.getByRole('link', { name: /Roberto Lima/ }).first().click();
    const obs = `E2E ${carimbo()}`;
    await page.fill('input[name=valor]', '87,40');
    await page.fill('input[name=data]', '2099-01-01');
    await page.fill('input[name=observacao]', obs);
    await page.getByRole('button', { name: 'Registrar venda' }).click();
    await expect(page.getByText('A data não pode ser no futuro.')).toBeVisible();
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await page.fill('input[name=data]', hoje);
    await page.getByRole('button', { name: 'Registrar venda' }).click();
    await expect(page.getByText('Venda registrada.')).toBeVisible();

    await page.goto('/painel/vendas');
    const linha = page.locator('tr, li, div').filter({ hasText: obs }).last();
    await expect(linha).toContainText('87,40');
    aceitarConfirmacao(page);
    await linha.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText(obs)).toHaveCount(0);
  });

  test('vendedor só vê os próprios clientes e pedidos; URL de outro dá "não encontrado"', async ({ browser }) => {
    const gestor = await (await browser.newContext()).newPage();
    await entrar(gestor, 'gestor@dcerutti.local');
    await gestor.goto('/painel/pedidos?q=Helena');
    const href = await gestor.getByRole('link', { name: /PED-\d+/ }).first().getAttribute('href');
    expect(href).toMatch(/\/painel\/pedidos\/c/);

    const carlos = await (await browser.newContext()).newPage();
    await entrar(carlos, 'carlos@dcerutti.local');
    await carlos.goto('/painel/clientes?q=Juliana');
    await expect(carlos.getByText('Juliana Ferreira')).toHaveCount(0);
    // O painel transmite a página aos poucos (loading.tsx): o "não encontrado" chega com HTTP 200. Confere o conteúdo.
    await carlos.goto(href!);
    await expect(carlos.getByRole('heading', { level: 1 })).toHaveText('Não encontrado');
    await expect(carlos.getByText('Helena')).toHaveCount(0);
    await carlos.goto('/painel/pedidos?q=Helena');
    await expect(carlos.getByRole('link', { name: /PED-\d+/ })).toHaveCount(0);

    const ana = await (await browser.newContext()).newPage();
    await entrar(ana, 'ana@dcerutti.local');
    await ana.goto(href!);
    await expect(ana.getByRole('heading', { level: 1 })).toHaveText(/^PED-\d{6}$/);
    await expect(ana.getByText('Helena Pendente').first()).toBeVisible();
  });

  test('resumo do vendedor: meta, vendido e pendentes do mês; sem custo em lugar nenhum', async ({ page }) => {
    await entrar(page, 'ana@dcerutti.local');
    await page.goto('/painel');
    for (const r of ['Minha meta', 'Vendido no mês', 'Pedidos pendentes']) await expect(page.getByText(r).first()).toBeVisible();
    const pendentes = numero(await page.getByRole('link', { name: /Pedidos/ }).first().textContent());
    expect(pendentes).toBeGreaterThanOrEqual(0);
    for (const url of ['/painel', '/painel/pedidos', '/painel/clientes', '/painel/vendas']) {
      await page.goto(url);
      expect(await page.content(), url).not.toMatch(/Custo das peças|custoUnitario|Lucro bruto/);
    }
  });

  test('vendedor com cliente sem WhatsApp do vendedor: o pedido da cliente vai para a loja (RN-03)', async ({ page }) => {
    await entrar(page, 'cliente.gustavo@dcerutti.local');
    await page.goto('/produto/FIX-ESTOQUE');
    await page.getByRole('radio', { name: 'GG', exact: true }).click();
    await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
    await page.goto('/sacola');
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Enviar pedido/ }).click();
    const aba = await popup;
    // No computador a aba abre em branco e recebe o endereço do WhatsApp em seguida.
    await aba.waitForURL(/wa\.me|whatsapp\.com/, { waitUntil: 'commit' });
    expect(decodeURIComponent(aba.url())).toMatch(/5549988036499/);
    await aba.close();
  });
});
