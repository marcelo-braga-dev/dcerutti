import { Sacola } from '@/components/loja/sacola-pagina';
import { lerConfig } from '@/server/config';
import { cepDoClienteLogado } from '@/server/consultas/clientes';
import { usuarioAtual } from '@/server/permissoes';

export const metadata = { title: 'Sacola' };

export default async function PaginaSacola() {
  const [u, cfg] = await Promise.all([usuarioAtual(), lerConfig()]);
  const cepInicial = u ? await cepDoClienteLogado(u) : null;
  return (
    <Sacola
      usuario={u ? { nome: u.name, papel: u.papel } : null}
      frete={cfg.frete}
      cepsCondicional={cfg.cepsCondicional}
      cidadeCondicional={cfg.cidadeCondicional}
      cepInicial={cepInicial}
    />
  );
}
