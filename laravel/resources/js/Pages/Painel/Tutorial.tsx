import { Head } from '@inertiajs/react';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import PainelLayout from '@/Layouts/PainelLayout';
import { CabecalhoPagina, Etiqueta } from '@/Components/ui/Basicos';

/** `onde`: caminhos até a página, cada um como trilha (Menu lateral › Seção › Item › aba). */
type Topico = { id: string; titulo: string; resumo: string; onde: string[][]; passos: string[]; links?: { href: string; rotulo: string }[]; soGestor?: boolean };

/** Tutorial da equipe (src/app/(painel)/painel/tutorial/page.tsx): o essencial de cada área, com o atalho para a página. */
export default function Tutorial({ gestor, atendimento, vitrines, cupons }: { gestor: boolean; atendimento: boolean; vitrines: boolean; cupons: boolean }) {
  const topicos: (Topico | false)[] = [
    {
      id: 'inicio', titulo: gestor ? 'Início' : 'Meu painel', resumo: 'É a tela que abre quando você entra. Ela reúne o que precisa da sua atenção hoje e mostra como estão as vendas, para você saber por onde começar.',
      onde: [['Menu lateral', gestor ? 'Início' : 'Meu painel']],
      passos: [
        'Mostra primeiro o que pede ação: pedidos parados, clientes para chamar e sugestões sem resposta.',
        gestor ? 'Acompanhe as vendas do mês e a meta da loja.' : 'Acompanhe suas vendas do mês e quanto falta para a meta.',
        'O sino no topo avisa pedido novo, sacola parada, prazo vencendo e mais.',
      ],
      links: [{ href: '/painel', rotulo: 'Abrir' }, { href: '/painel/notificacoes', rotulo: 'Notificações' }],
    },
    atendimento && {
      id: 'atendimento', titulo: 'Atendimento', resumo: 'Aqui você organiza as conversas com as clientes, do primeiro contato até a venda. Cada conversa vira um atendimento, para nenhuma cliente ficar sem resposta ou sem retorno.',
      onde: [['Menu lateral', 'Vendas', 'Atendimento', 'abas Hoje · Todos · Respostas prontas']],
      passos: [
        'Em “Hoje” fica a fila do dia, em ordem de urgência.',
        'Crie um atendimento com nome e WhatsApp ou Instagram. Se o contato já tem vendedora, ele vai para ela.',
        'Registre cada contato e marque a data do próximo retorno. A plataforma lembra você.',
        'Use as “Respostas prontas” para não digitar a mesma mensagem sempre.',
      ],
      links: [{ href: '/painel/atendimento', rotulo: 'Fila de hoje' }, { href: '/painel/atendimento/novo', rotulo: 'Novo atendimento' }],
    },
    {
      id: 'clientes', titulo: gestor ? 'Clientes' : 'Meus clientes', resumo: 'É a sua carteira de clientes. Cada uma tem uma ficha com contato, compras e o que ela olhou na loja, para você atender sabendo do que ela gosta.',
      onde: [['Menu lateral', 'Clientes', gestor ? 'Clientes' : 'Meus clientes', `abas ${gestor ? 'Clientes' : 'Meus clientes'} · Interesse`]],
      passos: [
        'Cadastre com nome e WhatsApp. O resto pode ficar para depois.',
        'Na ficha você vê pedidos, compras, o que ela olhou na loja e o que deixou na sacola.',
        'Pela ficha dá para chamar no WhatsApp, enviar uma peça ou montar uma sugestão.',
        'Em “Interesse” você vê o que as clientes estão procurando e separando na loja.',
      ],
      links: [{ href: '/painel/clientes', rotulo: 'Clientes' }, { href: '/painel/clientes/novo', rotulo: 'Novo cliente' }, { href: '/painel/interesse', rotulo: 'Interesse' }],
    },
    {
      id: 'pedidos', titulo: 'Pedidos', resumo: 'Reúne os pedidos que chegam pela loja online e os que você cria. É onde você confirma, cancela e acompanha cada pedido até virar venda.',
      onde: [['Menu lateral', 'Vendas', 'Pedidos', `abas Pedidos · ${gestor ? 'Vendas do mês' : 'Minhas vendas'}`]],
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
      id: 'caixa', titulo: 'Caixa da loja', resumo: 'É a tela para registrar vendas feitas pessoalmente na loja física. A venda entra no seu resultado e a peça sai do estoque na hora.',
      onde: [['Menu lateral', 'Caixa da loja']],
      passos: [
        'Abre em tela cheia. Busque a peça pelo nome ou pelo código e escolha o tamanho.',
        'Escolha a cliente (ou “Consumidor final”) e a forma de pagamento.',
        'Ao finalizar, a venda é registrada e a peça sai do estoque.',
      ],
      links: [{ href: '/caixa', rotulo: 'Abrir o caixa' }],
    },
    {
      id: 'sugestoes', titulo: 'Sugestões', resumo: 'Serve para mandar uma seleção de peças escolhidas por você para uma cliente. Ela recebe um link, responde do celular e o que ela quiser vira pedido.',
      onde: [['Menu lateral', 'Vendas', 'Sugestões']],
      passos: [
        'Escolha a cliente, as peças e, se quiser, um preço especial ou uma nota.',
        'Envie o link pelo WhatsApp. Ela abre sem precisar de login e responde em cada peça: quero, talvez ou não.',
        'Você vê quem abriu e quem respondeu. O que ela quiser vira pedido.',
      ],
      links: [{ href: '/painel/sugestoes', rotulo: 'Sugestões' }, { href: '/painel/sugestoes/nova', rotulo: 'Montar sugestão' }],
    },
    {
      id: 'peca', titulo: 'Enviar uma peça', resumo: 'É o jeito mais rápido de mostrar uma peça para uma cliente pelo WhatsApp. O link, as fotos e o texto já vão prontos, e ela pode comprar por ali.',
      onde: [['Menu lateral', 'Clientes', gestor ? 'Clientes' : 'Meus clientes', 'abrir a cliente', 'botão Enviar na peça']],
      passos: [
        'Na ficha da cliente ou na busca, use “Enviar peça”.',
        'Ela recebe o link com o seu nome (“Ana separou esta peça para você”) e pode comprar por ali.',
        'No celular, as fotos e os vídeos vão direto para o WhatsApp.',
      ],
      links: [{ href: '/painel/clientes', rotulo: 'Ir para clientes' }],
    },
    vitrines && {
      id: 'vitrines', titulo: 'Vitrines', resumo: 'Cria uma página com as peças de uma live, post, reels ou story. Você coloca o link no Instagram e acompanha quem visitou e o que vendeu.',
      onde: [['Menu lateral', 'Vendas', 'Vitrines']],
      passos: [
        'Crie a vitrine, escolha as peças e, se quiser, um preço de oferta com prazo.',
        'Coloque o link no Instagram. Os pedidos e atendimentos que chegarem por ali já ficam marcados.',
        'Acompanhe as visitas e as vendas de cada vitrine.',
      ],
      links: [{ href: '/painel/vitrines', rotulo: 'Vitrines' }, { href: '/painel/vitrines/nova', rotulo: 'Nova vitrine' }],
    },
    cupons && {
      id: 'cupons', titulo: 'Cupons', resumo: gestor ? 'Aqui você cria os descontos da loja e as campanhas que mandam cupons sozinhas. Ajuda a trazer clientes novas e a fazer quem já comprou voltar.' : 'Mostra os cupons de desconto ativos na loja. Use para incentivar a cliente a fechar a compra.',
      onde: [['Menu lateral', 'Clientes', 'Cupons', ...(gestor ? ['abas Cupons · Campanhas'] : [])]],
      passos: gestor
        ? ['Crie cupons de porcentagem, de valor ou de frete grátis, com prazo e limite de uso.', 'Em “Campanhas”, ligue o cupom de primeira compra e o de próxima compra, que são enviados sozinhos.', 'Veja quantas vezes cada cupom foi usado e quanto de desconto ele deu.']
        : ['Veja os cupons ativos e copie o código para mandar à cliente.', 'A cliente usa o código na sacola. Você também pode aplicá-lo no pedido.'],
      links: [{ href: '/painel/cupons', rotulo: 'Cupons' }],
    },
    gestor && {
      id: 'produtos', titulo: 'Produtos e estoque', resumo: 'É o catálogo da loja: as peças, os preços, as fotos e o estoque de cada tamanho. O que estiver aqui e ativo aparece para as clientes.', soGestor: true,
      onde: [['Menu lateral', 'Gestão', 'Produtos', 'abas Produtos e estoque · Importar estoque']],
      passos: [
        'Cadastre ou edite peças: fotos, vídeos, preço, tamanhos e estoque.',
        'Em “Importar estoque”, envie a planilha do sistema da loja. A plataforma mostra uma prévia antes de gravar.',
        'Peça inativa some da loja, mas continua no histórico.',
      ],
      links: [{ href: '/painel/produtos', rotulo: 'Produtos' }, { href: '/painel/produtos/importar', rotulo: 'Importar estoque' }],
    },
    gestor && {
      id: 'resultados', titulo: 'Resultados', resumo: 'Mostra o desempenho da loja no período: quanto vendeu, o ticket médio e o resultado de cada vendedora, para você acompanhar e decidir.', soGestor: true,
      onde: [['Menu lateral', 'Gestão', 'Resultados', 'abas Resultados · Pagamentos online']],
      passos: ['Vendas, ticket médio e desempenho de cada vendedora no período.', 'Se o pagamento online estiver ligado, confira em “Pagamentos online” o que entrou, as taxas e o valor líquido.'],
      links: [{ href: '/painel/resultados', rotulo: 'Resultados' }],
    },
    gestor && {
      id: 'equipe', titulo: 'Equipe', resumo: 'Aqui você cuida da equipe: cadastra vendedoras, define as metas, acompanha o que cada uma fez e organiza os números de WhatsApp da loja.', soGestor: true,
      onde: [['Menu lateral', 'Gestão', 'Equipe', 'abas Vendedores · Acompanhamento · Atendimento da equipe · Números de WhatsApp']],
      passos: [
        'Cadastre vendedoras e defina a meta do mês de cada uma.',
        'Em “Acompanhamento”, veja o que cada uma fez: logins, pedidos, contatos.',
        'Em “Números de WhatsApp”, decida quem usa cada número da loja.',
      ],
      links: [{ href: '/painel/vendedores', rotulo: 'Vendedores' }, { href: '/painel/equipe', rotulo: 'Acompanhamento' }, { href: '/painel/numeros', rotulo: 'Números' }],
    },
    gestor && {
      id: 'configuracoes', titulo: 'Configurações', resumo: 'Reúne as regras e a aparência da loja: frete, prazos, pagamento online, cores, logo e os textos da página inicial. Mexa só quando precisar mudar algo da loja toda.', soGestor: true,
      onde: [['Menu lateral', 'Gestão', 'Configurações', 'abas Geral · Pagamento online · Identidade visual · Página inicial']],
      passos: ['Frete, prazos, condicional, atendimento e vitrines.', 'Pagamento online (Mercado Pago), cores e logo da loja, e textos da página inicial.'],
      links: [{ href: '/painel/configuracoes', rotulo: 'Configurações' }],
    },
  ];
  const lista = topicos.filter((t): t is Topico => !!t);

  return (
    <PainelLayout titulo="Como usar">
      <Head title="Como usar" />
      <Box sx={{ maxWidth: 900 }}>
        <CabecalhoPagina sobre="Tutorial" titulo="Como usar a plataforma">O essencial de cada área, em poucas linhas. Toque em um botão para ir direto à página.</CabecalhoPagina>
        <Card sx={{ mb: 3 }}><CardContent>
          <Typography variant="overline" color="secondary">Sua rotina em 4 passos</Typography>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
            {[['1', 'Abra o painel', 'veja o que pede ação e as notificações.'], ['2', 'Responda os pedidos', 'confirme ou cancele os pendentes antes do prazo.'],
              ['3', 'Fale com as clientes', 'faça os retornos, envie peças e sugestões.'], ['4', 'Venda no balcão', 'use o caixa da loja para vendas presenciais.']].map(([n, t, d]) => (
              <Stack component="li" key={n} direction="row" sx={{ gap: 1.5, fontSize: 14 }}>
                <Box sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{n}</Box>
                <span><strong>{t}:</strong> {d}</span>
              </Stack>
            ))}
          </Box>
        </CardContent></Card>
        <Card sx={{ mb: 3 }}><CardContent>
          <Typography variant="overline" color="secondary">Como achar as coisas</Typography>
          <Stack component="ul" sx={{ m: 0, pl: 2.5, gap: 1, fontSize: 14 }}>
            <li><strong>Menu lateral:</strong> à esquerda, em seções. No celular, toque no ícone de menu no canto superior esquerdo.</li>
            <li><strong>Abas:</strong> quando uma área tem mais de uma página, elas aparecem como abas no topo.</li>
            <li><strong>Este tutorial:</strong> Menu lateral › Ajuda › Como usar.</li>
          </Stack>
        </CardContent></Card>
        <Stack component="nav" aria-label="Tópicos" direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 3 }}>
          {lista.map(t => <Chip key={t.id} component="a" href={`#${t.id}`} clickable variant="outlined" label={t.titulo} />)}
        </Stack>
        <Stack sx={{ gap: 2 }}>
          {lista.map(t => (
            <Card key={t.id} id={t.id} sx={{ scrollMarginTop: 96 }}><CardContent>
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}><Typography variant="h6">{t.titulo}</Typography>{t.soGestor && <Etiqueta>Só gestor</Etiqueta>}</Stack>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>{t.resumo}</Typography>
              <Box sx={{ mt: 1.5, bgcolor: 'marca.bege', px: 1.5, py: 1, borderRadius: 1.5, fontSize: 14 }}>
                <Typography variant="overline" color="secondary" sx={{ fontSize: 10 }}>Onde encontrar</Typography>
                {t.onde.map(c => <Box key={c.join()}>{c.map((parte, i) => <span key={i}>{i > 0 && <Box component="span" sx={{ color: 'text.secondary', mx: 0.75 }}>›</Box>}<Box component="span" sx={{ fontWeight: i === c.length - 1 ? 600 : 400 }}>{parte}</Box></span>)}</Box>)}
              </Box>
              <Box component="ul" sx={{ mt: 1.5, mb: 0, pl: 2.5, fontSize: 14, '& li': { mb: 0.75 } }}>{t.passos.map(p => <li key={p}>{p}</li>)}</Box>
              {t.links && <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2 }}>{t.links.map((l, i) => <Button key={l.href} size="small" variant={i === 0 ? 'contained' : 'outlined'} href={l.href}>{l.rotulo}</Button>)}</Stack>}
            </CardContent></Card>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>Dúvida em uma tela? Use a busca no topo para achar clientes, pedidos e peças de qualquer lugar.</Typography>
      </Box>
    </PainelLayout>
  );
}
