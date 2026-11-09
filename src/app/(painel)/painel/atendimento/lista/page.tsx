import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { CANAIS, ETAPAS, ehCanal, ehEtapa, MOTIVOS_PERDA, type Canal, type Etapa } from '@/lib/atendimento';
import { formatarData } from '@/lib/datas';
import { atendimentoLigado, ATENDIMENTOS_POR_PAGINA, listarAtendimentos } from '@/server/consultas/atendimento';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Atendimentos' };

type Busca = { vitrine?: string; etapa?: string; canal?: string; vendedor?: string; q?: string; pagina?: string };

export default async function Atendimentos({ searchParams }: { searchParams: Promise<Busca> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await atendimentoLigado())) notFound();
  const sp = await searchParams;
  const etapa = ehEtapa(sp.etapa) ? sp.etapa : null;
  const canal = ehCanal(sp.canal) ? sp.canal : null;
  const q = String(sp.q ?? '').slice(0, 80);
  const vendedor = u.papel === 'gestor' ? (sp.vendedor ?? null) : null;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const [{ lista, total, contagem }, vendedoras] = await Promise.all([listarAtendimentos(u, { vitrine: sp.vitrine ?? null, etapa, canal, vendedor, q, pagina }), u.papel === 'gestor' ? vendedoresAtivos() : []]);
  const url = (m: Partial<Busca>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ vitrine: sp.vitrine, etapa, canal, vendedor, q, ...m })) if (v) p.set(k, String(v));
    const t = p.toString();
    return `/painel/atendimento/lista${t ? `?${t}` : ''}`;
  };
  const totalGeral = [...contagem.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <CabecalhoPagina sobre="Atendimento" titulo="Atendimentos" acoes={<BotaoLink href="/painel/atendimento/novo">+ Novo atendimento</BotaoLink>} />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar por etapa">
        <Link href={url({ etapa: undefined, pagina: undefined })} className={botao(etapa ? 'secundario' : 'primario', 'p')}>Todos ({totalGeral})</Link>
        {(Object.keys(ETAPAS) as Etapa[]).map(e => <Link key={e} href={url({ etapa: e, pagina: undefined })} className={botao(etapa === e ? 'primario' : 'secundario', 'p')}>{ETAPAS[e]} ({contagem.get(e) ?? 0})</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 mb-6">
        {etapa && <input type="hidden" name="etapa" value={etapa} />}
        {sp.vitrine && <input type="hidden" name="vitrine" value={sp.vitrine} />}
        <input name="q" defaultValue={q} placeholder="Nome, WhatsApp, @ ou código" aria-label="Buscar" className={`${classeCampo} flex-1 min-w-48`} />
        <select name="canal" defaultValue={canal ?? ''} aria-label="Canal" className={`${classeCampo} w-auto`}>
          <option value="">Todos os canais</option>
          {(Object.keys(CANAIS) as Canal[]).map(c => <option key={c} value={c}>{CANAIS[c]}</option>)}
        </select>
        {u.papel === 'gestor' && (
          <select name="vendedor" defaultValue={vendedor ?? ''} aria-label="Quem atende" className={`${classeCampo} w-auto`}>
            <option value="">Toda a equipe</option>
            <option value="nenhum">Sem responsável</option>
            {vendedoras.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <button className={botao('secundario')}>Filtrar</button>
      </form>
      {lista.length === 0 ? <Vazio>Nenhum atendimento encontrado.</Vazio> : (
        <ul className="grid gap-3">
          {lista.map(a => (
            <li key={a.id}>
              <Cartao className={`p-4 flex flex-wrap items-center justify-between gap-3 ${a.fechadoEm ? 'opacity-70' : ''}`}>
                <div className="min-w-0">
                  <Link href={`/painel/atendimento/${a.id}`} className="font-semibold text-marrom-950 hover:underline">{a.nome}</Link>{' '}
                  <Etiqueta>{ETAPAS[a.etapa as Etapa]}</Etiqueta>{' '}
                  <Etiqueta cor="contorno">{CANAIS[a.canal as Canal]}</Etiqueta>
                  <div className="text-sm text-suave">
                    {a.codigo}{a.instagram ? ` · @${a.instagram}` : ''}{u.papel === 'gestor' ? ` · ${a.responsavel?.name ?? 'Sem responsável'}` : ''}
                    {a.proximoContatoEm ? ` · retorno em ${formatarData(a.proximoContatoEm)}` : ''}{a.motivoPerda ? ` · ${MOTIVOS_PERDA[a.motivoPerda] ?? a.motivoPerda}` : ''}
                  </div>
                </div>
                <Link href={`/painel/atendimento/${a.id}`} className={botao('secundario', 'p')}>Abrir</Link>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
      {lista.length < total && <div className="mt-4 text-center"><Link href={url({ pagina: String(Math.ceil(lista.length / ATENDIMENTOS_POR_PAGINA) + 1) })} scroll={false} className={botao('secundario')}>Carregar mais</Link></div>}
    </>
  );
}
