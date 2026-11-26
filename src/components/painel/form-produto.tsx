import type { Custo, Produto, ProdutoImagem, ProdutoVideo } from '@prisma/client';
import { Campo, Formulario } from '@/components/ui/formulario';
import { IconeCabide, IconeDinheiro, IconeEtiqueta, IconeImagem } from '@/components/ui/icones';
import { salvarProduto } from '@/server/acoes/produtos';
import { FotosProduto } from './fotos-produto';
import { VideosProduto } from './videos-produto';
import { Acompanhamento, BarraSalvar, type AvisoExterno, type Etapa } from './produto/acompanhamento';
import { CampoCor, CampoTexto, EditorDestaques, Interruptor, PrecosProduto, Secao, SeletorCategoria, Segmentado } from './produto/campos';

type Props = {
  produto?: Produto & { imagens: ProdutoImagem[]; videos: ProdutoVideo[]; custo: Custo | null };
  marcas: { id: number; nome: string }[];
  categorias: { id: number; nome: string }[];
  /** Avisos que dependem do que está fora do formulário (estoque, por exemplo). */
  avisos?: AvisoExterno[];
};

const valor = (v: unknown) => (v == null ? '' : Number(String(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const ETAPAS: Etapa[] = [
  { id: 'identificacao', titulo: 'Identificação' },
  { id: 'midia', titulo: 'Fotos e vídeos' },
  { id: 'preco', titulo: 'Preço' },
  { id: 'detalhes', titulo: 'Detalhes' },
];

/**
 * Cadastro e edição de produto em etapas (visual 2026): cada bloco numerado explica para que serve; ao lado, a prévia do
 * card como a cliente vê, o andamento das etapas e os avisos; embaixo, a barra fixa de salvar. Os nomes dos campos são
 * os mesmos de antes, então `salvarProduto` não muda.
 */
export function FormProduto({ produto: p, marcas, categorias, avisos }: Props) {
  return (
    <Formulario acao={salvarProduto}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="grid gap-4 min-w-0">
          <Secao id="identificacao" numero={1} icone={<IconeEtiqueta />} titulo="Identificação" descricao="Código, nome, marca e categoria.">
            <div className="grid sm:grid-cols-3 gap-4">
              <CampoTexto nome="referencia" id="campo-referencia" rotulo="Referência" padrao={p?.referencia} placeholder="SC431GSI" maximo={20} maiusculas obrigatorio />
              <CampoTexto nome="nome" rotulo="Nome na loja" padrao={p?.nome} placeholder="Ex.: Camiseta Gola V - Off White" maximo={160} obrigatorio className="sm:col-span-2"
                ajuda={<>Termine com <strong>“ - Cor”</strong> para juntar as cores do mesmo modelo.</>} />
              <Campo nome="marcaId" rotulo="Marca" tipo="select" padrao={p?.marcaId} obrigatorio opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...marcas.map(m => ({ valor: String(m.id), rotulo: m.nome }))]} />
              <SeletorCategoria categorias={categorias} padrao={p?.categoriaId} />
              <Campo nome="subcategoria" rotulo="Modelagem" padrao={p?.subcategoria} placeholder="Slim, Oversized…" />
            </div>
          </Secao>

          <Secao id="midia" numero={2} icone={<IconeImagem />} titulo="Fotos e vídeos" descricao="A primeira foto é a capa; os vídeos entram depois dela.">
            <div className="grid gap-5">
              <FotosProduto inicial={p?.imagens.map(i => i.url) ?? []} />
              <div className="border-t border-borda pt-4">
                <VideosProduto inicial={p?.videos.map(v => ({ url: v.url, capa: v.capa })) ?? []} />
              </div>
            </div>
          </Secao>

          <Secao id="preco" numero={3} icone={<IconeDinheiro />} titulo="Preço" descricao="Preço cheio maior que o de venda vira promoção.">
            <PrecosProduto preco={valor(p?.preco)} precoCheio={valor(p?.precoCheio)} custo={valor(p?.custo?.valor)} />
          </Secao>

          <Secao id="detalhes" numero={4} icone={<IconeCabide />} titulo="Detalhes" descricao="Filtros da vitrine e texto da página da peça.">
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Segmentado nome="genero" rotulo="Gênero" padrao={p?.genero} obrigatorio
                  opcoes={[{ valor: 'feminino', rotulo: 'Feminino' }, { valor: 'masculino', rotulo: 'Masculino' }, { valor: 'unissex', rotulo: 'Unissex' }]} />
                <Segmentado nome="estacao" rotulo="Estação" padrao={p?.estacao ?? ''}
                  opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'inverno', rotulo: 'Inverno' }, { valor: 'verao', rotulo: 'Verão' }]} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <CampoCor padrao={p?.cor} />
                <CampoTexto nome="composicao" rotulo="Composição" padrao={p?.composicao} placeholder="Ex.: 95% algodão, 5% elastano" maximo={500} />
              </div>
              <CampoTexto nome="descricao" rotulo="Descrição" padrao={p?.descricao} linhas={4} maximo={4000} placeholder="Caimento, tecido, como usar e com o que combinar…" />
              <EditorDestaques padrao={Array.isArray(p?.destaques) ? (p.destaques as string[]) : []} />
            </div>
          </Secao>
        </div>

        <aside className="grid gap-4 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto sem-barra xl:pb-20">
          <div className="cartao bg-card border border-borda rounded-[1.25rem] px-4 py-2 divide-y divide-borda">
            <Interruptor nome="ativo" titulo="Ativo no catálogo" descricao="Desligado, some da loja." padrao={p?.ativo ?? true} tom="oliva" />
            <Interruptor nome="imperdivel" titulo="Imperdível" descricao="Selo vermelho de destaque." padrao={p?.imperdivel ?? false} tom="imperdivel" />
          </div>
          <Acompanhamento etapas={ETAPAS} novo={!p} avisos={avisos} />
        </aside>
      </div>
      <BarraSalvar rotulo={p ? 'Salvar produto' : 'Cadastrar produto'} novo={!p} />
    </Formulario>
  );
}
