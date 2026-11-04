import { BotaoLink } from '@/components/ui/botao';

export default function NaoEncontrado() {
  return (
    <div className="my-6 sm:my-10 rounded-[2rem] bg-creme py-20 sm:py-28 px-6 text-center">
      <div className="titulo text-7xl sm:text-8xl text-caramelo/40">404</div>
      <h1 className="titulo text-3xl sm:text-4xl mt-2">Página não encontrada</h1>
      <p className="text-suave mt-3">A peça pode ter saído do catálogo. Que tal ver as novidades?</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <BotaoLink href="/catalogo?ordem=novidades" tamanho="g">Ver novidades</BotaoLink>
        <BotaoLink href="/catalogo" variante="secundario" tamanho="g">Voltar ao catálogo</BotaoLink>
      </div>
    </div>
  );
}
