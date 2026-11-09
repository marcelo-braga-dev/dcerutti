'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { celularValido, formatarTelefone } from '@/lib/telefone';
import { registrarInteresse, type ResultadoInteresse } from '@/server/acoes/peca';

type Variante = { id: number; tamanho: string; ultimas: boolean };

/**
 * "Quero esta peça" (docs/26). Só registra o pedido de atendimento: a peça fica reservada apenas depois que a loja
 * confirma, e a página diz isso. A tela final tem botão próprio porque o navegador do Instagram pode bloquear a nova aba.
 */
export function QueroPeca({ chave, variantes }: { chave: string; variantes: Variante[] }) {
  const [varianteId, setVarianteId] = useState<number | null>(variantes.length === 1 ? variantes[0].id : null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState('');
  const [ofertas, setOfertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Extract<ResultadoInteresse, { ok: true }> | null>(null);
  const [pendente, iniciar] = useTransition();
  const escolhida = variantes.find(v => v.id === varianteId);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!varianteId) return setErro('Escolha o tamanho.');
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (!celularValido(telefone)) return setErro('Informe o WhatsApp com DDD e 9 dígitos.');
    if (!aceite) return setErro('Para continuar, aceite o contato da loja.');
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    iniciar(async () => {
      const r = await registrarInteresse(chave, { varianteId, nome, telefone, aceite, site, ofertas });
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      if (aba) aba.location.href = r.url;
      setFeito(r);
    });
  };

  if (feito) return <PedidoRecebido destinatario={feito.destinatario} url={feito.url} />;

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <fieldset className="grid gap-2">
        <legend className="rotulo text-suave mb-2">Tamanho</legend>
        <div className="flex flex-wrap gap-2">
          {variantes.map(v => (
            <button key={v.id} type="button" role="radio" aria-checked={v.id === varianteId} onClick={() => setVarianteId(v.id)}
              className={`min-w-12 h-11 px-3 border font-semibold ${v.id === varianteId ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
              {v.tamanho}
            </button>
          ))}
        </div>
        {escolhida?.ultimas && <p className="text-sm text-caramelo">Últimas unidades neste tamanho.</p>}
      </fieldset>
      <CamposContato nome={nome} setNome={setNome} telefone={telefone} setTelefone={setTelefone} aceite={aceite} setAceite={setAceite} site={site} setSite={setSite} ofertas={ofertas} setOfertas={setOfertas} />
      {erro && <p role="alert" className="text-sm text-vermelho">{erro}</p>}
      <button type="submit" disabled={pendente} className={botao('whatsapp', 'g', 'w-full')}>{pendente ? 'Enviando…' : 'Quero esta peça'}</button>
      <p className="text-xs text-suave text-center">A peça só fica reservada depois da confirmação da loja.</p>
    </form>
  );
}

/** Os campos do formulário público, iguais na peça e na vitrine. */
export function CamposContato({ nome, setNome, telefone, setTelefone, aceite, setAceite, site, setSite, ofertas, setOfertas }: {
  nome: string; setNome: (v: string) => void; telefone: string; setTelefone: (v: string) => void; aceite: boolean; setAceite: (v: boolean) => void; site: string; setSite: (v: string) => void; ofertas: boolean; setOfertas: (v: boolean) => void;
}) {
  return (
    <>
      <label className="grid gap-1">
        <span className="rotulo text-suave">Seu nome</span>
        <input value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" maxLength={120} className={classeCampo} />
      </label>
      <label className="grid gap-1">
        <span className="rotulo text-suave">Seu WhatsApp</span>
        <input value={telefone} onChange={e => setTelefone(formatarTelefone(e.target.value))} type="tel" inputMode="numeric" autoComplete="tel" placeholder="(49) 99999-9999" className={classeCampo} />
      </label>
      {/* Armadilha para robôs: fora da tela e fora do Tab. */}
      <label className="absolute -left-[9999px]" aria-hidden="true">Site<input tabIndex={-1} autoComplete="off" value={site} onChange={e => setSite(e.target.value)} /></label>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="size-5 mt-0.5 accent-marrom-950" />
        <span>Aceito que a loja fale comigo pelo WhatsApp sobre este pedido. <Link href="/privacidade" target="_blank" className="underline underline-offset-2">Política de privacidade</Link></span>
      </label>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" checked={ofertas} onChange={e => setOfertas(e.target.checked)} className="size-5 mt-0.5 accent-marrom-950" />
        <span>Também quero receber ofertas e novidades pelo WhatsApp (opcional).</span>
      </label>
    </>
  );
}

/** A tela final tem botão próprio porque o navegador do Instagram pode bloquear a nova aba. */
export function PedidoRecebido({ destinatario, url }: { destinatario: string; url: string }) {
  return (
    <div className="bg-card border border-borda rounded-3xl p-6 text-center grid gap-3 justify-items-center">
      <div className="size-14 rounded-full bg-oliva text-creme grid place-items-center text-2xl" aria-hidden="true">✓</div>
      <h2 className="titulo text-xl">Pedido recebido!</h2>
      <p className="text-suave max-w-sm">Agora é só mandar a mensagem no WhatsApp para falar com {destinatario}. A peça fica reservada depois da confirmação da loja.</p>
      <a href={url} target="_blank" rel="noopener" className={botao('whatsapp', 'm')}>Abrir o WhatsApp</a>
    </div>
  );
}
