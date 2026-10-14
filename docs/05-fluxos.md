# 05 · Fluxos

Como cada fluxo funciona de ponta a ponta, com os arquivos envolvidos. Todos são cobertos por testes de integração (`tests/integracao/`) e ponta a ponta (`fluxos.spec.ts`, `melhorias.spec.ts`, `loja.spec.ts`, `senha.spec.ts`); ver [Testes](14-testes.md).

## 1. Pedido de compra (cliente)

```
Cliente (navegador)                    Servidor                              WhatsApp
  │ monta a sacola (localStorage)
  │ "Enviar pedido no WhatsApp"
  │   abre uma aba vazia (para o navegador não bloquear)
  │ ─────────────────────────────► enviarPedido()          acoes/pedidos.ts
  │                                 1. exige papel cliente
  │                                 2. acha a ficha do cliente e o vendedor
  │                                 3. criarPedido()          server/pedidos.ts
  │                                    · confere estoque disponível
  │                                    · preços do banco
  │                                    · código PED-000123 (contador)
  │                                    · frete da regra atual, gravado no pedido
  │                                    · pedido + itens, status pendente
  │                                 4. after(): e-mail ao vendedor   server/avisos.ts
  │ ◄──────────── { codigo, url wa.me, itens }
  │ aponta a aba para o wa.me ─────────────────────────────────────► conversa com o vendedor
  │ limpa a sacola, mostra "Pedido enviado para Ana"
  │ gera a imagem do pedido (canvas) → "Enviar também a imagem"
```

**Pontos-chave**
- O pedido é **gravado antes** de abrir o WhatsApp (D-07): aparece no painel mesmo que o cliente não toque em "enviar".
- O WhatsApp de destino é o do vendedor do cliente. Se o vendedor estiver inativo ou com número incompleto, é o da loja (RN-03).
- Os preços da mensagem e do pedido vêm do banco. Ao abrir, a sacola confere preço e estoque no servidor (`conferirSacola`), atualiza o que mudou e avisa a cliente; peça fora do catálogo aparece pelo nome, para ser retirada.
- O vendedor recebe um e-mail com o código e o link do pedido no painel (se estiver inativo, os gestores). Cobre o caso de a cliente fechar a aba sem tocar em "enviar" no WhatsApp. Uma falha no e-mail nunca derruba o pedido.
- Se alguma peça acabou, o envio é recusado com a lista do que falta.
- Compra **não reserva** estoque: o estoque só baixa na confirmação.
- Mensagem: por item, nome, marca, referência, tamanho, cor, código interno, quantidade × preço e link da foto grande; no fim, total de peças e total. Frete: com regra ligada em Configurações, o valor ou "grátis" e o total com frete; sem regra (o padrão, D-14), "Frete, pagamento e entrega: a combinar".

**No painel**
1. O pedido aparece em *Pedidos → Pendentes*, e o número de pendentes aparece no menu.
2. O vendedor combina pagamento e entrega pelo WhatsApp (botão "WhatsApp do cliente").
3. **Editar peças** (opcional): enquanto pendente, mudar quantidades ou retirar peças (`editarPedido`, com `SELECT … FOR UPDATE`). O preço combinado não muda; o total e o frete são recalculados.
4. **Confirmar venda**: em transação, o status passa a `confirmado`, o estoque baixa (`movimento_estoque` com motivo `venda`), o custo atual é gravado em cada item e a `venda` é criada. Se faltar estoque, a confirmação é recusada.
5. **Cancelar pedido**: o status passa a `cancelado`, com motivo `equipe`. O estoque não muda (a compra só baixa na confirmação). Depois de confirmado, cancelar **desfaz a venda** e devolve as peças ao estoque (fluxo 8a). A cliente também pode cancelar em Minha conta (motivo `cliente`, e o vendedor recebe um e-mail); sem resposta, o pedido expira (fluxo 8).

## 2. Condicional (cliente)

