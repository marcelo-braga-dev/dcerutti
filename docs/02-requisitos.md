# 02 · Requisitos

Códigos: **RF** = requisito funcional, **RN** = regra de negócio, **RNF** = requisito não funcional.
Status: ✅ implementado · ⏳ pendente · 🔧 parcial. A coluna **Onde** aponta para o código principal.

## Loja (cliente)

| Código | Requisito | Status | Onde |
|---|---|:-:|---|
| RF-01 | Home com destaques: atalhos Feminino/Masculino, Imperdível, categorias principais, novidades, marcas, explicação do condicional | ✅ | `src/app/(loja)/page.tsx` |
| RF-02 | Catálogo com filtros combináveis: marca, gênero, categoria, tamanho disponível, promoção, Imperdível, estação, estoque; busca sem acento por nome, referência, categoria ou cor; ordenação por relevância e preço | ✅ | `src/app/(loja)/catalogo/`, `src/lib/catalogo.ts` |
| RF-03 | Paginação por "Carregar mais" (24 por vez) | ✅ | idem |
| RF-04 | Página de produto: galeria, preço cheio e promocional com % de desconto, parcelamento ilustrativo (número configurável), tamanhos com esgotados riscados e estoque do tamanho escolhido, descrição, composição, destaques, relacionados | ✅ | `src/app/(loja)/produto/[referencia]/` |
| RF-05 | Sacola no navegador, com ajuste de quantidade | ✅ | `src/components/loja/sacola.tsx` |
| RF-06 | Envio do **pedido** ao WhatsApp do vendedor do cliente, com mensagem formatada e imagem do pedido | ✅ | `src/components/loja/sacola-pagina.tsx`, `src/server/acoes/pedidos.ts` |
| RF-07 | Envio de **condicional**, com CEP e passo a passo "Envie → Receba → Prove → Pague só o que ficar" | ✅ | idem |
| RF-08 | Cadastro de cliente (nome, WhatsApp, endereço, cidade, e-mail, senha) e login | ✅ | `src/app/(conta)/` |
| RF-09 | Cadastro via link de convite do vendedor, com vínculo automático | ✅ | `src/app/(conta)/cadastro/` |
| RF-10 | Cliente consulta seus pedidos e condicionais e o status de cada um | ✅ | `src/app/(loja)/minha-conta/` |

## Painel (vendedor e gestor)

| Código | Requisito | Status | Onde |
|---|---|:-:|---|
| RF-20 | Resumo: vendido no mês, meta, % atingido, quanto falta, pedidos pendentes, vendas recentes, link de convite | ✅ | `src/app/(painel)/painel/page.tsx` |
| RF-21 | Pedidos: abas por status com contagem, busca por código ou cliente, fotos dos itens, atalho para o WhatsApp do cliente | ✅ | `painel/pedidos/` |
| RF-22 | Confirmar ou cancelar pedido; no condicional, marcar **peça a peça** o que ficou e o que voltou | ✅ | `src/components/painel/fechar-pedido.tsx` |
| RF-23 | Montar seleção de peças para um cliente e enviar pelo WhatsApp com imagem gerada | ✅ | `painel/pedidos/novo/`, `src/components/painel/montador.tsx` |
| RF-24 | Clientes: busca, cadastro, edição, acesso à loja opcional, última compra, total comprado, vendedor responsável | ✅ | `painel/clientes/` |
| RF-25 | Registrar venda manual (loja física) e excluir venda manual lançada por engano | ✅ | ficha do cliente, `painel/vendas/` |
| RF-26 | Copiar e compartilhar o próprio link de convite | ✅ | `src/components/painel/convite.tsx` |
| RF-27 | Vendas do mês, com navegação entre meses | ✅ | `painel/vendas/` |
| RF-30 | *(gestor)* Vendedores: cadastro, WhatsApp, meta mensal com histórico, ranking, desativar/reativar | ✅ | `painel/vendedores/` |
| RF-31 | *(gestor)* Produtos: cadastro, edição e exclusão (com fotos e tudo que depende do produto; recusada se já houver pedido), fotos (upload para o servidor ou URL), preços, custo, estação, Imperdível, ativar/desativar | ✅ | `painel/produtos/` |
| RF-32 | *(gestor)* Estoque por tamanho: entrada, ajuste por contagem, novos tamanhos, histórico | ✅ | `painel/produtos/[id]` |
| RF-33 | *(gestor)* Indicadores de estoque: peças, valor a custo, a preço de venda, lucro potencial; filtros sem foto, sem custo, esgotados, inativos | ✅ | `painel/produtos/` |
| RF-34 | *(gestor)* Resultados: faturamento, custo, lucro bruto e margem por mês ou todo o período, por vendedor, por categoria e top 10 produtos | ✅ | `painel/resultados/`, `src/server/relatorios.ts` |
| RF-35 | *(gestor)* Importação de catálogo/estoque por planilha | ⏳ | — |
| RF-36 | *(gestor)* Configurações: WhatsApp da loja, vendedor padrão, CEPs e cidade do condicional, frete, parcelas, catálogo público | ✅ | `painel/configuracoes/` |
| RF-38 | LGPD: política em `/privacidade` (minuta, aprovar com a loja), aceite registrado no cadastro (`user.aceitouPrivacidadeEm`), cliente sem aceite aceita no primeiro acesso, exclusão da própria conta em "Minha conta" (anonimiza ficha e pedidos) | ✅ | `src/app/privacidade/`, `acoes/conta.ts` |
| RF-37 | Recuperação de senha por e-mail: "Esqueci a senha" no login, link de uso único válido por 1 hora, encerra as sessões; resposta igual para e-mail sem conta; limite de 3 pedidos por e-mail por hora | ✅ | `(conta)/esqueci-senha`, `(conta)/redefinir-senha`; envio por `SMTP_URL` (sem ele, vai para o log) |

