import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { CANAIS, type Canal } from '@/lib/atendimento';
import { tempoLegivel } from '@/lib/pos-venda';
import { TOM } from '@/lib/marca';
import { atendimentoLigado, visaoDaEquipe } from '@/server/consultas/atendimento';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Visão da equipe' };

/** Só a gestão (D-30): o que está aberto com cada pessoa e o que está sem responsável. */
export default async function VisaoDaEquipe() {
  const u = await exigirPapel(['gestor']);
  if (!(await atendimentoLigado())) notFound();
  const { linhas, semResponsavel } = await visaoDaEquipe(u);
  return (
    <>
      <CabecalhoPagina sobre="Atendimento" titulo="Visão da equipe">O que está em andamento com cada pessoa. Lembre que o painel só conta o que foi registrado.</CabecalhoPagina>
      <div className="grid gap-6">
        {semResponsavel.length > 0 && (
          <Cartao className="p-5">
            <h2 className="titulo text-lg mb-3">Sem responsável ({semResponsavel.length})</h2>
            <ul className="grid gap-2">
              {semResponsavel.map(a => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>{a.nome} <span className="text-suave">· {a.codigo} · {CANAIS[a.canal as Canal]}</span></span>
                  <Link href={`/painel/atendimento/${a.id}`} className={botao('secundario', 'p')}>Passar para alguém</Link>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
        {linhas.length === 0 ? <Vazio>Nenhum vendedor ativo.</Vazio> : (
          <Cartao className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-suave">
                <tr className="border-b border-borda">
                  <th scope="col" className="p-3 font-normal">Pessoa</th>
                  <th scope="col" className="p-3 font-normal">Número</th>
                  <th scope="col" className="p-3 font-normal text-right">Abertos</th>
                  <th scope="col" className="p-3 font-normal text-right">Novos</th>
                  <th scope="col" className="p-3 font-normal text-right">Para hoje</th>
                  <th scope="col" className="p-3 font-normal text-right">Atrasados</th>
                  <th scope="col" className="p-3 font-normal text-right">Conversão, 30 dias</th>
                  <th scope="col" className="p-3 font-normal text-right">1º contato, 30 dias</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="border-b border-borda last:border-0">
                    <th scope="row" className="p-3 text-left font-semibold"><Link href={`/painel/atendimento/lista?vendedor=${l.id}`} className="hover:underline">{l.nome}</Link></th>
                    <td className="p-3" style={{ color: l.numero ? undefined : TOM.ruim }}>{l.numero ?? 'Sem número'}</td>
                    <td className="p-3 text-right">{l.abertos}</td>
                    <td className="p-3 text-right">{l.novos}</td>
                    <td className="p-3 text-right">{l.hoje}</td>
                    <td className="p-3 text-right font-semibold" style={{ color: l.vencidos ? TOM.ruim : undefined }}>{l.vencidos}</td>
                    <td className="p-3 text-right">{l.conversao == null ? '—' : `${l.conversao}%`}</td>
                    <td className="p-3 text-right">{tempoLegivel(l.minutosPrimeiroContato)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        )}
      </div>
    </>
  );
}
