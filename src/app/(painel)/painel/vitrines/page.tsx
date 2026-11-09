import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BotaoCopiar } from '@/components/painel/vitrine-pecas';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { formatarDataHora } from '@/lib/datas';
import { ehStatusVitrine, STATUS_VITRINE, TIPOS_VITRINE, vitrineAtiva, type StatusVitrine } from '@/lib/vitrines';
import { listarVitrines, vitrinesLigadas } from '@/server/consultas/vitrines';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';

export const metadata = { title: 'Vitrines' };

export default async function Vitrines({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await vitrinesLigadas())) notFound();
  const sp = await searchParams;
  const status = ehStatusVitrine(sp.status) ? sp.status : null;
  const [lista, site] = await Promise.all([listarVitrines(u, { status }), urlDoSite()]);
  const gestor = u.papel === 'gestor';
  return (
    <>
      <CabecalhoPagina sobre="Vendas" titulo="Vitrines" acoes={<>
        <BotaoCopiar texto={`${site}/vitrines`} rotulo="Copiar link da bio" />
        <BotaoLink href="/painel/vitrines/nova">+ Nova vitrine</BotaoLink>
      </>}>
        Peças de lives e publicações do Instagram, em uma página aberta. Coloque <strong>{site.replace(/^https?:\/\//, '')}/vitrines</strong> na bio.
      </CabecalhoPagina>
      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filtrar por situação">
        <Link href="/painel/vitrines" className={botao(status ? 'secundario' : 'primario', 'p')}>Em uso</Link>
        {(Object.keys(STATUS_VITRINE) as StatusVitrine[]).map(s => <Link key={s} href={`/painel/vitrines?status=${s}`} className={botao(status === s ? 'primario' : 'secundario', 'p')}>{STATUS_VITRINE[s]}</Link>)}
      </div>
      {lista.length === 0 ? <Vazio>Nenhuma vitrine aqui ainda.</Vazio> : (
        <ul className="grid gap-3">
          {lista.map(v => (
            <li key={v.id}>
              <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/painel/vitrines/${v.id}`} className="font-semibold text-marrom-950 hover:underline">{v.titulo}</Link>{' '}
                  <Etiqueta cor={vitrineAtiva(v.status) ? 'oliva' : 'cinza'}>{STATUS_VITRINE[v.status]}</Etiqueta>{' '}
                  <Etiqueta cor="contorno">{TIPOS_VITRINE[v.tipo]}</Etiqueta>
                  <div className="text-sm text-suave">
                    {v._count.pecas} peças · {v.visitas} visitas · {v._count.atendimentos} atendimentos · {v._count.pedidos} pedidos
                    {v.inicioPrevisto ? ` · ${formatarDataHora(v.inicioPrevisto)}` : ''}{gestor ? ` · ${v.responsavel.name}` : ''}
                  </div>
                </div>
                <Link href={`/painel/vitrines/${v.id}`} className={botao('secundario', 'p')}>Abrir</Link>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
