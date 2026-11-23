import { CopiarTexto, TestarConexao } from '@/components/painel/conexao-pagamento';
import type { SaudePagamento } from '@/server/consultas/pagamentos';

type Props = { saude: Omit<SaudePagamento, 'ultimoAviso'> & { ultimoAviso: (NonNullable<SaudePagamento['ultimoAviso']> & { quando: string }) | null }; pronto: boolean };

const MODO = { mercadopago: 'Mercado Pago', simulado: 'Simulado (ambiente de teste)', bloqueado: 'Bloqueado' } as const;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[12rem_1fr] gap-1 sm:gap-4 py-2 border-t border-borda first:border-t-0">
      <dt className="rotulo !text-[0.65rem] text-suave pt-0.5">{rotulo}</dt>
      <dd className="text-sm min-w-0">{children}</dd>
    </div>
  );
}

const Tem = ({ v, falta }: { v: string | null; falta: string }) =>
  v ? <span><span className="text-oliva font-semibold">✓ Definido</span> <code className="text-suave">{v}</code></span> : <span className="text-vermelho">✗ {falta}</span>;

/** Bloco "Conexão" da página de configuração do pagamento (docs/27). */
export function ConexaoPagamento({ saude: s, pronto }: Props) {
  return (
    <div className="grid gap-4">
      <dl>
        <Linha rotulo="Modo">{MODO[s.modo]}</Linha>
        <Linha rotulo="Ambiente">{s.ambiente === 'producao' ? 'Produção' : s.ambiente === 'teste' ? 'Teste' : <span className="text-suave">Não definido (MP_AMBIENTE)</span>}</Linha>
        {s.modo !== 'simulado' && <>
          <Linha rotulo="Access Token"><Tem v={s.credenciais.token} falta="Falta MP_ACCESS_TOKEN" /></Linha>
          <Linha rotulo="Chave dos avisos"><Tem v={s.credenciais.segredo} falta="Falta MP_WEBHOOK_SECRET (os avisos são recusados)" /></Linha>
          {s.credenciais.segredoAnterior && <Linha rotulo="Chave anterior"><span>Em uso durante a troca <code className="text-suave">{s.credenciais.segredoAnterior}</code>. Apague quando o Mercado Pago passar a usar a nova.</span></Linha>}
        </>}
        <Linha rotulo="Endereço do aviso">
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all select-all">{s.urlAviso}</code>
            <CopiarTexto texto={s.urlAviso} />
          </div>
          <p className="text-xs text-suave mt-1">Cadastre no Mercado Pago com o evento &quot;Order&quot;.{!s.urlAvisoHttps && <span className="text-vermelho"> O Mercado Pago só chama endereços https.</span>}</p>
        </Linha>
        <Linha rotulo="Último aviso">
          {s.ultimoAviso
            ? <span>{s.ultimoAviso.quando} · {s.ultimoAviso.tipo.replace(/^aviso_/, '').replace(/_/g, ' ')}{s.ultimoAviso.erro ? <span className="text-vermelho"> · {s.ultimoAviso.erro}</span> : s.ultimoAviso.processadoEm ? <span className="text-oliva"> · processado</span> : ' · aguardando'}</span>
            : <span className="text-suave">Nenhum aviso recebido ainda.</span>}
        </Linha>
        <Linha rotulo="Últimas 24 horas">
          <span>{s.avisos24h} {s.avisos24h === 1 ? 'aviso' : 'avisos'}{s.avisosComErro ? <span className="text-vermelho"> ({s.avisosComErro} com erro)</span> : ''} · {s.falhas24h ? <span className="text-vermelho">{s.falhas24h} {s.falhas24h === 1 ? 'falha' : 'falhas'} ao falar com o Mercado Pago</span> : 'nenhuma falha'}{s.pendentes ? <span className="text-vermelho"> · {s.pendentes} {s.pendentes === 1 ? 'aviso' : 'avisos'} a reprocessar</span> : ''} · {s.abertas} {s.abertas === 1 ? 'cobrança aberta' : 'cobranças abertas'}</span>
        </Linha>
      </dl>
      <TestarConexao desabilitado={!pronto} />
    </div>
  );
}
