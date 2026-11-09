'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Alerta, Etiqueta, Vazio } from '@/components/ui/basicos';
import { Botao, botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { Popup } from '@/components/ui/popup';
import { LIMITE_APARELHOS, ROTULO_STATUS, type StatusNumero } from '@/lib/numeros';
import { plural } from '@/lib/pedido';
import { formatarTelefone } from '@/lib/telefone';
import { ligarPessoa, marcarConectada, marcarDesconectada, moverPessoa, tirarPessoa, tornarPrincipal, verImpacto, type ResultadoNumero } from '@/server/acoes/numeros';
import type { QuadroDeNumeros } from '@/server/consultas/numeros';
import { FormNumero } from './form-numero';

type Numero = QuadroDeNumeros['numeros'][number];
type Vinculo = Numero['vinculos'][number];
type Pessoa = QuadroDeNumeros['equipe'][number];
type Impacto = NonNullable<Awaited<ReturnType<typeof verImpacto>>>;

type Mudanca = { tipo: 'ligar'; numeroId: number; pessoa: Pessoa } | { tipo: 'tirar'; numeroId: number; usuarioId: string } | { tipo: 'mover'; origem: number; destino: number; usuarioId: string };

/** A tela muda na hora; se o servidor recusar, volta sozinha quando a transição termina. */
function aplicar(numeros: Numero[], m: Mudanca): Numero[] {
  const sem = (lista: Vinculo[], id: string) => lista.filter(v => v.usuarioId !== id);
  if (m.tipo === 'ligar') {
    const novo: Vinculo = { id: -1, usuarioId: m.pessoa.id, nome: m.pessoa.nome, papel: m.pessoa.papel, conexao: 'aguardando', principal: false, ultimoUso: null };
    return numeros.map(n => (n.id === m.numeroId ? { ...n, vinculos: [...n.vinculos, novo] } : n));
  }
  if (m.tipo === 'tirar') return numeros.map(n => (n.id === m.numeroId ? { ...n, vinculos: sem(n.vinculos, m.usuarioId) } : n));
  const v = numeros.find(n => n.id === m.origem)?.vinculos.find(x => x.usuarioId === m.usuarioId);
  if (!v) return numeros;
  return numeros.map(n => (n.id === m.origem ? { ...n, vinculos: sem(n.vinculos, m.usuarioId) } : n.id === m.destino ? { ...n, vinculos: [...n.vinculos, { ...v, id: -1, conexao: 'aguardando' as const, ultimoUso: null }] } : n));
}

function Alca({ id, rotulo, dados, children }: { id: string; rotulo: string; dados: { nome: string }; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: dados });
  return (
    <div className={`flex items-center gap-2 min-w-0 ${isDragging ? 'opacity-30' : ''}`}>
      {/* touch-none só na alça: o resto do cartão continua rolando a página no celular. */}
      <button type="button" ref={setNodeRef} {...attributes} {...listeners} aria-label={rotulo} className="touch-none cursor-grab active:cursor-grabbing text-suave hover:text-marrom-950 px-1 py-2 text-lg leading-none">⠿</button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Solta({ id, className, children, rotulo }: { id: string; className: string; children: ReactNode; rotulo: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <section ref={setNodeRef} aria-label={rotulo} className={`${className} transition-colors ${isOver ? 'outline-2 outline-caramelo bg-bege' : ''}`}>{children}</section>;
}

/** Quadro de arrastar e soltar (D-31). Tudo também tem menu e botão, para celular e teclado. */
export function NumerosQuadro({ numeros, equipe, pendencias }: QuadroDeNumeros) {
  const [pendente, iniciar] = useTransition();
  const [otimista, mudar] = useOptimistic(numeros, aplicar);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [perguntaMover, setPerguntaMover] = useState<{ origem: Numero; destino: Numero; vinculo: Vinculo } | null>(null);
  const [remover, setRemover] = useState<{ numero: Numero; vinculo: Vinculo; impacto: Impacto | null } | null>(null);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const executar = (m: Mudanca | null, acao: () => Promise<ResultadoNumero>) => {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      if (m) mudar(m);
      const r = await acao();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.');
      else if (r.aviso) setAviso(r.aviso);
    });
  };

  const ligar = (numero: Numero, p: Pessoa) => {
    if (numero.vinculos.some(v => v.usuarioId === p.id)) return setErro(`${p.nome} já está em ${numero.apelido}.`);
    if (numero.status === 'desativado') return setErro(`${numero.apelido} está desativado. Reative antes de ligar alguém.`);
    executar({ tipo: 'ligar', numeroId: numero.id, pessoa: p }, () => ligarPessoa(numero.id, p.id));
  };

  const pedirRemocao = (numero: Numero, vinculo: Vinculo) => {
    setRemover({ numero, vinculo, impacto: null });
    verImpacto(numero.id, vinculo.usuarioId).then(impacto => setRemover(atual => (atual ? { ...atual, impacto } : atual)), () => setRemover(atual => (atual ? { ...atual, impacto: null } : atual)));
  };

  const aoSoltar = ({ active, over }: DragEndEvent) => {
    setArrastando(null);
    if (!over) return;
    const [tipo, a, b] = String(active.id).split(':');
    const destino = String(over.id);
    if (tipo === 'pessoa') {
      const numero = otimista.find(n => `numero:${n.id}` === destino), p = equipe.find(x => x.id === a);
      if (numero && p) ligar(numero, p);
      return;
    }
    const origem = otimista.find(n => n.id === Number(a));
    const vinculo = origem?.vinculos.find(v => v.usuarioId === b);
    if (!origem || !vinculo) return;
    if (destino === 'equipe') return pedirRemocao(origem, vinculo);
    const alvo = otimista.find(n => `numero:${n.id}` === destino);
    if (!alvo || alvo.id === origem.id) return;
    if (alvo.vinculos.some(v => v.usuarioId === vinculo.usuarioId)) return setErro(`${vinculo.nome} já está em ${alvo.apelido}.`);
    setPerguntaMover({ origem, destino: alvo, vinculo });
  };

  const aoComecar = ({ active }: DragStartEvent) => setArrastando((active.data.current as { nome: string } | undefined)?.nome ?? null);

  const emUso = otimista.filter(n => n.status !== 'desativado');
  const desativados = otimista.filter(n => n.status === 'desativado');
  const semNumero = equipe.filter(p => p.semNumero);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Botao onClick={() => setNovo(true)}>+ Cadastrar número</Botao></div>

      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="aviso">{aviso}</Alerta>}

      {pendencias.map(p => (
        <Alerta key={p.id} tipo="aviso">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span><strong>Desconectar {p.nome}</strong> do número {p.numero}, {formatarTelefone(p.telefone)}, em Aparelhos conectados no WhatsApp. Saiu {p.desde}.</span>
            <Botao variante="secundario" tamanho="p" disabled={pendente} onClick={() => executar(null, () => marcarDesconectada(p.id))}>Já desconectei</Botao>
          </div>
        </Alerta>
      ))}
      {semNumero.length > 0 && (
        <Alerta tipo="aviso">
          <strong>{semNumero.map(p => p.nome.split(' ')[0]).join(', ')}</strong> {semNumero.length === 1 ? 'está' : 'estão'} sem número em uso: as clientes falam com o número padrão da loja.
        </Alerta>
      )}

      <DndContext id="quadro-numeros" sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
        <div className="grid lg:grid-cols-[17rem_1fr] gap-4 items-start">
          <Solta id="equipe" rotulo="Equipe" className="bg-card border border-borda p-4 lg:sticky lg:top-24 grid gap-3">
            <div>
              <h2 className="titulo text-lg">Equipe</h2>
              <p className="text-xs text-suave">Arraste para um número. Solte aqui para tirar a pessoa do número.</p>
            </div>
            <ul className="grid gap-2">
              {equipe.map(p => (
                <li key={p.id} className="border border-borda p-2">
                  <Alca id={`pessoa:${p.id}`} rotulo={`Arrastar ${p.nome}`} dados={{ nome: p.nome }}>
                    <div className="font-semibold text-sm text-marrom-950 truncate">{p.nome} {p.semNumero && <span title="Sem número" className="text-caramelo">⚠</span>}</div>
                    <div className="text-xs text-suave">{p.papel === 'gestor' ? 'Gestor' : plural(p.clientes, 'cliente', 'clientes')}</div>
                  </Alca>
                  <select aria-label={`Ligar ${p.nome} a um número`} value="" disabled={pendente} className={`${classeCampo} mt-2 !h-9 !text-sm`}
                    onChange={e => { const n = emUso.find(x => x.id === Number(e.target.value)); if (n) ligar(n, p); }}>
                    <option value="">Ligar a um número…</option>
                    {emUso.filter(n => !n.vinculos.some(v => v.usuarioId === p.id)).map(n => <option key={n.id} value={n.id}>{n.apelido}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </Solta>

          {emUso.length === 0 ? <Vazio>Nenhum número cadastrado.</Vazio> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {emUso.map(n => (
                <Solta key={n.id} id={`numero:${n.id}`} rotulo={`Número ${n.apelido}`} className={`bg-card border border-borda p-4 grid gap-3 ${n.status === 'pausado' ? 'opacity-75' : ''}`}>
                  <header>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/painel/numeros/${n.id}`} className="titulo text-lg hover:underline">{n.apelido}</Link>
                      <div className="flex flex-wrap justify-end gap-1">
                        {n.padrao && <Etiqueta cor="caramelo">★ Padrão</Etiqueta>}
                        {n.status !== 'ativo' && <Etiqueta cor="cinza">{ROTULO_STATUS[n.status as StatusNumero]}</Etiqueta>}
                      </div>
                    </div>
                    <div className="text-sm text-suave">{formatarTelefone(n.telefone)}</div>
                    <div className="text-xs text-suave mt-1">{plural(n.clientes, 'cliente fala', 'clientes falam')} com este número</div>
                  </header>
                  {n.vinculos.length > LIMITE_APARELHOS && <p className="text-xs text-caramelo">Mais pessoas que os {LIMITE_APARELHOS} aparelhos que o WhatsApp costuma permitir: confira o limite do seu plano.</p>}
                  {n.vinculos.length === 0 ? (
                    <p className="border border-dashed border-borda-forte p-4 text-center text-sm text-suave">Solte uma pessoa aqui</p>
                  ) : (
                    <ul className="grid gap-2">
                      {n.vinculos.map(v => (
                        <li key={v.usuarioId} className="border border-borda p-2 grid gap-2 bg-creme/40">
                          <Alca id={`vinculo:${n.id}:${v.usuarioId}`} rotulo={`Arrastar ${v.nome} para outro número`} dados={{ nome: v.nome }}>
                            <div className="font-semibold text-sm text-marrom-950 truncate">{v.nome} {v.principal && <span title="Número principal desta pessoa" className="text-caramelo">★</span>}</div>
                            <div className="text-xs text-suave">
                              {v.conexao === 'conectado' ? 'Aparelho conectado' : 'Aguardando conexão'}{v.ultimoUso ? ` · usou ${v.ultimoUso}` : ''}
                            </div>
                          </Alca>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs items-center">
                            {v.conexao === 'aguardando' && v.id > 0 && <button type="button" disabled={pendente} className="underline underline-offset-2 text-oliva font-semibold" onClick={() => executar(null, () => marcarConectada(v.id))}>Já conectei</button>}
                            {!v.principal && v.papel === 'vendedor' && n.status === 'ativo' && v.id > 0 && <button type="button" disabled={pendente} className="underline underline-offset-2" onClick={() => executar(null, () => tornarPrincipal(n.id, v.usuarioId))}>Tornar principal</button>}
                            <button type="button" disabled={pendente} className="underline underline-offset-2 text-vermelho" onClick={() => pedirRemocao(n, v)}>Remover</button>
                            {emUso.length > 1 && (
                              <select aria-label={`Mover ${v.nome} para outro número`} value="" disabled={pendente} className="bg-transparent underline underline-offset-2 max-w-28"
                                onChange={e => { const alvo = emUso.find(x => x.id === Number(e.target.value)); if (alvo) setPerguntaMover({ origem: n, destino: alvo, vinculo: v }); }}>
                                <option value="">Mover…</option>
                                {emUso.filter(x => x.id !== n.id && !x.vinculos.some(y => y.usuarioId === v.usuarioId)).map(x => <option key={x.id} value={x.id}>{x.apelido}</option>)}
                              </select>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Solta>
              ))}
            </div>
          )}
        </div>
        <DragOverlay>{arrastando && <div className="bg-marrom-950 text-creme text-sm font-semibold px-3 py-2 shadow-lg w-max">{arrastando}</div>}</DragOverlay>
      </DndContext>

      {desativados.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-suave">{plural(desativados.length, 'número desativado', 'números desativados')}</summary>
          <ul className="mt-2 grid gap-1">
            {desativados.map(n => <li key={n.id}><Link className="underline underline-offset-2" href={`/painel/numeros/${n.id}`}>{n.apelido}</Link> <span className="text-suave">{formatarTelefone(n.telefone)}</span></li>)}
          </ul>
        </details>
      )}

      {novo && <Popup titulo="Cadastrar número" fechar={() => setNovo(false)}><FormNumero aoConcluir={() => setNovo(false)} /></Popup>}

      {perguntaMover && (
        <Popup titulo={`${perguntaMover.vinculo.nome} em ${perguntaMover.destino.apelido}`} fechar={() => setPerguntaMover(null)}>
          <p className="text-sm text-suave">Mover tira a pessoa de {perguntaMover.origem.apelido}. Adicionar deixa a pessoa nos dois números.</p>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => { const { origem, destino, vinculo } = perguntaMover; setPerguntaMover(null); executar({ tipo: 'mover', origem: origem.id, destino: destino.id, usuarioId: vinculo.usuarioId }, () => moverPessoa(origem.id, destino.id, vinculo.usuarioId)); }}>Mover</Botao>
            <Botao variante="secundario" onClick={() => { const { destino, vinculo } = perguntaMover; const p = equipe.find(x => x.id === vinculo.usuarioId); setPerguntaMover(null); if (p) ligar(destino, p); }}>Adicionar</Botao>
            <Botao variante="fantasma" onClick={() => setPerguntaMover(null)}>Voltar</Botao>
          </div>
        </Popup>
      )}

      {remover && (
        <Popup titulo={`Tirar ${remover.vinculo.nome} de ${remover.numero.apelido}?`} fechar={() => setRemover(null)}>
          {!remover.impacto ? <p className="text-sm text-suave">Conferindo o que muda…</p> : (
            <form className="grid gap-3" onSubmit={e => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              const { numero, vinculo } = remover;
              setRemover(null);
              executar({ tipo: 'tirar', numeroId: numero.id, usuarioId: vinculo.usuarioId }, () => tirarPessoa({ numeroId: numero.id, usuarioId: vinculo.usuarioId, motivo: String(dados.get('motivo') ?? ''), transferirPara: String(dados.get('transferirPara') ?? '') }));
            }}>
              <ul className="text-sm grid gap-1 list-disc pl-5">
                {remover.impacto.principal && <li>Este é o número principal desta pessoa.</li>}
                {remover.impacto.ficaSemNumero && <li>As clientes desta pessoa passam a falar com o <strong>número padrão</strong> da loja.</li>}
                {remover.impacto.podeTransferir && <li>Na carteira: {plural(remover.impacto.clientes, 'cliente', 'clientes')} e {plural(remover.impacto.pendentes, 'pedido em aberto', 'pedidos em aberto')}. Tirar do número não muda a carteira.</li>}
                {remover.vinculo.conexao === 'conectado' && <li><strong>O aparelho continua conectado</strong> até você desconectar no WhatsApp. Fica uma pendência no topo desta página.</li>}
              </ul>
              {remover.impacto.podeTransferir && (
                <label className="grid gap-1 text-sm">
                  <span className="rotulo text-marrom-900">Carteira</span>
                  <select name="transferirPara" className={classeCampo} defaultValue="">
                    <option value="">Manter com {remover.vinculo.nome.split(' ')[0]}</option>
                    {remover.impacto.vendedoras.map(v => <option key={v.id} value={v.id}>Transferir para {v.name}</option>)}
                  </select>
                </label>
              )}
              <label className="grid gap-1 text-sm">
                <span className="rotulo text-marrom-900">Motivo (opcional)</span>
                <input name="motivo" maxLength={200} className={classeCampo} placeholder="Férias, troca de função…" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={botao('perigo')}>Remover do número</button>
                <Botao variante="fantasma" onClick={() => setRemover(null)}>Voltar</Botao>
              </div>
            </form>
          )}
        </Popup>
      )}
    </div>
  );
}
