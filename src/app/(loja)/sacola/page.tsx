import { Sacola } from '@/components/loja/sacola-pagina';
import { lerConfig } from '@/server/config';
import { cepDoClienteLogado } from '@/server/consultas/clientes';
import { cuponsDoClienteLogado } from '@/server/consultas/cupons';
import { usuarioAtual } from '@/server/permissoes';

export const metadata = { title: 'Sacola' };

export default async function PaginaSacola() {
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  const [cepInicial, cupons] = u ? await Promise.all([cepDoClienteLogado(u), cuponsDoClienteLogado(u)]) : [null, []];
  // Fase 4: cupons que a própria cliente pode aplicar agora (primeira compra, pessoais, criados para ela).
  const ofertas = cupons.filter(c => c.situacao === 'disponivel' && c.quemAplica !== 'equipe').map(c => ({ codigo: c.codigo, regra: c.regra, primeiraCompra: c.origem === 'primeiraCompra' }));
  return (
    <Sacola
      usuario={u ? { nome: u.name, papel: u.papel } : null}
      frete={cfg.frete}
      cepsCondicional={cfg.cepsCondicional}
      cidadeCondicional={cfg.cidadeCondicional}
      cepInicial={cepInicial}
      cuponsLigados={cfg.cupons.ligados}
      ofertasCupom={ofertas}
    />
  );
}
