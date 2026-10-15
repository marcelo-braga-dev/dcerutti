import { CartaoProduto } from '@/components/loja/cartao-produto';
import { Vazio } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { catalogo } from '@/server/catalogo';
import { lerConfig } from '@/server/config';
import { favoritosDoClienteLogado } from '@/server/consultas/clientes';
import { exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Favoritos' };

/** Peças guardadas com o coração (D-22), da mais recente para a mais antiga. As que saíram do catálogo não aparecem. */
export default async function Favoritos() {
  const u = await exigirPapel(['cliente']);
  const [ids, lista, cfg] = await Promise.all([favoritosDoClienteLogado(u), catalogo(), lerConfig()]);
  const porId = new Map(lista.map(p => [p.id, p]));
  const produtos = ids.flatMap(id => porId.get(id) ?? []);
  const fora = ids.length - produtos.length;

  return (
    <>
      <div className="mb-6">
        <h2 className="titulo text-xl">Favoritos</h2>
        <p className="mt-1 text-sm text-suave">
          {produtos.length ? `${produtos.length} ${produtos.length === 1 ? 'peça guardada' : 'peças guardadas'}. Toque no coração para tirar.` : 'Toque no coração de uma peça para guardar aqui.'}
          {fora > 0 && ` ${fora} ${fora === 1 ? 'saiu' : 'saíram'} do catálogo.`}
        </p>
      </div>
      {produtos.length === 0 ? (
        <Vazio>Nenhuma peça guardada ainda.<div className="mt-4"><BotaoLink href="/catalogo">Ver o catálogo</BotaoLink></div></Vazio>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
          {produtos.map(p => <CartaoProduto key={p.id} p={p} parcelas={cfg.parcelas} />)}
        </div>
      )}
    </>
  );
}
