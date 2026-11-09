'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Foto } from '@/components/loja/foto';
import { Alerta } from '@/components/ui/basicos';
import { Botao, botao } from '@/components/ui/botao';
import { classeCampo } from '@/components/ui/formulario';
import { Popup } from '@/components/ui/popup';
import { linkDirect } from '@/lib/atendimento';
import { linkWhatsApp } from '@/lib/whatsapp';
import { avisarPecaEnviada, prepararEnvioDaPeca, type EnvioDePeca } from '@/server/acoes/peca';
import { buscarPecas, type PecaSelecao } from '@/server/acoes/pedidos';

type Envio = Extract<EnvioDePeca, { ok: true }>;

/** Compartilha o arquivo pelo celular (o WhatsApp recebe foto ou vídeo de verdade); sem suporte, baixa. */
async function compartilharArquivo(url: string, nome: string): Promise<'ok' | 'baixar'> {
  try {
    const r = await fetch(url);
    if (!r.ok) return 'baixar';
    const b = await r.blob();
    const arquivo = new File([b], `${nome}.${url.split('.').pop()?.split('?')[0] ?? 'jpg'}`, { type: b.type });
    if (!navigator.canShare?.({ files: [arquivo] })) return 'baixar';
    await navigator.share({ files: [arquivo] });
    return 'ok';
  } catch (e) {
    // A pessoa fechou o compartilhar: não é erro. Arquivo de outro site (sem permissão de leitura): baixa.
    return e instanceof DOMException && e.name === 'AbortError' ? 'ok' : 'baixar';
  }
}

/** "Enviar peça": link da peça (assinado por quem envia), texto pronto, fotos e vídeos. */
export function EnviarPeca({ referencia, nome, telefone, instagram, atendimentoId }: { referencia: string; nome: string; telefone?: string | null; instagram?: string | null; atendimentoId?: string }) {
  const [aberto, setAberto] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const abrir = () => {
    setAberto(true);
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await prepararEnvioDaPeca(referencia);
      if (r.ok) setEnvio(r);
      else setErro(r.erro);
    });
  };
  const contou = () => { avisarPecaEnviada(referencia, atendimentoId).catch(() => {}); };
  const copiar = async (texto: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(msg);
      contou();
    } catch {
      setAviso('O navegador não deixou copiar. Selecione o texto e copie.');
    }
  };
  const compartilhar = async (url: string) => {
    const r = await compartilharArquivo(url, referencia);
    if (r === 'baixar') setAviso('Este aparelho não compartilha arquivos daqui: use Baixar e envie pela conversa.');
    else contou();
  };

  return (
    <>
      <button type="button" onClick={abrir} className={botao('secundario', 'p', 'shrink-0')} aria-label={`Enviar ${nome}`}>Enviar</button>
      {aberto && (
        <Popup titulo={`Enviar ${nome}`} fechar={() => setAberto(false)}>
          {erro && <Alerta>{erro}</Alerta>}
          {!envio && !erro && <p className="text-sm text-suave">{pendente ? 'Preparando…' : ''}</p>}
          {envio && (
            <div className="grid gap-4">
              {envio.semEstoque && <Alerta tipo="aviso">Esta peça está sem estoque agora.</Alerta>}
              <label className="grid gap-1 text-sm">
                <span className="rotulo text-suave">Texto pronto</span>
                <textarea readOnly rows={5} value={envio.texto} aria-label="Texto da peça" className={`${classeCampo} h-auto py-2 text-sm`} />
              </label>
              <div className="flex flex-wrap gap-2">
                {telefone && <a href={linkWhatsApp(telefone, envio.texto)} target="_blank" rel="noopener" data-acao="nenhuma" onClick={contou} className={botao('whatsapp', 'p')}>Enviar no WhatsApp</a>}
                <Botao variante="secundario" tamanho="p" onClick={() => copiar(envio.texto, 'Texto copiado: cole na conversa.')}>Copiar texto</Botao>
                <Botao variante="secundario" tamanho="p" onClick={() => copiar(envio.link, 'Link copiado: cole na conversa.')}>Copiar link</Botao>
                {instagram && <a href={linkDirect(instagram)} target="_blank" rel="noopener" className={botao('secundario', 'p')}>Abrir o Direct</a>}
              </div>
              {aviso && <p role="status" className="text-sm text-oliva">{aviso}</p>}

              {envio.fotos.length + envio.videos.length > 0 ? (
                <div className="grid gap-2">
                  <span className="rotulo text-suave">Fotos e vídeos</span>
                  <ul className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                    {envio.fotos.slice(0, 9).map((f, i) => (
                      <li key={f} className="grid gap-1 text-xs text-center">
                        <span className="relative aspect-[3/4] bg-bege block"><Foto src={f} alt={`Foto ${i + 1}`} sizes="120px" /></span>
                        <button type="button" onClick={() => compartilhar(f)} className="underline underline-offset-2">Compartilhar</button>
                        <a href={f} download target="_blank" rel="noopener" onClick={contou} className="underline underline-offset-2 text-suave">Baixar</a>
                      </li>
                    ))}
                    {envio.videos.map((v, i) => (
                      <li key={v} className="grid gap-1 text-xs text-center">
                        <video src={`${v}#t=0.5`} muted playsInline preload="metadata" className="aspect-[3/4] w-full object-cover bg-bege" aria-label={`Vídeo ${i + 1}`} />
                        <button type="button" onClick={() => compartilhar(v)} className="underline underline-offset-2">Compartilhar</button>
                        <a href={v} download target="_blank" rel="noopener" onClick={contou} className="underline underline-offset-2 text-suave">Baixar</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="text-sm text-suave">Esta peça ainda não tem foto nem vídeo.</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-3">
                <Link href={`/painel/produtos/${envio.produtoId}/midia`} className="text-sm underline underline-offset-4">Adicionar foto ou vídeo</Link>
                <Botao variante="fantasma" tamanho="p" onClick={() => setAberto(false)}>Fechar</Botao>
              </div>
            </div>
          )}
          {erro && <Botao variante="fantasma" tamanho="p" onClick={() => setAberto(false)}>Fechar</Botao>}
        </Popup>
      )}
    </>
  );
}

/** Na ficha da cliente: busca a peça e envia. */
export function BuscarEEnviarPeca({ telefone, instagram }: { telefone: string; instagram: string | null }) {
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<PecaSelecao[] | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="grid gap-3">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); iniciar(async () => setAchadas(await buscarPecas(termo))); }}>
        <input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Nome ou referência da peça" aria-label="Buscar peça para enviar" className={`${classeCampo} flex-1 min-w-0`} />
        <button type="submit" disabled={pendente} className={botao('secundario')}>Buscar</button>
      </form>
      {achadas && (achadas.length === 0 ? <p className="text-sm text-suave">Nenhuma peça com estoque encontrada.</p> : (
        <ul className="grid gap-2 max-h-72 overflow-y-auto">
          {achadas.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{p.nome}</span>
              <EnviarPeca referencia={p.referencia} nome={p.nome} telefone={telefone} instagram={instagram} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
