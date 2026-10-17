import Link from 'next/link';
import { Etiqueta, Vazio } from '@/components/ui/basicos';
import { formatarData } from '@/lib/datas';
import { aberta, SITUACOES, situacaoDe } from '@/lib/sugestoes';
import { chaveDaSugestao } from '@/server/link-pedido';
import { exigirPapel } from '@/server/permissoes';
import { sugestoesDaCliente } from '@/server/sugestoes';

export const metadata = { title: 'Sugestões para você' };

/** As sugestões que quem atende separou para a cliente (D-27); cada uma abre a página de escolher. */
export default async function MinhasSugestoes() {
  const u = await exigirPapel(['cliente']);
  const lista = (await sugestoesDaCliente(u.id)).map(s => ({ ...s, situacao: situacaoDe(s) }));
  return (
    <>
      <div className="mb-6">
        <h2 className="titulo text-xl">Sugestões para você</h2>
        <p className="mt-1 text-sm text-suave">Peças que separaram pensando em você. Abra, marque o que gostou e escolha o tamanho.</p>
      </div>
      {lista.length === 0 ? <Vazio>Nenhuma sugestão ainda.</Vazio> : (
        <ul className="grid gap-3">
          {lista.map(s => (
            <li key={s.id}>
              <Link href={`/s/${chaveDaSugestao(s.codigo)}`} className="bg-card border border-borda p-4 flex flex-wrap items-center justify-between gap-3 hover:border-marrom-950">
                <div className="min-w-0">
                  <div className="font-semibold text-marrom-950">{s.titulo}</div>
                  <div className="text-sm text-suave">{s.vendedor.name.split(' ')[0]} · {s.itens.length} {s.itens.length === 1 ? 'peça' : 'peças'} · {formatarData(s.criadaEm)}{aberta(s.situacao) ? ` · até ${formatarData(s.validaAte)}` : ''}</div>
                </div>
                <Etiqueta cor={aberta(s.situacao) ? 'caramelo' : SITUACOES[s.situacao].cor}>{aberta(s.situacao) ? 'Escolher' : SITUACOES[s.situacao].rotulo}</Etiqueta>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
