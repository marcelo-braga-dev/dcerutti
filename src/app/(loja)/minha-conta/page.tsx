import { Foto } from '@/components/loja/foto';
import { CabecalhoPagina, Cartao, Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarDataHora } from '@/lib/datas';
import { brl } from '@/lib/dinheiro';
import { sair } from '@/server/acoes/conta';
import { db } from '@/server/db';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Minha conta' };

export default async function MinhaConta() {
  const u = await exigirPapel(['cliente']);
  const cliente = await db.cliente.findUnique({
    where: { userId: u.id },
    include: {
      vendedor: { select: { name: true, telefone: true } },
      pedidos: { orderBy: { criadoEm: 'desc' }, take: 50, include: { itens: true } },
    },
  });

  return (
    <div className="py-8 max-w-4xl">
      <CabecalhoPagina sobre="Minha conta" titulo={`Olá, ${u.name.split(' ')[0]}`}
        acoes={<form action={sair}><button className="rotulo underline underline-offset-4 text-suave">Sair</button></form>}>
        {cliente?.vendedor && <>Quem te atende: <strong className="text-marrom-950">{cliente.vendedor.name}</strong>{cliente.vendedor.telefone ? ` · ${cliente.vendedor.telefone}` : ''}</>}
      </CabecalhoPagina>

      <h2 className="titulo text-xl mb-4">Meus pedidos</h2>
      {!cliente?.pedidos.length ? (
        <Vazio>Você ainda não enviou pedidos.<div className="mt-4"><BotaoLink href="/catalogo">Ver o catálogo</BotaoLink></div></Vazio>
      ) : (
        <div className="grid gap-4">
          {cliente.pedidos.map(p => (
            <Cartao key={p.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-extrabold text-lg">{p.codigo}</span>
                  <EtiquetaTipo tipo={p.tipo} />
                  <EtiquetaStatus status={p.status} />
                </div>
                <span className="text-sm text-suave">{formatarDataHora(p.criadoEm)}</span>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {p.itens.map(i => (
                  <div key={i.id} className={`relative w-14 aspect-[3/4] bg-bege ${i.situacao === 'devolvido' ? 'opacity-40' : ''}`} title={`${i.nome} · Tam. ${i.tamanho}`}>
                    <Foto src={i.imagem} alt={i.nome} sizes="56px" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between text-sm">
                <span className="text-suave">{p.itens.reduce((a, i) => a + i.quantidade, 0)} peça(s){p.tipo === 'condicional' && p.status === 'confirmado' ? ` · ${p.itens.filter(i => i.situacao === 'vendido').length} ficaram` : ''}</span>
                <span className="font-display font-extrabold">{brl(p.total)}</span>
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </div>
  );
}
