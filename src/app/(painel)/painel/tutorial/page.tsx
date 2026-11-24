import { CabecalhoPagina, Cartao, Etiqueta } from '@/components/ui/basicos';
import { BotaoLink } from '@/components/ui/botao';
import { lerConfig } from '@/server/config';
import { EQUIPE, exigirPapel } from '@/server/permissoes';

export const metadata = { title: 'Como usar' };

type Topico = { id: string; titulo: string; resumo: string; passos: string[]; links?: { href: string; rotulo: string }[]; soGestor?: boolean };

/** Tutorial da equipe: o essencial de cada área, em poucas linhas, com o atalho para a página. Mostra só o que a pessoa usa. */
export default async function Tutorial() {
  const [u, cfg] = await Promise.all([exigirPapel(EQUIPE), lerConfig()]);
  const gestor = u.papel === 'gestor';

  const topicos: (Topico | false)[] = [
    {
      id: 'inicio', titulo: gestor ? 'Início' : 'Meu painel', resumo: 'Sua primeira parada do dia.',
      passos: [
        'Mostra primeiro o que pede ação: pedidos parados, clientes para chamar e sugestões sem resposta.',
        gestor ? 'Acompanhe as vendas do mês e a meta da loja.' : 'Acompanhe suas vendas do mês e quanto falta para a meta.',
        'O sino no topo avisa pedido novo, sacola parada, prazo vencendo e mais.',
      ],
      links: [{ href: '/painel', rotulo: 'Abrir' }, { href: '/painel/notificacoes', rotulo: 'Notificações' }],
    },
    cfg.atendimento.ligado && {
      id: 'atendimento', titulo: 'Atendimento', resumo: 'Cada conversa com uma cliente vira um atendimento.',
      passos: [
        'Em “Hoje” fica a fila do dia, em ordem de urgência.',
        'Crie um atendimento com nome e WhatsApp ou Instagram. Se o contato já tem vendedora, ele vai para ela.',
        'Registre cada contato e marque a data do próximo retorno. A plataforma lembra você.',
        'Use as “Respostas prontas” para não digitar a mesma mensagem sempre.',
      ],
      links: [{ href: '/painel/atendimento', rotulo: 'Fila de hoje' }, { href: '/painel/atendimento/novo', rotulo: 'Novo atendimento' }],
    },
    {
      id: 'clientes', titulo: gestor ? 'Clientes' : 'Meus clientes', resumo: 'A ficha de cada cliente, com tudo o que ela fez.',
      passos: [
        'Cadastre com nome e WhatsApp. O resto pode ficar para depois.',
        'Na ficha você vê pedidos, compras, o que ela olhou na loja e o que deixou na sacola.',
        'Pela ficha dá para chamar no WhatsApp, enviar uma peça ou montar uma sugestão.',
        'Em “Interesse” você vê o que as clientes estão procurando e separando na loja.',
      ],
      links: [{ href: '/painel/clientes', rotulo: 'Clientes' }, { href: '/painel/clientes/novo', rotulo: 'Novo cliente' }, { href: '/painel/interesse', rotulo: 'Interesse' }],
    },
    {
      id: 'pedidos', titulo: 'Pedidos', resumo: 'Tudo o que as clientes pediram, pela loja online ou por você.',
      passos: [
        'Compra: a cliente leva e paga. Condicional: ela prova em casa e paga só o que ficar.',
        'Pedido pendente tem prazo. Confirme ou cancele antes de vencer.',
        'Ao confirmar um condicional, marque quais peças ficaram. A venda e o estoque se ajustam sozinhos.',
        'Para cancelar, é preciso dizer o motivo. Ele fica no histórico do pedido.',
        'Você também pode criar o pedido pela cliente em “Novo pedido”.',
      ],
      links: [{ href: '/painel/pedidos', rotulo: 'Pedidos' }, { href: '/painel/pedidos/novo', rotulo: 'Novo pedido' }, { href: '/painel/vendas', rotulo: gestor ? 'Vendas do mês' : 'Minhas vendas' }],
    },
    {
      id: 'caixa', titulo: 'Caixa da loja', resumo: 'Venda no balcão da loja física.',
      passos: [
        'Abre em tela cheia. Busque a peça pelo nome ou pelo código e escolha o tamanho.',
        'Escolha a cliente (ou “Consumidor final”) e a forma de pagamento.',
        'Ao finalizar, a venda é registrada e a peça sai do estoque.',
      ],
      links: [{ href: '/caixa', rotulo: 'Abrir o caixa' }],
    },
    {
      id: 'sugestoes', titulo: 'Sugestões', resumo: 'Monte uma seleção de peças e mande o link para a cliente.',
      passos: [
        'Escolha a cliente, as peças e, se quiser, um preço especial ou uma nota.',
        'Envie o link pelo WhatsApp. Ela abre sem precisar de login e responde em cada peça: quero, talvez ou não.',
        'Você vê quem abriu e quem respondeu. O que ela quiser vira pedido.',
      ],
      links: [{ href: '/painel/sugestoes', rotulo: 'Sugestões' }, { href: '/painel/sugestoes/nova', rotulo: 'Montar sugestão' }],
    },
    {
      id: 'peca', titulo: 'Enviar uma peça', resumo: 'Mande uma peça com link, fotos e texto prontos.',
      passos: [
        'Na ficha da cliente ou na busca, use “Enviar peça”.',
        'Ela recebe o link com o seu nome (“Ana separou esta peça para você”) e pode comprar por ali.',
        'No celular, as fotos e os vídeos vão direto para o WhatsApp.',
      ],
      links: [{ href: '/painel/clientes', rotulo: 'Ir para clientes' }],
    },
    cfg.vitrines.ligadas && {
      id: 'vitrines', titulo: 'Vitrines', resumo: 'Uma página com as peças de uma live, um post ou um story.',
      passos: [
        'Crie a vitrine, escolha as peças e, se quiser, um preço de oferta com prazo.',
        'Coloque o link no Instagram. Os pedidos e atendimentos que chegarem por ali já ficam marcados.',
        'Acompanhe as visitas e as vendas de cada vitrine.',
      ],
      links: [{ href: '/painel/vitrines', rotulo: 'Vitrines' }, { href: '/painel/vitrines/nova', rotulo: 'Nova vitrine' }],
    },
    cfg.cupons.ligados && {
      id: 'cupons', titulo: 'Cupons', resumo: gestor ? 'Crie descontos e campanhas automáticas.' : 'Os cupons que você pode divulgar.',
      passos: gestor
        ? ['Crie cupons de porcentagem, de valor ou de frete grátis, com prazo e limite de uso.', 'Em “Campanhas”, ligue o cupom de primeira compra e o de próxima compra, que são enviados sozinhos.', 'Veja quantas vezes cada cupom foi usado e quanto de desconto ele deu.']
        : ['Veja os cupons ativos e copie o código para mandar à cliente.', 'A cliente usa o código na sacola. Você também pode aplicá-lo no pedido.'],
      links: [{ href: '/painel/cupons', rotulo: 'Cupons' }],
    },
    gestor && {
      id: 'produtos', titulo: 'Produtos e estoque', resumo: 'O catálogo da loja.', soGestor: true,
      passos: [
        'Cadastre ou edite peças: fotos, vídeos, preço, tamanhos e estoque.',
        'Em “Importar estoque”, envie a planilha do sistema da loja. A plataforma mostra uma prévia antes de gravar.',
        'Peça inativa some da loja, mas continua no histórico.',
      ],
      links: [{ href: '/painel/produtos', rotulo: 'Produtos' }, { href: '/painel/produtos/importar', rotulo: 'Importar estoque' }],
    },
    gestor && {
      id: 'resultados', titulo: 'Resultados', resumo: 'Os números da loja.', soGestor: true,
      passos: ['Vendas, ticket médio e desempenho de cada vendedora no período.', 'Se o pagamento online estiver ligado, confira em “Pagamentos online” o que entrou, as taxas e o valor líquido.'],
      links: [{ href: '/painel/resultados', rotulo: 'Resultados' }],
    },
    gestor && {
      id: 'equipe', titulo: 'Equipe', resumo: 'Vendedoras, metas e números de WhatsApp.', soGestor: true,
      passos: [
        'Cadastre vendedoras e defina a meta do mês de cada uma.',
        'Em “Acompanhamento”, veja o que cada uma fez: logins, pedidos, contatos.',
        'Em “Números de WhatsApp”, decida quem usa cada número da loja.',
      ],
      links: [{ href: '/painel/vendedores', rotulo: 'Vendedores' }, { href: '/painel/equipe', rotulo: 'Acompanhamento' }, { href: '/painel/numeros', rotulo: 'Números' }],
    },
    gestor && {
      id: 'configuracoes', titulo: 'Configurações', resumo: 'Ajustes gerais da loja.', soGestor: true,
      passos: ['Frete, prazos, condicional, atendimento e vitrines.', 'Pagamento online (Mercado Pago), cores e logo da loja, e textos da página inicial.'],
      links: [{ href: '/painel/configuracoes', rotulo: 'Configurações' }],
    },
  ];
  const lista = topicos.filter((t): t is Topico => !!t);

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina sobre="Tutorial" titulo="Como usar a plataforma">
        O essencial de cada área, em poucas linhas. Toque em um botão para ir direto à página.
      </CabecalhoPagina>

      <Cartao className="p-5 mb-6">
        <div className="rotulo text-caramelo mb-3">Sua rotina em 4 passos</div>
        <ol className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            ['1', 'Abra o painel', 'veja o que pede ação e as notificações.'],
            ['2', 'Responda os pedidos', 'confirme ou cancele os pendentes antes do prazo.'],
            ['3', 'Fale com as clientes', 'faça os retornos, envie peças e sugestões.'],
            ['4', 'Venda no balcão', 'use o caixa da loja para vendas presenciais.'],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3">
              <span className="grid place-items-center size-7 shrink-0 rounded-full bg-marrom-950 text-creme text-xs font-bold">{n}</span>
              <span><strong>{t}:</strong> {d}</span>
            </li>
          ))}
        </ol>
      </Cartao>

      <nav aria-label="Tópicos" className="flex flex-wrap gap-2 mb-6">
        {lista.map(t => <a key={t.id} href={`#${t.id}`} className="px-3 py-1.5 text-sm border border-borda-forte hover:bg-bege">{t.titulo}</a>)}
      </nav>

      <div className="space-y-4">
        {lista.map(t => (
          <Cartao key={t.id} className="p-5 scroll-mt-24">
            <section id={t.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="titulo text-xl">{t.titulo}</h2>
                {t.soGestor && <Etiqueta cor="contorno">Só gestor</Etiqueta>}
              </div>
              <p className="mt-1 text-suave">{t.resumo}</p>
              <ul className="mt-3 space-y-1.5 text-sm list-disc pl-5">
                {t.passos.map(p => <li key={p}>{p}</li>)}
              </ul>
              {t.links && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {t.links.map((l, i) => <BotaoLink key={l.href} href={l.href} variante={i === 0 ? 'primario' : 'secundario'} tamanho="p">{l.rotulo}</BotaoLink>)}
                </div>
              )}
            </section>
          </Cartao>
        ))}
      </div>

      <p className="mt-6 text-sm text-suave">Dúvida em uma tela? Use a busca no topo para achar clientes, pedidos e peças de qualquer lugar.</p>
    </div>
  );
}
