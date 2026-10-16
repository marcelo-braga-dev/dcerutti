# 02 · Requisitos

Códigos: **RF** = requisito funcional, **RN** = regra de negócio, **RNF** = requisito não funcional.
Status: ✅ implementado · ⏳ pendente · 🔧 parcial. A coluna **Onde** aponta para o código principal. Situação em 10/10/2026.

## Loja (cliente)

| Código | Requisito | Status | Onde |
|---|---|:-:|---|
| RF-01 | Home: banner com a mensagem da loja, chamadas e busca; Feminino/Masculino; faixa de confiança; categorias com foto; vitrines Novidades, Imperdível e Promoções (uma por modelo, carrossel no celular); condicional; marcas com foto; atendimento (WhatsApp e Instagram) (D-21) | ✅ | `src/app/(loja)/page.tsx` |
| RF-02 | Catálogo com filtros combináveis: gênero, categoria (em grupos), tamanho (roupas e numeração; UN = UNI), faixa de preço, promoção, Imperdível, marca, estação, estoque; contagens que respeitam a busca e os outros filtros; chips dos filtros ativos; gaveta no celular; busca sem acento por nome, referência, categoria ou cor, com sugestões no topo; ordenação por relevância, novidades, preço e desconto; **um card por modelo**, com as cores (D-21) | ✅ | `src/app/(loja)/catalogo/`, `src/lib/catalogo.ts` |
| RF-03 | Paginação por "Carregar mais" (24 por vez) | ✅ | idem |
| RF-04 | Página de produto: galeria, preço cheio e promocional com % de desconto, parcelamento (número configurável; 0 = escondido, o padrão até a loja definir, D-14), tamanhos com esgotados riscados e estoque do tamanho escolhido, **seletor de cores do mesmo modelo** com foto, galeria em tela cheia, "Dúvida no tamanho?" no WhatsApp, barra fixa no celular, detalhes da peça com dados reais, "Combine com" e "Mais da categoria" (D-21) | ✅ | `src/app/(loja)/produto/[referencia]/` |
| RF-05 | Sacola no navegador, com ajuste de quantidade limitado ao estoque; ao abrir, confere preço e disponibilidade no servidor e avisa o que mudou | ✅ | `src/components/loja/sacola.tsx`, `conferirSacola` |
| RF-06 | Envio do **pedido** ao WhatsApp do vendedor do cliente, com mensagem formatada (saudação, peças, resumo, link do pedido; D-19), **cartão com as fotos do carrinho na prévia do link** (D-20), **prévia da mensagem** na sacola, tela final com abrir de novo, copiar a mensagem e imagem do pedido; o vendedor também recebe um aviso por e-mail | ✅ | `src/components/loja/sacola-pagina.tsx`, `src/server/acoes/pedidos.ts` |
| RF-07 | Envio de **condicional**, com CEP e passo a passo "Envie → Receba → Prove → Pague só o que ficar" | ✅ | idem |
| RF-08 | Cadastro de cliente (nome, WhatsApp, endereço, cidade, e-mail, senha) e login | ✅ | `src/app/(conta)/` |
| RF-09 | Cadastro via link de convite do vendedor, com vínculo automático | ✅ | `src/app/(conta)/cadastro/` |
| RF-10 | Cliente consulta seus pedidos e condicionais (valor do que ficou, frete e total), corrige os próprios dados e cancela pedido em aberto (o vendedor é avisado por e-mail) | ✅ | `src/app/(loja)/minha-conta/` |

## Painel (vendedor e gestor)

