import Link from 'next/link';
import { Barra, CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { BotaoLink, botao } from '@/components/ui/botao';
import { mesDe } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';
import { corDaMeta, metasDoMes, vendidoPorVendedor } from '@/server/relatorios';

export const metadata = { title: 'Vendedores' };

export default async function Vendedores() {
  await exigirPapel(['gestor']);
  const mes = mesDe();
  const vendedores = await db.user.findMany({
    where: { papel: 'vendedor' },
    select: { id: true, name: true, email: true, telefone: true, ativo: true, _count: { select: { clientes: true } } },
    orderBy: [{ ativo: 'desc' }, { name: 'asc' }],
  });
  const [metas, vendido] = await Promise.all([metasDoMes(vendedores.map(v => v.id), mes), vendidoPorVendedor(mes)]);

  return (
    <>
      <CabecalhoPagina sobre="Equipe" titulo="Vendedores" acoes={<BotaoLink href="/painel/vendedores/novo">+ Novo vendedor</BotaoLink>} />
      {vendedores.length === 0 ? <Vazio>Nenhum vendedor cadastrado.</Vazio> : (
        <div className="grid md:grid-cols-2 gap-3">
          {vendedores.map(v => {
            const meta = metas.get(v.id) ?? 0, valor = vendido.get(v.id)?.valor ?? 0, pct = meta ? (valor / meta) * 100 : 0;
            return (
              <Cartao key={v.id} className={`p-5 grid gap-3 ${v.ativo ? '' : 'opacity-60'}`}>
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-semibold text-marrom-950">{v.name} {!v.ativo && <Etiqueta cor="cinza">Inativo</Etiqueta>}</div>
                    <div className="text-sm text-suave">{v.email}</div>
                    <div className="text-sm" style={{ color: celularValido(v.telefone) ? '#5E6B43' : '#B8462F' }}>
                      {celularValido(v.telefone) ? `WhatsApp ${v.telefone}` : `WhatsApp incompleto${v.telefone ? `: ${v.telefone}` : ''} — corrija`}
                    </div>
                  </div>
                  <div className="text-right text-sm text-suave">{v._count.clientes} clientes</div>
                </div>
                {v.ativo && (
                  <>
                    <div className="flex justify-between text-sm"><span>{brl(valor)} de {meta ? brl(meta) : 'sem meta'}</span><strong style={{ color: corDaMeta(pct) }}>{Math.round(pct)}%</strong></div>
                    <Barra pct={pct} cor={corDaMeta(pct)} />
                  </>
                )}
                <Link href={`/painel/vendedores/${v.id}`} className={botao('secundario', 'p', 'justify-self-start')}>Editar</Link>
              </Cartao>
            );
          })}
        </div>
      )}
    </>
  );
}
