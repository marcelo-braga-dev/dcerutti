import { Caixa } from '@/components/caixa/caixa';
import { lerConfig } from '@/server/config';
import { produtosDoCaixa, resumoDoCaixa } from '@/server/consultas/caixa';
import { vendedoresAtivos } from '@/server/consultas/equipe';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Caixa' };

export default async function PaginaCaixa() {
  const u = await exigirPapel(EQUIPE);
  const gestor = u.papel === 'gestor';
  const [produtos, cfg, resumo, vendedores] = await Promise.all([produtosDoCaixa(), lerConfig(), resumoDoCaixa(u), gestor ? vendedoresAtivos() : null]);
  return (
    <Caixa
      produtos={produtos}
      usuario={{ id: u.id, nome: u.name, papel: gestor ? 'gestor' : 'vendedor' }}
      vendedores={vendedores?.map(v => ({ id: v.id, name: v.name })) ?? null}
      limiteDesconto={cfg.caixa.descontoMaxVendedor}
      parcelasMax={cfg.caixa.parcelasMax}
      cupons={cfg.cupons.ligados && (gestor || cfg.cupons.vendedorAplica)}
      resumo={resumo}
    />
  );
}