| Código | Requisito | Status | Onde |
|---|---|:-:|---|
| RF-20 | Resumo: vendido no mês, meta, % atingido, quanto falta, pedidos pendentes, vendas recentes, link de convite, clientes interessados agora | ✅ | `src/app/(painel)/painel/page.tsx` |
| RF-21 | Pedidos: abas por status com contagem, busca por código ou cliente, fotos dos itens, atalho para o WhatsApp do cliente | ✅ | `painel/pedidos/` |
| RF-22 | Confirmar ou cancelar pedido; no condicional, marcar **peça a peça** o que ficou e o que voltou, inclusive parte das unidades (1 de 3) | ✅ | `src/components/painel/fechar-pedido.tsx` |
| RF-22a | Editar as peças de um pedido ou condicional pendente: mudar a quantidade ou retirar (o preço combinado não muda; a reserva acompanha) | ✅ | `src/components/painel/editar-pedido.tsx`, `editarPedido` |
| RF-23 | Montar seleção de peças para um cliente, como pedido ou condicional, e enviar pelo WhatsApp com imagem gerada; ou registrar como **venda na loja** (já confirmada, baixa o estoque) | ✅ | `painel/pedidos/novo/`, `src/components/painel/montador.tsx` |
| RF-24 | Clientes: busca, cadastro, edição, acesso à loja opcional, última compra, total comprado, vendedor responsável, último acesso à loja e sacola aberta | ✅ | `painel/clientes/` |
| RF-25 | Registrar venda manual só com o valor (quando não há peças) e excluir venda manual lançada por engano | ✅ | ficha do cliente, `painel/vendas/` |
| RF-26 | *(vendedor)* Copiar e compartilhar o próprio link de convite | ✅ | `src/components/painel/convite.tsx` |
| RF-27 | Vendas do mês, com navegação entre meses | ✅ | `painel/vendas/` |
| RF-30 | *(gestor)* Vendedores: cadastro (meta opcional), WhatsApp, meta mensal com histórico, ranking, desativar transferindo clientes e pedidos em aberto, reativar | ✅ | `painel/vendedores/` |
| RF-31 | *(gestor)* Produtos: cadastro, edição e exclusão (com fotos e tudo que depende do produto; recusada se já houver pedido), fotos (upload para o servidor ou URL, em miniaturas com mover e remover), preços, custo, estação, Imperdível, ativar/desativar | ✅ | `painel/produtos/` |
| RF-32 | *(gestor)* Estoque por tamanho: entrada, ajuste por contagem, novos tamanhos, histórico | ✅ | `painel/produtos/[id]` |
| RF-33 | *(gestor)* Indicadores de estoque: peças, valor a custo, a preço de venda, lucro potencial; filtros sem foto, sem custo, esgotados, inativos | ✅ | `painel/produtos/` |
| RF-34 | *(gestor)* Resultados: faturamento, custo, lucro bruto e margem por mês ou todo o período, por vendedor, por categoria e top 10 produtos | ✅ | `painel/resultados/`, `src/server/relatorios.ts` |
| RF-35 | *(gestor)* Importação de catálogo/estoque por planilha | ⏳ | — |
| RF-36 | *(gestor)* Configurações: WhatsApp da loja, vendedor padrão, CEPs e cidade do condicional, frete (ou a combinar), parcelas, prazo de resposta dos pendentes, cupons, registro da navegação e aviso de sacola parada, catálogo público | ✅ | `painel/configuracoes/` |
| RF-37 | Recuperação de senha por e-mail: "Esqueci a senha" no login, link de uso único válido por 1 hora, encerra as sessões; resposta igual para e-mail sem conta; limite de 3 pedidos por e-mail por hora | ✅ | `(conta)/esqueci-senha`, `(conta)/redefinir-senha`; envio por `SMTP_URL` (sem ele, vai para o log; ligar na produção, L-04) |
| RF-38 | LGPD: política em `/privacidade` (minuta, aprovar com a loja), aceite registrado no cadastro (`user.aceitouPrivacidadeEm`), cliente sem aceite aceita no primeiro acesso, exclusão da própria conta em "Minha conta" (anonimiza ficha e pedidos) | ✅ | `src/app/privacidade/`, `acoes/conta.ts` |
| RF-39 | Aviso por e-mail ao vendedor quando a cliente envia ou cancela um pedido (aos gestores, se o vendedor estiver inativo). Enviado depois da resposta; uma falha nunca derruba o pedido | ✅ | `src/server/avisos.ts` |
| RF-40 | Histórico do cliente ([21](21-historico-do-cliente.md), D-18): registro da navegação das clientes logadas (login, visitas, páginas e tempo, peças, buscas, filtros, tamanhos, sacola, cupons, WhatsApp), sem IP, guardado por 12 meses e apagado com a conta | ✅ | `src/components/loja/rastreador.tsx`, `api/atividade`, `src/server/navegacao.ts` |
| RF-41 | Interesse da cliente para a equipe (escopo do vendedor): card na ficha (acesso, sacola atual, peças mais vistas, preferências, buscas), linha do tempo por visita, filtros de acesso e sacola na lista de clientes, "Clientes interessados agora" no painel e a tela **Interesse** (peças mais vistas com funil, buscas sem resultado, clientes mais ativas) | ✅ | `painel/clientes/[id]`, `painel/clientes/[id]/historico`, `painel/interesse`, `src/server/consultas/navegacao.ts` |
| RF-49 | Acompanhamento da equipe (D-26): login, presença e tempo de uso, último acesso, histórico de ações (clientes, pedidos, envios, vendas) e a página Equipe com a tabela por vendedor e filtros | ✅ | `painel/equipe`, `server/equipe.ts`, `lib/equipe.ts`, `api/equipe` |
| RF-48 | Painéis: clientes filtrados por vendedor, compras e uso da loja, ordenados por total ou última compra, agrupados por vendedor; perfil do vendedor com carteira, pedidos e vendas; Pedidos e Vendas por vendedor; links entre as páginas | ✅ | `painel/clientes`, `painel/vendedores/[id]`, `consultas/clientes.ts`, `consultas/equipe.ts`, `components/painel/filtros.tsx` |
| RF-47 | Identidade visual editável pelo gestor (D-25): nome da loja e assinatura, cores do tema, logos para fundo claro e escuro, favicon, prévia ao vivo, avisos de contraste, voltar à marca de fábrica | ✅ | `src/app/(painel)/painel/identidade`, `components/painel/editor-identidade.tsx`, `lib/identidade.ts`, `acoes/identidade.ts` |
| RF-46 | CPF opcional da cliente (D-24) na ficha, no cadastro da loja, em Minha conta e no cadastro rápido do caixa: máscara, dígitos verificadores, sem repetir entre fichas, busca por CPF | ✅ | `lib/cpf.ts`, `acoes/clientes.ts`, `acoes/conta.ts`, `acoes/caixa.ts` |
| RF-45 | Caixa da loja física em `/caixa` (D-23): busca por código da etiqueta e filtros, venda com desconto por peça e geral (limite do vendedor), cliente opcional com cadastro rápido, cupom, cobrar com Pix, débito, crédito em parcelas e dinheiro com troco, pagamento dividido, comprovante pelo WhatsApp; vendas do dia e fechamento por forma de pagamento e vendedor | ✅ | `src/app/(caixa)/caixa`, `components/caixa`, `acoes/caixa.ts`, `lib/caixa.ts` |
| RF-43 | Favoritos: coração no card e na peça, aba Favoritos em Minha conta, salvos na conta e visíveis na ficha do painel (D-22) | ✅ | `components/loja/favoritos.tsx`, `acoes/favoritos.ts`, `minha-conta/favoritos` |
| RF-44 | "Comprar de novo" nos pedidos, gaveta ao pôr na sacola, resumo em Minha conta (último pedido, favoritos, cupons, quem atende) e "Mostrar senha" (D-22) | ✅ | `acoes/recompra.ts`, `gaveta-sacola.tsx`, `minha-conta/layout.tsx`, `ui/formulario.tsx` |
| RF-42 | Aviso por e-mail ao vendedor da sacola parada (peças separadas sem pedido depois de N horas, padrão 24) | ✅ | `avisarSacolasParadas` em `src/server/navegacao.ts` |

