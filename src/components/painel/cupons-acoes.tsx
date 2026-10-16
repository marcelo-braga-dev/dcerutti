'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { alternarCupom, apagarCupom } from '@/server/acoes/cupons';
import { Alerta } from '@/components/ui/basicos';
import { botao } from '@/components/ui/botao';
import { Popup } from '@/components/ui/popup';
import { linkCompartilharWhatsApp } from '@/lib/whatsapp';
import { nomeDaLoja } from '@/lib/loja';

/** Liga ou desliga o cupom (gestor). */
export function AlternarCupom({ id, ativo }: { id: number; ativo: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={pendente} className={botao(ativo ? 'perigo' : 'oliva', 'p')}
        onClick={() => iniciar(async () => { const r = await alternarCupom(id, !ativo); if (!r.ok) setErro(r.erro ?? 'Não foi possível salvar.'); else router.refresh(); })}>
        {pendente ? 'Salvando…' : ativo ? 'Desativar' : 'Ativar'}
      </button>
      {erro && <Alerta>{erro}</Alerta>}
    </>
  );
}

/** Apaga cupom nunca usado, com confirmação (gestor). */
export function ApagarCupom({ id, codigo }: { id: number; codigo: string }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={botao('fantasma', 'p', 'text-vermelho')}>Apagar</button>
      {aberto && (
        <Popup titulo={`Apagar ${codigo}?`} fechar={() => !pendente && setAberto(false)}>
          <p className="text-sm">O cupom some de vez. Só é possível porque ele nunca foi usado.</p>
          {erro && <Alerta>{erro}</Alerta>}
          <div className="flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" disabled={pendente} onClick={() => setAberto(false)} className={botao('fantasma', 'm')}>Voltar</button>
            <button type="button" disabled={pendente} className={botao('perigo', 'm')}
              onClick={() => iniciar(async () => { const r = await apagarCupom(id); if (r && !r.ok) setErro(r.erro ?? 'Não foi possível apagar.'); })}>
              {pendente ? 'Apagando…' : 'Apagar cupom'}
            </button>
          </div>
        </Popup>
      )}
    </>
  );
}

/**
 * Divulgação (vendedor e gestor): copiar código, copiar o link que já aplica o cupom na sacola e abrir o WhatsApp com a
 * mensagem pronta (a pessoa escolhe o contato). Cupom só do vendedor não tem link: a cliente pede para aplicar.
 */
export function DivulgarCupom({ codigo, regra, link }: { codigo: string; regra: string; link: string | null }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (texto: string, qual: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      window.prompt('Copie:', texto);
    }
  };
  const mensagem = link
    ? `Tenho um cupom para você na ${nomeDaLoja()}: *${codigo}*\n${regra}\n\nÉ só usar na sacola do site: ${link}`
    : `Tenho um cupom para você na ${nomeDaLoja()}: *${codigo}*\n${regra}\n\nMe chama aqui que eu aplico no seu pedido.`;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => copiar(codigo, 'codigo')} className={botao('secundario', 'p')}>{copiado === 'codigo' ? 'Copiado!' : 'Copiar código'}</button>
      {link && <button type="button" onClick={() => copiar(link, 'link')} className={botao('secundario', 'p')}>{copiado === 'link' ? 'Copiado!' : 'Copiar link'}</button>}
      <a href={linkCompartilharWhatsApp(mensagem)} data-acao="cupom" target="_blank" rel="noopener" className={botao('oliva', 'p')}>Enviar pelo WhatsApp</a>
    </div>
  );
}
