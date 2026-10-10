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
3. Filtre as consultas com `...escopoVendedor(u)`.
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
Toda action que altera produto, foto, variante, estoque ou reserva **precisa** chamar `invalidarCatalogo()` (`src/server/catalogo.ts`); senão a loja mostra dados antigos por até 5 minutos. Alterações de estoque devem acontecer dentro de `db.$transaction` e usar `UPDATE ... WHERE` condicional (ver `src/server/pedidos.ts`) quando houver concorrência.

### Nova configuração da loja
1. Acrescente o campo ao tipo `Config` e a `CONFIG_PADRAO` em `src/server/config.ts`.
2. Inclua no formulário de `painel/configuracoes/page.tsx` e no esquema de `salvarConfiguracoes` (`acoes/gestao.ts`).
3. Leia com `await lerConfig()`. Não use `null` como valor: o campo JSON do Prisma não aceita. Use `''` ou `0`.

### Novo servidor de imagens
Inclua o host em `HOSTS_IMAGENS` (`src/lib/imagens.ts`). Ele vale para o `next.config.ts` (otimizador), para o `<Foto>` e para a imagem do pedido. Refaça o build.

## Armadilhas conhecidas

| Armadilha | Detalhe |
|---|---|
| `exigirPapel` dentro de `try` | Ele usa `redirect()`, que funciona lançando uma exceção. Dentro de `try/catch`, o redirecionamento vira "erro". Chame sempre antes do `try` |
| Hidratação com `localStorage` | Componentes que mostram dados do navegador (a sacola) devem usar `useHidratado()` (`src/lib/hidratado.ts`) para a primeira renderização ser igual à do servidor |
| Qualidade de imagem | O otimizador do Next 16 só aceita `q=75` por padrão; outro valor responde 400. Use `urlOtimizada()` |
| `window.open` depois de `await` | O navegador bloqueia pop-up que não vem direto do clique. A sacola abre a aba **antes** da Server Action e depois troca o endereço |
| Memória no build | `next build` pode esgotar a RAM em máquinas pequenas. Já há `experimental.cpus: 1`; use `NODE_OPTIONS=--max-old-space-size=1536` |
| `pkill -f "next ..."` | Em scripts, o padrão também casa com o próprio comando e encerra o shell. Encerre pelo PID da porta (`ss -ltnp`) |
| Cache em mais de um processo | O cache do catálogo é por processo. Mantenha o PM2 com `instances: 1` ou troque por cache compartilhado |
