'use client';

import { useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { brl } from '@/lib/dinheiro';
import { celularValido } from '@/lib/telefone';
import { registrarInteresseVitrine, type ResultadoInteresseVitrine } from '@/server/acoes/vitrines';
import type { VitrinePublica } from '@/server/consultas/vitrines';
import { CamposContato, PedidoRecebido } from './quero-peca';

/**
 * A cliente escolhe as peças e os tamanhos, informa nome e WhatsApp, e a conversa abre com a lista. Só registra o pedido
 * de atendimento: a peça fica reservada depois que a loja confirma, e a página diz isso.
 */
export function EscolherVitrine({ slug, pecas, aberta }: { slug: string; pecas: VitrinePublica['pecas']; aberta: boolean }) {
  // Peça → tamanho escolhido (uma por peça: outro tamanho da mesma peça substitui).
  const [escolhas, setEscolhas] = useState<Record<number, number>>({});
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState('');
  const [ofertas, setOfertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Extract<ResultadoInteresseVitrine, { ok: true }> | null>(null);
  const [pendente, iniciar] = useTransition();

  const variantes = Object.values(escolhas);
  const total = pecas.reduce((a, p) => a + (escolhas[p.produtoId] ? p.preco : 0), 0);
  const alternar = (produtoId: number, varianteId: number) => setEscolhas(e => {
    const n = { ...e };
    if (n[produtoId] === varianteId) delete n[produtoId];
    else n[produtoId] = varianteId;
    return n;
  });

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setErro(null);
    if (!variantes.length) return setErro('Escolha pelo menos uma peça e o tamanho.');
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (!celularValido(telefone)) return setErro('Informe o WhatsApp com DDD e 9 dígitos.');
    if (!aceite) return setErro('Para continuar, aceite o contato da loja.');
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    iniciar(async () => {
      const r = await registrarInteresseVitrine(slug, { variantes, nome, telefone, aceite, site, ofertas });
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      if (aba) aba.location.href = r.url;
      setFeito(r);
    });
  };

  if (feito) return <PedidoRecebido destinatario={feito.destinatario} url={feito.url} />;

  return (
    <div className="grid gap-6">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pecas.map(p => {
          const especial = p.preco < p.precoCheio;
          const escolhida = p.variantes.find(v => v.id === escolhas[p.produtoId]);
          return (
            <li key={p.produtoId} className="bg-card border border-borda rounded-3xl overflow-hidden grid content-start">
              <span className="relative block aspect-[3/4] bg-bege"><Foto src={p.imagem} alt={p.nome} sizes="(max-width: 640px) 100vw, 33vw" /></span>
              <div className="p-4 grid gap-2">
                <h3 className="font-semibold text-marrom-950 leading-snug">{p.nome}</h3>
                <div className="flex items-baseline gap-2">
                  <strong className="font-display text-lg">{brl(p.preco)}</strong>
                  {especial && <span className="text-sm text-suave line-through">{brl(p.precoCheio)}</span>}
                </div>
                {!p.variantes.length ? <p className="text-sm text-suave">Esgotada</p> : aberta && (
                  <div role="group" aria-label={`Tamanhos de ${p.nome}`} className="flex flex-wrap gap-1.5">
                    {p.variantes.map(v => (
                      <button key={v.id} type="button" aria-pressed={v.id === escolhas[p.produtoId]} aria-label={`${p.nome}, tamanho ${v.tamanho}`} onClick={() => alternar(p.produtoId, v.id)}
                        className={`min-w-10 h-10 px-2 border text-sm font-semibold ${v.id === escolhas[p.produtoId] ? 'bg-marrom-950 text-creme border-marrom-950' : 'border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                        {v.tamanho}
                      </button>
                    ))}
                  </div>
                )}
                {escolhida?.ultimas && <p className="text-xs text-caramelo">Últimas unidades neste tamanho.</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {aberta && (
        <form onSubmit={enviar} className="relative bg-card border border-borda rounded-3xl p-5 grid gap-4 max-w-xl w-full justify-self-center" noValidate>
          <h2 className="titulo text-xl">{variantes.length ? `${variantes.length} ${variantes.length === 1 ? 'peça escolhida' : 'peças escolhidas'} · ${brl(total)}` : 'Escolha o tamanho das peças que quiser'}</h2>
          <CamposContato nome={nome} setNome={setNome} telefone={telefone} setTelefone={setTelefone} aceite={aceite} setAceite={setAceite} site={site} setSite={setSite} ofertas={ofertas} setOfertas={setOfertas} />
          {erro && <p role="alert" className="text-sm text-vermelho">{erro}</p>}
          <button type="submit" disabled={pendente} className={botao('whatsapp', 'g', 'w-full')}>{pendente ? 'Enviando…' : 'Quero estas peças'}</button>
          <p className="text-xs text-suave text-center">As peças só ficam reservadas depois da confirmação da loja.</p>
        </form>
      )}
    </div>
  );
}
