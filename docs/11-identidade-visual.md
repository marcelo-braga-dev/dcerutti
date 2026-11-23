# 11 · Identidade visual

Extraída do protótipo e implementada em `src/app/globals.css`. Assinatura da marca: **"O básico aconchego"**.

## Cores

Definidas no bloco `@theme` do Tailwind 4, com uso direto como classe (`bg-creme`, `text-caramelo`, `border-borda`…). Os valores abaixo são os **de fábrica**: o gestor pode trocá-los em **Painel → Identidade visual** (veja a seção abaixo).

| Token (`--color-…`) | Hex | Uso |
|---|---|---|
| `marrom-950` | `#2E2520` | Texto principal, fundos escuros, botões primários, menu do painel |
| `marrom-900` | `#3A2E27` | Texto de corpo |
| `marrom-700` | `#4A2B1C` | Hover do botão primário |
| `caramelo` | `#6D402A` | Destaque, preço promocional, abas ativas, contador de pendentes |
| `oliva` | `#5E6B43` | Sucesso, meta batida, condicional, "Ficou" |
| `vermelho` | `#B8462F` | Erro, meta abaixo de 60%, WhatsApp incompleto |
| `imperdivel` | `#E3261B` | Selo e preço do Imperdível |
| `areia` | `#DDCDB3` | Texto sobre fundo escuro |
| `creme` | `#F6F2EC` | Fundo da página |
| `card` | `#FFFDF9` | Fundo de cartões e campos |
| `bege` | `#EFE4D6` | Fundo sutil, espaço reservado das fotos |
| `borda` | `#E6DCCD` | Bordas suaves |
| `borda-forte` | `#CFC2B2` | Bordas de campos e chips |
| `suave` | `#76685D` | Texto secundário |

Cores das metas e margens: ≥ 100% oliva, ≥ 60% caramelo, abaixo disso vermelho (`corDaMeta` em `src/server/relatorios.ts`). Na margem de produto os cortes são 50% e 30%.

O site tem só o tema claro, como o protótipo e a identidade da loja.

## Identidade visual editável (D-25)

Em **Painel → Identidade visual** (`/painel/identidade`, só o gestor):

- **Nome da loja e assinatura** ("D’Cerutti" e "O básico aconchego" de fábrica; a assinatura pode ficar em branco): vão para os títulos das páginas, as mensagens do WhatsApp, os e-mails, o rodapé, o cartão e a imagem do pedido. Ficam em `src/lib/loja.ts` (`nomeDaLoja()`): no servidor, `lerConfig` guarda o valor; no navegador e na pré-renderização dos componentes do navegador, o `ProvedorLoja` do layout raiz entrega o valor. O CNPJ da política de privacidade e o @ do Instagram na imagem do pedido continuam fixos.
- **Cores:**
  - principais: primária (`marrom-950`), secundária (`caramelo`), fundo (`creme`), cartões (`card`), texto (`marrom-900`), confirmação (`oliva`) e promoção (`imperdivel`);
  - em "Mais cores": texto secundário, erros, detalhes sobre a primária, fundos suaves, bordas e a variação da primária;
  - cada cor tem seletor e campo de código, e "padrão" volta a cor de fábrica.
- **Logos e favicon:**
  - logo para fundo claro: cabeçalho da loja e imagem do pedido;
  - logo para fundo escuro: tela de entrar, menu do painel, caixa e rodapé da loja;
  - favicon: aba do navegador e atalho no celular;
  - aceita PNG, SVG, WebP ou JPG até 1,8 MB. O servidor converte: as logos viram WebP com transparência, até 1200 px; o favicon vira PNG quadrado de 512 px. SVG nunca é servido como veio.
- **Prévia ao vivo** (aba, cabeçalho, card de produto, botões, campo, erro e topo do painel) e **avisos de contraste** quando um texto fica difícil de ler sobre o fundo (mínimo WCAG 4,5, ou 3 em botões e preços grandes).
- **Desfazer** volta ao que está salvo. **Voltar à marca de fábrica** prepara o nome, as cores e as logos originais; vale ao salvar.

