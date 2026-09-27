import { formatarTelefone } from '@/lib/telefone';

export function Rodape({ whatsapp }: { whatsapp: string }) {
  return (
    <footer className="mt-20 bg-marrom-950 text-areia">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-8 py-12 grid gap-8 sm:grid-cols-3">
        <div>
          <div className="font-[Georgia,serif] italic text-4xl text-creme">D&apos;Cerutti</div>
          <p className="mt-2 rotulo">O básico aconchego</p>
        </div>
        <div className="grid gap-2 text-sm">
          <span className="rotulo text-creme">Atendimento</span>
          <a href={`https://wa.me/55${whatsapp}`} className="hover:text-creme" target="_blank" rel="noopener">WhatsApp {formatarTelefone(whatsapp)}</a>
          <a href="https://instagram.com/dcerutti_" className="hover:text-creme" target="_blank" rel="noopener">Instagram @dcerutti_</a>
          <span>Maravilha (SC)</span>
        </div>
        <div className="grid gap-2 text-sm">
          <span className="rotulo text-creme">Como funciona</span>
          <span>Monte sua sacola e envie para o WhatsApp de quem te atende.</span>
          <span>Em Maravilha, peça um condicional: prove em casa e pague só o que ficar.</span>
        </div>
      </div>
      <div className="border-t border-creme/10 py-4 text-center text-xs">© {new Date().getFullYear()} D&apos;Cerutti · Maravilha (SC) · CNPJ 42.388.147/0001-40</div>
    </footer>
  );
}
