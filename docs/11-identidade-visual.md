# 11 · Identidade visual

Extraída do protótipo e implementada em `src/app/globals.css`. Assinatura da marca: **"O básico aconchego"**.

## Cores

Definidas no bloco `@theme` do Tailwind 4, com uso direto como classe (`bg-creme`, `text-caramelo`, `border-borda`…).

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

## Elementos

- **Logo:** `public/logo-dcerutti.png`, extraído do protótipo. Tem fundo branco, por isso é exibido com `mix-blend-multiply` sobre o creme (e com `multiply` também na imagem do pedido).
- **Ícone do site:** `src/app/icon.svg`, com "D'C" em Georgia itálico, `#DDCDB3` sobre `#2E2520`.
- **Fotos de ambiente:** `public/ambiente/foto-1..3.jpg`, na tela de login.
- **Fotos de produto:** proporção 3:4. Na vitrine, a segunda foto aparece ao passar o mouse.
- **Cantos retos**, sem sombras; separação por bordas finas.
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
