'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { brl } from '@/lib/dinheiro';
import { celularValido, formatarTelefone } from '@/lib/telefone';
import { registrarInteresse, type ResultadoInteresse } from '@/server/acoes/peca';
import { Gaveta, gravarContato, lerContato, PedidoEnviado, useGaveta } from './pedido-publico';

type Variante = { id: number; tamanho: string; ultimas: boolean };
type Tamanho = { tamanho: string; livre: boolean };

/**
 * "Quero esta peça" (docs/26, D-36): o tamanho a um toque (esgotados riscados), a ação principal fixa embaixo no
 * celular e a gaveta com nome e WhatsApp (lembrados no aparelho). Só registra o pedido de atendimento: a peça fica
 * reservada depois que a loja confirma, e a página diz isso.
 */
export function QueroPeca({ chave, variantes, tamanhos, peca }: {
  chave: string; variantes: Variante[]; tamanhos?: Tamanho[]; peca: { nome: string; preco: number; imagem: string | null; vendedora: string | null; duvida: string };
}) {
  const [varianteId, setVarianteId] = useState<number | null>(variantes.length === 1 ? variantes[0].id : null);
  const [gaveta, setGaveta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [feito, setFeito] = useState<Extract<ResultadoInteresse, { ok: true }> | null>(null);
  const escolhida = variantes.find(v => v.id === varianteId);
  const lista = tamanhos ?? variantes.map(v => ({ tamanho: v.tamanho, livre: true }));
  const fechar = useCallback(() => setGaveta(false), []);
  const quero = () => {
    if (!escolhida) { setAviso('Escolha o tamanho primeiro.'); document.getElementById('tamanhos-peca')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setAviso(null);
    setGaveta(true);
  };

  if (feito) return <PedidoEnviado destinatario={feito.destinatario} url={feito.url} itens={escolhida ? [{ chave: escolhida.id, nome: peca.nome, tamanho: escolhida.tamanho, preco: peca.preco, imagem: peca.imagem }] : []} />;

  return (
    <div className="grid gap-4">
      <fieldset id="tamanhos-peca" className="grid gap-2.5 scroll-mt-24">
        <legend className="flex w-full items-baseline justify-between gap-3 mb-1">
          <span className="text-sm font-semibold text-marrom-950">Tamanho{escolhida ? <span className="font-normal text-suave"> · {escolhida.tamanho}</span> : null}</span>
          <a href={peca.duvida} target="_blank" rel="noopener" className="text-sm text-suave underline underline-offset-4 hover:text-marrom-950">Dúvida no tamanho?</a>
        </legend>
        <div role="radiogroup" aria-label="Tamanho" className="flex flex-wrap gap-2">
          {lista.map(t => {
            const v = variantes.find(x => x.tamanho === t.tamanho);
            if (!v) return <span key={t.tamanho} title="Esgotado" className="min-w-12 h-12 px-3 rounded-xl border border-borda text-borda-forte line-through grid place-items-center text-sm"><span aria-hidden="true">{t.tamanho}</span><span className="sr-only">{t.tamanho} esgotado</span></span>;
            const ativo = v.id === varianteId;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={ativo} onClick={() => { setVarianteId(v.id); setAviso(null); }}
                className={`min-w-12 h-12 px-3 rounded-xl border text-sm font-semibold transition-colors ${ativo ? 'bg-marrom-950 text-creme border-marrom-950' : 'bg-card border-borda-forte text-marrom-950 hover:border-marrom-950'}`}>
                {v.tamanho}
              </button>
            );
          })}
        </div>
        {escolhida?.ultimas && <p className="text-sm text-caramelo">Últimas unidades neste tamanho.</p>}
        {aviso && <p role="alert" className="text-sm text-vermelho">{aviso}</p>}
      </fieldset>

      {/* Computador: a ação logo abaixo dos tamanhos (no celular ela fica na barra fixa). */}
      <div className="hidden md:grid gap-2">
        <button type="button" onClick={quero} className={botao('whatsapp', 'g', 'w-full')}>Quero esta peça</button>
        <p className="text-xs text-suave">A peça só fica reservada depois da confirmação da loja. Frete e pagamento são combinados na conversa.</p>
      </div>

      {/* Celular: preço e ação principal sempre à mão. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-creme via-creme/95 to-creme/0 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-marrom-950 text-creme pl-5 pr-1.5 py-1.5 shadow-xl shadow-marrom-950/25">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold">{brl(peca.preco)}</div>
            <div className="text-[0.72rem] text-areia truncate">{escolhida ? `Tamanho ${escolhida.tamanho}` : 'Escolha o tamanho'}</div>
          </div>
          <button type="button" onClick={quero} className="shrink-0 h-11 px-5 rounded-full bg-whatsapp text-white text-sm font-semibold">Quero esta peça</button>
        </div>
      </div>

      {gaveta && escolhida && <GavetaPeca chave={chave} variante={escolhida} peca={peca} fechar={fechar} concluir={setFeito} />}
    </div>
  );
}

function GavetaPeca({ chave, variante, peca, fechar, concluir }: {
  chave: string; variante: Variante; peca: { nome: string; preco: number; imagem: string | null }; fechar: () => void; concluir: (r: Extract<ResultadoInteresse, { ok: true }>) => void;
}) {
  const [nome, setNome] = useState(() => lerContato().nome);
  const [telefone, setTelefone] = useState(() => lerContato().telefone);
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState('');
  const [ofertas, setOfertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const painel = useRef<HTMLDivElement>(null);
  useGaveta(fechar, painel);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (!celularValido(telefone)) return setErro('Informe o WhatsApp com DDD e 9 dígitos.');
    if (!aceite) return setErro('Para continuar, aceite o contato da loja.');
    // Abre a aba antes de esperar o servidor: o navegador bloqueia a aberta depois.
    const aba = window.open('about:blank', '_blank');
    iniciar(async () => {
      const r = await registrarInteresse(chave, { varianteId: variante.id, nome, telefone, aceite, site, ofertas });
      if (!r.ok) { aba?.close(); return setErro(r.erro); }
      gravarContato(nome.trim(), telefone);
      if (aba) aba.location.href = r.url;
      fechar();
      concluir(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  return (
    <Gaveta titulo="Quero esta peça" idTitulo="titulo-quero-peca" fechar={fechar} painel={painel}>
      <form onSubmit={enviar} className="relative p-5 grid gap-4" noValidate>
        <div className="flex items-center gap-3 bg-card border border-borda rounded-2xl p-2 pr-3">
          <span className="relative w-12 aspect-[3/4] shrink-0 rounded-lg overflow-hidden bg-bege">
            <Foto src={peca.imagem} alt="" sizes="48px" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-marrom-950 truncate">{peca.nome}</span>
            <span className="block text-xs text-suave">Tam. <strong className="text-marrom-950">{variante.tamanho}</strong> · {brl(peca.preco)}</span>
          </span>
        </div>
        <CamposContato nome={nome} setNome={setNome} telefone={telefone} setTelefone={setTelefone} aceite={aceite} setAceite={setAceite} site={site} setSite={setSite} ofertas={ofertas} setOfertas={setOfertas} />
        {erro && <p role="alert" className="text-sm text-vermelho">{erro}</p>}
        <button type="submit" disabled={pendente} className={botao('whatsapp', 'g', 'w-full')}>{pendente ? 'Enviando…' : 'Enviar pelo WhatsApp'}</button>
        <p className="text-xs text-suave text-center">Sem cadastro. A peça só fica reservada depois da confirmação da loja.</p>
      </form>
    </Gaveta>
  );
}

/** Nome, WhatsApp e consentimentos: os mesmos campos em todas as páginas públicas de pedido. */
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