Como funciona:
- A configuração fica na chave `identidade` da tabela `configuracao`, só com as cores que mudaram.
- O layout raiz (`src/app/layout.tsx`) põe na página um `<style>` com `html:root{--color-…}`, que ganha do tema do Tailwind. Ele também define o favicon, a cor do navegador (`theme-color`) e o `data-logo` usado pela imagem do pedido.
- Por isso todas as páginas são geradas a cada acesso (`connection()`), e nada fica com as cores antigas do build.
- O cartão do link do pedido (`cartao-pedido.ts`) e a imagem do pedido (`imagem-pedido.ts`) usam as cores em uso.
- Os arquivos ficam em `armazenamento/marca/`, com nome novo a cada envio; o arquivo substituído é apagado.
- O ícone de fábrica é `public/icone.svg`; as logos de fábrica são `public/logo-dcerutti*.png`.
- A cor do WhatsApp não muda: é a da marca do WhatsApp.

## Tipografia

| Uso | Fonte | Como usar |
|---|---|---|
| Títulos | **Archivo** 800, maiúsculas | utilitário `titulo` |
| Botões, rótulos, menus | **Archivo** 700, maiúsculas, espaçamento 0,12em | utilitário `rotulo` |
| Números (preços, indicadores) | **Archivo** 800 | `font-display font-extrabold` |
| Texto corrido | **Hanken Grotesk** 400–600 | padrão do `body` (`font-sans`) |
| Monograma e assinatura | Georgia itálico | `font-[Georgia,serif] italic` |

As fontes são carregadas por `next/font/google` em `src/app/layout.tsx`, expostas como `--font-archivo` e `--font-hanken`. A imagem do pedido (canvas) lê essas mesmas variáveis.

## Componentes de interface (`src/components/ui`)

| Componente | Uso |
|---|---|
| `Botao`, `BotaoLink`, `botao()` | Variantes `primario`, `secundario`, `fantasma`, `perigo`, `claro`, `oliva`; tamanhos `p`, `m`, `g` |
| `Formulario`, `Campo`, `BotaoEnviar` | Formulários ligados a Server Actions, com erros por campo e máscaras de telefone e CEP |
| `Cartao`, `Kpi`, `Etiqueta`, `Alerta`, `Vazio`, `Barra`, `CabecalhoPagina` | Blocos do painel e da loja |
| `EtiquetaStatus`, `EtiquetaTipo` | Status e tipo de pedido |
| `icones.tsx` | Ícones de traço (lupa, pessoa, sacola, menu, fechar, seta, caminhão, casa, selo, conversa); herdam a cor do texto |

### Editor visual da página inicial

Em **Painel → Configurações › Página inicial** (`/editar/inicio`, só o gestor) a home aparece como na loja, com uma barra fixa no topo. É edição visual (inline): o gestor muda o conteúdo da página que já existe, sem mexer no layout.

- **Textos:** cada texto editável tem um contorno tracejado; clique e digite (uma linha, Enter confirma; colar traz só o texto). Texto apagado volta ao de fábrica. Nos textos, `{cidade}`, `{frete}` e `{parcelas}` viram os dados de Configurações.
- **Fotos do banner** (Feminino, Masculino, Novidades): "Trocar foto" envia uma foto (reduzida no navegador para caber no limite de 2 MB e gravada em WebP de até 2000 px em `armazenamento/paginas/`); "Usar foto automática" volta à foto tirada das peças.
- **Links:** cada botão e card da página (botões do banner, cards Feminino/Masculino/Novidades, vantagens da loja, "Ver tudo", faixas de ofertas, botão do condicional, cards de categoria, preço e marca) tem um botão "🔗 Link", amarelo quando o destino foi mudado. Ele abre uma janela para escolher uma página da loja ou digitar um endereço: caminho da loja (`/catalogo`), `https://`, `mailto:` ou `tel:`. Endereço de fora abre em outra aba; vazio volta ao destino padrão. As vantagens da loja não têm link até o gestor escolher um. As peças das vitrines sempre levam à própria peça.
- **Seções:** passar o mouse mostra o nome da seção e "Ocultar seção"; oculta, ela fica apagada no editor e some da loja.
- **Barra:** Desfazer (volta ao que está salvo), Voltar ao padrão (vale ao salvar), Ver no site e Salvar. Sair com alterações não salvas pede confirmação. Links e formulários da página não navegam durante a edição.

