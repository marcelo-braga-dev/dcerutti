# 13 · Guia do desenvolvedor

Como trabalhar no código: convenções, receitas para as tarefas mais comuns e armadilhas conhecidas. A visão geral está em [Arquitetura](03-arquitetura.md).

## Antes de começar

- Leia `AGENTS.md`: o Next.js 16 mudou APIs (`proxy.ts` no lugar de `middleware.ts`, `params` e `searchParams` assíncronos). A documentação da versão instalada está em `node_modules/next/dist/docs/`.
- Ambiente: [Ambiente e deploy](07-ambiente-e-deploy.md#primeira-execução).
- Antes de enviar mudanças: `npm run lint && npm run typecheck && npm test`. Em mudanças no servidor ou em Server Actions, rode `npm run test:integracao`; em mudanças de fluxo, `npm run test:e2e`. O CI roda tudo isso a cada push na `main` e em todo pull request.

## Convenções

| Tema | Regra |
|---|---|
| Idioma | Domínio em português (`pedido`, `cliente`, `variante`, `exigirPapel`); APIs do framework em inglês |
| Onde fica o quê | `src/lib/`: código puro, sem banco, usado no cliente e no servidor, com testes em `tests/unit`. `src/server/`: só servidor (`import 'server-only'`). `src/server/acoes/`: Server Actions (`'use server'`) |
| Scripts | `scripts/` roda fora do Next (tsx): não pode importar arquivos com `'server-only'`. Por isso `src/server/contas.ts` não tem essa marca |
| Dinheiro | `Decimal` do Prisma no banco e nos cálculos de pedido; `Number()` só para exibir; `brl()` para formatar; `lerValor()` para ler o que foi digitado |
| Datas | Sempre pelas funções de `src/lib/datas.ts` (`mesDe`, `intervaloDoMes`, `formatarData`…). Nunca `toISOString().slice(...)` para descobrir dia ou mês |
| Telefone e CEP | `src/lib/telefone.ts` (`celularValido`, `formatarTelefone`, `numeroWhatsApp`, `formatarCep`) |
| Estilo | Tailwind com os tokens da marca (`bg-creme`, `text-caramelo`…) e os utilitários `titulo` e `rotulo`. Componentes em `src/components/ui` |
| Comentários | Só quando explicam o **porquê** (regra de negócio, decisão). Citar o código da regra: `// RN-08` |

## Receitas

### Nova página no painel
1. Crie `src/app/(painel)/painel/<nome>/page.tsx` como Server Component `async`.
2. Primeira linha: `const u = await exigirPapel(EQUIPE)` (ou `['gestor']`).
3. Leia os dados por uma função em `src/server/consultas/` que recebe `u` e aplica o escopo (`...escopoVendedor(u)`, ou `exigirGestor(u)` se for só do gestor). A página não importa `@/server/db`: o ESLint barra.
4. Se for só do gestor, inclua o item no menu dentro de `gestor ? [...]` em `src/app/(painel)/painel/layout.tsx`.
5. Use `CabecalhoPagina`, `Cartao` e `Kpi` para manter o padrão visual.

### Novo formulário
```ts
// src/server/acoes/exemplo.ts
'use server';
export async function salvarAlgo(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const u = await exigirPapel(['gestor']);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return falha(fd, errosDoZod(r.error));   // erros por campo + valores de volta
  // ... gravar
  revalidatePath('/painel/...');
  return { ok: true, mensagem: 'Salvo.' };                  // ou redirect(...)
}
```
```tsx
// na página (Server Component)
<Formulario acao={salvarAlgo} className="grid gap-5">
  <Campo nome="nome" rotulo="Nome" padrao={registro?.nome} />
  <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" />
  <BotaoEnviar>Salvar</BotaoEnviar>
</Formulario>
```
`Formulario` usa `useActionState`, mostra `erro` e `mensagem` e repassa os erros aos `Campo` pelo contexto. Use `limparAoConcluir` para formulários de lançamento, como a venda manual.

### Mudar o banco
1. Edite `prisma/schema.prisma`.
2. `npx prisma migrate dev --name descricao-curta` (gera a migration e o client).
3. Revise o SQL gerado em `prisma/migrations/`.
4. Atualize [Banco de dados](04-banco-de-dados.md) se mudar o modelo.
5. Em produção, a migration roda no `deploy/deploy.sh` (`prisma migrate deploy`).

### Mexer em produto ou estoque
Toda action que altera produto, foto, variante, estoque ou reserva **precisa** chamar `invalidarCatalogo()` (`src/server/catalogo.ts`); senão a loja mostra dados antigos por até 5 minutos. Estoque só muda pelas funções de `src/server/estoque.ts` (reservar, baixar, liberar, movimentar), dentro de `db.$transaction`, com `UPDATE ... WHERE` condicional ou `SELECT … FOR UPDATE`. Os testes de integração têm uma corrida pela última peça; rode-os depois de mexer aqui.

### Nova configuração da loja
1. Acrescente o campo ao tipo `Config` e a `CONFIG_PADRAO` em `src/server/config.ts`.
2. Inclua no formulário de `painel/configuracoes/page.tsx` e no esquema de `salvarConfiguracoes` (`acoes/gestao.ts`).
3. Inclua o formato em `FORMATO` (zod): valor salvo que não confere é ignorado e vale o padrão.
4. Leia com `await lerConfig()`. `null` é aceito (o `frete` usa `null` para "a combinar"), mas para textos prefira `''` e para números `0`, como os demais.

### Testar uma regra nova
- Lógica pura de `src/lib/`: teste de unidade em `tests/unit/`.
- Servidor ou Server Action: teste de integração em `tests/integracao/`. `entrarComo('ana@dcerutti.local')` define quem está logado (`suporte/next.ts`); os dados vêm do seed completo. Mudou a forma dos dados? Ajuste `scripts/seed/` e os invariantes (`invariantes.test.ts`).
- Tela ou fluxo: ponta a ponta em `tests/e2e/`. Crie o que o teste altera (nomes com carimbo de tempo), para a suíte passar de novo sem recriar o banco.
- Como rodar cada camada: [Testes](14-testes.md).

### Mandar um e-mail
`enviarEmail({ para, assunto, texto })` (`src/server/email.ts`). Numa Server Action, chame dentro de `after(() => …)` com `.catch`, como `avisarEquipe` em `acoes/pedidos.ts`: o e-mail sai depois da resposta e uma falha não desfaz a ação. Sem `SMTP_URL`, vai para o log.

### Novo servidor de imagens
Inclua o host em `HOSTS_IMAGENS` (`src/lib/imagens.ts`). Ele vale para o `next.config.ts` (otimizador), para o `<Foto>` e para a imagem do pedido. Refaça o build. Prefira baixar as fotos para o servidor (D-13): a Hering apaga arquivos com o tempo.

## Armadilhas conhecidas

| Armadilha | Detalhe |
|---|---|
| `exigirPapel` dentro de `try` | Ele usa `redirect()`, que funciona lançando uma exceção. Dentro de `try/catch`, o redirecionamento vira "erro". Chame sempre antes do `try` |
| Hidratação com `localStorage` | Componentes que mostram dados do navegador (a sacola) devem usar `useHidratado()` (`src/lib/hidratado.ts`) para a primeira renderização ser igual à do servidor |
| Qualidade de imagem | O otimizador do Next 16 só aceita `q=75` por padrão; outro valor responde 400. Use `urlOtimizada()` |
| `window.open` depois de `await` | O navegador bloqueia pop-up que não vem direto do clique. A sacola abre a aba **antes** da Server Action e depois troca o endereço |
| Memória no build | `next build` pode esgotar a RAM em máquinas pequenas. Já há `experimental.cpus: 1`; use `NODE_OPTIONS=--max-old-space-size=1536` |
| `pkill -f "next ..."` | Em scripts, o padrão também casa com o próprio comando e encerra o shell. Encerre pelo PID da porta (`ss -ltnp`) |
| Cache em mais de um processo | O cache do catálogo e o controle da expiração são por processo. Mantenha o PM2 com `instances: 1` ou troque por cache compartilhado |
| Rodar comandos como root no servidor | Arquivos ficam com dono root e o app (`dcerutti`) não grava mais. Use `bash deploy/app.sh` e `bash deploy/pm2.sh`; até um `git checkout` como root muda donos (corrija com `chown -R dcerutti:dcerutti`) |
| Link do WhatsApp | Use `linkWhatsApp` / `linkCompartilharWhatsApp` (`lib/whatsapp.ts`), nunca `wa.me` com texto: o redirecionamento do `wa.me` troca emojis por "�" (D-19). Texto vindo do cadastro dentro de uma mensagem passa por `textoSeguro` |
| Link público do pedido | Monte por `linkPublicoDoPedido` e confira por `codigoDaChave` (`server/link-pedido.ts`). O que aparece em `/p/…` sai de `consultas/pedido-publico.ts`: não acrescente dado pessoal (D-20). O servidor web guarda o cartão por 5 min; para conferir um desenho novo, use `?v=1` |
| Dois "históricos" | `src/server/historico.ts` é o histórico do **pedido** (`pedido_historico`); a navegação da cliente fica em `src/server/navegacao.ts` e `consultas/navegacao.ts` (tabela `atividade`) |
| Registrar um evento novo da loja | Acrescente o tipo em `EventoRastro` (`lib/rastro.ts`), em `esquemaEventos` e no `switch` de `registrarEventos` (`server/navegacao.ts`) e, se for um tipo novo de `atividade`, no enum `TipoAtividade` (migration) e no texto da linha do tempo. Nunca confie em quem é a cliente pelo corpo: vem da sessão |
| `loading.tsx` e status HTTP | Com `loading.tsx`, o painel começa a transmitir antes de saber se a página existe: o "não encontrado" responde 200 (o conteúdo está protegido). Achado dos testes, em aberto |
