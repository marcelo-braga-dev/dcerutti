import Link from 'next/link';
import { Barra, CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { formatarDataHora, mesDe } from '@/lib/datas';
import { tempoDesde } from '@/lib/atividade';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes, vendidoPorVendedor } from '@/server/relatorios';
import { listarVendedores } from '@/server/consultas/equipe';
import { TOM } from '@/lib/marca';

export const metadata = { title: 'Vendedores' };

export default async function Vendedores() {
  const u = await exigirPapel(['gestor']);
  const mes = mesDe();
  const vendedores = await listarVendedores(u);
  const [metas, vendido] = await Promise.all([metasDoMes(vendedores.map(v => v.id), mes), vendidoPorVendedor(mes)]);

  return (
    <>
      <CabecalhoPagina sobre="Equipe" titulo="Vendedores" acoes={<BotaoLink href="/painel/vendedores/novo">+ Novo vendedor</BotaoLink>} />
      {vendedores.length === 0 ? <Vazio>Nenhum vendedor cadastrado.</Vazio> : (
        <div className="grid md:grid-cols-2 gap-3">
          {vendedores.map(v => {
            const meta = metas.get(v.id) ?? 0, valor = vendido.get(v.id)?.valor ?? 0, pct = meta ? (valor / meta) * 100 : 0;
            return (
              <Cartao key={v.id} className={`p-5 grid gap-3 ${v.ativo ? '' : 'opacity-60'}`}>
                <div className="flex justify-between gap-3">
                  <div>
                    <Link href={`/painel/vendedores/${v.id}`} className="font-semibold text-marrom-950 hover:underline">{v.name}</Link> {!v.ativo && <Etiqueta cor="cinza">Inativo</Etiqueta>}
                    <div className="text-sm text-suave">{v.email}</div>
                    {/* D-26: último acesso ao painel ou ao caixa (sinal a cada minuto) e último login. */}
                    <div className="text-sm mt-1">
                      {v.online
                        ? <span className="text-oliva font-semibold">● Online agora</span>
                        : <><span className="text-suave">Último acesso:</span> {v.ultimoAcessoEm ? <><strong className="text-marrom-950">{formatarDataHora(v.ultimoAcessoEm)}</strong> <span className="text-suave">({tempoDesde(v.ultimoAcessoEm)})</span></> : <span className="text-suave">sem registro</span>}</>}
                    </div>
                    {v.ultimoLoginEm && <div className="text-xs text-suave">Último login: {formatarDataHora(v.ultimoLoginEm)}</div>}
                    <div className="text-sm" style={{ color: celularValido(v.telefone) ? TOM.bom : TOM.ruim }}>
                      {celularValido(v.telefone) ? `WhatsApp ${v.telefone}` : `WhatsApp incompleto${v.telefone ? `: ${v.telefone}` : ''} — corrija`}
                    </div>
                  </div>
                  <Link href={`/painel/clientes?vendedor=${v.id}`} className="text-right text-sm text-suave underline underline-offset-4 hover:text-marrom-950 self-start">{v._count.clientes} clientes</Link>
                </div>
                {v.ativo && (
                  <>
                    <div className="flex justify-between text-sm"><span>{brl(valor)} de {meta ? brl(meta) : 'sem meta'}</span><strong style={{ color: corDaMeta(pct) }}>{Math.round(pct)}%</strong></div>
                    <Barra pct={pct} cor={corDaMeta(pct)} />
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/painel/vendedores/${v.id}`} className={botao('primario', 'p')}>Perfil</Link>
                  <Link href={`/painel/clientes?vendedor=${v.id}`} className={botao('secundario', 'p')}>Clientes</Link>
                  <Link href={`/painel/pedidos?vendedor=${v.id}`} className={botao('secundario', 'p')}>Pedidos</Link>
                  <Link href={`/painel/vendas?vendedor=${v.id}`} className={botao('secundario', 'p')}>Vendas</Link>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </>
  );
}
