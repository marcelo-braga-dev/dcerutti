import Link from 'next/link';
import { FormCampanha } from '@/components/painel/form-campanha';
import { Alerta, CabecalhoPagina, Cartao } from '@/components/ui/basicos';
import { brl } from '@/lib/dinheiro';
import { campanhasDeCupom } from '@/server/consultas/cupons';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Campanhas de cupom' };

const texto = (v: { toString(): string } | null | undefined) => (v == null ? '' : String(Number(v.toString())).replace('.', ','));

/** Fase 4 dos cupons (gestor): primeira compra e próxima compra. Valores iniciais: os sugeridos no plano (P-15). */
export default async function Campanhas() {
  const u = await exigirPapel(['gestor']);
  const { primeira, usosPrimeira, modelo, proxima, regras, ligados } = await campanhasDeCupom(u);
  return (
    <>
      <Link href="/painel/cupons" className="rotulo text-suave hover:text-marrom-950">← Cupons</Link>
      <div className="mt-4" />
      <CabecalhoPagina sobre="Cupons" titulo="Campanhas">Cupons automáticos: boas-vindas na primeira compra e um presente para voltar depois de cada compra.</CabecalhoPagina>
      {!ligados && <div className="mb-4"><Alerta tipo="aviso">Os cupons estão desligados em <Link href="/painel/configuracoes" className="underline underline-offset-4">Configurações</Link>: as campanhas só funcionam com eles ligados.</Alerta></div>}
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <Cartao className="p-5 sm:p-8 grid gap-4">
          <div>
            <h2 className="titulo text-xl">Primeira compra</h2>
            <p className="text-sm text-suave mt-1">Para quem nunca comprou: a sacola oferece o cupom com um clique.{primeira && ` Usado ${usosPrimeira.usos} ${usosPrimeira.usos === 1 ? 'vez' : 'vezes'}${primeira.tipo !== 'freteGratis' ? ` · ${brl(usosPrimeira.desconto)} de desconto dado` : ''}.`}</p>
          </div>
          <FormCampanha campanha="primeiraCompra" inicial={primeira ? {
            ativo: primeira.ativo, codigo: primeira.codigo, tipo: primeira.tipo, valor: texto(primeira.valor), tetoDesconto: texto(primeira.tetoDesconto),
            minimoCompra: texto(primeira.minimoCompra), valePromocao: primeira.valePromocao, quemAplica: primeira.quemAplica,
            diasAposCadastro: primeira.diasAposCadastro == null ? '' : String(primeira.diasAposCadastro),
          } : { ativo: false, codigo: 'BEMVINDA', tipo: 'percentual', valor: '10', tetoDesconto: '', minimoCompra: '', valePromocao: false, quemAplica: 'ambos', diasAposCadastro: '30' }} />
        </Cartao>
        <Cartao className="p-5 sm:p-8 grid gap-4">
          <div>
            <h2 className="titulo text-xl">Próxima compra</h2>
            <p className="text-sm text-suave mt-1">
              Cada venda confirmada que se encaixa gera um cupom pessoal, de uso único, para a cliente voltar.
              {modelo && ` ${proxima.gerados} ${proxima.gerados === 1 ? 'gerado' : 'gerados'}, ${proxima.usados} ${proxima.usados === 1 ? 'usado' : 'usados'}${proxima.desconto ? ` · ${brl(proxima.desconto)} de desconto dado` : ''}.`}
            </p>
          </div>
          <FormCampanha campanha="proximaCompra" inicial={{
            ativo: modelo?.ativo ?? false, tipo: modelo?.tipo ?? 'percentual', valor: modelo ? texto(modelo.valor) : '10', tetoDesconto: modelo ? texto(modelo.tetoDesconto) : '50',
            minimoCompra: texto(modelo?.minimoCompra), valePromocao: modelo?.valePromocao ?? false, quemAplica: modelo?.quemAplica ?? 'ambos',
            minimoParaGerar: texto(regras.minimoParaGerar), diasParaComecar: String(regras.diasParaComecar), diasValidade: String(regras.diasValidade),
            geraComCupom: regras.geraComCupom, acumula: regras.acumula,
          }} />
        </Cartao>
      </div>
    </>
  );
}
