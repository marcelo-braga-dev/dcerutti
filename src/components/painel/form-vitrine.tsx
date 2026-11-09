import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { paraCampoDataHora } from '@/lib/datas';
import { TIPOS_VITRINE, type TipoVitrine } from '@/lib/vitrines';
import { salvarVitrine } from '@/server/acoes/vitrines';

type Dados = { id: string; tipo: string; titulo: string; descricao: string | null; urlInstagram: string | null; legenda: string | null; inicioPrevisto: Date | null; ofertaAte: Date | null; responsavelId: string };

/** Dados da vitrine. O tipo só muda antes de criar: define o que a página mostra. */
export function FormVitrine({ vitrine, vendedoras, legendaSugerida }: { vitrine?: Dados; vendedoras?: { id: string; name: string }[]; legendaSugerida?: string }) {
  return (
    <Formulario acao={salvarVitrine} className="grid sm:grid-cols-2 gap-5">
      {vitrine && <input type="hidden" name="id" value={vitrine.id} />}
      {vitrine ? <input type="hidden" name="tipo" value={vitrine.tipo} /> : (
        <Campo nome="tipo" rotulo="Tipo" tipo="select" padrao="post" opcoes={(Object.keys(TIPOS_VITRINE) as TipoVitrine[]).map(t => ({ valor: t, rotulo: TIPOS_VITRINE[t] }))} />
      )}
      <Campo nome="titulo" rotulo="Título" padrao={vitrine?.titulo} placeholder="Novidades de inverno" className="sm:col-span-2" />
      <Campo nome="descricao" rotulo="Descrição (opcional)" tipo="textarea" linhas={2} padrao={vitrine?.descricao} className="sm:col-span-2" />
      <Campo nome="urlInstagram" rotulo="Link no Instagram" tipo="url" padrao={vitrine?.urlInstagram} placeholder="https://www.instagram.com/p/…" className="sm:col-span-2" ajuda="O link da publicação ou do perfil, onde a live vai acontecer." />
      <Campo nome="inicioPrevisto" rotulo="Data e hora da live" tipo="datetime-local" padrao={vitrine?.inicioPrevisto ? paraCampoDataHora(vitrine.inicioPrevisto) : ''} ajuda="Só para live." />
      <Campo nome="ofertaAte" rotulo="Preço especial até" tipo="datetime-local" padrao={vitrine?.ofertaAte ? paraCampoDataHora(vitrine.ofertaAte) : ''} ajuda="Em branco: enquanto a vitrine estiver ativa." />
      {vendedoras && (
        <Campo nome="responsavelId" rotulo="Quem atende os pedidos" tipo="select" padrao={vitrine?.responsavelId ?? ''} opcoes={[{ valor: '', rotulo: 'Escolha…' }, ...vendedoras.map(v => ({ valor: v.id, rotulo: v.name }))]} />
      )}
      <Campo nome="legenda" rotulo="Legenda para o Instagram" tipo="textarea" linhas={4} padrao={vitrine?.legenda ?? legendaSugerida} className="sm:col-span-2" ajuda="Links em legendas não abrem no Instagram: por isso, a legenda aponta para o link da bio." />
      <div className="sm:col-span-2"><BotaoEnviar>{vitrine ? 'Salvar' : 'Criar vitrine'}</BotaoEnviar></div>
    </Formulario>
  );
}
