# 10 · Decisões

Registro das decisões técnicas e de produto. Uma decisão tomada só muda com uma nova entrada que a substitua.

## Tomadas

### D-01 · Next.js como framework — 2026-09-27
**Contexto:** catálogo que precisa ser rápido, indexável e bonito ao ser compartilhado no WhatsApp, mais um painel interno com login.
**Decisão:** uma única aplicação Next.js (App Router, TypeScript) para loja e painel.
**Consequência:** um só deploy e um só código; exige hospedagem com Node.js.

### D-02 · MySQL como banco — 2026-09-27 *(parte de banco substituída por D-12: MariaDB 10.11)*
**Contexto:** alternativa considerada foi Supabase (PostgreSQL com login e storage prontos).
**Decisão:** MySQL 8, por preferência do time e liberdade de hospedagem.
**Consequência:** login, armazenamento de imagens e controle de acesso ficam a cargo da aplicação (D-03, D-04, D-05).

### D-03 · Prisma como ORM — 2026-09-27
**Decisão:** Prisma, pela facilidade de uso, migrations e tipagem.
**Alternativa:** Drizzle (mais leve, mais próximo do SQL). Reavaliar se o tamanho do cliente Prisma virar problema em ambiente serverless.

### D-04 · Better Auth para autenticação — 2026-09-27
**Decisão:** Better Auth com e-mail e senha, adapter Prisma, campo `papel` no usuário.
**Alternativa:** Auth.js — descartado porque o fluxo de e-mail + senha é menos direto.

### D-05 · Controle de acesso na aplicação — 2026-09-27
**Contexto:** MySQL não tem regras de acesso por linha como o PostgreSQL/Supabase.
**Decisão:** toda verificação em `src/server/permissoes.ts`, chamada no início de cada Server Action e layout protegido. Custos em tabela separada.
**Consequência:** exige disciplina — ver checklist em [Permissões](06-permissoes.md).

### D-06 · Cloudflare R2 para imagens — 2026-09-27 *(substituída por D-13)*
**Decisão:** fotos no R2, servidas por domínio próprio.
**Motivo:** sem custo de tráfego de saída, compatível com S3, independe da hospedagem escolhida.

### D-07 · Pedido gravado antes de abrir o WhatsApp — 2026-09-27
**Decisão:** o envio cria o pedido no banco e só depois abre `wa.me`.
**Motivo:** o painel fica completo mesmo se o cliente desistir de tocar em "enviar" no WhatsApp; pedidos pendentes antigos podem ser cancelados.

### D-08 · Sem integração com a API do WhatsApp — 2026-09-27
**Decisão:** usar links `wa.me` com texto pré-preenchido.
**Motivo:** gratuito, sem aprovação da Meta, funciona com o WhatsApp pessoal de cada vendedor.

### D-09 · Catálogo privado, preparado para ser público — 2026-09-27
**Contexto:** a loja quer, por enquanto, que só clientes cadastrados vejam o catálogo; no futuro ele poderá abrir ao público.
**Decisão:** todas as páginas da loja exigem login. O acesso é controlado por uma única configuração, `catalogoPublico` (padrão `false`), verificada no layout da loja (`src/app/(loja)/layout.tsx`) e editável em Painel → Configurações.
**Consequência:**
- Páginas da loja são renderizadas por requisição (dependem da sessão); os **dados** do catálogo ficam em cache de memória no servidor, invalidado a cada alteração (D-11).
- Open Graph, sitemap e indexação ficam para quando o catálogo abrir (páginas privadas não são lidas pelo Google nem geram prévia no WhatsApp).
- Para abrir no futuro: ligar `catalogoPublico`, trocar as páginas da loja para ISR, liberar o visitante na matriz de [Permissões](06-permissoes.md) e adicionar Open Graph e sitemap. O envio de pedido continua exigindo login.

