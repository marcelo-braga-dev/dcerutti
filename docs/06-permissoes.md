# 06 · Permissões

## Princípios

1. **O servidor decide.** Esconder um botão não é proteção. Toda Server Action e toda página protegida verifica o papel no servidor.
2. **Negar por padrão.** Páginas do gestor chamam `exigirPapel(['gestor'])` na primeira linha, mesmo estando dentro do layout do painel.
3. **Custo é segredo.** Nenhum dado de custo ou margem sai do servidor para quem não é gestor, nem em JSON, nem em props de componente, nem em HTML. O cache do catálogo (`src/server/catalogo.ts`) nem carrega o custo.
4. **Vendedor vê só o que é dele**: seus clientes, seus pedidos, suas vendas, sua meta. Toda leitura de página passa por `src/server/consultas/`, que aplica esse escopo num lugar só.
5. **Gestor não tem carteira** (D-14): opera todos os clientes e pedidos, mas o vendedor de um cliente é sempre um vendedor ativo.

## Matriz de acesso

| Recurso / ação | Visitante | Cliente | Vendedor | Gestor |
|---|:-:|:-:|:-:|:-:|
| Entrar / criar conta / "Esqueci a senha" | ✅ | — | — | — |
| Ver catálogo e produtos | — ¹ | ✅ | ✅ | ✅ |
| Montar sacola | — ¹ | ✅ | ✅ | ✅ |
| Enviar pedido / condicional pela loja | — | ✅ | — | — |
| Ver os próprios pedidos (Minha conta) | — | ✅ | — | — |
| Cancelar o próprio pedido em aberto | — | ✅ | — | — |
| Corrigir os próprios dados; excluir a própria conta | — | ✅ | — | — |
| Ver pedidos | — | — | Seus | Todos |
| Confirmar / editar peças / cancelar pedido | — | — | Seus | Todos |
| Montar seleção, condicional ou venda na loja para cliente | — | — | Seus clientes | Todos |
| Ver / cadastrar / editar clientes | — | — | Seus | Todos |
| Dar acesso à loja a cliente sem conta | — | — | Seus | Todos |
| Trocar e-mail ou redefinir senha de cliente que já tem acesso | — | — | — | Todos |
| Trocar vendedor de um cliente (os pedidos em aberto vão junto) | — | — | — | ✅ |
| Registrar / excluir venda manual | — | — | Seus clientes | Todos |
| Ver vendas do mês | — | — | As suas | Todas |
| Ver meta e vendido no mês | — | — | A sua | Todas |
| Link de convite | — | — | ✅ | — ³ |
| Cadastrar / editar / desativar vendedores e metas | — | — | — | ✅ |
| Ver estoque disponível | — | ✅ ² | ✅ | ✅ |
| Editar produtos, preços, fotos, estoque | — | — | — | ✅ |
| Ver custos, margem, lucro | — | — | — | ✅ |
| Resultados | — | — | — | ✅ |
| Configurações da loja | — | — | — | ✅ |
| Identidade visual (cores, logos, favicon; D-25) | — | — | — | ✅ |
| Acompanhamento da equipe: presença, tempo de uso e histórico de ações ([24](24-acompanhamento-da-equipe.md)) | — | — | — | ✅ |
| Ligar os cupons; criar, editar, desativar e apagar cupom ([Cupons](20-cupons.md)) | — | — | — | ✅ |
| Ver os cupons disponíveis e divulgar (com os cupons ligados; sem números de uso) | — | — | ✅ | ✅ |
| Caixa da loja: registrar venda, cadastro rápido de cliente, vendas do dia ([22](22-caixa.md)) | — | — | Suas | Todas (escolhe o "vendido por"; desconto sem limite) |
| Guardar favoritos, "Comprar de novo" dos próprios pedidos | — | ✅ | — | — |
| Ver interesse e histórico de navegação das clientes ([21](21-historico-do-cliente.md)) | — | — | Seus clientes | Todos |
| Ligar o registro de navegação e o aviso de sacola parada | — | — | — | ✅ |

¹ Por enquanto o catálogo é **privado**: o visitante só vê as telas de entrar e de cadastro. Com "Catálogo público" ligado em Configurações, o visitante passa a ver catálogo e sacola, mas continua precisando entrar para enviar pedido ([D-09](10-decisoes.md)).
² Na página do produto, depois de escolher o tamanho ("3 em estoque").
³ O gestor não atende clientes (D-14), por isso não tem link de convite.
⁴ Link público do pedido (`/p/PED-….<assinatura>`, D-20): quem tem o link vê as peças, os valores e a situação daquele pedido, sem login, para a prévia no WhatsApp funcionar. Sem nome, telefone, CEP, vendedor ou custo; a assinatura impede chegar a outros pedidos trocando o número.

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
| Layout da loja | `src/app/(loja)/layout.tsx` | Sem usuário e catálogo privado → `/entrar`; cliente sem aceite da política → `/privacidade` |
| Consultas | `src/server/consultas/*.ts` | Recebem o usuário e aplicam o escopo; as de gestor chamam `exigirGestor`. Uma regra do ESLint impede páginas de importar `@/server/db` |
| Layout do painel | `src/app/(painel)/painel/layout.tsx` | `exigirPapel(EQUIPE)` |
| Páginas | cada `page.tsx` | `exigirPapel(...)` + `escopoVendedor` / `podeAcessar` |
| Server Actions | `src/server/acoes/*.ts` | `exigirPapel(...)` na primeira linha, **fora** do `try` |
| Rotas de API | `src/app/api/upload/route.ts` | Checa o gestor e responde 403. `/api/saude` é pública e só diz se o banco responde |
| Limites | `src/server/limite.ts`, `deploy/nginx.conf` | Tentativas de login, cadastro e redefinição por e-mail e por IP; Nginx com 20 req/min por IP nas rotas de conta |
| Login | `src/server/auth.ts` | O hook `session.create.before` impede a sessão de usuário inativo; o cadastro público do Better Auth é desligado (contas só pelas nossas actions) |

## Checklist para cada nova tela ou ação

- [ ] Começa com `exigirPapel(...)`, fora de qualquer `try`?
- [ ] Consultas usam `escopoVendedor()` quando o vendedor tem acesso?
- [ ] O `select`/`include` do Prisma traz só o necessário, sem `custo` por acidente?
- [ ] Ao receber um ID do navegador, confere com `podeAcessar()`?
- [ ] Leitura nova de página? Fica em `src/server/consultas/`, não na página.
- [ ] Existe teste do acesso negado? Na integração (`tests/integracao/consultas-relatorios.test.ts` e `acoes-*.test.ts`) e, para telas, em `tests/e2e/fluxos.spec.ts` e `gestao.spec.ts`.
