import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { FormVitrine } from '@/components/painel/form-vitrine';
import { BotaoCopiar, VitrinePecas } from '@/components/painel/vitrine-pecas';
import { Cartao } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { legendaSugerida, proximosStatus, STATUS_VITRINE, TIPOS_VITRINE, type StatusVitrine, type TipoVitrine } from '@/lib/vitrines';
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
/** O caminho de cada tipo, para a linha de etapas. */
const ETAPAS: Record<'live' | 'outro', StatusVitrine[]> = { live: ['rascunho', 'agendada', 'no_ar', 'encerrada'], outro: ['rascunho', 'publicada', 'encerrada'] };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Uma vitrine no painel (docs/26, D-36): etapas, peças, divulgação com QR code, resultado em funil e os dados. */
export default async function Vitrine({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await vitrinesLigadas())) notFound();
  const id = (await params).id;
  const [v, r] = await Promise.all([vitrineParaEdicao(u, id), resultadoDaVitrine(u, id)]);
  if (!v || !r) notFound();
  const [site, vendedoras] = await Promise.all([urlDoSite(), u.papel === 'gestor' ? vendedoresAtivos() : undefined]);
  const tipo = v.tipo as TipoVitrine;
  const st = v.status as StatusVitrine;
  const endereco = `${site}/vitrine/${v.slug}`;
  const legenda = v.legenda ?? legendaSugerida({ tipo, titulo: v.titulo, dominio: site.replace(/^https?:\/\//, '') });
  const qr = await QRCode.toString(endereco, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2e2520', light: '#ffffff' } });
  const etapas = ETAPAS[tipo === 'live' ? 'live' : 'outro'];
  const atual = st === 'arquivada' ? etapas.length : etapas.indexOf(st);
  const funil = [
    { rotulo: 'Visitas', valor: r.visitas, base: r.visitas },
    { rotulo: 'Atendimentos', valor: r.atendimentos, base: r.visitas },
    { rotulo: 'Pedidos', valor: r.pedidos, base: r.atendimentos },
    { rotulo: 'Vendas', valor: r.vendas, base: r.pedidos },
  ];

  return (
    <>
      <Link href="/painel/vitrines" className="rotulo text-suave hover:text-marrom-950">← Vitrines</Link>

      <header className="mt-4 mb-6 grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="rotulo !text-[0.66rem] text-caramelo">{TIPOS_VITRINE[tipo]}</div>
            <h1 className="titulo text-3xl sm:text-4xl mt-1">{v.titulo}</h1>
            <p className="text-sm text-suave mt-1">Pedidos vão para <strong className="text-marrom-950">{v.responsavel.name}</strong>{v.inicioPrevisto ? ` · live em ${formatarDataHora(v.inicioPrevisto)}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {proximosStatus(tipo, st).map(s => (
              <BotaoAcao key={s} acao={mudarStatus.bind(null, v.id, s)} confirmar={CONFIRMAR[s]} className={botao(s === 'publicada' || s === 'agendada' || s === 'no_ar' ? 'oliva' : 'secundario')}>{ACAO[s]}</BotaoAcao>
            ))}
            <BotaoAcao acao={duplicar.bind(null, v.id)} className={botao('fantasma')}>Duplicar</BotaoAcao>
          </div>
        </div>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Etapas da vitrine">
          {etapas.map((e, i) => {
            const feito = i < atual, agora = i === atual;
            return (
              <li key={e} className="flex items-center gap-2" aria-current={agora ? 'step' : undefined}>
                <span className={`h-8 pl-1.5 pr-3 rounded-full text-sm font-semibold inline-flex items-center gap-2 ${agora ? (e === 'no_ar' ? 'bg-imperdivel text-white' : 'bg-marrom-950 text-creme') : feito ? 'bg-oliva/15 text-oliva' : 'bg-card border border-borda text-suave'}`}>
                  <span className={`size-5 rounded-full grid place-items-center text-[0.65rem] font-bold ${agora ? 'bg-creme/20' : feito ? 'bg-oliva text-creme' : 'bg-bege'}`}>{feito ? '✓' : i + 1}</span>
                  {STATUS_VITRINE[e]}
                </span>
                {i < etapas.length - 1 && <span aria-hidden="true" className={`h-px w-5 ${feito ? 'bg-oliva' : 'bg-borda-forte'}`} />}
              </li>
            );
          })}
          {st === 'arquivada' && <li className="text-sm text-suave">· Arquivada (fora do ar)</li>}
        </ol>
      </header>

      <div className="grid xl:grid-cols-[1fr_24rem] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          {v.avisos.length > 0 && (
            <div className="rounded-3xl border border-caramelo/30 bg-bege/60 p-5">
              <div className="font-semibold text-caramelo mb-2">Para conferir antes de divulgar</div>
              <ul className="grid gap-1.5 text-sm">
                {v.avisos.map(a => <li key={a} className="flex gap-2"><span aria-hidden="true" className="text-caramelo">•</span><span>{a}</span></li>)}
              </ul>
            </div>
          )}
          <Cartao className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className="titulo text-lg">Peças</h2>
              <span className="text-sm text-suave">{v.pecas.length} {v.pecas.length === 1 ? 'peça' : 'peças'}</span>
            </div>
            <VitrinePecas id={v.id} pecas={v.pecas} />
          </Cartao>
          <Cartao className="p-5 sm:p-6">
            <h2 className="titulo text-lg mb-4">Dados da vitrine</h2>
            <FormVitrine vitrine={{ ...v }} vendedoras={vendedoras} legendaSugerida={legenda} />
          </Cartao>
        </div>

        <div className="grid gap-6">
          <Cartao className="p-5 grid gap-4">
            <h2 className="titulo text-lg">Divulgar</h2>
            <div className="flex gap-4 items-center">
              <div className="w-28 shrink-0 rounded-2xl border border-borda bg-white p-1.5 [&_svg]:w-full [&_svg]:h-auto" role="img" aria-label="QR code da vitrine" dangerouslySetInnerHTML={{ __html: qr }} />
              <div className="min-w-0 grid gap-2">
                <p className="text-sm break-all text-marrom-950">{endereco}</p>
                <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} download={`vitrine-${v.slug}.svg`} className="text-sm underline underline-offset-4 justify-self-start">Baixar o QR code</a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <BotaoCopiar texto={endereco} rotulo="Copiar endereço" />
              <BotaoCopiar texto={legenda} rotulo="Copiar legenda" />
              <a href={`/vitrine/${v.slug}`} target="_blank" rel="noopener" className={botao('secundario', 'p')}>Ver a página</a>
            </div>
            <p className="text-xs text-suave">Links em legendas e comentários não abrem no Instagram: use a bio, o story (figurinha de link) ou o Direct. O QR code serve para story, provador e etiqueta.</p>
          </Cartao>

          <section aria-label="Resultado" className="bg-card border border-borda rounded-3xl p-5 grid gap-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="titulo text-lg">Resultado</h2>
              <span className="text-sm text-suave">Conversão {r.conversao}%</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-marrom-950 text-creme p-4"><div className="text-[0.65rem] uppercase tracking-wide text-areia">Vendido</div><div className="font-display font-extrabold text-xl">{brl(r.valorVendido)}</div></div>
              <div className="rounded-2xl bg-creme p-4"><div className="text-[0.65rem] uppercase tracking-wide text-suave">Em aberto</div><div className="font-display font-extrabold text-xl text-marrom-950">{brl(r.valorAberto)}</div></div>
            </div>
            <ul className="grid gap-2.5">
              {funil.map((f, i) => (
                <li key={f.rotulo} className="grid gap-1">
                  <div className="flex justify-between text-sm"><span>{f.rotulo}</span><span className="font-semibold tabular-nums">{f.valor}{i > 0 && f.base > 0 ? <span className="text-suave font-normal"> · {pct(f.valor, f.base)}%</span> : null}</span></div>
                  <div className="h-2 rounded-full bg-creme overflow-hidden"><div className="h-full rounded-full bg-caramelo" style={{ width: `${funil[0].valor ? Math.max(2, pct(f.valor, funil[0].valor)) : 0}%` }} /></div>
                </li>
              ))}
            </ul>
            {r.atendimentos > 0 && <Link href={`/painel/atendimento/lista?vitrine=${v.id}`} className="text-sm underline underline-offset-4">Ver os atendimentos</Link>}
          </section>

          <Cartao className="p-5 grid gap-2">
            <h2 className="titulo text-lg">Por peça</h2>
            {r.pecas.length === 0 ? <p className="text-sm text-suave">Sem peças.</p> : (
              <ul className="grid gap-1.5 text-sm">
                {r.pecas.map(p => <li key={p.produtoId} className="flex justify-between gap-3"><span className="min-w-0 truncate">{p.nome}</span><span className="text-suave whitespace-nowrap tabular-nums">{p.pedidas} pedidas · {p.vendidas} vendidas</span></li>)}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
