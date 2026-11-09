import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { BotoesContato } from '@/components/painel/atendimento-botoes';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao, BotaoLink } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { CANAIS, ETAPAS, type Canal, type Etapa } from '@/lib/atendimento';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { linkWhatsApp } from '@/lib/whatsapp';
import { adiarAtendimento } from '@/server/acoes/atendimento';
import { atendimentoLigado, filaDeHoje, type AtendimentoDaLista } from '@/server/consultas/atendimento';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { marcaAtual } from '@/server/marca';
import { BotoesPosVenda } from '@/components/painel/botoes-pos-venda';
import { ehOferta, SITUACOES_PAGAMENTO, textoPosVenda, TIPOS_POS_VENDA } from '@/lib/pos-venda';

export const metadata = { title: 'Hoje' };

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  if (!n) return null;
  return (
    <section className="grid gap-3">
      <h2 className="titulo text-xl flex items-center gap-2">{titulo} <span className="text-sm font-normal text-suave">{n}</span></h2>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

function ItemAtendimento({ a, verResponsavel, detalhe }: { a: AtendimentoDaLista; verResponsavel: boolean; detalhe: string }) {
  return (
    <li>
      <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/painel/atendimento/${a.id}`} className="font-semibold text-marrom-950 hover:underline">{a.nome}</Link>{' '}
          <Etiqueta cor="contorno">{CANAIS[a.canal as Canal]}</Etiqueta>{' '}
          {a.etapa !== 'novo' && <Etiqueta>{ETAPAS[a.etapa as Etapa]}</Etiqueta>}
          <div className="text-sm text-suave">{a.codigo} · {detalhe}{verResponsavel ? ` · ${a.responsavel?.name ?? 'Sem responsável'}` : ''}</div>
          {!a.telefone && <div className="text-sm text-caramelo">Sem WhatsApp: peça o número no Direct.</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotoesContato id={a.id} telefone={a.telefone} instagram={a.instagram} />
          <BotaoAcao acao={adiarAtendimento.bind(null, a.id, 1)} className={botao('fantasma', 'p')}>Amanhã</BotaoAcao>
          <Link href={`/painel/atendimento/${a.id}`} className={botao('secundario', 'p')}>Abrir</Link>
        </div>
      </Cartao>
    </li>
  );
}

/** A fila do dia (docs/26): em ordem de urgência, o que precisa de ação agora. */
export default async function Hoje() {
  const u = await exigirPapel(EQUIPE);
  if (!(await atendimentoLigado())) notFound();
  const [f, marca] = await Promise.all([filaDeHoje(u), marcaAtual()]);
  const gestor = u.papel === 'gestor';
  const total = f.posVenda.length + f.novos.length + f.retornos.length + f.pedidos.length + f.interessados.length + f.sugestoes.length;

  return (
    <>
      <CabecalhoPagina sobre="Atendimento" titulo="Hoje" acoes={<BotaoLink href="/painel/atendimento/novo">+ Novo atendimento</BotaoLink>}>
        {gestor ? 'O que está pendente em toda a equipe.' : 'Quem atender agora, em ordem de urgência.'}
      </CabecalhoPagina>
      {total === 0 ? <Vazio>Nada pendente. Quando chegar uma mensagem, registre em <strong>+ Novo atendimento</strong>.</Vazio> : (
        <div className="grid gap-8">
          <Grupo titulo="Novos, sem primeiro contato" n={f.novos.length}>
            {f.novos.map(a => <ItemAtendimento key={a.id} a={a} verResponsavel={gestor} detalhe={`chegou em ${formatarDataHora(a.criadoEm)}`} />)}
          </Grupo>
          <Grupo titulo="Retornos de hoje e atrasados" n={f.retornos.length}>
            {f.retornos.map(a => <ItemAtendimento key={a.id} a={a} verResponsavel={gestor} detalhe={`retorno em ${formatarData(a.proximoContatoEm!)}`} />)}
          </Grupo>
          <Grupo titulo="Pedidos em aberto" n={f.pedidos.length}>
            {f.pedidos.map(p => (
              <li key={p.id}>
                <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/painel/pedidos/${p.id}`} className="font-semibold text-marrom-950 hover:underline">{p.nomeCliente}</Link>
                    <div className="text-sm text-suave">{p.codigo} · {brl(p.total)} · {SITUACOES_PAGAMENTO[p.pagamentoSituacao]} · desde {formatarData(p.criadoEm)}{gestor ? ` · ${p.vendedor.name}` : ''}</div>
                  </div>
                  <Link href={`/painel/pedidos/${p.id}`} className={botao('secundario', 'p')}>Ver o pedido</Link>
                </Cartao>
              </li>
            ))}
          </Grupo>
          <Grupo titulo="Pós-venda" n={f.posVenda.length}>
            {f.posVenda.map(c => (
              <li key={c.id}>
                <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/painel/clientes/${c.cliente.id}`} className="font-semibold text-marrom-950 hover:underline">{c.cliente.nome}</Link>{' '}
                    <Etiqueta>{TIPOS_POS_VENDA[c.tipo]}</Etiqueta>
                    <div className="text-sm text-suave">{c.pedido.codigo} · desde {formatarData(c.venceEm)}{gestor ? ` · ${c.cliente.vendedor.name}` : ''}</div>
                  </div>
                  <BotoesPosVenda id={c.id} clienteId={c.cliente.id} oferta={ehOferta(c.tipo)}
                    url={linkWhatsApp(c.cliente.telefone, textoPosVenda(c.tipo, { nome: c.cliente.nome.split(' ')[0], vendedora: c.cliente.vendedor.name.split(' ')[0], loja: marca.nome }))} />
                </Cartao>
              </li>
            ))}
          </Grupo>
          <Grupo titulo="Clientes com interesse agora" n={f.interessados.length}>
            {f.interessados.map(c => (
              <li key={c.id}>
                <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/painel/clientes/${c.id}`} className="font-semibold text-marrom-950 hover:underline">{c.nome}</Link>
                    <div className="text-sm text-suave">{c.motivos.join(' · ')}{gestor ? ` · ${c.vendedor.name}` : ''}</div>
                  </div>
                  <a href={linkWhatsApp(c.telefone, `Olá, ${c.nome.split(' ')[0]}!`)} target="_blank" rel="noopener" className={botao('whatsapp', 'p')}>WhatsApp</a>
                </Cartao>
              </li>
            ))}
          </Grupo>
          <Grupo titulo="Sugestões que precisam de atenção" n={f.sugestoes.length}>
            {f.sugestoes.map(s => (
              <li key={s.id}>
                <Cartao className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/painel/sugestoes/${s.id}`} className="font-semibold text-marrom-950 hover:underline">{s.cliente}</Link>
                    <div className="text-sm text-suave">{s.codigo} · {s.motivo}</div>
                  </div>
                  <Link href={`/painel/sugestoes/${s.id}`} className={botao('secundario', 'p')}>Ver a sugestão</Link>
                </Cartao>
              </li>
            ))}
          </Grupo>
        </div>
      )}
    </>
  );
}
