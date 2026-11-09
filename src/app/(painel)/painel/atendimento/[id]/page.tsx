import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PainelContato } from '@/components/painel/atendimento-botoes';
import { PecasDoAtendimento } from '@/components/painel/atendimento-pecas';
import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { CANAIS, ETAPAS, MOTIVOS_PERDA, type Canal, type Etapa } from '@/lib/atendimento';
import { diaDe, formatarData, formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { formatarTelefone } from '@/lib/telefone';
import { apagarDadosDoContato, passarAtendimento, salvarContato, salvarEtapa, salvarNota } from '@/server/acoes/atendimento';
import { atendimentoLigado, detalheDoAtendimento } from '@/server/consultas/atendimento';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { marcaAtual } from '@/server/marca';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Atendimento' };

const ROTULO_REGISTRO: Record<string, string> = { nota: 'Nota', contato_whatsapp: 'Chamou no WhatsApp', contato_direct: 'Chamou no Direct', etapa: 'Etapa', transferencia: 'Transferência', pedido: 'Pedido', envio_peca: 'Enviou peça' };

export default async function Atendimento({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirPapel(EQUIPE);
  if (!(await atendimentoLigado())) notFound();
  const a = await detalheDoAtendimento(u, (await params).id);
  if (!a) notFound();
  const gestor = u.papel === 'gestor';
  const [marca, vendedoras] = await Promise.all([marcaAtual(), gestor ? vendedoresAtivos() : []]);
  const aberto = !a.fechadoEm;
  const peca = a.pecas[0];
  const emAndamento = aberto && !a.pedidoId;

  return (
    <>
      <Link href="/painel/atendimento" className="rotulo text-suave hover:text-marrom-950">← Hoje</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre={`Atendimento ${a.codigo}`} titulo={a.nome}
        acoes={a.cliente && <Link href={`/painel/clientes/${a.cliente.id}`} className={botao('secundario')}>Ver a ficha</Link>}>
        <Etiqueta cor={a.etapa === 'ganho' ? 'oliva' : a.etapa === 'perdido' ? 'cinza' : 'bege'}>{ETAPAS[a.etapa as Etapa]}</Etiqueta>{' '}
        <Etiqueta cor="contorno">{CANAIS[a.canal as Canal]}</Etiqueta>
        <div className="text-sm mt-1">
          {[a.telefone && formatarTelefone(a.telefone), a.instagram && `@${a.instagram}`].filter(Boolean).join(' · ') || 'Sem contato'}
          {' · '}{a.responsavel?.name ?? 'Sem responsável'}
          {a.proximoContatoEm && ` · retorno em ${formatarData(a.proximoContatoEm)}`}
          {a.motivoPerda && ` · ${MOTIVOS_PERDA[a.motivoPerda] ?? a.motivoPerda}`}
          {a.vitrine && <> · Vitrine: <Link href={`/painel/vitrines/${a.vitrine.id}`} className="underline underline-offset-4">{a.vitrine.titulo}</Link></>}
        </div>
      </CabecalhoPagina>

      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          <Cartao className="p-5">
            <h2 className="titulo text-lg mb-3">Falar com a cliente</h2>
            <PainelContato id={a.id} telefone={a.telefone} instagram={a.instagram} respostas={a.respostas} meuNumero={a.meuNumero}
              variaveis={{ nome: a.nome.split(' ')[0], vendedora: (a.responsavel?.name ?? u.name).split(' ')[0], loja: marca.nome, peca: peca?.nome, preco: peca ? brl(peca.preco) : undefined, tamanhos: peca?.tamanhos.join(', ') }} />
          </Cartao>
          <Cartao className="p-5">
            <h2 className="titulo text-lg mb-3">Peças</h2>
            <PecasDoAtendimento id={a.id} pecas={a.pecas} podeEditar={emAndamento} temFicha={!!a.cliente} pedido={a.pedido} telefone={a.telefone} instagram={a.instagram} />
          </Cartao>
          <Cartao className="p-5 grid gap-3">
            <h2 className="titulo text-lg">Histórico</h2>
            <Formulario acao={salvarNota} limparAoConcluir className="grid gap-2">
              <input type="hidden" name="id" value={a.id} />
              <Campo nome="texto" rotulo="Nova nota" tipo="textarea" linhas={2} ajuda="Não registre dados sensíveis, como saúde ou documentos." />
              <div><BotaoEnviar variante="secundario">Salvar nota</BotaoEnviar></div>
            </Formulario>
            <ul className="grid gap-3 text-sm border-t border-borda pt-3">
              <li className="text-suave">Criado em {formatarDataHora(a.criadoEm)}.</li>
              {a.registros.map(r => (
                <li key={r.id}>
                  <strong className="text-marrom-950">{ROTULO_REGISTRO[r.tipo] ?? r.tipo}</strong>{r.usuario ? ` · ${r.usuario.name}` : ''} <span className="text-suave">· {formatarDataHora(r.criadoEm)}</span>
                  {r.texto && <p className="whitespace-pre-line">{r.texto}</p>}
                </li>
              ))}
            </ul>
          </Cartao>
        </div>

        <div className="grid gap-6">
          {!a.pedidoId && a.etapa !== 'ganho' && (
            <Cartao className="p-5">
              <h2 className="titulo text-lg mb-3">Próximo passo</h2>
              <Formulario acao={salvarEtapa} className="grid gap-4">
                <input type="hidden" name="id" value={a.id} />
                <Campo nome="etapa" rotulo="Etapa" tipo="select" padrao={a.etapa === 'novo' || a.etapa === 'perdido' ? 'em_conversa' : a.etapa}
                  opcoes={[{ valor: 'em_conversa', rotulo: 'Em conversa' }, { valor: 'proposta', rotulo: 'Proposta' }, { valor: 'perdido', rotulo: 'Perdido' }]} />
                <Campo nome="proximoContato" rotulo="Próximo contato" tipo="date" padrao={a.proximoContatoEm ? diaDe(a.proximoContatoEm) : ''} ajuda="Obrigatório enquanto a conversa estiver aberta." />
                <Campo nome="motivoPerda" rotulo="Motivo, se perdido" tipo="select" padrao={a.motivoPerda ?? ''} opcoes={[{ valor: '', rotulo: '—' }, ...Object.entries(MOTIVOS_PERDA).map(([valor, rotulo]) => ({ valor, rotulo }))]} />
                <div><BotaoEnviar>Salvar</BotaoEnviar></div>
              </Formulario>
            </Cartao>
          )}
          {(!a.cliente || !a.instagram) && (
            <Cartao className="p-5">
              <h2 className="titulo text-lg mb-1">Completar o contato</h2>
              {!a.telefone && <p className="text-sm text-caramelo mb-3">Peça o WhatsApp: sem ele não há ficha nem pedido, e o Direct limita a retomada da conversa.</p>}
              {a.telefone && !a.cliente && <p className="text-sm text-caramelo mb-3">Número informado pela própria pessoa. Confirme na conversa e salve para criar a ficha.</p>}
              <Formulario acao={salvarContato} className="grid gap-4">
                <input type="hidden" name="id" value={a.id} />
                {!a.cliente && <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" mascara="telefone" placeholder="(49) 99999-9999" padrao={a.telefone ? formatarTelefone(a.telefone) : ''} />}
                {!a.instagram && <Campo nome="instagram" rotulo="Instagram" placeholder="@usuario" />}
                <div><BotaoEnviar variante="secundario">Salvar contato</BotaoEnviar></div>
              </Formulario>
            </Cartao>
          )}
          {gestor && (
            <Cartao className="p-5 grid gap-3">
              <h2 className="titulo text-lg">Gestão</h2>
              {aberto && (
                <Formulario acao={passarAtendimento} className="grid gap-3">
                  <input type="hidden" name="id" value={a.id} />
                  <Campo nome="para" rotulo="Passar para" tipo="select" opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...vendedoras.filter(v => v.id !== a.responsavelId).map(v => ({ valor: v.id, rotulo: v.name }))]} ajuda="A carteira não muda: para isso, edite a ficha." />
                  <div><BotaoEnviar variante="secundario">Passar</BotaoEnviar></div>
                </Formulario>
              )}
              {!a.cliente && <BotaoAcao acao={apagarDadosDoContato.bind(null, a.id)} depois="/painel/atendimento/lista" confirmar="Apagar este contato e todo o histórico dele? Use quando a pessoa pedir a exclusão dos dados." className={botao('perigo', 'p')}>Apagar dados do contato</BotaoAcao>}
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