```
Sacola → aba "Provar em casa" → CEP
          │
          ├─ CEP fora da lista → janela "Ainda não chegamos aí" → [Enviar como pedido]
          └─ CEP atendido → enviarPedido(tipo condicional)
                             · reserva: UPDATE variante SET reservado = reservado + q
                                        WHERE estoque - reservado >= q
                             · COND-000045, pendente
                             → WhatsApp do vendedor
```

A reserva tira a peça do "disponível" da loja na hora. Se duas pessoas tentarem a última peça, a segunda recebe "acabou de ser reservada por outra pessoa".

**No painel**
1. O vendedor entrega as peças.
2. Na volta, abre o condicional e marca cada peça: **Ficou** ou **Voltou** (há atalhos "Ficou tudo" e "Voltou tudo"). Com mais de uma unidade, escolhe quantas ficaram (1 de 3). O botão de fechar só é liberado com tudo marcado e já mostra o valor da venda.
3. **Fechar condicional**, em transação:
   - peças que ficaram: `estoque −= q`, `reservado −= q`, custo gravado;
   - peças que voltaram: `reservado −= q`;
   - linha com parte das unidades: dividida em uma linha `vendido` e outra `devolvido`;
   - `venda` criada só com o valor das peças que ficaram (se nenhuma ficou, não há venda);
   - status `confirmado`.
4. **Cancelar** (pela equipe, pela cliente ou pela equipe por prazo vencido): libera toda a reserva.

## 3. Seleção montada pelo vendedor (e venda na loja)

1. *Pedidos → + Novo pedido*, ou *Montar pedido* na lista ou na ficha do cliente (o cliente já vem escolhido).
2. Escolhe o cliente (o vendedor vê só os seus); busca por nome, referência, categoria ou cor; clica no tamanho para adicionar (só aparecem tamanhos com estoque disponível).
3. Escolhe o tipo: **Pedido** (compra), **Condicional** (reserva as peças na hora, como o da loja) ou **Venda na loja**.
4. **Só salvar**: cria o pedido com `origem = vendedor`, status `pendente`, e abre o detalhe.
5. **Salvar e enviar ao cliente**: além de salvar, gera a imagem "Seleção para você":
   - no celular, abre o compartilhamento do sistema com imagem e texto (escolha o contato no WhatsApp);
   - no computador, baixa a imagem e abre o WhatsApp Web com o texto (anexe a imagem baixada).
6. O cliente responde no WhatsApp; o vendedor confirma ou cancela como no fluxo 1. Frete: sempre a combinar.

**Venda na loja** (`origem = balcao`, D-14): a peça foi vendida no balcão. **Registrar venda** cria o pedido de compra e o confirma na mesma hora: o estoque baixa, o custo é gravado e a venda entra na meta. Não exige WhatsApp válido do cliente.

Quando o gestor monta a seleção, o pedido fica com o vendedor do cliente.

## 4. Convite e cadastro de cliente

```
Painel → "Seu link de convite" → Copiar / Enviar no WhatsApp
        │   /cadastro?v=<id do vendedor>
Cliente abre o link → "Convite de Ana"
        │
Nome, WhatsApp, endereço, cidade, e-mail, senha
        │
cadastrarCliente()                                        acoes/conta.ts
  · e-mail único
  · vendedor: do convite → escolhido → padrão da loja → primeiro ativo
  · cria a conta (papel cliente)
  · mesmo WhatsApp de uma ficha sem acesso? cria ficha nova com o mesmo vendedor, sem ligar à antiga (RN-19)
  · entra logado → loja
```

Sem convite, com mais de um vendedor ativo, o formulário pergunta "Quem te atende na D'Cerutti?".

O vendedor também pode dar acesso pela ficha do cliente: preenchendo e-mail e senha, a conta é criada na hora.

## 5. Venda manual (só o valor)

