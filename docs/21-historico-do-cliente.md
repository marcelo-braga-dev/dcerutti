# 21 · Histórico do cliente (navegação e interesse)

Planejamento e implementação de 15/10/2026 · Marcelo · situação: **concluído** — fases 1 a 5 prontas em 15/10/2026 (D-18); conferido no navegador no ambiente de teste (cliente no celular, gestor no computador) em 15/10/2026

A loja registra como cada cliente logada usa o catálogo: quando entra, que páginas e peças abre e por quanto tempo, o que busca e filtra, que tamanhos escolhe, o que põe e tira da sacola, que cupons tenta e quando clica no WhatsApp. O vendedor e o gestor usam isso para entender o interesse da cliente e oferecer as peças certas.

## O que é registrado

Só clientes logadas com ficha (`cliente.userId`). Equipe navegando na loja e visitantes (catálogo público) **não** são registrados. **Sem IP** (D-18).

| Evento (`atividade.tipo`) | Quando | O que guarda |
|---|---|---|
| `login` | Entrou com a senha (hook `session.create.after` do Better Auth) | aparelho |
| `acesso` | Primeira página depois de 30 min sem atividade (começo de uma visita) | página de entrada, aparelho |
| `pagina` | Abriu uma página da loja | caminho, tempo visível na página |
| `produto` | Abriu a página de uma peça | produto, tempo |
| `busca` | Catálogo com `?q=` | termo, filtros, quantos resultados vieram |
| `filtro` | Catálogo com filtros, sem busca | filtros (gênero, categoria, marca, tamanho, estação, promoção, estoque) |
| `tamanho` | Escolheu um tamanho na peça | produto, variante, tamanho |
| `sacola` | Pôs ou tirou peça da sacola | produto, variante, tamanho, `delta` |
| `cupom` | Tentou um código na sacola (uma vez a cada 30 min por código) | código, aceito ou motivo da recusa |
| `whatsapp` | Clicou em um link do WhatsApp | página |

Pedidos não são duplicados: a linha do tempo junta os eventos com a tabela `pedido`.

Além dos eventos:
- `cliente.ultimoLoginEm` e `cliente.ultimoAcessoEm` (atualizado no máximo uma vez por minuto), para a lista de clientes ordenar e filtrar sem somar eventos.
- `sacola_cliente`: cópia da sacola do navegador. Vazia ou virou pedido, a linha sai.

## Como funciona

```
navegador (loja)                                servidor
───────────────                                 ────────
<Rastreador> no layout da loja (só cliente)
  usePathname/useSearchParams → pagina {ref, caminho}
  visibilitychange/pagehide   → duracao {ref, seg}
  clique em wa.me             → whatsapp
  sacola mudou                → carrinho {itens}
<Comprar> escolheu tamanho    → tamanho
ProvedorSacola +/−            → sacola {delta}
        │ fila em lib/rastro.ts, lote a cada 1,5 s
        └─ navigator.sendBeacon('/api/atividade') ──▶ sessão → cliente (nunca do corpo)
                                                       zod, mesma origem, 60 lotes/min
                                                       server/navegacao.ts: classifica o caminho
                                                       (produto / busca / filtro / página), evita
                                                       repetição em 10 s, grava atividade
```

- **Por que no navegador:** o layout do App Router não roda de novo a cada navegação, e o prefetch dos links renderiza páginas que a cliente nunca abriu. Registrar no servidor contaria errado.
- **Tempo na página:** cada página aberta recebe uma `ref` aleatória; quando a aba some, a página fecha ou a cliente navega, o tempo visível é somado (`duracaoSeg += seg`).
- **Sacola:** a primeira leitura do `localStorage` não é enviada. Assim, abrir a loja em outro aparelho com a sacola vazia não apaga a sacola do celular. As mudanças esperam 800 ms para juntar cliques seguidos; se a cliente sai da página antes disso (pôs a peça e foi direto para a sacola), o envio pendente sai junto com o `pagehide`, em vez de se perder.
- **Falhas não derrubam a loja:** a rota responde 204 mesmo quando não grava; erros vão para o log.

## Onde a equipe vê

