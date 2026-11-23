'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { pagar, simularPagamento } from '@/server/acoes/pagamentos';
import { tempoRestante } from '@/lib/pagamento';
import { brl } from '@/lib/dinheiro';
import { botao } from '@/components/ui/botao';

type PixAtivo = { copiaECola: string; expiraEm: string | null; qrSvg: string };

/**
 * Escolha do meio na página /pagar (docs/27). Pix: gera no servidor, a página recarrega com o QR e passa a perguntar a
 * situação a cada 5 s. Cartão: vai para o checkout do Mercado Pago e volta por /pagar/…/retorno.
 */
export function Pagar(p: {
  chave: string; valor: number; pix: boolean; cartao: boolean; precisaEmail: boolean; parcelasMax: number; parcelasSemJuros: number; minutosPix: number;
  pixAtivo: PixAtivo | null; aviso: string | null; simulado?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pedirEmail, setPedirEmail] = useState(p.precisaEmail);
  const [pendente, iniciar] = useTransition();
  const [indo, setIndo] = useState(false);

  const escolher = (metodo: 'pix' | 'checkout') => {
    setErro(null);
    if (metodo === 'pix' && pedirEmail && !/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe seu e-mail para gerar o Pix.'); return; }
    iniciar(async () => {
      const r = await pagar({ chave: p.chave, metodo, email: email || undefined });
      if (!r.ok) { setErro(r.erro); if (r.pedirEmail) setPedirEmail(true); return; }
      if (r.metodo === 'checkout') { setIndo(true); window.location.assign(r.url); return; }
      router.refresh();
    });
  };

  if (p.pixAtivo) return <><PixAberto chave={p.chave} pix={p.pixAtivo} valor={p.valor} cartao={p.cartao} trocar={() => escolher('checkout')} pendente={pendente || indo} erro={erro} />{p.simulado && <Simular chave={p.chave} />}</>;

  const parcelas = p.parcelasMax > 1 ? `em até ${p.parcelasMax}×${p.parcelasSemJuros > 1 ? ` (até ${Math.min(p.parcelasSemJuros, p.parcelasMax)}× sem juros)` : ''}` : 'à vista';
  return (
    <section className="grid gap-4" aria-busy={pendente || indo}>
      {p.aviso && <p className="text-sm text-vermelho" role="status">{p.aviso}</p>}
      {p.pix && pedirEmail && (
        <label className="grid gap-1 text-sm">
          <span className="rotulo text-marrom-900">Seu e-mail (o Mercado Pago pede para o Pix)</span>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="h-11 px-3 border border-borda-forte bg-card" placeholder="voce@email.com" />
        </label>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {p.pix && (
          <button type="button" onClick={() => escolher('pix')} disabled={pendente || indo} className="text-left border border-marrom-950 bg-marrom-950 text-creme p-5 grid gap-1 hover:bg-marrom-700 disabled:opacity-60">
            <span className="rotulo">Pagar com Pix</span>
            <span className="text-sm opacity-80">Aprovação na hora. O código vale {p.minutosPix} minutos.</span>
          </button>
        )}
        {p.cartao && (
          <button type="button" onClick={() => escolher('checkout')} disabled={pendente || indo} className="text-left border border-marrom-950 p-5 grid gap-1 hover:bg-bege disabled:opacity-60">
            <span className="rotulo text-marrom-950">Pagar com cartão</span>
            <span className="text-sm text-suave">Crédito {parcelas}, débito ou saldo, no ambiente seguro do Mercado Pago.</span>
          </button>
        )}
      </div>
      {(pendente || indo) && <p className="text-sm text-suave" role="status">{indo ? 'Abrindo o Mercado Pago…' : 'Gerando o pagamento…'}</p>}
      {erro && <p className="text-sm text-vermelho" role="alert">{erro}</p>}
      <p className="text-xs text-suave">Pagamento processado pelo Mercado Pago. A loja não vê nem guarda os dados do seu cartão.</p>
      {p.simulado && <Simular chave={p.chave} />}
    </section>
  );
}

/** Só no ambiente de teste (Mercado Pago simulado): faz o papel da cliente pagando. */
function Simular({ chave }: { chave: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="border border-dashed border-caramelo p-3 grid gap-2 text-sm text-left">
      <strong>Ambiente de teste · Mercado Pago simulado</strong>
      <span className="text-suave">Gere o Pix (ou o pagamento com cartão) e use o botão para fazer de conta que a cliente pagou.</span>
      <button type="button" disabled={pendente} className={botao('secundario', 'p', 'justify-self-start')}
        onClick={() => { setErro(null); iniciar(async () => { const r = await simularPagamento(chave); if (r.ok) router.refresh(); else setErro(r.erro); }); }}>
        Simular pagamento aprovado
      </button>
      {erro && <span className="text-vermelho">{erro}</span>}
    </div>
  );
}

function PixAberto({ chave, pix, valor, cartao, trocar, pendente, erro }: { chave: string; pix: PixAtivo; valor: number; cartao: boolean; trocar: () => void; pendente: boolean; erro: string | null }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [resta, setResta] = useState(pix.expiraEm ? tempoRestante(pix.expiraEm) : null);
  const [vencido, setVencido] = useState(false);

  useEffect(() => {
    if (!pix.expiraEm) return;
    const t = setInterval(() => {
      setResta(tempoRestante(pix.expiraEm!));
      if (new Date(pix.expiraEm!).getTime() <= Date.now()) setVencido(true);
    }, 1000);
    return () => clearInterval(t);
  }, [pix.expiraEm]);

  // Pergunta a situação a cada 5 s enquanto a aba está visível; pago ou vencido, recarrega a página.
  useEffect(() => {
    let parado = false;
    const perguntar = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/pagamentos/situacao?chave=${encodeURIComponent(chave)}`, { cache: 'no-store' });
        if (!r.ok || parado) return;
        const s = await r.json() as { pago?: boolean; aberta?: boolean };
        if (s.pago || s.aberta === false) router.refresh();
      } catch { /* sem rede: tenta de novo */ }
    };
    const t = setInterval(perguntar, 5000);
    return () => { parado = true; clearInterval(t); };
  }, [chave, router]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(pix.copiaECola); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
    catch { setCopiado(false); }
  };

  return (
    <section className="grid gap-4 justify-items-center text-center">
      <div className="rotulo text-marrom-900">Pix de {brl(valor)}</div>
      <div className="w-56 h-56 bg-white p-2 border border-borda [&_svg]:w-full [&_svg]:h-full" aria-label="QR Code do Pix" role="img" dangerouslySetInnerHTML={{ __html: pix.qrSvg }} />
      <p className="text-sm text-suave max-w-sm">Abra o app do seu banco, escolha <strong>Pix › Ler QR Code</strong> ou <strong>Pix Copia e Cola</strong> e cole o código abaixo.</p>
      <div className="w-full grid gap-2">
        <code className="block w-full text-xs break-all bg-bege p-3 text-left select-all">{pix.copiaECola}</code>
        <button type="button" onClick={copiar} className={botao('primario', 'g', 'w-full')}>{copiado ? 'Código copiado ✓' : 'Copiar código Pix'}</button>
      </div>
      <p className="text-sm" role="status" aria-live="polite">
        {vencido ? <span className="text-vermelho">Este código venceu. Atualize a página para gerar outro.</span>
          : <>Aguardando o pagamento{resta ? <> · vence em <strong className="tabular-nums">{resta}</strong></> : null}. Esta página atualiza sozinha.</>}
      </p>
      {vencido && <button type="button" onClick={() => router.refresh()} className={botao('secundario')}>Atualizar</button>}
      {cartao && !vencido && <button type="button" onClick={trocar} disabled={pendente} className="text-sm underline underline-offset-4 text-suave">Prefiro pagar com cartão</button>}
      {erro && <p className="text-sm text-vermelho" role="alert">{erro}</p>}
    </section>
  );
}
