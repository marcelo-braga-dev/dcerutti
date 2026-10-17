import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { BotaoEnviarSugestao, BotaoLembrar } from '@/components/painel/botoes-sugestao';
import { Alerta } from '@/components/ui/basicos';
import { tempoDesde } from '@/lib/atividade';
import { formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { aberta, ATENCAO, ESCOLHAS, mensagemDaSugestao, mensagemLembrete, precoQueVale, SITUACOES } from '@/lib/sugestoes';
import { linkWhatsApp } from '@/lib/whatsapp';
import { cancelarSugestaoAcao, renovarSugestaoAcao } from '@/server/acoes/sugestoes';
import { linkDaSugestao } from '@/server/link-pedido';
import { marcaAtual } from '@/server/marca';
import { EQUIPE, exigirPapel } from '@/server/permissoes';
import { urlDoSite } from '@/server/site';
import { sugestaoParaEquipe } from '@/server/sugestoes';

export const metadata = { title: 'Sugestão' };

const COR_ESCOLHA = { quero: 'oliva', talvez: 'caramelo', nao: 'cinza', pendente: 'bege' } as const;

/** Detalhe da sugestão (D-27): o que foi sugerido, o que a cliente marcou, reenviar o link, cancelar. */
export default async function Sugestao({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  const s = await sugestaoParaEquipe(u, (await params).id);
  if (!s) notFound();
  const [site, loja] = await Promise.all([urlDoSite(), marcaAtual()]);
  const link = linkDaSugestao(site, s.codigo);
  const vencida = s.situacao === 'vencida';
  const texto = mensagemDaSugestao({
    nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor.name, loja: loja.nome, titulo: s.titulo, mensagem: s.mensagem, link,
    pecas: s.itens.length, validaAte: s.validaAte, temOferta: s.itens.some(i => i.precoOferta != null), cupom: s.cupomCodigo,
  });
  const marcadas = s.itens.filter(i => i.escolha !== 'pendente').length;
  const temOferta = s.itens.some(i => i.precoOferta != null);
  const lembrete = mensagemLembrete({ nomeCliente: s.cliente.nome, nomeVendedor: s.vendedor.name, situacao: s.situacao, link, validaAte: s.validaAte, temOferta });
  const podeLembrar = aberta(s.situacao) && !!s.enviadaEm;

  return (
    <>
      <Link href="/painel/sugestoes" className="rotulo text-suave hover:text-marrom-950">← Sugestões enviadas</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={`Sugestão ${s.codigo}`} titulo={s.titulo}
        acoes={<>
          {/* Para enviar: o primeiro envio. Já enviado: o lembrete é o passo seguinte, e reenviar fica como opção. */}
          {podeLembrar && <BotaoLembrar id={s.id} url={linkWhatsApp(s.cliente.telefone, lembrete)} lembretes={s.lembretes} />}
          {aberta(s.situacao) && <BotaoEnviarSugestao id={s.id} url={linkWhatsApp(s.cliente.telefone, texto)} enviada={!!s.enviadaEm} />}
          {s.pedidoId && <Link href={`/painel/pedidos/${s.pedidoId}`} className={botao('primario')}>Ver o pedido</Link>}
          <Link href={`/painel/sugestoes/nova?de=${s.id}`} className={botao('secundario')}>Duplicar</Link>
        </>}>
        <Etiqueta cor={SITUACOES[s.situacao].cor}>{SITUACOES[s.situacao].rotulo}</Etiqueta>{' '}
        Para <Link href={`/painel/clientes/${s.cliente.id}`} className="underline underline-offset-4 text-marrom-950">{s.cliente.nome}</Link> · por {s.vendedor.name.split(' ')[0]} · {formatarData(s.criadaEm)}
      </CabecalhoPagina>

      {s.atencao && (
        <div className="mb-6"><Alerta tipo="aviso"><strong>Agora:</strong> {ATENCAO[s.atencao]}. {s.atencao === 'enviar' ? 'Toque em Enviar no WhatsApp.' : s.atencao === 'vencendo' ? 'Lembre a cliente ou renove por mais 7 dias.' : 'Um lembrete no WhatsApp costuma destravar.'}</Alerta></div>
      )}
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <Cartao className="divide-y divide-borda">
          {s.itens.map(i => {
            const p = i.produto;
            const preco = p ? precoQueVale(p.preco, i.precoOferta == null ? null : Number(i.precoOferta), vencida) : 0;
            const trocouCor = i.escolhida && p && i.escolhida.produto.id !== p.id;
            return (
              <div key={i.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-4 p-4 items-start text-sm">
                <div className="relative w-14 h-[70px] bg-bege overflow-hidden"><Foto src={(trocouCor ? i.escolhida!.produto.imagens[0] : p?.imagens[0]) ?? null} alt="" sizes="56px" className="!text-[0.5rem]" /></div>
                <div className="min-w-0 grid gap-1">
                  <span className="text-marrom-950 font-semibold">{p?.nome ?? 'Peça fora do catálogo'}</span>
                  <span className="text-xs text-suave">
                    Sugerido: {i.sugerida ? `Tam. ${i.sugerida.tamanho}` : 'ela escolhe o tamanho'}
                    {i.precoOferta != null && p && <> · <s>{brl(p.preco)}</s> <strong className={vencida ? 'text-suave' : 'text-imperdivel'}>{brl(Number(i.precoOferta))}</strong>{vencida && ' (venceu)'}</>}
                  </span>
                  {i.nota && <span className="text-xs italic text-suave">“{i.nota}”</span>}
                  {i.escolha !== 'pendente' && (
                    <span className="text-xs">
                      Ela escolheu: {i.escolhida ? <strong>Tam. {i.escolhida.tamanho}{trocouCor ? ` · ${i.escolhida.produto.corNome ?? 'outra cor'}` : ''}</strong> : 'sem tamanho'} · {i.quantidade} {i.quantidade === 1 ? 'peça' : 'peças'}
                    </span>
                  )}
                </div>
                <div className="grid gap-1 justify-items-end">
                  <Etiqueta cor={COR_ESCOLHA[i.escolha]}>{i.escolha === 'pendente' ? 'Sem resposta' : ESCOLHAS[i.escolha]}</Etiqueta>
                  <span className="font-display font-bold">{brl(preco)}</span>
                </div>
              </div>
            );
          })}
        </Cartao>

        <div className="grid gap-6">
          <Cartao className="p-5 grid gap-2 text-sm">
            <h2 className="titulo text-lg mb-1">Acompanhamento</h2>
            <div><span className="text-suave">Vale até:</span> {formatarDataHora(s.validaAte)}{vencida && <span className="text-vermelho"> · venceu</span>}</div>
            <div><span className="text-suave">Vista:</span> {s.vistaEm ? <>{formatarDataHora(s.vistaEm)} ({tempoDesde(s.vistaEm)}) · aberta {s.vezesVista}×</> : 'a cliente ainda não abriu o link'}</div>
            <div><span className="text-suave">Marcadas:</span> {marcadas} de {s.itens.length}</div>
            {s.respondidaEm && <div><span className="text-suave">Respondida:</span> {formatarDataHora(s.respondidaEm)}</div>}
            {s.cupomCodigo && <div><span className="text-suave">Cupom:</span> <strong>{s.cupomCodigo}</strong> (aplicado quando ela pedir)</div>}
            {s.lembretes > 0 && s.lembradoEm && <div><span className="text-suave">Lembrada:</span> {s.lembretes}× · a última {formatarDataHora(s.lembradoEm)}</div>}
            {(aberta(s.situacao) || vencida) && (
              <BotaoAcao acao={renovarSugestaoAcao.bind(null, s.id, 7)} className={botao('secundario', 'p', 'justify-self-start mt-2')}>{vencida ? 'Reabrir por mais 7 dias' : 'Renovar por mais 7 dias'}</BotaoAcao>
            )}
            {s.mensagem && <p className="mt-2 bg-bege px-3 py-2 italic">{s.mensagem}</p>}
          </Cartao>
          <Cartao className="p-5 grid gap-3 text-sm">
            <h2 className="titulo text-lg">Link da cliente</h2>
            <input readOnly value={link} aria-label="Link da sugestão" className="h-10 px-3 border border-borda-forte bg-creme text-xs" />
            <a href={link} target="_blank" rel="noopener" className="text-caramelo underline underline-offset-4 justify-self-start">Abrir como a cliente vê</a>
            {aberta(s.situacao) && (
              <BotaoAcao acao={cancelarSugestaoAcao.bind(null, s.id)} confirmar="Cancelar esta sugestão? O link deixa de aceitar respostas." className={botao('perigo', 'p', 'justify-self-start')}>Cancelar a sugestão</BotaoAcao>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