Para quando não há peças a registrar (a venda com peças é a **Venda na loja** do fluxo 3). Ficha do cliente → **Registrar venda na loja**: valor, data (não pode ser futura) e observação. A venda conta para a meta e o faturamento, sem itens e sem custo (RN-11). Uma venda lançada por engano pode ser excluída em *Vendas* (só as manuais; as de pedidos, não).

## 6. Estoque (gestor)

*Produtos → Editar*:
- **Entrada (somar)**: chegou mercadoria.
- **Ajuste (quantidade contada)**: define o número exato, depois de uma contagem. Não pode ficar abaixo do reservado.
- **Adicionar tamanho**: novo tamanho com código interno, EAN e estoque inicial.
- Toda mudança fica no **Histórico de estoque**, com quem fez e quando. As vendas entram automaticamente.

## 7. Login e redirecionamento

| Papel | Após entrar | Pode acessar |
|---|---|---|
| Cliente | Loja (`/`) | Loja e `/minha-conta` |
| Vendedor | `/painel` | Loja (sem enviar pedidos) e painel, sem as áreas do gestor |
| Gestor | `/painel` | Tudo |

- Sem sessão, `/painel` e `/minha-conta` levam a `/entrar?volta=...`, e depois do login a pessoa volta para onde estava.
- Enquanto o catálogo for privado, as páginas da loja também levam a `/entrar`.
- Usuário desativado não consegue entrar, e as sessões dele são apagadas na desativação.
- Cliente sem aceite da política de privacidade é levada a `/privacidade` antes de usar a loja (Minha conta continua liberada).

## 8. Prazo vencido dos pendentes (D-14, revisto em D-17)

Pedido ou condicional `pendente` criado há mais que `diasExpiracao` (Configurações, "Prazo de resposta", padrão 7; 0 = sem prazo) **não é cancelado sozinho**. Nos últimos 2 dias a lista mostra "Prazo vence em N dias"; depois, a etiqueta **Prazo vencido** e, no pedido, um aviso. A equipe confirma normalmente ou usa **Cancelar pedido**: o popup já traz o motivo "Prazo vencido sem resposta" (motivo `expirado`, com o autor), e só então a reserva do condicional volta ao estoque.

## 8a. Desfazer uma venda (D-17)

Pedido **confirmado** pode ser cancelado pela equipe (o vendedor dos dele, o gestor de todos), com motivo obrigatório, em **Desfazer a venda › Cancelar venda**: as peças vendidas voltam ao estoque (movimento `estorno`), a venda é apagada (sai das metas e dos relatórios), o uso do cupom é liberado e o cupom de próxima compra gerado por ela, se ainda não usado, é desativado. A cliente não desfaz venda.

## 9. Recuperação de senha

```
/entrar → "Esqueci a senha" → e-mail
pedirRedefinicao()                         acoes/conta.ts
  · resposta sempre igual (não revela se o e-mail tem conta)
  · limite: 3 por e-mail e 10 por IP por hora
  · Better Auth grava o link em `verification` (uso único, 1 hora) → e-mail por SMTP
link → /redefinir-senha?token=… → senha nova (mínimo 8) e confirmação
redefinirSenha() → troca a senha, encerra todas as sessões → /entrar?redefinida=1
```

Sem `SMTP_URL`, o e-mail vai para o log do servidor (ambiente de teste). Na produção, depende do L-04.

## 10. Dados da cliente (LGPD)

- **Corrigir dados**: Minha conta → Meus dados (nome, WhatsApp, endereço, cidade, CEP). O e-mail de acesso só muda pela equipe.
- **Excluir a conta**: Minha conta → Excluir minha conta. Com pedido pendente, é recusado (o vendedor fecha ou cancela antes). Senão, em transação: a conta e as sessões são apagadas, a ficha vira "Cliente removido" sem contato, e os pedidos ficam sem nome, telefone e CEP. Os valores continuam nos relatórios, sem identificar a pessoa.
