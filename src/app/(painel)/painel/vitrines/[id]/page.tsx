import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormVitrine } from '@/components/painel/form-vitrine';
import { BotaoCopiar, VitrinePecas } from '@/components/painel/vitrine-pecas';
import { Alerta, CabecalhoPagina, Cartao, Etiqueta, Kpi } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { legendaSugerida, proximosStatus, STATUS_VITRINE, TIPOS_VITRINE, vitrineAtiva, type StatusVitrine, type TipoVitrine } from '@/lib/vitrines';
import { duplicar, mudarStatus } from '@/server/acoes/vitrines';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { resultadoDaVitrine, vitrineParaEdicao, vitrinesLigadas } from '@/server/consultas/vitrines';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';

export const metadata = { title: 'Vitrine' };

const ACAO: Partial<Record<StatusVitrine, string>> = { agendada: 'Agendar live', no_ar: 'Iniciar live', publicada: 'Publicar', encerrada: 'Encerrar', arquivada: 'Arquivar', rascunho: 'Voltar para rascunho' };
const CONFIRMAR: Partial<Record<StatusVitrine, string>> = {
  encerrada: 'Encerrar esta vitrine? A página continua no ar, sem preço especial e sem o pedido pela página.',
  arquivada: 'Arquivar? A página sai do ar, e quem abrir o link verá que não existe.',
};

export default async function Vitrine({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await vitrinesLigadas())) notFound();
  const id = (await params).id;
  const [v, r] = await Promise.all([vitrineParaEdicao(u, id), resultadoDaVitrine(u, id)]);
  if (!v || !r) notFound();
  const [site, vendedoras] = await Promise.all([urlDoSite(), u.papel === 'gestor' ? vendedoresAtivos() : undefined]);
  const tipo = v.tipo as TipoVitrine;
  const endereco = `${site}/vitrine/${v.slug}`;
  const legenda = v.legenda ?? legendaSugerida({ tipo, titulo: v.titulo, dominio: site.replace(/^https?:\/\//, '') });

  return (
    <>
      <Link href="/painel/vitrines" className="rotulo text-suave hover:text-marrom-950">← Vitrines</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={TIPOS_VITRINE[tipo]} titulo={v.titulo} acoes={<>
        {proximosStatus(tipo, v.status as StatusVitrine).map(s => (
          <BotaoAcao key={s} acao={mudarStatus.bind(null, v.id, s)} confirmar={CONFIRMAR[s]} className={botao(s === 'publicada' || s === 'agendada' || s === 'no_ar' ? 'oliva' : 'secundario')}>{ACAO[s]}</BotaoAcao>
        ))}
        <BotaoAcao acao={duplicar.bind(null, v.id)} className={botao('fantasma')}>Duplicar</BotaoAcao>
      </>}>
        <Etiqueta cor={vitrineAtiva(v.status) ? 'oliva' : 'cinza'}>{STATUS_VITRINE[v.status as StatusVitrine]}</Etiqueta>
        <div className="text-sm mt-1">Pedidos vão para {v.responsavel.name}{v.inicioPrevisto ? ` · ${formatarDataHora(v.inicioPrevisto)}` : ''}</div>
      </CabecalhoPagina>

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          {v.avisos.length > 0 && (
            <Alerta tipo="aviso">
              <strong>Para conferir:</strong>
              <ul className="list-disc pl-5 mt-1">{v.avisos.map(a => <li key={a}>{a}</li>)}</ul>
            </Alerta>
          )}
          <Cartao className="p-5">
            <h2 className="titulo text-lg mb-3">Peças</h2>
            <VitrinePecas id={v.id} pecas={v.pecas} />
          </Cartao>
          <Cartao className="p-5">
            <h2 className="titulo text-lg mb-3">Dados</h2>
            <FormVitrine vitrine={{ ...v }} vendedoras={vendedoras} legendaSugerida={legenda} />
          </Cartao>
        </div>

        <div className="grid gap-6">
          <Cartao className="p-5 grid gap-3">
            <h2 className="titulo text-lg">Divulgar</h2>
            <p className="text-sm break-all text-suave">{endereco}</p>
            <div className="flex flex-wrap gap-2">
              <BotaoCopiar texto={endereco} rotulo="Copiar endereço" />
              <BotaoCopiar texto={legenda} rotulo="Copiar legenda" />
              <a href={`/vitrine/${v.slug}`} target="_blank" rel="noopener" className={botao('secundario', 'p')}>Ver a página</a>
            </div>
            <p className="text-xs text-suave">Links em legendas e comentários não abrem no Instagram. Use a bio, o story ou o Direct.</p>
          </Cartao>
          <section className="grid grid-cols-2 gap-3" aria-label="Resultado">
            <Kpi rotulo="Visitas" valor={r.visitas} />
            <Kpi rotulo="Atendimentos" valor={r.atendimentos} />
            <Kpi rotulo="Vendido" valor={brl(r.valorVendido)} detalhe={`${r.vendas} ${r.vendas === 1 ? 'venda' : 'vendas'}`} />
            <Kpi rotulo="Em aberto" valor={brl(r.valorAberto)} detalhe={`${r.pedidos} ${r.pedidos === 1 ? 'pedido' : 'pedidos'}`} />
          </section>
          <Cartao className="p-5 grid gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="titulo text-lg">Por peça</h2>
              <span className="text-sm text-suave">Conversão: {r.conversao}%</span>
            </div>
            {r.pecas.length === 0 ? <p className="text-sm text-suave">Sem peças.</p> : (
              <ul className="grid gap-1 text-sm">
                {r.pecas.map(p => <li key={p.produtoId} className="flex justify-between gap-3"><span className="min-w-0 truncate">{p.nome}</span><span className="text-suave whitespace-nowrap">{p.pedidas} pedidas · {p.vendidas} vendidas</span></li>)}
              </ul>
            )}
            {r.atendimentos > 0 && <Link href={`/painel/atendimento/lista?vitrine=${v.id}`} className="text-sm underline underline-offset-4 mt-1">Ver os atendimentos</Link>}
          </Cartao>
        </div>
      </div>
    </>
  );
}
