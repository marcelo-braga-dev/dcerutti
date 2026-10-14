import Link from 'next/link';
import { Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { formatarData } from '@/lib/datas';
import { lerConfig } from '@/server/config';
import { cuponsDoClienteLogado, type CupomDaCliente } from '@/server/consultas/cupons';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Meus cupons' };

const ROTULO: Record<CupomDaCliente['situacao'], { texto: string; cor: 'oliva' | 'caramelo' | 'cinza' }> = {
  disponivel: { texto: 'Disponível', cor: 'oliva' }, agendado: { texto: 'Em breve', cor: 'caramelo' }, usado: { texto: 'Usado', cor: 'cinza' }, expirado: { texto: 'Vencido', cor: 'cinza' },
};
const ORIGEM: Record<CupomDaCliente['origem'], string> = { primeiraCompra: 'Primeira compra', proximaCompra: 'Presente pela sua compra', manual: 'Cupom para você' };

/** Fase 4 dos cupons: os cupons da cliente (primeira compra, próxima compra e os criados para ela). */
export default async function MeusCupons() {
  const u = await exigirPapel(['cliente']);
  if (!(await lerConfig()).cupons.ligados) return <Vazio>Nenhum cupom por enquanto.</Vazio>;
  const cupons = await cuponsDoClienteLogado(u);
  if (!cupons.length) return <Vazio>Você ainda não tem cupons. Quando ganhar um, ele aparece aqui.</Vazio>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {cupons.map(c => (
        <article key={c.id} className={`bg-card border p-5 grid gap-2 content-start ${c.situacao === 'disponivel' ? 'border-oliva' : 'border-borda opacity-80'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rotulo !text-[0.6rem] text-suave">{ORIGEM[c.origem]}</span>
            <Etiqueta cor={ROTULO[c.situacao].cor}>{ROTULO[c.situacao].texto}</Etiqueta>
          </div>
          <span className="font-display font-extrabold text-2xl tracking-wide text-marrom-950">{c.codigo}</span>
          <p className="text-sm">{c.regra}</p>
          <p className="text-sm text-suave">
            {c.situacao === 'agendado' ? `Começa em ${formatarData(c.inicioEm)}` : c.fimEm ? `${c.situacao === 'expirado' ? 'Venceu' : 'Vale até'} ${formatarData(c.fimEm)}` : 'Sem data para acabar'}
            {c.quemAplica === 'equipe' && ' · peça ao seu vendedor para aplicar'}
          </p>
          {c.situacao === 'disponivel' && c.quemAplica !== 'equipe' && (
            <Link href={`/sacola?cupom=${encodeURIComponent(c.codigo)}`} className={botao('oliva', 'p', 'justify-self-start')}>Usar na sacola</Link>
          )}
        </article>
      ))}
    </div>
  );
}
