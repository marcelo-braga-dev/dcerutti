'use client';

import { useState } from 'react';
import { salvarCupom } from '@/server/acoes/cupons';
import { Alerta } from '@/components/ui/basicos';
import { BotaoEnviar, Campo, classeCampo, Formulario } from '@/components/ui/formulario';
import { QUEM_APLICA, TIPOS, type TipoCupom } from '@/lib/cupom';
import { normalizar } from '@/lib/catalogo';

type Opcao = { valor: string; rotulo: string; detalhe?: string };

export type CupomForm = {
  id?: number; codigo: string; descricao: string; tipo: TipoCupom; valor: string; tetoDesconto: string; minimoCompra: string;
  inicio: string; fim: string; limiteTotal: string; limitePorCliente: string; quemAplica: string;
  somentePrimeiraCompra: boolean; valePromocao: boolean; ativo: boolean;
  categorias: string[]; marcas: string[]; clientes: string[]; referencias: string;
};

/** Cadastro e edição de cupom (só gestor). `usado`: código, tipo, valor, teto, promoção e abrangência ficam travados. */
export function FormCupom({ inicial, usado, opcoes }: {
  inicial: CupomForm; usado: boolean; opcoes: { categorias: Opcao[]; marcas: Opcao[]; clientes: Opcao[] };
}) {
  const [tipo, setTipo] = useState<TipoCupom>(inicial.tipo);
  return (
    <Formulario acao={salvarCupom} className="grid gap-8">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {usado && <Alerta tipo="aviso">Este cupom já foi usado em pedidos: código, tipo, valor, teto, promoção e abrangência estão travados. Para mudar, desative-o e crie outro.</Alerta>}

      <Secao titulo="Cupom">
        <Campo nome="codigo" rotulo="Código" padrao={inicial.codigo} placeholder="PRIMAVERA10" somenteLeitura={usado}
          ajuda="De 3 a 30 letras, números ou hífen. A cliente pode digitar em maiúsculas ou minúsculas." />
        <Campo nome="descricao" rotulo="Descrição interna (opcional)" padrao={inicial.descricao} placeholder="Campanha de primavera no Instagram" />
        <div>
          <label htmlFor="campo-tipo" className="block rotulo text-suave mb-2">Tipo</label>
          {usado && <input type="hidden" name="tipo" value={tipo} />}
          <select id="campo-tipo" name={usado ? undefined : 'tipo'} value={tipo} disabled={usado} onChange={e => setTipo(e.target.value as TipoCupom)} className={classeCampo}>
            {(Object.keys(TIPOS) as TipoCupom[]).map(t => <option key={t} value={t}>{TIPOS[t]}</option>)}
          </select>
        </div>
        {tipo !== 'freteGratis' && (
          <Campo nome="valor" rotulo={tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'} padrao={inicial.valor} placeholder={tipo === 'percentual' ? '10' : '20,00'} somenteLeitura={usado} />
        )}
        {tipo === 'percentual' && (
          <Campo nome="tetoDesconto" rotulo="Teto do desconto (R$, opcional)" padrao={inicial.tetoDesconto} placeholder="50,00" somenteLeitura={usado}
            ajuda="O desconto não passa deste valor. Em branco: sem teto." />
        )}
        {tipo === 'freteGratis' && <p className="text-sm text-suave sm:col-span-2">Zera o frete do pedido de compra. Não vale para condicional nem para venda na loja.</p>}
      </Secao>

      <Secao titulo="Onde vale">
        <Campo nome="minimoCompra" rotulo="Valor mínimo do pedido (R$, opcional)" padrao={inicial.minimoCompra} placeholder="150,00"
          ajuda="Soma de todas as peças do pedido, com o desconto do vendedor e sem o frete." />
        <div className="grid gap-2 content-start">
          <span className="rotulo text-suave">Produtos em promoção</span>
          {usado ? (
            <>
              <input type="hidden" name="valePromocao" value={inicial.valePromocao ? 'on' : ''} />
              <span className="text-sm">{inicial.valePromocao ? 'Vale também para produtos em promoção' : 'Não vale para produtos em promoção'}</span>
            </>
          ) : (
            <Campo nome="valePromocao" rotulo="Vale também para produtos em promoção e Imperdível" tipo="checkbox" padrao={inicial.valePromocao} />
          )}
        </div>
        <p className="sm:col-span-2 text-sm text-suave">Abrangência: sem nada marcado abaixo, o cupom vale para a loja toda. Marcando, vale para a peça que estiver em qualquer item escolhido.</p>
        <SeletorMultiplo nome="categorias" rotulo="Categorias" opcoes={opcoes.categorias} iniciais={inicial.categorias} travado={usado} />
        <SeletorMultiplo nome="marcas" rotulo="Marcas" opcoes={opcoes.marcas} iniciais={inicial.marcas} travado={usado} />
        <Campo nome="referencias" rotulo="Produtos (referências)" tipo="textarea" linhas={2} padrao={inicial.referencias} somenteLeitura={usado}
          placeholder="KG9H1DSI, 0199MD3EN" ajuda="Separe por vírgula. Cada cor é um produto." className="sm:col-span-2" />
      </Secao>

      <Secao titulo="Validade e limites">
        <Campo nome="inicio" rotulo="Começa em" tipo="date" padrao={inicial.inicio} ajuda="Em branco: a partir de agora." />
        <Campo nome="fim" rotulo="Termina em (opcional)" tipo="date" padrao={inicial.fim} ajuda="Vale até o fim deste dia." />
        <Campo nome="limiteTotal" rotulo="Limite total de usos (opcional)" tipo="number" padrao={inicial.limiteTotal} placeholder="Sem limite" />
        <Campo nome="limitePorCliente" rotulo="Usos por cliente" tipo="number" padrao={inicial.limitePorCliente} placeholder="Sem limite" ajuda="Em branco: sem limite por cliente." />
      </Secao>

      <Secao titulo="Para quem">
        <Campo nome="quemAplica" rotulo="Quem pode aplicar" tipo="select" padrao={inicial.quemAplica}
          opcoes={Object.entries(QUEM_APLICA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <div className="grid content-end pb-2">
          <Campo nome="somentePrimeiraCompra" rotulo="Só na primeira compra da cliente" tipo="checkbox" padrao={inicial.somentePrimeiraCompra} />
        </div>
        <SeletorMultiplo nome="clientes" rotulo="Só para estas clientes (opcional)" opcoes={opcoes.clientes} iniciais={inicial.clientes} vazio="Todas as clientes" />
      </Secao>

      <div className="grid gap-4 border-t border-borda pt-6">
        <Campo nome="ativo" rotulo="Cupom ativo" tipo="checkbox" padrao={inicial.ativo} ajuda="Desmarcado, ninguém consegue usar, mas o cupom continua guardado." />
        <div><BotaoEnviar>{inicial.id ? 'Salvar cupom' : 'Criar cupom'}</BotaoEnviar></div>
      </div>
    </Formulario>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid sm:grid-cols-2 gap-6">
      <legend className="titulo text-lg mb-4">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** Lista pesquisável com caixas de marcar; envia um campo `nome` por item escolhido. */
function SeletorMultiplo({ nome, rotulo, opcoes, iniciais, travado = false, vazio = 'Nenhum' }: {
  nome: string; rotulo: string; opcoes: Opcao[]; iniciais: string[]; travado?: boolean; vazio?: string;
}) {
  const [escolhidos, setEscolhidos] = useState<string[]>(iniciais);
  const [busca, setBusca] = useState('');
  const termos = normalizar(busca);
  const visiveis = opcoes.filter(o => !termos || normalizar(`${o.rotulo} ${o.detalhe ?? ''}`).includes(termos)).slice(0, 200);
  const alternar = (v: string) => setEscolhidos(e => (e.includes(v) ? e.filter(x => x !== v) : [...e, v]));
  const nomeDe = (v: string) => opcoes.find(o => o.valor === v)?.rotulo ?? v;

  return (
    <div className="grid gap-2 content-start">
      <span className="rotulo text-suave">{rotulo}</span>
      {escolhidos.map(v => <input key={v} type="hidden" name={nome} value={v} />)}
      <div className="flex flex-wrap gap-1 min-h-8">
        {escolhidos.length === 0 && <span className="text-sm text-suave">{vazio}</span>}
        {escolhidos.map(v => (
          <button key={v} type="button" disabled={travado} onClick={() => alternar(v)} className="h-7 px-2 bg-bege text-xs text-marrom-950 disabled:opacity-60" aria-label={`Tirar ${nomeDe(v)}`}>
            {nomeDe(v)}{!travado && ' ×'}
          </button>
        ))}
      </div>
      {!travado && (
        <>
          {opcoes.length > 8 && <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" aria-label={`Buscar em ${rotulo}`} className={`${classeCampo} !h-9`} />}
          <div className="max-h-44 overflow-y-auto border border-borda divide-y divide-borda">
            {visiveis.map(o => (
              <label key={o.valor} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-bege/50">
                <input type="checkbox" checked={escolhidos.includes(o.valor)} onChange={() => alternar(o.valor)} className="size-4 accent-marrom-950" />
                <span>{o.rotulo}</span>{o.detalhe && <span className="text-suave text-xs">{o.detalhe}</span>}
              </label>
            ))}
            {!visiveis.length && <p className="px-3 py-2 text-sm text-suave">Nada encontrado.</p>}
          </div>
        </>
      )}
    </div>
  );
}
