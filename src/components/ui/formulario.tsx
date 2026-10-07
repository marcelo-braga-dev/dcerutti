'use client';

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { AcaoForm, EstadoForm } from '@/lib/formulario';
import { formatarCep, formatarTelefone } from '@/lib/telefone';
import { Alerta } from './basicos';
import { botao } from './botao';

const Ctx = createContext<EstadoForm>({});

export function Formulario({
  acao, children, className = '', aoConcluir, limparAoConcluir,
}: { acao: AcaoForm; children: ReactNode; className?: string; aoConcluir?: (e: EstadoForm) => void; limparAoConcluir?: boolean }) {
  const [estado, enviar] = useActionState(acao, {});
  const ref = useRef<HTMLFormElement>(null);
  const alerta = useRef<HTMLDivElement>(null);
  // B-12: em formulário longo o botão fica longe do topo; leva a mensagem para a tela.
  useEffect(() => {
    if (estado.erro || estado.mensagem) alerta.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [estado]);
  useEffect(() => {
    if (!estado.ok) return;
    if (limparAoConcluir) ref.current?.reset();
    aoConcluir?.(estado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);
  return (
    <form ref={ref} action={enviar} className={className} noValidate>
      <Ctx.Provider value={estado}>
        {(estado.erro || estado.mensagem) && (
          <div ref={alerta} className="mb-4 scroll-mt-28">
            <Alerta tipo={estado.erro ? 'erro' : 'ok'}>{estado.erro ?? estado.mensagem}</Alerta>
          </div>
        )}
        {children}
      </Ctx.Provider>
    </form>
  );
}

type Opcao = { valor: string; rotulo: string };

type CampoProps = {
  nome: string;
  rotulo: string;
  tipo?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'date' | 'month' | 'textarea' | 'select' | 'checkbox' | 'url';
  padrao?: string | number | boolean | null;
  placeholder?: string;
  ajuda?: ReactNode;
  opcoes?: Opcao[];
  mascara?: 'telefone' | 'cep';
  somenteLeitura?: boolean;
  autoComplete?: string;
  className?: string;
  passo?: string;
  linhas?: number;
};

export const classeCampo =
  'w-full bg-card border border-borda-forte px-3 h-11 text-marrom-950 placeholder:text-suave/60 focus:border-marrom-950 outline-none aria-[invalid=true]:border-vermelho read-only:bg-bege/50';

export function Campo({ nome, rotulo, tipo = 'text', padrao, placeholder, ajuda, opcoes, mascara, somenteLeitura, autoComplete, className = '', passo, linhas = 4 }: CampoProps) {
  const estado = useContext(Ctx);
  const erro = estado.erros?.[nome];
  const enviado = estado.valores;
  const id = `campo-${nome}`;
  const valorInicial = enviado && nome in enviado ? enviado[nome] : padrao == null ? '' : String(padrao);
  // A chave muda a cada envio com erro: o campo remonta já com o valor que a pessoa digitou.
  const chave = enviado ? `${nome}:${valorInicial}` : nome;
  const comum = { id, name: nome, 'aria-invalid': !!erro, 'aria-describedby': erro ? `${id}-erro` : undefined };

  if (tipo === 'checkbox') {
    const marcado = enviado ? enviado[nome] === 'on' : !!padrao;
    return (
      <div className={className}>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input key={`${nome}:${marcado}`} type="checkbox" defaultChecked={marcado} className="size-5 accent-marrom-950" {...comum} />
          <span>{rotulo}</span>
        </label>
        {erro && <p id={`${id}-erro`} className="mt-1 text-sm text-vermelho">{erro}</p>}
        {ajuda && <p className="mt-1 text-sm text-suave">{ajuda}</p>}
      </div>
    );
  }

  let entrada: ReactNode;
  if (tipo === 'select')
    entrada = (
      <select key={chave} defaultValue={valorInicial} className={classeCampo} disabled={somenteLeitura} {...comum}>
        {opcoes?.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    );
  else if (tipo === 'textarea')
    entrada = <textarea key={chave} defaultValue={valorInicial} rows={linhas} placeholder={placeholder} readOnly={somenteLeitura} className={`${classeCampo} h-auto py-2`} {...comum} />;
  else
    entrada = (
      <input
        key={chave}
        type={tipo}
        defaultValue={valorInicial}
        placeholder={placeholder}
        readOnly={somenteLeitura}
        autoComplete={autoComplete}
        step={passo}
        inputMode={mascara ? 'numeric' : tipo === 'number' ? 'decimal' : undefined}
        onInput={mascara ? e => { const t = e.currentTarget; t.value = mascara === 'cep' ? formatarCep(t.value) : formatarTelefone(t.value); } : undefined}
        className={classeCampo}
        {...comum}
      />
    );

  return (
    <div className={className}>
      <label htmlFor={id} className="block rotulo text-suave mb-2">{rotulo}</label>
      {entrada}
      {erro ? <p id={`${id}-erro`} className="mt-1 text-sm text-vermelho">{erro}</p> : ajuda ? <p className="mt-1 text-sm text-suave">{ajuda}</p> : null}
    </div>
  );
}

export function BotaoEnviar({ children, pendente = 'Salvando…', variante = 'primario', className = '', nome, valor }: { children: ReactNode; pendente?: string; variante?: 'primario' | 'secundario' | 'oliva' | 'perigo'; className?: string; nome?: string; valor?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={nome} value={valor} disabled={pending} className={botao(variante, 'm', className)}>
      {pending ? pendente : children}
    </button>
  );
}
