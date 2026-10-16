# 24 · Acompanhamento da equipe

Planejamento e implementação de 16/10/2026 · Marcelo · situação: **concluído** (D-26); conferido no navegador no ambiente de teste em 16/10/2026

O gestor acompanha quem da equipe está usando o painel e o caixa, por quanto tempo e o que cada pessoa fez: clientes cadastradas, pedidos montados, seleções enviadas, conversas no WhatsApp e vendas. O registro começou em 16/10/2026; antes disso não há dados.

## O que é registrado

| Registro | Quando | Onde |
|---|---|---|
| **Login** | Ao entrar com senha (gancho do Better Auth), com o aparelho | `atividade_equipe` (`login`) e `user.ultimoLoginEm` |
| **Presença** | Sinal a cada minuto com o painel ou o caixa aberto, e ao esconder a aba ou fechar. Só conta o tempo com a tela **visível** | `sessao_equipe` e `user.ultimoAcessoEm` |
| **Ações** | Nas próprias ações do servidor, depois que deram certo | `atividade_equipe` |
| **Envios pelo WhatsApp** | No clique do link do painel e do caixa; o tipo vem do atributo `data-acao` do link. A seleção enviada pelo compartilhar do celular é avisada pelo montador | `atividade_equipe` |

Uma **sessão** vai do primeiro ao último sinal, com até 5 minutos entre eles; depois disso começa outra. "Online agora" é o último sinal há menos de 3 minutos.

| Ação (`atividade_equipe.tipo`) | Grupo na tabela | Registrada em |
|---|---|---|
| `login` | Acesso | login |
| `cliente_cadastrado`, `cliente_editado` | Clientes | ficha do painel, cadastro rápido do caixa |
| `pedido_criado` | Pedidos | montador ("Só salvar" ou "Salvar e enviar") |
| `oferta_enviada` | Envios e contatos | "Salvar e enviar ao cliente" |
| `pedido_editado`, `cupom_pedido`, `pedido_cancelado` | Pedidos | página do pedido |
| `pedido_confirmado`, `venda_balcao`, `venda_caixa`, `venda_manual` | Vendas | confirmar pedido, venda na loja, caixa, venda manual |
| `venda_desfeita`, `venda_excluida` | Vendas | desfazer venda, excluir venda manual |
| `whatsapp`, `cupom_enviado`, `convite_enviado` | Envios e contatos | links do WhatsApp (cliente, pedido, comprovante, fechamento, cupom, convite) |

Cada ação guarda quem fez, a cliente e o pedido (sem chave estrangeira, para o histórico não sumir), o valor quando há e uma frase curta ("Fulana · PED-000123 · 3 peças"). Quem registra é **quem fez a ação**: uma venda que o gestor lançou no caixa para a Ana fica no histórico do gestor, com "vendida por Ana"; o valor vendido da tabela vem da tabela `venda` (a mesma das metas) e vai para a Ana.

Registrar nunca impede o trabalho: um erro ao gravar só aparece no log do servidor.

## A página Equipe (`/painel/equipe`, só o gestor)

- **Período** (hoje, 7 dias, 30 dias, este mês) e **Ordenar por** (mais vendido, mais tempo de uso, mais ações, acesso mais recente, nome).
- **Números:** online agora, tempo de uso somado, ações registradas e vendido no período.
- **Tabela por vendedor:**
  - online agora ou "visto há…", e o último login;
  - tempo de uso, dias com uso e logins;
  - faixa de uso por dia;
  - clientes novas (e a carteira), pedidos montados, envios e contatos;
  - vendas em R$ e quantidade, cancelamentos.
  - Cada número tem uma barra de fundo do tamanho dele em relação ao maior da coluna, para comparar de relance. Os números levam ao histórico já filtrado, e o nome leva ao perfil.
- **Histórico de ações:** filtro por pessoa (inclusive o gestor) e por ação, agrupado por dia, com links para a cliente e o pedido, e "Carregar mais".
- **Perfil do vendedor:** online ou "visto há…" no topo e o cartão **Últimas ações**, com o último login e o link para o histórico completo.

## Privacidade e retenção

São dados de trabalho da equipe, vistos só pelo gestor. Não há IP nem conteúdo das conversas: do WhatsApp fica só que o link foi aberto, para quem e de que tipo. Sessões e ações com mais de **13 meses** são apagadas na manutenção diária (`limparAcompanhamento`). Excluir o usuário apaga o acompanhamento dele.

## Peças

| Peça | O que faz |
|---|---|
| `src/lib/equipe.ts` | Nomes e grupos das ações, resumo por pessoa (`resumirEquipe`), duração e online |
| `src/server/equipe.ts` | `registrarAcao`, `registrarLoginEquipe`, `registrarPresenca`, `registrarEnvio` e a retenção |
| `src/app/api/equipe` | Recebe o sinal de presença e os envios (só equipe, com limite por minuto) |
| `src/components/painel/sinal-equipe.tsx` | Sinal a cada minuto e cliques do WhatsApp, no painel e no caixa |
| `src/server/consultas/equipe.ts` | `acompanhamentoDaEquipe`, `historicoDaEquipe`, `ultimasAcoes` |
| `src/app/(painel)/painel/equipe` | A página |
