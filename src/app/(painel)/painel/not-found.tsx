import { BotaoLink } from '@/components/ui/botao';

/** Registro inexistente ou de outro vendedor: as consultas devolvem null e a página chama notFound(). */
export default function NaoEncontrado() {
  return (
    <div className="py-24 text-center grid gap-4 justify-items-center">
      <h1 className="titulo text-3xl">Não encontrado</h1>
      <p className="text-suave max-w-md">Este registro não existe, foi removido ou pertence a outro vendedor.</p>
      <BotaoLink href="/painel">Voltar ao painel</BotaoLink>
    </div>
  );
}
