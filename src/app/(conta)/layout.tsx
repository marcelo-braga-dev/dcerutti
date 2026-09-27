import Image from 'next/image';

export default function LayoutConta({ children }: { children: React.ReactNode }) {
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
        <div className="relative font-[Georgia,serif] italic text-5xl text-areia">D&apos;C</div>
        <div className="relative max-w-md">
          <div className="rotulo text-areia mb-3">O básico aconchego</div>
          <p className="titulo !text-creme text-3xl sm:text-4xl leading-tight">Hering com estoque pronto, do jeito que você gosta de comprar.</p>
          <p className="mt-4 text-areia">Monte sua sacola e envie direto para o WhatsApp de quem te atende. Em Maravilha, prove em casa e pague só o que ficar.</p>
        </div>
      </div>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Image src="/logo-dcerutti.png" alt="D'Cerutti — O Básico Aconchego" width={220} height={100} className="mb-8 mix-blend-multiply h-auto" priority />
          {children}
        </div>
      </main>
    </div>
  );
}