### D-10 · Hospedagem em VPS própria com MySQL — 2026-09-27
**Decisão:** aplicação Next.js e MySQL 8 no mesmo servidor VPS, com Nginx, PM2 e HTTPS (Let's Encrypt).
**Consequência:** custo fixo e controle total; backups, atualizações de segurança e monitoramento são responsabilidade da equipe — ver [Ambiente e deploy](07-ambiente-e-deploy.md#hospedagem-vps).

### D-11 · Escolhas de implementação — 2026-09-27
**Contexto:** ao iniciar o código, algumas ferramentas do planejamento foram trocadas por opções mais simples ou mais estáveis.
**Decisão:**
- **npm** no lugar de pnpm: o pnpm atual bloqueia os scripts de instalação do Prisma e do sharp e exige configuração extra.
- **Prisma 6**: a versão 7 exige driver adapter e a 8 ainda é *release candidate*.
- **Componentes próprios** em vez de shadcn/ui, e **`useActionState`** do React em vez de React Hook Form: o visual da marca é simples (cantos retos, poucas variações) e os formulários são todos Server Actions.
- **Cache do catálogo em memória** em vez de `revalidateTag`: ~600 produtos, um processo na VPS, invalidação explícita a cada alteração.
- **Datas com `Intl`** nativo em vez de date-fns: o Brasil não tem horário de verão desde 2019 e o deslocamento é fixo (-03:00), isolado em `src/lib/datas.ts`.
- **Condicional reserva estoque** ao ser enviado, e o fechamento é feito peça por peça (RN-08).
**Consequência:** menos dependências. Rever o cache se a aplicação passar a rodar em mais de um processo, e rever as datas se o horário de verão voltar.

### D-12 · MariaDB 10.11 e camadas de leitura e estoque — 2026-10-02
**Contexto:** o servidor usa MariaDB 10.11 (aaPanel), enquanto Docker e documentação usavam MySQL 8.4. As leituras estavam espalhadas por 17 páginas, cada uma repetindo o filtro de permissão.
**Decisão:** MariaDB 10.11 em todos os ambientes (servidor, Docker e CI). Leituras de página só por `src/server/consultas/`; alterações de estoque só por `src/server/estoque.ts`; chaves estrangeiras em `pedido.vendedorId`, `venda.vendedorId` e `movimento_estoque` (migration `20261002120000_chaves_estrangeiras`).
**Consequência:** substitui a parte de banco de D-02 e D-10. A regra "vendedor só vê o que é dele" fica num lugar só e pode ser testada.

### D-13 · Fotos no próprio servidor — 2026-10-02
**Contexto:** D-06 previa Cloudflare R2, mas o bucket nunca foi usado e as fotos importadas continuavam nos servidores da Hering, com 65 já quebradas.
**Decisão:** substitui D-06. Arquivos enviados ficam no servidor, na pasta `armazenamento/` do projeto, servidos pela rota `/arquivos/...`. O SDK da AWS saiu do projeto; `sharp` converte as fotos para WebP.
**Consequência:** sem custo nem conta externa. A pasta precisa acompanhar o servidor em migrações (não está no Git nem no dump do banco).

### D-14 · Expiração, venda na loja, frete a combinar e carteira só de vendedores — 2026-10-07
**Contexto:** auditoria de 07/10 (docs/18-auditoria.md, itens Q-04, Q-05, Q-08, U-11 e C-03).
**Decisão:**
- **Q-05:** pedido ou condicional pendente expira após **7 dias** (ajustável em Configurações; 0 = nunca). A reserva volta ao estoque e o motivo fica registrado: equipe, cliente ou expirado.
- **Q-04:** a venda na loja física é registrada **com as peças** (Novo pedido → Venda na loja). Entra confirmada, baixa o estoque e conta na meta. O lançamento só de valor continua para quando não houver peças.
- **Q-08 / U-11:** o gestor **não** atende clientes. O vendedor de um cliente é sempre um vendedor ativo, e o gestor não tem link de convite.
- **C-03 (P-03, P-04):** frete e parcelamento ficam **escondidos até a loja definir**. O frete aparece como "a combinar" e o parcelamento como 0. O gestor ativa os dois em Configurações.
**Consequência:** o frete do pedido passa a aceitar NULL (a combinar). O pedido ganha a origem `balcao` e a coluna `motivoCancelamento`. A expiração roda dentro do app quando a equipe abre o painel, no máximo uma vez por hora.

### D-15 · Produção separada do ambiente de teste — 2026-10-08
**Contexto:** o domínio definitivo servia o ambiente de teste, com dados fictícios, um usuário de banco com `ALL PRIVILEGES` e segredos que circularam em conversa (docs/19-lancamento.md, L-02 e L-06).
**Decisão:**
- Produção com banco próprio, `dcerutti_producao`, e dois usuários: `dcerutti_app` (só leitura e escrita de dados, usado pelo site) e `dcerutti_migra` (alterar tabelas, usado só nas migrations via `MIGRATE_DATABASE_URL`). Senhas e `BETTER_AUTH_SECRET` novos, gerados no servidor por `deploy/criar-banco-producao.sh`.
- Fotos da produção em pasta própria (`ARMAZENAMENTO_DIR`), vindas do cache das fotos originais da Hering.
- O ambiente de teste vai para `teste.dcerutti.com.br`, com cópia própria do código, banco `dcerutti`, porta 3001 e processo PM2 `dcerutti-teste`.
- Produção atualizada só pela `main`, com `deploy/deploy.sh`, depois do CI verde.
**Consequência:** depois da virada, `dcerutti.com.br` deixa de aceitar build e testes livres; `CLAUDE.md` e a documentação passam a dizer que ele é produção.

### D-16 · Testes contra o banco real, com seed completo — 2026-10-08
**Contexto:** os testes de unidade só cobriam código puro, e os ponta a ponta usavam poucos dados. As regras de estoque, reserva e escopo dependem do banco e de transações.
**Decisão:** um seed determinístico (`scripts/seed/`) que popula todas as tabelas e variações usando as próprias regras do sistema; testes de integração que chamam os módulos do servidor e todas as Server Actions contra um MariaDB real (APIs do Next simuladas); ponta a ponta sobre o mesmo seed. Bancos de teste sempre com prefixo `test_`, recriados a cada execução. O CI roda as três camadas.
**Consequência:** 299 testes, que pegaram 7 de 7 bugs introduzidos de propósito. Rodar a integração exige um MariaDB local ([Testes](14-testes.md)).

### D-17 · Prazo vencido não cancela sozinho; venda confirmada pode ser desfeita — 2026-10-15
**Contexto:** pendentes vencidos eram cancelados automaticamente (D-14), e a reserva saía sem ninguém ver. Um pedido confirmado por engano ou devolvido não tinha como voltar: o estoque ficava baixado e a venda contava na meta.
**Decisão:**
- O prazo das Configurações ("Prazo de resposta") só **marca** o pendente como "Prazo vencido". O vendedor ou o gestor cancela pelo botão (motivo `expirado`, com autor e o texto do motivo), ou confirma.
- Cancelar um pedido **confirmado** desfaz a venda: peças de volta ao estoque com o novo motivo de movimento `estorno`, venda apagada, uso do cupom liberado, cupom de próxima compra gerado por ela desativado se não foi usado. Motivo obrigatório; só a equipe.
**Consequência:** migration `20261015090000_estorno_de_venda`; `expirarPendentes`/`expirarSeNecessario` deixam de existir; o painel não cancela nada ao abrir.

### D-18 · Histórico de navegação das clientes — 2026-10-15
**Contexto:** o vendedor só via o que a cliente pedia; não sabia o que ela olhava, buscava ou deixava na sacola.
**Decisão:** registrar a navegação das clientes logadas (páginas, peças, tempo, buscas, filtros, tamanhos, sacola, cupons, WhatsApp, login e acesso), pelo navegador, em lote, para `/api/atividade` ([21 · Histórico do cliente](21-historico-do-cliente.md)). Definido com a loja: **sem IP**; linha do tempo **completa** para o vendedor da cliente e o gestor; retenção de **12 meses**; **sem aviso nem opção de desligar** para a cliente (a política de privacidade é atualizada, sem novo aceite); **avisar o vendedor** por e-mail da sacola parada. Sacola copiada para o servidor só para isso. Chave `historico` nas Configurações, ligada por padrão.
**Consequência:** migration `20261015120000_historico_do_cliente`; menu "Interesse"; manutenção por hora (`talvezManutencao`) e `npm run historico:manutencao` no cron.

### D-19 · Mensagem do pedido no WhatsApp com prévia, e link api.whatsapp.com — 2026-10-15
**Contexto:** a mensagem que a cliente envia ao vendedor era um bloco de texto sem saudação nem destaque; pedidos grandes geravam links enormes; a cliente não via o que ia mandar; e, testando, o redirecionamento de `wa.me` para `api.whatsapp.com` trocava todos os emojis por "�" (conferido em 15/10/2026).
**Decisão:** a mensagem é montada por `src/lib/mensagem-pedido.ts` (saudação, blocos, resumo, link do pedido no painel, texto seguro contra a marcação do WhatsApp e três formatos conforme o tamanho), e a sacola mostra a prévia com a mesma função. Todos os links passam a usar `https://api.whatsapp.com/send?phone=…&text=…` (e `?text=` para compartilhar sem número), que preserva os emojis e abre o aplicativo no celular. A tela depois do envio oferece abrir de novo, copiar a mensagem e a imagem, e avisa quando o navegador bloqueia a aba.
**Consequência:** `mensagemDoCliente` sai de `lib/whatsapp.ts`; `ResultadoEnvio` traz `texto`, `total` e `frete`; botão e balão com as cores `--color-whatsapp` e `--color-balao`.

### D-20 · Cartão com as fotos do pedido na prévia do link — 2026-10-15
**Contexto:** a cliente queria mandar uma imagem ou PDF do carrinho junto com a mensagem. O link do WhatsApp só leva texto; anexar exigiria a API oficial (D-08) e sairia do número da loja.
**Decisão:** cada pedido ganha um link público assinado, `/p/PED-000123.<assinatura>` (HMAC de 96 bits com `LINK_PEDIDO_SEGREDO` ou `BETTER_AUTH_SECRET`), que vai como **primeiro link** da mensagem. A página tem as tags Open Graph, e o WhatsApp mostra a prévia com o cartão `cartao.jpg` (1200×630, gerado pelo `sharp`): até 4 fotos com o tamanho, código, peças e total. Ao tocar, abre a página com as peças em tamanho grande. Sem nome, telefone, CEP, vendedor ou custo. Sem login, porque quem busca a prévia é o aparelho da cliente. Com o link, as fotos de cada peça saem do texto.
**Consequência:** sem migration (a assinatura é calculada); `src/server/link-pedido.ts`, `cartao-pedido.ts`, `consultas/pedido-publico.ts` e `app/p/[chave]`. O cartão fica 5 min em cache (`max-age=300`, também no servidor web): uma edição do pedido aparece no cartão em até 5 min; a página mostra na hora. A prévia do link depende do aparelho da cliente: costuma aparecer, mas não é garantida (internet ruim, envio muito rápido); o link continua no texto.

### D-21 · Loja: um card por modelo, filtros com contagem real e visual revisto — 2026-10-15
**Contexto:** vistoria visual de 15/10/2026. A grade repetia o mesmo modelo em várias cores (389 produtos de 122 modelos); 39 categorias em botões; tamanhos misturados ("UN" e "UNI"); contagens que ignoravam a busca; home sem mensagem; sem busca com sugestões, menu no celular, cores na página do produto, tela cheia nas fotos nem botão de compra fixo no celular.
**Decisão:** o modelo é calculado pelo nome-base (sem a cor do fim), marca, categoria e gênero (`lib/cores.ts`); a vitrine mostra uma cor por modelo, com as bolinhas das outras, e a página do produto tem o seletor de cores. Contagens de filtro contam modelos e respeitam a busca e os outros filtros. "Relevância": com estoque e foto, mais tamanhos e fotos, as mais novas, alternando categorias. Componentes novos listados em [Identidade visual](11-identidade-visual.md). Não se inventa descrição de peça: sem descrição, a página mostra os detalhes reais (marca, categoria, cor, composição, referência).
**Consequência:** sem migration. Nginx do site com `proxy_cache off` (o cache global do painel do servidor guardava páginas estáticas de builds antigos) e o limite das telas de conta só para POST (os pré-carregamentos dos links davam 429).

### D-22 · Favoritos, "Comprar de novo", gaveta da sacola e resumo da conta — 2026-10-16
**Contexto:** fase 4 da vistoria visual: faltavam favoritos, recompra, confirmação visível ao pôr na sacola, um resumo na conta e "mostrar senha".
**Decisão:**
- **Favoritos no banco** (tabela `favorito`, chave cliente + produto), não no navegador: valem em qualquer aparelho e o vendedor vê na ficha (sinal forte de interesse). Coração no card e na peça; aba Favoritos em Minha conta. Visitante e equipe que tocam no coração vão para o login.
- **"Comprar de novo"** em pedidos não pendentes: junta à sacola as peças com estoque, nos mesmos tamanhos, com o preço de hoje (a sacola confere de novo ao abrir); o condicional fechado repete só o que ficou; o que acabou é avisado pelo nome.
- **Gaveta da sacola** não bloqueia a tela (dá para escolher outro tamanho em seguida) e fecha sozinha em 6 s.
- **Resumo da conta:** último pedido, favoritos, cupons e quem atende, em todas as abas.
- **"Mostrar senha"** em todo campo de senha.
**Consequência:** migration `20261016090000_favoritos`; a exclusão da conta apaga os favoritos (LGPD); produto excluído leva os favoritos dele.

### D-23 · Caixa da loja física — 2026-10-16
**Contexto:** a venda na loja existia só como opção do montador de pedidos: exigia cliente cadastrada, não registrava a forma de pagamento nem desconto na hora, não tinha busca por código nem filtros e não fechava o caixa.
**Decisão:** tela própria em `/caixa` ([22 · Caixa](22-caixa.md)), cada pessoa com a sua conta; catálogo no navegador com busca por código da etiqueta e filtros; desconto por peça e geral (vendedor até 10%, gestor sem limite); cliente opcional (ficha "Consumidor final", sem mudar a regra de que todo pedido tem cliente); formas de pagamento com parcelas, troco e divisão (tabela `pagamento`); comprovante e fechamento pelo WhatsApp (sem impressora); vendas do dia com totais por forma e por vendedor. A venda reaproveita criar e confirmar pedido (origem `balcao`), com os preços combinados no pedido.
**Consequência:** migration `20261016120000_pagamentos_caixa`; configuração `caixa` (desconto máximo, parcelas); `criarPedido` aceita `precos`; a campanha de próxima compra ignora ficha sem telefone.

## Pendentes

Em aberto de propósito: serão definidas conforme o andamento e a validação com a loja. Até lá, o sistema segue o comportamento do protótipo.

| # | Pergunta | Opções | Impacto |
|---|---|---|---|
| P-03 | Qual a regra de frete? *(até definir: a combinar, D-14)* | Fixo R$ 24,90 com grátis acima de R$ 299 (protótipo); sempre a combinar; tabela por cidade | Sacola, mensagem do WhatsApp, RN-15 |
| P-04 | Parcelamento "6× sem juros" exibido no produto é real? *(até definir: escondido, D-14)* | Manter, mudar o número de parcelas, remover | Página de produto |
| P-05 | O estoque vem de outro sistema da loja? | Manual no painel; importação periódica por planilha; integração | Fase 4, RF-35 |
| P-07 | Quem mais além da Hering? | Só Hering por enquanto; outras marcas depois | Filtros, home |

Resolvida: P-06 (domínio) → **dcerutti.com.br**, com certificado também para `www`.