| Tela | O que mostra |
|---|---|
| **Ficha do cliente** → card "Interesse e acesso" | Último acesso e login, aparelho, visitas em 7 e 30 dias, páginas e tempo em 30 dias; **sacola atual** (com botão para montar o pedido); **peças mais vistas** (vezes, tempo, tamanhos escolhidos, se pôs na sacola, pediu ou comprou, estoque, botão "Oferecer"); categorias, marcas e tamanhos preferidos; parte das peças vistas em promoção; buscas recentes (as sem resultado em vermelho); **favoritos** guardados com o coração (D-22) |
| **Ficha → Histórico completo** (`/painel/clientes/[id]/historico`) | Linha do tempo agrupada por visita, com os pedidos no meio; filtros Peças, Buscas e filtros, Sacola e cupons, Acessos, Pedidos; "Carregar mais" |
| **Clientes** | "Último acesso" e "Sacola aberta" em cada cartão; filtros "Acessaram em 7 dias", "Com sacola aberta" e ordem por último acesso |
| **Painel inicial** → "Clientes interessados agora" | Clientes dos últimos 7 dias com sacola aberta ou que viram a mesma peça 3 vezes ou mais, com atalho para o WhatsApp |
| **Interesse** (`/painel/interesse`, menu) | Últimos 7, 30 ou 90 dias: clientes que acessaram, visitas e aparelhos, peças vistas, sacolas abertas; peças mais vistas com o funil vistas → clientes → sacola → pedidas; clientes mais ativas; buscas sem resultado; mais buscadas; visitas por dia; clientes ativas por vendedor (gestor) |
| **Montar pedido** | Aceita `?busca=REF`: o botão "Oferecer" e o da sacola já abrem o montador com a peça buscada |

Escopo: o vendedor vê só as clientes dele; o gestor, todas. A linha do tempo é completa para quem atende (D-18).

## Aviso de sacola parada

Com "Avisar o vendedor da sacola parada" ligado, a sacola com peças parada há `horasSacola` (padrão 24 h, até 7 dias) e sem pedido depois gera um e-mail para o vendedor da cliente (ou para os gestores, se ele estiver inativo), com as peças, o total e o link da ficha. Um aviso por sacola: mexeu de novo, pode avisar outra vez. A linha é marcada antes do envio, então dois processos não avisam em dobro.

## Retenção e manutenção

- Eventos com mais de **12 meses** são apagados.
- A manutenção (retenção + aviso de sacola) roda sozinha no máximo uma vez por hora, depois das respostas de `/api/atividade` e do painel inicial (`talvezManutencao`). Para garantir que roda mesmo sem acesso, há o cron:

```bash
15 * * * * cd /www/wwwroot/dcerutti/site && sudo -u dcerutti /opt/node-22/bin/npm run historico:manutencao >> /var/log/dcerutti-historico.log 2>&1
```

## LGPD

- A política de privacidade (versão de 15/10/2026) descreve o registro de uso do catálogo, a finalidade (atendimento pelo vendedor e reposição de estoque), a retenção de 12 meses e a cópia da sacola. Por decisão da loja (D-18), **não há novo aceite nem opção de desligar** para a cliente; o texto da política é atualizado.
- **Excluir minha conta** apaga os eventos, a sacola guardada e as datas de acesso e login.
- Não é usado cookie novo: o registro usa a sessão que já existe.

## Configurações

Em **Configurações** (só gestor), chave `historico`:

| Campo | Padrão | Efeito |
|---|---|---|
| Registrar a navegação das clientes (`ligado`) | ligado | Desligado, nada novo é gravado; as telas continuam mostrando o que já existe |
| Avisar o vendedor da sacola parada (`avisarSacola`) | ligado | E-mail da sacola parada |
| Avisar depois de (horas) (`horasSacola`) | 24 | De 1 a 168 |

## Arquivos

| Arquivo | Papel |
|---|---|
| `prisma/migrations/20261015120000_historico_do_cliente` | Tabelas `atividade`, `sacola_cliente`; `cliente.ultimoLoginEm` e `ultimoAcessoEm` |
| `src/lib/atividade.ts` | Lógica pura: aparelho, caminho válido, classificação, visitas, ranking, textos (testes em `tests/unit/atividade.test.ts`) |
| `src/lib/rastro.ts`, `src/components/loja/rastreador.tsx` | Navegador: fila e envio em lote, páginas, tempo, WhatsApp, cópia da sacola |
| `src/app/api/atividade/route.ts` | Recebe os lotes |
| `src/server/navegacao.ts` | Gravação, login, cupom, sacola, LGPD, manutenção e aviso |
| `src/server/consultas/navegacao.ts` | Leituras do painel com o escopo do usuário |
| `src/components/painel/interesse-cliente.tsx`, `painel/clientes/[id]/historico`, `painel/interesse` | Telas |
| `scripts/manutencao-historico-cliente.ts` | Manutenção pelo cron (`npm run historico:manutencao`) |
| `tests/integracao/historico-cliente.test.ts` | Gravação, recusas, escopo, interessados, sacola parada, retenção e exclusão da conta |
| `tests/e2e/historico.spec.ts` | Ponta a ponta: a navegação da cliente aparece para a vendedora dela e não para outro vendedor |
