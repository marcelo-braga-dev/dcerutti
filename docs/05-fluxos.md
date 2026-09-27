# 05 · Fluxos

Como cada fluxo funciona de ponta a ponta, com os arquivos envolvidos. Os fluxos 1 a 4 são cobertos pelos testes em `tests/e2e/fluxos.spec.ts`.

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
  │                                    · pedido + itens, status pendente
  │ ◄──────────── { codigo, url wa.me, itens }
  │ aponta a aba para o wa.me ─────────────────────────────────────► conversa com o vendedor
  │ limpa a sacola, mostra "Pedido enviado para Ana"
  │ gera a imagem do pedido (canvas) → "Enviar também a imagem"
```

**Pontos-chave**
- O pedido é **gravado antes** de abrir o WhatsApp (D-07): aparece no painel mesmo que o cliente não toque em "enviar".
- O WhatsApp de destino é o do vendedor do cliente. Se o vendedor estiver inativo ou com número incompleto, é o da loja (RN-03).
- Os preços da mensagem e do pedido vêm do banco. A sacola mostra o preço do momento em que a peça foi adicionada. Se o preço mudar nesse meio-tempo, a sacola não avisa: o valor certo aparece na mensagem e na imagem (limitação conhecida).
- Se alguma peça acabou, o envio é recusado com a lista do que falta.
- Compra **não reserva** estoque: o estoque só baixa na confirmação.
- Mensagem: por item, nome, marca, referência, tamanho, cor, código interno, quantidade × preço e link da foto grande; no fim, total de peças, total, frete ("grátis" ou o valor configurado) e o nome.

**No painel**
1. O pedido aparece em *Pedidos → Pendentes*, e o número de pendentes aparece no menu.
2. O vendedor combina pagamento e entrega pelo WhatsApp (botão "WhatsApp do cliente").
3. **Confirmar venda**: em transação, o status passa a `confirmado`, o estoque baixa (`movimento_estoque` com motivo `venda`), o custo atual é gravado em cada item e a `venda` é criada. Se faltar estoque, a confirmação é recusada.
4. **Cancelar pedido**: o status passa a `cancelado`. O estoque não muda.

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
2. Na volta, abre o condicional e marca cada peça: **Ficou** ou **Voltou** (há atalhos "Ficou tudo" e "Voltou tudo"). O botão de fechar só é liberado com tudo marcado e já mostra o valor da venda.
3. **Fechar condicional**, em transação:
   - peças que ficaram: `estoque −= q`, `reservado −= q`, custo gravado;
   - peças que voltaram: `reservado −= q`;
   - `venda` criada só com o valor das peças que ficaram (se nenhuma ficou, não há venda);
   - status `confirmado`.
4. **Cancelar**: libera toda a reserva.

## 3. Seleção montada pelo vendedor

1. *Pedidos → + Novo pedido*, ou *Montar pedido* na lista ou na ficha do cliente (o cliente já vem escolhido).
2. Escolhe o cliente (o vendedor vê só os seus); busca por nome, referência, categoria ou cor; clica no tamanho para adicionar (só aparecem tamanhos com estoque disponível).
3. **Só salvar**: cria o pedido com `origem = vendedor`, status `pendente`, e abre o detalhe.
4. **Salvar e enviar ao cliente**: além de salvar, gera a imagem "Seleção para você":
   - no celular, abre o compartilhamento do sistema com imagem e texto (escolha o contato no WhatsApp);
   - no computador, baixa a imagem e abre o WhatsApp Web com o texto (anexe a imagem baixada).
5. O cliente responde no WhatsApp; o vendedor confirma ou cancela como no fluxo 1.

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
  · mesmo WhatsApp de uma ficha sem acesso? liga a ela (RN-19); senão cria a ficha
  · entra logado → loja
```

Sem convite, com mais de um vendedor ativo, o formulário pergunta "Quem te atende na D'Cerutti?".

O vendedor também pode dar acesso pela ficha do cliente: preenchendo e-mail e senha, a conta é criada na hora.

## 5. Venda manual

Ficha do cliente → **Registrar venda na loja**: valor, data e observação. A venda conta para a meta e o faturamento, sem itens e sem custo (RN-11). Uma venda lançada por engano pode ser excluída em *Vendas* (só as manuais; as de pedidos, não).

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
