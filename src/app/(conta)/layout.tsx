import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { IconeCasa, IconeConversa, IconeEtiqueta } from '@/components/ui/icones';
import { marcaAtual } from '@/server/marca';

export default async function LayoutConta({ children }: { children: React.ReactNode }) {
  const { logo, logoClara } = await marcaAtual();
  return (
    <div className="loja bg-card min-h-dvh grid lg:grid-cols-[1.05fr_1fr] lg:p-4 gap-4">
      <div className="relative overflow-hidden bg-marrom-950 text-creme p-7 sm:p-12 flex flex-col justify-between gap-10 min-h-72 lg:min-h-0 lg:rounded-[2rem]">
        <div className="absolute inset-0 grid grid-cols-3 gap-1 opacity-50 saturate-[.85]" aria-hidden>
          {[1, 2, 3].map(i => (
            <div key={i} className="relative">
              <Image src={`/ambiente/foto-${i}.jpg`} alt="" fill sizes="33vw" className="object-cover object-[center_20%]" priority={i === 1} />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-marrom-950 via-marrom-950/60 to-marrom-950/20" aria-hidden />
        <Logo img={logoClara} className="relative w-36 sm:w-44 h-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]" prioridade />
        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-creme/10 backdrop-blur text-[0.78rem] font-medium text-areia">Portal de promoções</span>
          <p className="titulo !text-creme text-4xl sm:text-6xl leading-[0.98] mt-5">O que a vitrine<br /><em className="text-areia">não mostra.</em></p>
          <p className="mt-5 text-areia text-lg leading-relaxed">Preços que a gente só conta para quem é de casa. Entre, escolha com calma e receba com o carinho de sempre.</p>
          <ul className="mt-8 hidden sm:flex flex-wrap gap-2 text-sm">
            {[[<IconeEtiqueta key="e" className="size-4" />, 'Preços exclusivos'], [<IconeCasa key="c" className="size-4" />, 'Prove em casa'], [<IconeConversa key="w" className="size-4" />, 'Atendimento no WhatsApp']].map(([i, t]) => (
              <li key={t as string} className="h-9 px-3.5 inline-flex items-center gap-2 rounded-full bg-creme/10 backdrop-blur text-creme">{i}{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="hidden lg:block mb-10"><Logo img={logo} className="h-10 w-auto mix-blend-multiply" /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
