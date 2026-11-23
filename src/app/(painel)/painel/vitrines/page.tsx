import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { BotaoCopiar } from '@/components/painel/vitrine-pecas';
import { CabecalhoPagina, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { ehStatusVitrine, STATUS_VITRINE, TIPOS_VITRINE, type StatusVitrine } from '@/lib/vitrines';
import { listarVitrines, vitrinesLigadas } from '@/server/consultas/vitrines';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';

export const metadata = { title: 'Vitrines' };

/** Cor da situação: no ar em vermelho (como na página pública), ativas em oliva, o resto discreto. */
const COR_STATUS: Record<StatusVitrine, string> = {
  rascunho: 'bg-card text-suave border border-borda-forte', agendada: 'bg-caramelo text-creme', no_ar: 'bg-imperdivel text-white',
  publicada: 'bg-oliva text-creme', encerrada: 'bg-marrom-950/70 text-creme', arquivada: 'bg-card text-suave border border-borda',
};

/** Vitrines no painel (docs/26, D-36): cartões com a capa das peças, a situação e o resultado de cada uma. */
export default async function Vitrines({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await vitrinesLigadas())) notFound();
  const sp = await searchParams;
  const status = ehStatusVitrine(sp.status) ? sp.status : null;
  const [{ lista, contagem, emUso }, site] = await Promise.all([listarVitrines(u, { status }), urlDoSite()]);
  const gestor = u.papel === 'gestor';
  const dominio = site.replace(/^https?:\/\//, '');
  const filtros: { href: string; rotulo: string; n: number; ativo: boolean }[] = [
    { href: '/painel/vitrines', rotulo: 'Em uso', n: emUso, ativo: !status },
    ...(Object.keys(STATUS_VITRINE) as StatusVitrine[]).filter(s => contagem[s] || status === s).map(s => ({ href: `/painel/vitrines?status=${s}`, rotulo: STATUS_VITRINE[s], n: contagem[s] ?? 0, ativo: status === s })),
  ];

  return (
    <>
      <CabecalhoPagina sobre="Instagram" titulo="Vitrines" acoes={<BotaoLink href="/painel/vitrines/nova">+ Nova vitrine</BotaoLink>}>
        Peças de lives e publicações numa página aberta, com pedido pelo WhatsApp.
      </CabecalhoPagina>

      <div className="mb-6 bg-card border border-borda rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="rotulo !text-[0.65rem] text-suave">Link da bio</div>
          <div className="font-semibold text-marrom-950 break-all">{dominio}/vitrines</div>
          <div className="text-xs text-suave">Mostra a live no ar (ou a próxima) e as vitrines publicadas. Para falar na live: <strong>{dominio}/live</strong></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoCopiar texto={`${site}/vitrines`} rotulo="Copiar link da bio" />
          <a href="/vitrines" target="_blank" rel="noopener" className={botao('secundario', 'p')}>Abrir</a>
        </div>
      </div>

      <nav aria-label="Filtrar por situação" className="mb-6 flex gap-1 p-1 rounded-full bg-card border border-borda w-fit max-w-full overflow-x-auto sem-barra">
        {filtros.map(f => (
          <Link key={f.href} href={f.href} aria-current={f.ativo ? 'page' : undefined}
            className={`shrink-0 px-4 h-9 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${f.ativo ? 'bg-marrom-950 text-creme' : 'text-suave hover:text-marrom-950 hover:bg-creme'}`}>
            {f.rotulo}<span className={`text-[0.7rem] tabular-nums ${f.ativo ? 'text-areia' : 'text-suave/70'}`}>{f.n}</span>
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <Vazio>
          {status ? 'Nenhuma vitrine nesta situação.' : 'Nenhuma vitrine ainda. Crie uma para a próxima live ou publicação: escolha as peças, publique e coloque o link na bio.'}
          {!status && <div className="mt-4"><BotaoLink href="/painel/vitrines/nova">+ Nova vitrine</BotaoLink></div>}
        </Vazio>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {lista.map(v => {
            const st = v.status as StatusVitrine;
            const quando = st === 'agendada' && v.inicioPrevisto ? `Live em ${formatarDataHora(v.inicioPrevisto)}` : `Criada em ${formatarData(v.criadoEm)}`;
            return (
              <li key={v.id} className="bg-card border border-borda rounded-3xl overflow-hidden flex flex-col hover:shadow-lg hover:shadow-marrom-950/5 transition-shadow">
                <Link href={`/painel/vitrines/${v.id}`} className="relative block h-40 bg-bege" tabIndex={-1} aria-hidden="true">
                  <div className={`absolute inset-0 grid gap-0.5 ${v.imagens.length >= 3 ? 'grid-cols-3' : v.imagens.length === 2 ? 'grid-cols-2' : ''}`}>
                    {(v.imagens.length ? v.imagens : [null]).map((src, i) => <div key={i} className="relative overflow-hidden"><Foto src={src} alt="" sizes="160px" className={st === 'encerrada' || st === 'arquivada' ? 'grayscale' : ''} /></div>)}
                  </div>
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <span className={`h-6 px-2.5 rounded-full text-[0.7rem] font-bold inline-flex items-center gap-1.5 ${COR_STATUS[st]}`}>
                      {st === 'no_ar' && <span className="size-1.5 rounded-full bg-white animate-pulse motion-reduce:animate-none" />}{STATUS_VITRINE[st]}
                    </span>
                    <span className="h-6 px-2.5 rounded-full bg-card/95 text-marrom-950 text-[0.7rem] font-semibold inline-flex items-center">{TIPOS_VITRINE[v.tipo]}</span>
                  </div>
                </Link>
                <div className="p-4 grid gap-3 flex-1 content-start">
                  <div className="min-w-0">
                    <Link href={`/painel/vitrines/${v.id}`} className="font-semibold text-marrom-950 hover:underline underline-offset-4 line-clamp-1">{v.titulo}</Link>
                    <div className="text-xs text-suave">{quando}{gestor ? ` · ${v.responsavel.name.split(' ')[0]}` : ''} · {v._count.pecas} {v._count.pecas === 1 ? 'peça' : 'peças'}</div>
                  </div>
                  <dl className="grid grid-cols-4 gap-2 text-center">
                    {([['Visitas', v.visitas], ['Atend.', v._count.atendimentos], ['Pedidos', v._count.pedidos], ['Vendido', brl(v.vendido).replace(',00', '')]] as const).map(([r, n]) => (
                      <div key={r} className="rounded-xl bg-creme py-2 px-1 min-w-0">
                        <dt className="text-[0.62rem] uppercase tracking-wide text-suave">{r}</dt>
                        <dd className="text-sm font-display font-extrabold text-marrom-950 truncate tabular-nums">{n}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <Link href={`/painel/vitrines/${v.id}`} className={botao('primario', 'p', 'flex-1')}>Abrir</Link>
                  {st !== 'arquivada' && <a href={`/vitrine/${v.slug}`} target="_blank" rel="noopener" className={botao('secundario', 'p')} aria-label={`Ver a página de ${v.titulo}`}>Ver página</a>}
                  {st !== 'rascunho' && st !== 'arquivada' && <BotaoCopiar texto={`${site}/vitrine/${v.slug}`} rotulo="Copiar link" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
