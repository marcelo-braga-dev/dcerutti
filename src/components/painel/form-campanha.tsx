'use client';

import { useState } from 'react';
import { salvarCampanha } from '@/server/acoes/cupons';
import { BotaoEnviar, Campo, classeCampo, Formulario } from '@/components/ui/formulario';
import { QUEM_APLICA, TIPOS, type TipoCupom } from '@/lib/cupom';

export type CampanhaForm = {
  ativo: boolean; tipo: TipoCupom; valor: string; tetoDesconto: string; minimoCompra: string; valePromocao: boolean; quemAplica: string;
  codigo?: string; diasAposCadastro?: string;
  minimoParaGerar?: string; diasParaComecar?: string; diasValidade?: string; geraComCupom?: boolean; acumula?: boolean;
};

/** Formulário de uma campanha (fase 4, gestor): o desconto e as regras próprias de primeira compra ou de próxima compra. */
export function FormCampanha({ campanha, inicial }: { campanha: 'primeiraCompra' | 'proximaCompra'; inicial: CampanhaForm }) {
  const [tipo, setTipo] = useState<TipoCupom>(inicial.tipo);
  const primeira = campanha === 'primeiraCompra';
  return (
    <Formulario acao={salvarCampanha} className="grid sm:grid-cols-2 gap-6" prefixo={`${campanha}-`}>
      <input type="hidden" name="campanha" value={campanha} />
      <Campo nome="ativo" rotulo={primeira ? 'Campanha de primeira compra ligada' : 'Campanha de próxima compra ligada'} tipo="checkbox" padrao={inicial.ativo} className="sm:col-span-2"
        ajuda="Só funciona com os cupons ligados em Configurações." />
      {primeira && (
        <Campo nome="codigo" rotulo="Código público" padrao={inicial.codigo} placeholder="BEMVINDA"
          ajuda="Aparece sozinho na sacola de quem nunca comprou; pode ser divulgado fora do site." />
      )}
      <div>
        <label htmlFor={`tipo-${campanha}`} className="block rotulo text-suave mb-2">Tipo</label>
        <select id={`tipo-${campanha}`} name="tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoCupom)} className={classeCampo}>
          {(Object.keys(TIPOS) as TipoCupom[]).map(t => <option key={t} value={t}>{TIPOS[t]}</option>)}
        </select>
      </div>
      {tipo !== 'freteGratis' && <Campo nome="valor" rotulo={tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'} padrao={inicial.valor} />}
      {tipo === 'percentual' && <Campo nome="tetoDesconto" rotulo="Teto do desconto (R$, opcional)" padrao={inicial.tetoDesconto} />}
      <Campo nome="minimoCompra" rotulo="Valor mínimo do pedido para usar (R$, opcional)" padrao={inicial.minimoCompra} />
      <Campo nome="quemAplica" rotulo="Quem pode aplicar" tipo="select" padrao={inicial.quemAplica} opcoes={Object.entries(QUEM_APLICA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <div className="grid content-end pb-2"><Campo nome="valePromocao" rotulo="Vale também para produtos em promoção" tipo="checkbox" padrao={inicial.valePromocao} /></div>

      {primeira ? (
        <Campo nome="diasAposCadastro" rotulo="Vale por quantos dias depois do cadastro" tipo="number" padrao={inicial.diasAposCadastro} placeholder="Sem prazo"
          ajuda="Em branco: vale até a primeira compra. Uma vez por cliente (fichas com o mesmo telefone contam juntas)." />
      ) : (
        <>
          <Campo nome="minimoParaGerar" rotulo="Gera o cupom em vendas a partir de (R$)" padrao={inicial.minimoParaGerar} placeholder="150,00" ajuda="0 ou vazio: toda venda gera." />
          <Campo nome="diasParaComecar" rotulo="Começa a valer depois de (dias)" tipo="number" padrao={inicial.diasParaComecar} ajuda="1 = no dia seguinte à compra." />
          <Campo nome="diasValidade" rotulo="Vale por (dias)" tipo="number" padrao={inicial.diasValidade} />
          <div className="grid gap-3 sm:col-span-2">
            <Campo nome="geraComCupom" rotulo="Venda feita com cupom também gera" tipo="checkbox" padrao={inicial.geraComCupom} ajuda="Desmarcado, o desconto não vira uma corrente sem fim." />
            <Campo nome="acumula" rotulo="Acumular: gerar mesmo se a cliente ainda tem um cupom de próxima compra sem usar" tipo="checkbox" padrao={inicial.acumula} />
          </div>
        </>
      )}
      <div className="sm:col-span-2"><BotaoEnviar>Salvar campanha</BotaoEnviar></div>
    </Formulario>
  );
}
