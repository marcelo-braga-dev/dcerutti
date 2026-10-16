# 22 · Caixa da loja física

Planejamento e implementação de 16/10/2026 · Marcelo · situação: **concluído** — fases 1 e 2 prontas em 16/10/2026 (D-23)

Tela para vendedores e gestores registrarem as vendas feitas pessoalmente na loja. Fica aberta no balcão, num computador ou tablet: cada pessoa entra com a própria conta. Endereço: **`/caixa`** (no painel, menu **Vendas → Caixa da loja**).

Decisões com a loja (16/10/2026): **sem impressora** (comprovante pelo WhatsApp), **sem leitor de código de barras** (a busca aceita digitar o código da etiqueta), **cada um com a sua conta** (o gestor escolhe o "vendido por"), desconto de até **10%** sem o gestor e crédito em até **6x** (os dois ajustáveis em Configurações).

## A tela

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ D'Cerutti · CAIXA   Ana · vendedora        Hoje R$ 2.340 · 11 vendas   14:32  [Vendas do dia] [Tela cheia] │
├──────────────────────────────────────────────┬────────────────────────────────┤
│ 🔍 Código da etiqueta, nome, referência… (F2) │ VENDA ATUAL                     │
│ [Fem.|Masc.|Unissex] [Categoria ▾] [Tamanho ▾]│ peças, quantidade, desconto ✎   │
│ [Mais filtros ▾]  (cor, preço, promoção…)     │ Cliente: buscar · cadastrar ·   │
│ filtros escolhidos: [Camisetas ×] [M ×]       │          ou consumidor final    │
├──────────────────────────────────────────────┤ Vendido por (gestor)            │
│ card por modelo: uma linha por cor,          │ Desconto na venda (% ou R$)     │
│ tocar no tamanho da cor põe na venda         │ Cupom                           │
│ (sem busca nem filtro: área vazia, com a     │ TOTAL               R$ 189,97   │
│  dica de digitar o código da etiqueta)       │ [ COBRAR R$ 189,97 · F4 ]       │
└──────────────────────────────────────────────┴────────────────────────────────┘
```

- **Tela limpa ao abrir:** sem busca nem filtro, a área de produtos fica vazia, só com a dica "Digite o código da etiqueta e aperte Enter". As peças aparecem assim que se digita algo ou se escolhe um filtro (com estoque e foto primeiro, depois as mais vendidas nos últimos 90 dias).
- **Busca:** nome, referência, cor, categoria ou marca, sem acento. **Código da etiqueta** (código interno de 5 dígitos ou EAN) + Enter põe a peça direto na venda, no tamanho certo; peça com um só tamanho disponível também entra com Enter.
- **Filtros** (contagens respeitam os outros filtros), sem nada para arrastar de lado:
  - à vista: gênero, categoria e tamanho (UN = UNI), estes dois em listas;
  - em **Mais filtros** (painel suspenso): cor por família ("Azul Marinho" conta como Azul), faixa de preço, só promoção e incluir esgotadas (por padrão só aparece o que tem estoque);
  - os filtros escolhidos aparecem como etiquetas com × para tirar, e "Limpar tudo".
- **Cards:** **um por modelo**, com **uma linha por cor** e os tamanhos daquela cor ao lado, como a grade da arara: um toque escolhe cor e tamanho juntos, sem nada escondido. Miniatura (mostra a cor sob o mouse), nome do modelo e preço (por linha, se as cores tiverem preços diferentes). O número miúdo no tamanho é quanto resta, já descontando o que está na venda; o código da etiqueta e o estoque aparecem ao passar o mouse. Duas referências com a mesma cor e o mesmo preço (o catálogo tem algumas, como duas "Cinza") viram uma linha só, com o estoque somado; a peça sai da referência com mais unidades livres. Lista em 1 coluna no celular, 2 no computador, 3 em tela larga.
- **Venda atual:**
  - quantidade com − e +, sem passar do estoque;
  - **desconto por peça**: digita-se a % (o preço é calculado) ou o novo preço (a % é mostrada);
  - **desconto geral** (% ou R$);
  - **cliente:** buscar por nome ou final do WhatsApp, **cadastro rápido** com nome, WhatsApp e CPF (opcional; a busca também aceita o CPF), ou sem identificar (vai para a ficha "Consumidor final");
  - **cupom**, com os cupons ligados e o vendedor liberado;
  - **"vendido por"**: só o gestor escolhe.
- A venda em andamento fica guardada no navegador de quem está logado: recarregar a página não perde nada.
- **Cobrar** (F4):
  - Pix, Débito, Crédito (parcelas, com o valor de cada uma) e Dinheiro (valor recebido, atalhos e **troco**);
  - tocar numa forma lança o que falta; dá para **dividir** em até 4 formas;
  - confirma só quando a soma bate com o total, e o botão diz o que falta acertar.
- **Venda registrada:** troco em destaque, **comprovante pelo WhatsApp** (o número da cliente vem preenchido; sem cliente, digita-se), copiar o comprovante e **Nova venda**.
- **Celular:** a venda vira uma barra com o total no rodapé, que abre em tela cheia.
- **Atalhos:** F2 busca · F4 cobrar · Enter adiciona pelo código · Esc limpa a busca (ou fecha o cobrar) · Ctrl+Enter confirma no cobrar.

## Vendas do dia e fechamento (`/caixa/vendas`)

- Dia (anterior e próximo), total vendido, vendas, peças e ticket médio.
- **Por forma de pagamento**, com o troco dado no dinheiro, para conferir a gaveta e as maquininhas.
- **Por vendedora.**
- **Fechamento** em texto, com **"Enviar o fechamento no WhatsApp"**.
- Lista das vendas, com horário, cliente, peças e pagamentos. As **desfeitas** aparecem apagadas. "Ver ou desfazer no painel" leva ao pedido, onde fica o **Desfazer a venda** (D-17), que devolve as peças ao estoque.
- O vendedor vê as próprias vendas; o gestor, todas.

## Como funciona por trás

| Peça | O que faz |
|---|---|
| `src/lib/caixa.ts` | Lógica pura, usada pela tela e pelo servidor: preço de cada peça com os descontos (o geral vira percentual por unidade, arredondado ao centavo; o total é a soma desses preços), limite de desconto, conferência dos pagamentos (falta, sobra, troco), comprovante, busca e filtros |
| `src/server/consultas/caixa.ts` | Catálogo do caixa (com EAN e vendidos em 90 dias), resumo de hoje e as vendas do dia com os totais |
| `src/server/acoes/caixa.ts` | Buscar e cadastrar cliente, prévia do cupom e **registrar a venda** |
| `src/components/caixa/` | Tela: `caixa.tsx`, `produtos.tsx` (filtros e cards), `cobrar.tsx` (cobrar e venda concluída) |
| `src/app/(caixa)/caixa` | Rotas `/caixa` e `/caixa/vendas`, fora do layout do painel; só a equipe |

**Registrar a venda:**
1. Confere de novo os preços do banco, o limite de desconto (vendedor até `caixa.descontoMaxVendedor`%, gestor sem limite), as parcelas (até `caixa.parcelasMax`), o cupom (regras da fase 3) e a cliente (a que o usuário pode atender, ou "Consumidor final").
2. Cria o pedido de compra com **origem `balcao`** e os **preços combinados** em `precoUnitario` (o preço de catálogo fica em `precoTabela`), e aplica o cupom.
3. Confere os pagamentos contra o total gravado. Se não fecharem, o pedido é cancelado e nada baixa do estoque.
4. **Confirma o pedido**: baixa o estoque com bloqueio contra venda dupla, grava o custo, cria a venda na meta de quem vendeu e registra o histórico. Se a confirmação falhar, o pedido é cancelado.
5. Grava os **pagamentos** (tabela `pagamento`) e a observação na venda ("Caixa da loja", se não houver outra).

**Ficha "Consumidor final":**
- é criada no primeiro uso, com telefone vazio, e por isso fica fora das listas de clientes;
- é atendida pelo primeiro vendedor ativo, mas a venda conta para quem vendeu;
- não ganha cupom de próxima compra.

O catálogo vai inteiro para o navegador (algumas centenas de peças), então busca e filtros respondem na hora, sem ida ao servidor a cada tecla. Depois de cada venda a página se atualiza (estoque e total de hoje).

## Configurações

| Campo | Padrão | Efeito |
|---|---|---|
| Caixa: desconto máximo do vendedor (%) | 10 | Acima disso, só o gestor registra |
| Caixa: crédito em até (vezes) | 6 | Opções de parcelas no cobrar |

## Próximos passos (fase 3, opcional)

- Comprovante impresso, quando houver impressora térmica (layout de 80 mm pelo navegador).
- Leitor de código de barras: já funciona sem mudança, porque o leitor "modo teclado" digita o EAN e manda Enter.
- Troca e devolução com crédito para a cliente.
- Aprovação de desconto acima do limite pelo gestor na hora (PIN).
- Conferência de estoque bipando as peças.
