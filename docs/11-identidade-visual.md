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

### Caixa (`src/components/caixa`, D-23)

Topo marrom com a logo clara, relógio e o total de hoje; área de produtos e a venda atual lado a lado (no celular, a venda vira barra no rodapé). Alvos de toque de 44 a 80 px, números grandes em Archivo, confirmação em oliva e troco em destaque.

### Loja (`src/components/loja`, D-21)

| Componente | Uso |
|---|---|
| `Cabecalho`, `BuscaTopo` | Topo só com ícones (alvo de 44 px): busca, **favoritos** (com a quantidade em selo vermelho; para visitantes leva ao login), perfil (o nome aparece ao passar o mouse) e sacola (sem fundo, com a quantidade em selo marrom); menu lateral no celular e busca com sugestões enquanto digita (peças com foto e preço, categorias; ↑ ↓ Enter Esc) |
| `CartaoProduto` | Card da vitrine: foto 3:4, **um selo só** ("Imperdível −50%" ou "−20%"), "Última peça" quando resta 1, nome do modelo, preço, bolinhas das cores e tamanhos disponíveis em caixinhas |
| `BolinhaCor`, `CoresDoCard` | Cor da peça: tom aproximado pelo nome da cor (`lib/cores.ts`), estampa em gradiente ou, sem tom conhecido, a foto |
| `Vitrine` | Carrossel com deslize no celular, grade de 4 no computador |
| `PainelFiltros`, `FiltrosAtivos`, `GavetaFiltros`, `SeletorOrdem` | Filtros do catálogo: lateral fixa no computador, gaveta com "Ver N peças" no celular, chips removíveis e ordenação em lista |
| `Galeria` | Fotos do produto com setas, miniaturas e **tela cheia** (foto inteira, deslize e teclado) |
| `Comprar` | Tamanhos (48 px), estoque do tamanho, "Dúvida no tamanho?" no WhatsApp de quem atende e barra fixa no celular |
| `BotaoFavorito`, `ProvedorFavoritos` | Coração no canto da foto do card e ao lado do título da peça; vermelho Imperdível quando marcado (D-22) |
| `GavetaSacola` | Painel que surge ao pôr na sacola, no canto (topo no celular), sem bloquear a tela |
| `WhatsAppFlutuante` | Botão redondo do WhatsApp da loja (some na sacola, no produto e em Minha conta) |

## Elementos

- **Logo:** `public/logo-dcerutti.png`, extraído do protótipo. Tem fundo branco, por isso é exibido com `mix-blend-multiply` sobre o creme (e com `multiply` também na imagem do pedido). Para fundos escuros há `public/logo-dcerutti-claro.png`: a mesma logo em areia (`#DDCDB3`), com fundo transparente, gerada da original (a transparência vem do quão escuro é cada ponto); usada no painel da tela de login, com sombra suave. Logo nova no `public/` entra também em `images.localPatterns` (`next.config.ts`) e nas exceções do `matcher` em `src/proxy.ts`.
- **Ícone do site:** `src/app/icon.svg`, com "D'C" em Georgia itálico, `#DDCDB3` sobre `#2E2520`.
- **Fotos de ambiente:** `public/ambiente/foto-1..3.jpg`, na tela de login.
- **Fotos de produto:** proporção 3:4, fundo `#efebe5` enquanto carregam. Na vitrine, a segunda foto aparece ao passar o mouse (só no computador); a peça esgotada fica dessaturada.
- **Cores do mesmo modelo:** a cor vem do fim do nome ("… - Bege"); peças com o mesmo nome-base, marca, categoria e gênero formam um modelo. A vitrine mostra um card por modelo e a página do produto, o seletor de cores com foto.
- **Cantos retos** e separação por bordas finas. Exceções: o que flutua (botão "Filtrar · Ordenar", WhatsApp flutuante, gavetas) tem canto arredondado ou sombra para se destacar do conteúdo; bolinhas de cor são redondas.
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
