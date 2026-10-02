import type { Custo, Produto, ProdutoImagem } from '@prisma/client';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { salvarProduto } from '@/server/acoes/produtos';
import { EnviarFotos } from './enviar-fotos';

type Props = {
  produto?: Produto & { imagens: ProdutoImagem[]; custo: Custo | null };
  marcas: { id: number; nome: string }[];
  categorias: { id: number; nome: string }[];
};

const valor = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));

export function FormProduto({ produto: p, marcas, categorias }: Props) {
  return (
    <Formulario acao={salvarProduto} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Campo nome="referencia" rotulo="Referência" padrao={p?.referencia} placeholder="SC431GSI" />
      <Campo nome="nome" rotulo="Nome" padrao={p?.nome} className="sm:col-span-1 lg:col-span-2" />
      <Campo nome="marcaId" rotulo="Marca" tipo="select" padrao={p?.marcaId} opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...marcas.map(m => ({ valor: String(m.id), rotulo: m.nome }))]} />
      <Campo nome="categoriaId" rotulo="Categoria" tipo="select" padrao={p?.categoriaId}
        opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...categorias.map(c => ({ valor: String(c.id), rotulo: c.nome })), { valor: 'nova', rotulo: '+ Nova categoria…' }]} />
      <Campo nome="novaCategoria" rotulo="Nova categoria" placeholder="Só se escolheu “Nova categoria”" />
      <Campo nome="genero" rotulo="Gênero" tipo="select" padrao={p?.genero ?? ''} opcoes={[{ valor: '', rotulo: 'Escolha…' }, { valor: 'feminino', rotulo: 'Feminino' }, { valor: 'masculino', rotulo: 'Masculino' }, { valor: 'unissex', rotulo: 'Unissex' }]} />
      <Campo nome="estacao" rotulo="Estação" tipo="select" padrao={p?.estacao ?? ''} opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'inverno', rotulo: 'Inverno' }, { valor: 'verao', rotulo: 'Verão' }]} />
      <Campo nome="cor" rotulo="Cor" padrao={p?.cor} />
      <Campo nome="preco" rotulo="Preço de venda (R$)" padrao={valor(p?.preco)} />
      <Campo nome="precoCheio" rotulo="Preço cheio (R$)" padrao={valor(p?.precoCheio)} ajuda="Maior que o preço de venda = promoção." />
      <Campo nome="custo" rotulo="Custo (R$) · só gestor" padrao={valor(p?.custo?.valor)} />
      <Campo nome="subcategoria" rotulo="Subcategoria / modelagem" padrao={p?.subcategoria} />
      <div className="flex flex-col justify-end gap-3 lg:col-span-2">
        <Campo nome="imperdivel" rotulo="Imperdível (destaque em vermelho)" tipo="checkbox" padrao={p?.imperdivel ?? false} />
        <Campo nome="ativo" rotulo="Ativo no catálogo" tipo="checkbox" padrao={p?.ativo ?? true} />
      </div>
      <Campo nome="descricao" rotulo="Descrição" tipo="textarea" linhas={5} padrao={p?.descricao} className="sm:col-span-2 lg:col-span-3" />
      <Campo nome="composicao" rotulo="Composição" padrao={p?.composicao} className="sm:col-span-2 lg:col-span-3" />
      <Campo nome="destaques" rotulo="Destaques (um por linha)" tipo="textarea" linhas={3} padrao={Array.isArray(p?.destaques) ? (p.destaques as string[]).join('\n') : ''} className="sm:col-span-2 lg:col-span-3" />
      <div className="sm:col-span-2 lg:col-span-3 grid gap-2">
        <Campo nome="imagens" rotulo="Fotos (uma por linha, na ordem de exibição)" tipo="textarea" linhas={4} padrao={p?.imagens.map(i => i.url).join('\n')} />
        <EnviarFotos campoId="campo-imagens" />
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><BotaoEnviar>{p ? 'Salvar produto' : 'Cadastrar produto'}</BotaoEnviar></div>
    </Formulario>
  );
}
