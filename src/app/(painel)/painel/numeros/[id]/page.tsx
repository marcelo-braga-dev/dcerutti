import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormNumero } from '@/components/painel/form-numero';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { formatarDataHora } from '@/lib/datas';
import { ROTULO_STATUS, situacaoVinculo, type StatusNumero } from '@/lib/numeros';
import { formatarTelefone } from '@/lib/telefone';
import { mudarStatusDoNumero, tornarPadrao } from '@/server/acoes/numeros';
import { detalheDoNumero } from '@/server/consultas/numeros';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Número de WhatsApp' };

export default async function Numero({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(['gestor']);
  const id = Number((await params).id);
  const dados = Number.isInteger(id) && id > 0 ? await detalheDoNumero(u, id) : null;
  if (!dados) notFound();
  const { numero: n, vinculos, usos, pedidos, atendendo } = dados;
  const abertos = vinculos.filter(v => !v.fimEm).length;
  const status = async (s: StatusNumero) => { 'use server'; return mudarStatusDoNumero(n.id, s); };

  return (
    <>
      <CabecalhoPagina sobre="Números de WhatsApp" titulo={n.apelido} acoes={<Link href="/painel/numeros" className={botao('secundario')}>Voltar ao quadro</Link>}>
        {formatarTelefone(n.telefone)} <Etiqueta cor={n.status === 'ativo' ? 'oliva' : 'cinza'}>{ROTULO_STATUS[n.status]}</Etiqueta> {n.padrao && <Etiqueta cor="caramelo">★ Padrão da loja</Etiqueta>}
        <div className="text-sm mt-1">{atendendo} clientes falam com este número · {pedidos} pedidos · {abertos} {abertos === 1 ? 'pessoa ligada' : 'pessoas ligadas'}</div>
      </CabecalhoPagina>

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          <Cartao className="p-5">
            <h2 className="titulo text-xl mb-3">Quem teve acesso</h2>
            {vinculos.length === 0 ? <Vazio>Ninguém foi ligado a este número ainda.</Vazio> : (
              <ul className="grid gap-3">
                {vinculos.map(v => (
                  <li key={v.id} className="border-b border-borda last:border-0 pb-3 last:pb-0 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-marrom-950">{v.nome}</strong>
                      <Etiqueta cor={v.fimEm ? (v.desconectadoEm ? 'cinza' : 'vermelho') : 'oliva'}>{situacaoVinculo(v)}</Etiqueta>
                    </div>
                    <div className="text-suave">
                      De {formatarDataHora(v.inicioEm)}{v.vinculadoPor ? ` (por ${v.vinculadoPor})` : ''}
                      {v.fimEm ? ` até ${formatarDataHora(v.fimEm)}${v.encerradoPor ? ` (por ${v.encerradoPor})` : ''}` : ' até agora'}
                    </div>
                    {v.conectadoEm && <div className="text-suave">Conexão confirmada em {formatarDataHora(v.conectadoEm)}{v.desconectadoEm && v.fimEm ? ` · desconexão em ${formatarDataHora(v.desconectadoEm)}` : ''}</div>}
                    {v.motivoFim && <div className="text-suave">Motivo: {v.motivoFim}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao className="p-5">
            <h2 className="titulo text-xl">Uso registrado</h2>
            <p className="text-sm text-suave mb-3">Cliques no WhatsApp pelo painel e mudanças neste número. Sem a integração, o que acontece dentro do WhatsApp não aparece aqui.</p>
            {usos.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : (
              <ul className="grid gap-2 text-sm">
                {usos.map(a => <li key={a.id}><strong className="text-marrom-950">{a.quem}</strong> · {a.acao}{a.descricao ? ` · ${a.descricao}` : ''} <span className="text-suave">· {formatarDataHora(a.criadoEm)}</span></li>)}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="grid gap-6">
          <Cartao className="p-5">
            <h2 className="titulo text-xl mb-3">Dados</h2>
            <FormNumero numero={n} />
          </Cartao>
          <Cartao className="p-5 grid gap-2 justify-items-start">
            <h2 className="titulo text-xl">Situação</h2>
            {n.status === 'ativo' && !n.padrao && <BotaoAcao acao={async () => { 'use server'; return tornarPadrao(n.id); }} className={botao('secundario', 'p')}>Definir como padrão</BotaoAcao>}
            {n.status !== 'ativo' && <BotaoAcao acao={status.bind(null, 'ativo')} className={botao('oliva', 'p')}>Reativar</BotaoAcao>}
            {n.status === 'ativo' && !n.padrao && <BotaoAcao acao={status.bind(null, 'pausado')} confirmar="Pausar este número? As clientes de quem o usa como principal falarão com outro número dela ou com o padrão." className={botao('secundario', 'p')}>Pausar</BotaoAcao>}
            {n.status !== 'desativado' && !n.padrao && <BotaoAcao acao={status.bind(null, 'desativado')} confirmar="Desativar este número? Todas as pessoas saem dele e ficam as pendências de desconectar os aparelhos." className={botao('perigo', 'p')}>Desativar</BotaoAcao>}
            {n.padrao && <p className="text-sm text-suave">O número padrão atende as clientes de quem está sem número. Para pausar ou desativar, defina outro como padrão.</p>}
          </Cartao>
        </div>
      </div>
    </>
  );
}