## Regras de negócio

| Código | Regra | Status |
|---|---|:-:|
| RN-01 | Todo cliente tem um vendedor responsável. Vendedores são **desativados**, nunca apagados; para desativar quem tem clientes, o gestor escolhe para quem transferi-los. As sessões do desativado são encerradas. | ✅ |
| RN-02 | O WhatsApp de vendedores e clientes deve ter DDD + 9 dígitos (11 números). | ✅ |
| RN-03 | O pedido vai para o WhatsApp do vendedor do cliente. Se o vendedor estiver inativo ou com WhatsApp incompleto, vai para o WhatsApp da loja (Configurações). | ✅ |
| RN-04 | Condicional só para CEPs da lista (hoje 89874-000, Maravilha/SC). Fora da área, o sistema oferece enviar como pedido normal. | ✅ |
| RN-05 | Códigos de pedido sequenciais e únicos: `PED-000123`, `COND-000045`. | ✅ |
| RN-06 | Pedido nasce `pendente` (a venda na loja nasce `confirmado`). Só o vendedor responsável ou o gestor confirma, edita ou cancela; a cliente pode cancelar o próprio pedido em aberto. O motivo do cancelamento fica gravado: `equipe`, `cliente` ou `expirado`. | ✅ |
| RN-07 | Confirmar um **pedido**: todas as peças viram venda e o estoque é baixado. Se o estoque não for suficiente, a confirmação é recusada. | ✅ |
| RN-08 | **Condicional**: o estoque é reservado ao enviar; ao fechar, cada peça é marcada como `vendido` ou `devolvido`. Só as vendidas saem do estoque e geram venda; as devolvidas voltam a ficar disponíveis. | ✅ |
| RN-09 | Cancelar libera as reservas do condicional. | ✅ |
| RN-10 | A venda e o item guardam o **custo do momento da confirmação**; mudar o custo depois não altera o lucro passado. | ✅ |
| RN-11 | Venda manual (só valor) não tem itens nem custo: entra no faturamento e na meta, mas fica fora do cálculo de margem. A venda na loja com peças grava o custo como qualquer pedido. | ✅ |
| RN-12 | Mês de metas e relatórios calculado no fuso America/Sao_Paulo. | ✅ |
| RN-13 | Tamanho sem estoque disponível não pode ir para a sacola; produto sem nenhum aparece como "Esgotado". | ✅ |
| RN-14 | Promoção: `preço < preço cheio`. Desconto = `1 − preço / preço cheio`, arredondado. O "Imperdível" é um destaque à parte (preço em vermelho) e não entra no filtro "Em promoção". | ✅ |
| RN-15 | Frete da compra: **a combinar** por padrão (D-14). Com "Cobrar frete pelo site" ligado em Configurações, vale um valor fixo, grátis acima de um mínimo. O frete é gravado no pedido no envio, e todas as telas mostram o mesmo total. Condicional e seleção do vendedor: sempre a combinar. Os valores reais estão pendentes (P-03). | 🔧 |
| RN-16 | Custo e margem só existem para o gestor. | ✅ |
| RN-17 | Visitante sem login vê apenas as telas de entrar e de cadastro, enquanto o catálogo for privado. | ✅ |
| RN-18 | Só o gestor troca o vendedor de um cliente, e os pedidos em aberto vão junto; o vendedor cadastra clientes sempre para si. O vendedor de um cliente é sempre um vendedor **ativo**; o gestor não tem carteira (D-14). | ✅ |
| RN-19 | Se alguém se cadastra com o mesmo WhatsApp de uma ficha sem acesso, a conta **não** é ligada a ela (quem soubesse o número veria o histórico de outra pessoa). Cria-se uma ficha nova, com o mesmo vendedor da ficha antiga; juntar as duas fica a cargo da equipe. | ✅ |
| RN-20 | Meta de um mês sem meta própria = a meta mais recente anterior. | ✅ |
| RN-21 | O estoque não pode ser ajustado para menos do que está reservado em condicionais. Tamanho com pedidos no histórico não pode ser removido (zere o estoque). | ✅ |
| RN-22 | Pedido ou condicional pendente há mais que o prazo das Configurações (padrão 7 dias; 0 = nunca) é cancelado sozinho, com motivo `expirado`, e a reserva volta ao estoque. A verificação roda quando a equipe abre o painel, no máximo uma vez por hora. Nos últimos 2 dias a lista mostra "Expira em N dias". | ✅ |
| RN-23 | Produto que já entrou em pedido não pode ser excluído (desative-o); a exclusão apaga fotos, tamanhos, custo e histórico. | ✅ |

