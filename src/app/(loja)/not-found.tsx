import { BotaoLink } from '@/components/ui/botao';

export default function NaoEncontrado() {
  return (
    <div className="py-24 text-center">
      <h1 className="titulo text-3xl">Página não encontrada</h1>
      <p className="text-suave mt-2">A peça pode ter saído do catálogo.</p>
      <BotaoLink href="/catalogo" className="mt-6">Voltar ao catálogo</BotaoLink>
    </div>
  );
}
