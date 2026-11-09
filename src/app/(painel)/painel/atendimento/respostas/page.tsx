import { notFound } from 'next/navigation';
import { CabecalhoPagina, Cartao, Etiqueta, Vazio } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { BotaoAcao } from '@/components/ui/botao-acao';
import { BotaoEnviar, Campo, Formulario } from '@/components/ui/formulario';
import { VARIAVEIS_RESPOSTA } from '@/lib/atendimento';
import { apagarResposta, gravarResposta } from '@/server/acoes/atendimento';
import { atendimentoLigado, respostasPara } from '@/server/consultas/atendimento';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Respostas prontas' };

const variaveis = VARIAVEIS_RESPOSTA.map(v => `{${v}}`).join(', ');

export default async function Respostas() {
  const u = await exigirPapel(EQUIPE);
  if (!(await atendimentoLigado())) notFound();
  const respostas = await respostasPara(u);
  const gestor = u.papel === 'gestor';
  return (
    <>
      <CabecalhoPagina sobre="Atendimento" titulo="Respostas prontas">
        Modelos para falar com as clientes. Variáveis: {variaveis}. A mensagem sempre pode ser ajustada antes de enviar.
      </CabecalhoPagina>
      <div className="grid lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="grid gap-3 min-w-0">
          {respostas.length === 0 && <Vazio>Nenhuma resposta ainda.</Vazio>}
          {respostas.map(r => {
            const podeEditar = r.usuarioId ? r.usuarioId === u.id : gestor;
            return (
              <Cartao key={r.id} className="p-4">
                <Etiqueta cor={r.usuarioId ? 'contorno' : 'bege'}>{r.usuarioId ? 'Minha' : 'Da loja'}</Etiqueta>
                {podeEditar ? (
                  <Formulario acao={gravarResposta} prefixo={`resposta-${r.id}-`} className="grid gap-3 mt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Campo nome="titulo" rotulo="Título" padrao={r.titulo} />
                    <Campo nome="texto" rotulo="Texto" tipo="textarea" linhas={3} padrao={r.texto} />
                    <div className="flex flex-wrap items-start gap-2">
                      <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
                      <BotaoAcao acao={apagarResposta.bind(null, r.id)} confirmar={`Apagar a resposta "${r.titulo}"?`} className={botao('perigo')}>Apagar</BotaoAcao>
                    </div>
                  </Formulario>
                ) : (
                  <>
                    <h2 className="font-semibold text-marrom-950 mt-2">{r.titulo}</h2>
                    <p className="text-sm whitespace-pre-line text-suave">{r.texto}</p>
                  </>
                )}
              </Cartao>
            );
          })}
        </div>
        <Cartao className="p-5">
          <h2 className="titulo text-lg mb-3">Nova resposta</h2>
          <Formulario acao={gravarResposta} limparAoConcluir prefixo="nova-resposta-" className="grid gap-3">
            <Campo nome="titulo" rotulo="Título" placeholder="Boas-vindas" />
            <Campo nome="texto" rotulo="Texto" tipo="textarea" linhas={4} placeholder="Oi, {nome}! Aqui é {vendedora}…" />
            {gestor && <Campo nome="daLoja" rotulo="Disponível para toda a equipe" tipo="checkbox" padrao />}
            <div><BotaoEnviar>Criar resposta</BotaoEnviar></div>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