Como funciona: a home é o componente `PaginaInicial` (`components/loja/pagina-inicial.tsx`), usado pela loja e pelo editor. Os campos ficam em `lib/conteudo-inicio.ts` (textos de fábrica, espaços de foto, destinos padrão dos links e seções). O conteúdo fica na chave `inicio` da tabela `configuracao`, só com o que difere do padrão. `Texto`, `ImagemEditavel`, `LinkEditavel` e `SecaoEditavel` (`components/loja/editavel.tsx`) só mostram o conteúdo fora do editor e viram editáveis dentro do `ProvedorEdicao`. Ao salvar, fotos de `paginas/` fora de uso há mais de um dia são apagadas. Para editar outra página, o caminho é o mesmo: um arquivo de campos em `lib/`, uma chave em `configuracao` e a página usando os componentes editáveis.

### Painel (visual 2026)

O layout do painel (`.painel`) e o do caixa (`.painel.caixa`) recebem as mesmas fontes e componentes arredondados da loja. No painel, fora do caixa, uma regra na camada `components` de `globals.css` também arredonda os controles escritos à mão nas páginas: campos, chips de filtro (`rotulo` com borda, em letra normal) e caixas `bg-card border`; um `rounded-*` explícito no elemento continua valendo. Menu lateral escuro com ícone em cada item (`navegacao.tsx`), só itens diretos em seções curtas (D-35) e o cartão de quem está logado, com "Ver loja" e "Sair", no rodapé. A barra superior flutua em pílula. As páginas de cada área aparecem num seletor em pílula no topo (abas). No Resumo/Meu painel: saudação, anel da meta do mês, números com ícone, atalhos (novo pedido, sugestão, cliente, caixa), ranking com iniciais e posição, clientes interessadas com botão de WhatsApp e vendas recentes.

### Caixa (`src/components/caixa`, D-23)

Topo marrom enxuto: **← Voltar ao painel** em botão claro (destaque), a logo clara e "Caixa", e à direita o total de hoje (abre as Vendas do dia) e a tela cheia; área de produtos e a venda atual lado a lado (no celular, a venda vira barra no rodapé). Alvos de toque de 44 a 80 px, números grandes em Archivo, confirmação em oliva e troco em destaque.

### Loja (`src/components/loja`, visual 2026)

Tudo o que a cliente vê fica dentro da classe `.loja` (layout da loja, telas de entrar e cadastro, `/p`, `/s` e a política de privacidade). Em `globals.css`, ela troca as fontes (**Fraunces** nos títulos via `titulo`, **Plus Jakarta Sans** no resto) e arredonda os componentes compartilhados com o painel pelas classes-marcador `btn`, `campo`, `etiqueta`, `alerta`, `cartao` e `vazio`. O painel e o caixa usam a mesma base com a classe `.painel` (veja "Painel" abaixo). As cores continuam sendo os tokens da marca, editáveis no painel.

Linguagem: cantos arredondados (fotos 16–32 px, botões e chips em pílula), sombras suaves, títulos em serifa com destaque em itálico. Elementos de conversão: faixa de avisos (`Avisos`: prove em casa, frete grátis, parcelas, WhatsApp), busca sempre à vista no computador, categorias em círculos, faixas de oferta (Imperdível e Promoções com o maior desconto), "Compre por preço", compra rápida por tamanho no card (`AdicaoRapida`, só no computador), selos de urgência ("Última peça", "Corra! Só N em estoque"), sacola com etapas e botão de remover, barra fixa de compra no celular.

Componentes de antes (a tabela abaixo segue valendo para o que cada um faz):

