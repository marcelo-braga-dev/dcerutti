import Link from 'next/link';
import { DivulgarCupom } from '@/components/painel/cupons-acoes';
import { Alerta, CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { QUEM_APLICA, ROTULO_SITUACAO, beneficio, regraEmPalavras, type SituacaoCupom } from '@/lib/cupom';
import { formatarData } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { lerConfig } from '@/server/config';
import { cuponsParaDivulgar, listarCupons } from '@/server/consultas/cupons';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';

export const metadata = { title: 'Cupons' };

const COR: Record<SituacaoCupom, 'oliva' | 'caramelo' | 'cinza' | 'vermelho'> = { ativo: 'oliva', agendado: 'caramelo', expirado: 'cinza', esgotado: 'vermelho', desativado: 'cinza' };

const linkDe = (site: string, codigo: string, quem: string) => (quem === 'equipe' ? null : `${site}/sacola?cupom=${encodeURIComponent(codigo)}`);
const validade = (inicio: Date, fim: Date | null) =>
  inicio > new Date() ? `De ${formatarData(inicio)}${fim ? ` a ${formatarData(fim)}` : ''}` : fim ? `Até ${formatarData(fim)}` : 'Sem data para acabar';

/** Gestor: todos os cupons, com usos e desconto concedido. Vendedor: os cupons disponíveis para divulgar (P-13). */
export default async function Cupons() {
  const u = await exigirPapel(EQUIPE);
  const cfg = await lerConfig();
  const gestor = u.papel === 'gestor';
  const site = await urlDoSite();

  if (!gestor) {
    if (!cfg.cupons.ligados)
      return (
        <>
          <CabecalhoPagina sobre="Vendas" titulo="Cupons" />
          <Vazio>A loja ainda não ligou os cupons de desconto. Quando o gestor ligar, os cupons disponíveis para divulgar aparecem aqui.</Vazio>
        </>
      );
    const cupons = await cuponsParaDivulgar(u);
    return (
      <>
        <CabecalhoPagina sobre="Vendas" titulo="Cupons">
          Cupons criados pela loja para você divulgar aos seus clientes. Copie o código ou o link, ou envie pelo WhatsApp.
        </CabecalhoPagina>
        {cupons.length === 0 ? <Vazio>Nenhum cupom disponível agora.</Vazio> : (
          <div className="grid md:grid-cols-2 gap-3">
            {cupons.map(c => (
              <Cartao key={c.id} className="p-5 grid gap-3 content-start">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-extrabold text-xl tracking-wide text-marrom-950">{c.codigo}</span>
                  <Etiqueta cor={COR[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta>
                </div>
                <p className="text-sm">{regraEmPalavras(c.regra, c.nomes)}</p>
                <div className="text-sm text-suave grid gap-0.5">
                  <span>{validade(c.inicioEm, c.fimEm)}</span>
                  <span>Quem aplica: {QUEM_APLICA[c.quemAplica]}</span>
                  {c.temLimite && <span>Quantidade limitada</span>}
                  {c.especifico && <span>Só para: {c.clientes.map(x => x.nome).join(', ')}</span>}
                </div>
                <DivulgarCupom codigo={c.codigo} regra={regraEmPalavras(c.regra, c.nomes)} link={linkDe(site, c.codigo, c.quemAplica)} />
              </Cartao>
            ))}
          </div>
        )}
      </>
    );
  }

  const cupons = await listarCupons(u);
  return (
    <>
      <CabecalhoPagina sobre="Vendas" titulo="Cupons" acoes={<BotaoLink href="/painel/cupons/novo">+ Novo cupom</BotaoLink>} />
      {!cfg.cupons.ligados && (
        <div className="mb-4"><Alerta tipo="aviso">Os cupons estão desligados: clientes e vendedores não veem nada. Ligue em <Link href="/painel/configuracoes" className="underline underline-offset-4">Configurações</Link> quando quiser começar.</Alerta></div>
      )}
      {cupons.length === 0 ? <Vazio>Nenhum cupom criado ainda.</Vazio> : (
        <div className="grid md:grid-cols-2 gap-3">
          {cupons.map(({ cupom: c, regra, nomes, usos, desconto, situacao }) => (
            <Cartao key={c.id} className={`p-5 grid gap-3 content-start ${situacao === 'desativado' || situacao === 'expirado' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display font-extrabold text-xl tracking-wide text-marrom-950">{c.codigo}</span>
                <Etiqueta cor={COR[situacao]}>{ROTULO_SITUACAO[situacao]}</Etiqueta>
              </div>
              {c.descricao && <p className="text-sm text-suave">{c.descricao}</p>}
              <p className="text-sm">{regraEmPalavras(regra, nomes)}</p>
              <div className="grid grid-cols-3 gap-2 text-sm border-y border-borda py-2">
                <div><div className="rotulo !text-[0.6rem] text-suave">Usos</div><strong>{usos}{c.limiteTotal != null ? ` de ${c.limiteTotal}` : ''}</strong></div>
                <div><div className="rotulo !text-[0.6rem] text-suave">Desconto dado</div><strong>{c.tipo === 'freteGratis' ? '—' : brl(desconto)}</strong></div>
                <div><div className="rotulo !text-[0.6rem] text-suave">Validade</div><strong className="font-normal">{validade(c.inicioEm, c.fimEm)}</strong></div>
              </div>
              <div className="text-xs text-suave">{beneficio(regra)} · Quem aplica: {QUEM_APLICA[c.quemAplica]}{c.clientes.length ? ` · ${c.clientes.length} cliente(s) específica(s)` : ''}</div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/painel/cupons/${c.id}`} className={botao('secundario', 'p')}>Editar</Link>
                {(situacao === 'ativo' || situacao === 'agendado') && <DivulgarCupom codigo={c.codigo} regra={regraEmPalavras(regra, nomes)} link={linkDe(site, c.codigo, c.quemAplica)} />}
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
