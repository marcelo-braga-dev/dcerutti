import Link from 'next/link';
import { LinhaFiltro, PainelFiltros } from '@/components/painel/filtros';
import { PreferenciasNotificacao } from '@/components/painel/preferencias-notificacao';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { tempoDesde } from '@/lib/atividade';
import { formatarDataHora } from '@/lib/datas';
import { ehTipoNotificacao, TIPOS_NOTIFICACAO, type TipoNotificacao } from '@/lib/notificacoes';
import { comFiltros } from '@/lib/url';
import { marcarLidaAcao } from '@/server/acoes/notificacoes';
import { listarNotificacoes, preferenciasDe } from '@/server/notificacoes';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Notificações' };

/** Notificações da equipe (D-28): a lista com filtros, marcar como lidas e as preferências de cada pessoa. */
export default async function Notificacoes({ searchParams }: { searchParams: Promise<{ tipo?: string; ver?: string; pagina?: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const sp = await searchParams;
  const tipo = ehTipoNotificacao(sp.tipo) ? sp.tipo : null;
  const naoLidas = sp.ver === 'nao-lidas';
  const pagina = Math.min(20, Math.max(1, Number(sp.pagina) || 1));
  const [{ lista, total, naoLidas: n }, prefs] = await Promise.all([listarNotificacoes(u.id, { tipo, naoLidas, pagina }), preferenciasDe(u.id)]);
  const url = (m: Record<string, string | null>) => comFiltros('/painel/notificacoes', { tipo, ver: naoLidas ? 'nao-lidas' : null }, m);
  const tipos = (Object.keys(TIPOS_NOTIFICACAO) as TipoNotificacao[]).filter(t => u.papel === 'gestor' || !TIPOS_NOTIFICACAO[t].soGestor);

  return (
    <>
      <CabecalhoPagina sobre={`${n} não ${n === 1 ? 'lida' : 'lidas'}`} titulo="Notificações"
        acoes={n > 0 ? <BotaoAcao acao={marcarLidaAcao.bind(null, undefined)} className={botao('secundario')}>Marcar todas como lidas</BotaoAcao> : undefined} />
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div>
          <PainelFiltros limpar={tipo || naoLidas ? '/painel/notificacoes' : null}>
            <LinhaFiltro rotulo="Mostrar" opcoes={[{ rotulo: 'Todas', href: url({ ver: null }), ativo: !naoLidas }, { rotulo: 'Só não lidas', href: url({ ver: 'nao-lidas' }), ativo: naoLidas }]} />
            <LinhaFiltro rotulo="Tipo" opcoes={[{ rotulo: 'Todos os tipos', href: url({ tipo: null }), ativo: !tipo }, ...tipos.map(t => ({ rotulo: TIPOS_NOTIFICACAO[t].rotulo, href: url({ tipo: t }), ativo: tipo === t }))]} />
          </PainelFiltros>
          {lista.length === 0 ? <Vazio>Nenhuma notificação {naoLidas ? 'não lida' : ''}.</Vazio> : (
            <Cartao className="divide-y divide-borda">
              {lista.map(x => (
                <div key={x.id} className={`flex gap-3 px-5 py-3.5 text-sm ${x.lidaEm ? '' : 'bg-caramelo/5'}`}>
                  <span className={`mt-1.5 size-2 rounded-full shrink-0 ${x.lidaEm ? 'bg-transparent' : 'bg-caramelo'}`} aria-label={x.lidaEm ? undefined : 'Não lida'} />
                  <div className="min-w-0 flex-1">
                    {x.link ? <Link href={x.link} className={`hover:underline ${x.lidaEm ? 'text-marrom-900' : 'font-semibold text-marrom-950'}`}>{x.titulo}</Link> : <span className="font-semibold">{x.titulo}</span>}
                    {x.texto && <div className="text-suave">{x.texto}</div>}
                    <div className="text-xs text-suave mt-0.5" title={formatarDataHora(x.criadaEm)}>{TIPOS_NOTIFICACAO[x.tipo].rotulo} · {tempoDesde(x.criadaEm)}</div>
                  </div>
                  {!x.lidaEm && <BotaoAcao acao={marcarLidaAcao.bind(null, x.id)} className="text-xs text-suave underline underline-offset-2 self-start shrink-0">Marcar como lida</BotaoAcao>}
                </div>
              ))}
            </Cartao>
          )}
          {total > lista.length && <div className="mt-6 text-center"><Link href={url({ pagina: String(pagina + 1) })} scroll={false} className={botao('secundario')}>Carregar mais</Link></div>}
        </div>
        <Cartao className="p-5 sm:p-6">
          <h2 className="titulo text-lg mb-1">Preferências</h2>
          <p className="text-sm text-suave mb-4">Escolha o que aparece no sino do painel e o que chega por e-mail.</p>
          <PreferenciasNotificacao inicial={prefs} tipos={tipos} />
        </Cartao>
      </div>
    </>
  );
}
