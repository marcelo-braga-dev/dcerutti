# 06 · Permissões

## Princípios

1. **O servidor decide.** Esconder um botão não é proteção. Toda Server Action e toda página protegida verifica o papel no servidor.
2. **Negar por padrão.** Páginas do gestor chamam `exigirPapel(['gestor'])` na primeira linha, mesmo estando dentro do layout do painel.
3. **Custo é segredo.** Nenhum dado de custo ou margem sai do servidor para quem não é gestor, nem em JSON, nem em props de componente, nem em HTML. O cache do catálogo (`src/server/catalogo.ts`) nem carrega o custo.
4. **Vendedor vê só o que é dele**: seus clientes, seus pedidos, suas vendas, sua meta.

## Matriz de acesso

| Recurso / ação | Visitante | Cliente | Vendedor | Gestor |
|---|:-:|:-:|:-:|:-:|
| Entrar / criar conta | ✅ | — | — | — |
| Ver catálogo e produtos | — ¹ | ✅ | ✅ | ✅ |
| Montar sacola | — ¹ | ✅ | ✅ | ✅ |
| Enviar pedido / condicional pela loja | — | ✅ | — | — |
| Ver os próprios pedidos (Minha conta) | — | ✅ | — | — |
| Ver pedidos | — | — | Seus | Todos |
| Confirmar / cancelar pedido | — | — | Seus | Todos |
| Montar seleção para cliente | — | — | Seus clientes | Todos |
| Ver / cadastrar / editar clientes | — | — | Seus | Todos |
| Dar acesso à loja / redefinir senha de cliente | — | — | Seus | Todos |
| Trocar vendedor de um cliente | — | — | — | ✅ |
| Registrar / excluir venda manual | — | — | Seus clientes | Todos |
| Ver vendas do mês | — | — | As suas | Todas |
| Ver meta e vendido no mês | — | — | A sua | Todas |
| Link de convite | — | — | ✅ | — |
| Cadastrar / editar / desativar vendedores e metas | — | — | — | ✅ |
| Ver estoque disponível | — | ✅ ² | ✅ | ✅ |
| Editar produtos, preços, fotos, estoque | — | — | — | ✅ |
| Ver custos, margem, lucro | — | — | — | ✅ |
| Resultados | — | — | — | ✅ |
| Configurações da loja | — | — | — | ✅ |

¹ Por enquanto o catálogo é **privado**: o visitante só vê as telas de entrar e de cadastro. Com "Catálogo público" ligado em Configurações, o visitante passa a ver catálogo e sacola, mas continua precisando entrar para enviar pedido ([D-09](10-decisoes.md)).
² Na página do produto, depois de escolher o tamanho ("3 em estoque").

## Implementação

```ts
// src/server/permissoes.ts (resumo)
export const usuarioAtual = cache(async () => {
  // sessão do Better Auth → usuário lido do banco (papel e "ativo" sempre atualizados)
});

export async function exigirPapel(papeis: Papel[]) {
  const u = await usuarioAtual();
  if (!u) redirect('/entrar');                                    // sem sessão
  if (!papeis.includes(u.papel)) redirect(u.papel === 'cliente' ? '/' : '/painel');  // papel errado
  return u;
}

export const EQUIPE: Papel[] = ['vendedor', 'gestor'];

export function escopoVendedor(u) { return u.papel === 'gestor' ? {} : { vendedorId: u.id }; }
export function podeAcessar(u, registro) { return u.papel === 'gestor' || registro.vendedorId === u.id; }
```

Uso típico:

```ts
const u = await exigirPapel(EQUIPE);
const pedidos = await db.pedido.findMany({ where: { status, ...escopoVendedor(u) } });

const cliente = await db.cliente.findUnique({ where: { id } });
if (!cliente || !podeAcessar(u, cliente)) notFound();
```

Camadas de proteção:

| Camada | Arquivo | O que faz |
|---|---|---|
| Proxy | `src/proxy.ts` | Checagem rápida: sem cookie de sessão em `/painel` ou `/minha-conta` → `/entrar?volta=…` |
| Layout da loja | `src/app/(loja)/layout.tsx` | Sem usuário e catálogo privado → `/entrar` |
| Layout do painel | `src/app/(painel)/painel/layout.tsx` | `exigirPapel(EQUIPE)` |
| Páginas | cada `page.tsx` | `exigirPapel(...)` + `escopoVendedor` / `podeAcessar` |
| Server Actions | `src/server/acoes/*.ts` | `exigirPapel(...)` na primeira linha, **fora** do `try` |
| Rotas de API | `src/app/api/upload/route.ts` | Checa o gestor e responde 403 |
| Login | `src/server/auth.ts` | O hook `session.create.before` impede a sessão de usuário inativo; o cadastro público do Better Auth é desligado (contas só pelas nossas actions) |

## Checklist para cada nova tela ou ação

- [ ] Começa com `exigirPapel(...)`, fora de qualquer `try`?
- [ ] Consultas usam `escopoVendedor()` quando o vendedor tem acesso?
- [ ] O `select`/`include` do Prisma traz só o necessário, sem `custo` por acidente?
- [ ] Ao receber um ID do navegador, confere com `podeAcessar()`?
- [ ] Existe teste do acesso negado (ver `tests/e2e/fluxos.spec.ts`, teste de permissões)?
