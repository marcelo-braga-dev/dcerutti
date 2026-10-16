import Image from 'next/image';
import { Logo } from '@/components/ui/logo';
import { marcaAtual } from '@/server/marca';

export default async function LayoutConta({ children }: { children: React.ReactNode }) {
  const { logoClara } = await marcaAtual();
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="relative bg-marrom-950 text-creme p-8 sm:p-12 flex flex-col justify-between gap-10 min-h-64 overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-3 gap-1 opacity-45 saturate-[.85]" aria-hidden>
          {[1, 2, 3].map(i => (
            <div key={i} className="relative">
              <Image src={`/ambiente/foto-${i}.jpg`} alt="" fill sizes="33vw" className="object-cover object-[center_20%]" priority={i === 1} />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-marrom-950 via-marrom-950/60 to-marrom-950/30" aria-hidden />
        <Logo img={logoClara} className="relative w-40 sm:w-48 h-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]" prioridade />
        <div className="relative max-w-md">
          <div className="rotulo text-areia mb-3">Portal de promoções</div>
          <p className="titulo !text-creme text-4xl sm:text-5xl leading-[0.95]">O que a vitrine<br />não mostra.</p>
          <p className="mt-5 text-areia text-lg leading-relaxed">Preços que a gente só conta para quem é de casa. Entre, escolha com calma e receba com o carinho de sempre.</p>
        </div>
      </div>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>
    </div>
  );
}