| Componente | Uso |
|---|---|
| `Cabecalho`, `BuscaTopo` | Topo só com ícones (alvo de 44 px): busca, **favoritos** (com a quantidade em selo vermelho; para visitantes leva ao login), perfil (o nome aparece ao passar o mouse) e sacola (sem fundo, com a quantidade em selo marrom); menu lateral no celular e busca com sugestões enquanto digita (peças com foto e preço, categorias; ↑ ↓ Enter Esc) |
| `CartaoProduto` | Card da vitrine: foto 3:4, **um selo só** ("Imperdível −50%" ou "−20%"), "Última peça" quando resta 1, nome do modelo, preço, bolinhas das cores e tamanhos disponíveis em caixinhas |
| `BolinhaCor`, `CoresDoCard` | Cor da peça: tom aproximado pelo nome da cor (`lib/cores.ts`), estampa em gradiente ou, sem tom conhecido, a foto |
| `Vitrine` | Carrossel com deslize no celular, grade de 4 no computador |
| `PainelFiltros`, `FiltrosAtivos`, `GavetaFiltros`, `SeletorOrdem` | Filtros do catálogo: lateral fixa no computador, gaveta com "Ver N peças" no celular, chips removíveis e ordenação em lista |
| `Galeria` | Fotos e vídeos do produto com setas, miniaturas e **tela cheia** (foto inteira, deslize e teclado). Miniatura de vídeo com o botão de play sobre a capa (D-29) |
| `Comprar` | Tamanhos (48 px), estoque do tamanho, "Dúvida no tamanho?" no WhatsApp de quem atende e barra fixa no celular |
| `BotaoFavorito`, `ProvedorFavoritos` | Coração no canto da foto do card e ao lado do título da peça; vermelho Imperdível quando marcado (D-22) |
| `GavetaSacola` | Painel que surge ao pôr na sacola, no canto (topo no celular), sem bloquear a tela |
| `WhatsAppFlutuante` | Botão redondo do WhatsApp da loja (some na sacola, no produto e em Minha conta) |

## Elementos

- **Logo:** `public/logo-dcerutti.png`, extraído do protótipo. Tem fundo branco, por isso é exibido com `mix-blend-multiply` sobre o creme (e com `multiply` também na imagem do pedido). Para fundos escuros há `public/logo-dcerutti-claro.png`: a mesma logo em areia (`#DDCDB3`), com fundo transparente, gerada da original (a transparência vem do quão escuro é cada ponto); usada no painel da tela de login, com sombra suave. Logo nova no `public/` entra também em `images.localPatterns` (`next.config.ts`) e nas exceções do `matcher` em `src/proxy.ts`.
- **Ícone do site:** `src/app/icon.svg`, com "D'C" em Georgia itálico, `#DDCDB3` sobre `#2E2520`.
- **Fotos de ambiente:** `public/ambiente/foto-1..3.jpg`, na tela de login.
- **Fotos de produto:** proporção 3:4, fundo `#efebe5` enquanto carregam. Na vitrine, a segunda foto aparece ao passar o mouse (só no computador); a peça esgotada fica dessaturada.
- **Vídeos de produto (D-29):** mesmo quadro 3:4 das fotos, cortado para preencher (inteiro na tela cheia); tocam sem som e em repetição enquanto estão na tela, com os controles do navegador. Prefira vídeos curtos e na vertical.
- **Cores do mesmo modelo:** a cor vem do fim do nome ("… - Bege"); peças com o mesmo nome-base, marca, categoria e gênero formam um modelo. A vitrine mostra um card por modelo e a página do produto, o seletor de cores com foto.
- **Cantos retos** e separação por bordas finas no painel (a loja usa cantos arredondados, veja acima). Exceções: o que flutua (botão "Filtrar · Ordenar", WhatsApp flutuante, gavetas) tem canto arredondado ou sombra para se destacar do conteúdo; bolinhas de cor são redondas.
- **Cabeçalho da loja** fixo, com fundo creme translúcido e desfoque; no celular, os links de seção rolam na horizontal.

## Imagem do pedido

Arte de 1080 px de largura gerada no navegador (`src/lib/imagem-pedido.ts`):
- cabeçalho com logo, selo ("PEDIDO", "CONDICIONAL", "SELEÇÃO PARA VOCÊ"), código e data;
- duas peças por linha, com tamanho, quantidade e código interno sobre a foto;
- rodapé escuro com total de peças, total em reais e "D'Cerutti · Maravilha (SC) · @dcerutti_".

## Tom de voz

- Próximo e acolhedor, em segunda pessoa: "Separei estas peças para você", "Prove com calma", "Ainda não chegamos aí".
- Frases curtas; rótulos em maiúsculas nos botões.
- O vendedor tem nome: as mensagens citam quem atende ("Pedido enviado para Ana", "Convite de Ana").
