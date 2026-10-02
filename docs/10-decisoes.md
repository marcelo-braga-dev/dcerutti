# 10 · Decisões

Registro das decisões técnicas e de produto. Uma decisão tomada só muda com uma nova entrada que a substitua.

## Tomadas

### D-01 · Next.js como framework — 2026-09-27
**Contexto:** catálogo que precisa ser rápido, indexável e bonito ao ser compartilhado no WhatsApp, mais um painel interno com login.
**Decisão:** uma única aplicação Next.js (App Router, TypeScript) para loja e painel.
**Consequência:** um só deploy e um só código; exige hospedagem com Node.js.

### D-02 · MySQL como banco — 2026-09-27
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

### D-06 · Cloudflare R2 para imagens — 2026-09-27
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
**Decisão:** todas as páginas da loja exigem login. O acesso é controlado por uma única configuração, `catalogo_publico` (padrão `false`), verificada no layout da loja (`src/app/(loja)/layout.tsx`) e editável em Painel → Configurações.
**Consequência:**
- Páginas da loja são renderizadas por requisição (dependem da sessão); os **dados** do catálogo ficam em cache de memória no servidor, invalidado a cada alteração (D-11).
- Open Graph, sitemap e indexação ficam para quando o catálogo abrir (páginas privadas não são lidas pelo Google nem geram prévia no WhatsApp).
- Para abrir no futuro: ligar `catalogo_publico`, trocar as páginas da loja para ISR, liberar o visitante na matriz de [Permissões](06-permissoes.md) e adicionar Open Graph e sitemap. O envio de pedido continua exigindo login.

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

## Pendentes

Em aberto de propósito: serão definidas conforme o andamento e a validação com a loja. Até lá, o sistema segue o comportamento do protótipo.

| # | Pergunta | Opções | Impacto |
|---|---|---|---|
| P-03 | Qual a regra de frete? | Fixo R$ 24,90 com grátis acima de R$ 299 (protótipo); sempre a combinar; tabela por cidade | Sacola, mensagem do WhatsApp, RN-15 |
| P-04 | Parcelamento "6× sem juros" exibido no produto é real? | Manter, mudar o número de parcelas, remover | Página de produto |
| P-05 | O estoque vem de outro sistema da loja? | Manual no painel; importação periódica por planilha; integração | Fase 4, RF-35 |
| P-06 | Domínio | ex.: `dcerutti.com.br` | Deploy, e-mail, R2 |
| P-07 | Quem mais além da Hering? | Só Hering por enquanto; outras marcas depois | Filtros, home |