## Regras de negócio

| Código | Regra | Status |
|---|---|:-:|
| RN-01 | Todo cliente tem um vendedor responsável. Vendedores são **desativados**, nunca apagados; para desativar quem tem clientes, o gestor escolhe para quem transferi-los. As sessões do desativado são encerradas. | ✅ |
| RN-02 | O WhatsApp de vendedores e clientes deve ter DDD + 9 dígitos (11 números). | ✅ |
| RN-03 | O pedido vai para o WhatsApp do vendedor do cliente. Se o vendedor estiver inativo ou com WhatsApp incompleto, vai para o WhatsApp da loja (Configurações). | ✅ |
| RN-04 | Condicional só para CEPs da lista (hoje 89874-000, Maravilha/SC). Fora da área, o sistema oferece enviar como pedido normal. | ✅ |
| RN-05 | Códigos de pedido sequenciais e únicos: `PED-000123`, `COND-000045`. | ✅ |
| RN-06 | Pedido nasce `pendente`. Só o vendedor responsável ou o gestor confirma ou cancela. | ✅ |
| RN-07 | Confirmar um **pedido**: todas as peças viram venda e o estoque é baixado. Se o estoque não for suficiente, a confirmação é recusada. | ✅ |
| RN-08 | **Condicional**: o estoque é reservado ao enviar; ao fechar, cada peça é marcada como `vendido` ou `devolvido`. Só as vendidas saem do estoque e geram venda; as devolvidas voltam a ficar disponíveis. | ✅ |
| RN-09 | Cancelar libera as reservas do condicional. | ✅ |
| RN-10 | A venda e o item guardam o **custo do momento da confirmação**; mudar o custo depois não altera o lucro passado. | ✅ |
| RN-11 | Venda manual não tem itens nem custo: entra no faturamento e na meta, mas fica fora do cálculo de margem. | ✅ |
| RN-12 | Mês de metas e relatórios calculado no fuso America/Sao_Paulo. | ✅ |
| RN-13 | Tamanho sem estoque disponível não pode ir para a sacola; produto sem nenhum aparece como "Esgotado". | ✅ |
| RN-14 | Promoção: `preço < preço cheio`. Desconto = `1 − preço / preço cheio`, arredondado. O "Imperdível" é um destaque à parte (preço em vermelho) e não entra no filtro "Em promoção". | ✅ |
| RN-15 | Frete exibido na sacola e na mensagem: valor fixo, grátis acima de um valor (padrão R$ 24,90 / R$ 299, como no protótipo), editável em Configurações. A regra definitiva está pendente (P-03). | 🔧 |
| RN-16 | Custo e margem só existem para o gestor. | ✅ |
| RN-17 | Visitante sem login vê apenas as telas de entrar e de cadastro, enquanto o catálogo for privado. | ✅ |
| RN-18 | Só o gestor troca o vendedor de um cliente; o vendedor cadastra clientes sempre para si. | ✅ |
| RN-19 | Se alguém se cadastra com o mesmo WhatsApp de uma ficha sem acesso, a conta **não** é ligada a ela (quem soubesse o número veria o histórico de outra pessoa). Cria-se uma ficha nova, com o mesmo vendedor da ficha antiga; juntar as duas fica a cargo da equipe. | ✅ |
| RN-20 | Meta de um mês sem meta própria = a meta mais recente anterior. | ✅ |
| RN-21 | O estoque não pode ser ajustado para menos do que está reservado em condicionais. Tamanho com pedidos no histórico não pode ser removido (zere o estoque). | ✅ |

## Requisitos não funcionais

| Código | Requisito | Status |
|---|---|:-:|
| RNF-01 | **Mobile first**: sem rolagem horizontal no celular (coberto por teste). | ✅ |
| RNF-02 | Catálogo rápido: dados em cache de memória, imagens otimizadas pelo Next (AVIF/WebP). | ✅ |
| RNF-03 | *(quando o catálogo for público)* Open Graph e sitemap. Hoje o site responde `noindex`. | ⏳ |
| RNF-04 | Senhas de no mínimo 8 caracteres com hash (scrypt); trocar a senha encerra as sessões do usuário (até 5 min com o cache de sessão); sessões em cookie `httpOnly` de 30 dias, verificação de papel no servidor. | ✅ |
| RNF-05 | Imagens hospedadas pela loja, no próprio servidor (D-13). Fotos importadas da Hering migradas por `npm run fotos:migrar`. | ✅ |
| RNF-06 | Valores monetários em `DECIMAL(10,2)`. | ✅ |
| RNF-07 | Datas gravadas em UTC e exibidas no fuso America/Sao_Paulo. | ✅ |
| RNF-08 | Interface em português (pt-BR), moeda BRL. | ✅ |
| RNF-09 | Acessibilidade: foco visível, rótulos nos campos, `aria` em seletores de tamanho e abas, textos alternativos. Sem auditoria formal ainda. | 🔧 |
| RNF-10 | Backup diário do banco (`deploy/backup-mysql.sh`). Ativar na VPS. | 🔧 |
| RNF-11 | Catálogo privado; abrir ao público é uma chave em Configurações. | ✅ |