## Requisitos não funcionais

| Código | Requisito | Status |
|---|---|:-:|
| RNF-01 | **Mobile first**: sem rolagem horizontal no celular (coberto por teste). | ✅ |
| RNF-02 | Catálogo rápido: dados em cache de memória, imagens otimizadas pelo Next (só WebP: AVIF consumia memória demais). Respostas entre 40 e 110 ms. | ✅ |
| RNF-03 | *(quando o catálogo for público)* Open Graph e sitemap. Hoje o site responde `noindex`. | ⏳ |
| RNF-04 | Senhas de no mínimo 8 caracteres com hash (scrypt); trocar a senha encerra as sessões do usuário (até 5 min com o cache de sessão); sessões em cookie `httpOnly` de 30 dias, verificação de papel no servidor. Limite de tentativas: login 5 por e-mail e 20 por IP a cada 15 min, cadastro 5 por IP por hora; o Nginx limita as rotas de conta a 20 por minuto por IP. Cabeçalhos de segurança (CSP, HSTS, frame). | ✅ |
| RNF-05 | Imagens hospedadas pela loja, no próprio servidor (D-13). Fotos importadas da Hering migradas por `npm run fotos:migrar`. | ✅ |
| RNF-06 | Valores monetários em `DECIMAL(10,2)`. | ✅ |
| RNF-07 | Datas gravadas em UTC e exibidas no fuso America/Sao_Paulo. | ✅ |
| RNF-08 | Interface em português (pt-BR), moeda BRL. | ✅ |
| RNF-09 | Acessibilidade: foco visível, rótulos nos campos, `aria` em seletores de tamanho e abas, textos alternativos. Sem auditoria formal ainda. | 🔧 |
| RNF-10 | Backup diário do banco e das fotos (`deploy/backup-mysql.sh`, no cron às 3h), 7 dias no servidor. Falta o destino fora do servidor (`BACKUP_REMOTO`, L-09). | 🔧 |
| RNF-12 | Monitoramento: `/api/saude` responde 200 com o banco no ar e 503 sem ele, para um monitor externo (falta contratar, L-10). | 🔧 |
| RNF-13 | Testes automatizados de unidade, integração contra MariaDB e ponta a ponta, rodando no CI a cada push na `main` ([Testes](14-testes.md)). | ✅ |
| RNF-11 | Catálogo privado; abrir ao público é uma chave em Configurações. | ✅ |
