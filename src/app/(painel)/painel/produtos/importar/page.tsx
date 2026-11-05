import { CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { ImportadorEstoque } from '@/components/painel/importador-estoque';
import { formatarDataHora } from '@/lib/datas';
import { COLUNAS } from '@/lib/planilha-estoque';
import { historicoImportacoes, type ResumoImportacao } from '@/server/importacao-estoque';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Importar estoque' };

/** Importação da planilha de estoque do sistema da loja (docs/25): envio, prévia, marcas por fornecedor e histórico. */
export default async function ImportarEstoque() {
  await exigirPapel(['gestor']);
  const historico = await historicoImportacoes();
  return (
    <>
      <CabecalhoPagina sobre="Catálogo e estoque" titulo="Importar estoque" acoes={<BotaoLink href="/painel/produtos" variante="secundario">Ver produtos</BotaoLink>}>
        Envie a planilha de estoque do sistema da loja. Ela é a verdade do catálogo: estoque, preços, peças novas e o que saiu.
      </CabecalhoPagina>
      <ImportadorEstoque />
      <div className="grid lg:grid-cols-2 gap-6 mt-10">
        <Cartao className="p-6">
          <h2 className="titulo text-xl mb-3">Como funciona</h2>
          <ul className="grid gap-2 text-sm text-marrom-900 list-disc pl-5">
            <li><strong>Estoque</strong> de cada tamanho = Estoq. − Cond. − Res. EC. Tamanho que não está na planilha fica com estoque 0.</li>
            <li><strong>Preço</strong> cheio = Preço Venda. Uma promoção do site continua enquanto for menor que o preço novo.</li>
            <li><strong>Peça nova</strong> vira produto (agrupado por fornecedor, referência e cor) ou um tamanho novo de um produto existente. Nome, categoria e gênero são sugeridos pela descrição; depois de criados, o que você editar no produto fica.</li>
            <li><strong>Produto que sumiu</strong> da planilha é desativado; volta a ficar ativo quando reaparecer.</li>
            <li>Nada é gravado até você conferir a prévia e clicar em <strong>Importar agora</strong>.</li>
          </ul>
          <p className="mt-4 text-xs text-suave">Colunas esperadas: {COLUNAS.join(' · ')}.</p>
        </Cartao>
        <Cartao className="p-6">
          <h2 className="titulo text-xl mb-3">Últimas importações</h2>
          {historico.length === 0 ? <p className="text-sm text-suave">Nenhuma importação ainda.</p> : (
            <ul className="divide-y divide-borda text-sm">
              {historico.map(h => {
                const r = h.resumo as unknown as ResumoImportacao;
                return (
                  <li key={h.id} className="py-3 flex flex-wrap justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-marrom-950 truncate">{h.nomeOriginal}</div>
                      <div className="text-xs text-suave">{formatarDataHora(h.criadoEm)}{h.usuario ? ` · ${h.usuario.name}` : ' · linha de comando'}</div>
                    </div>
                    <div className="text-xs text-suave text-right">
                      {r.contagens.produtosNovos} novos · {r.contagens.estoqueAlterado} estoques · {r.contagens.precosAlterados} preços
                      <div>{r.totais.pecasSiteAntes.toLocaleString('pt-BR')} → {r.totais.pecasSiteDepois.toLocaleString('pt-BR')} peças no site</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
