import { useEffect, useRef } from 'react';
import { usePage } from '@inertiajs/react';
import { enviarRastro, ligarRastro, novaRef, rastrear, type EventoRastro } from '@/lib/rastro';
import { useSacola } from '@/lib/sacola';

/**
 * Histórico da cliente (docs/21; porta de src/components/loja/rastreador.tsx): páginas abertas e o tempo em cada uma,
 * cliques para o WhatsApp e a cópia da sacola. Só montado para clientes, com o histórico ligado.
 */
export function Rastreador() {
  const url = usePage().url;
  const { itens, pronta } = useSacola();

  useEffect(() => {
    ligarRastro(true);
    const aoClicar = (ev: MouseEvent) => {
      const alvo = ev.target instanceof Element ? ev.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"]') : null;
      if (alvo) { rastrear({ tipo: 'whatsapp', caminho: location.pathname + location.search }); enviarRastro(); }
    };
    document.addEventListener('click', aoClicar, true);
    return () => { document.removeEventListener('click', aoClicar, true); enviarRastro(); ligarRastro(false); };
  }, []);

  // Uma página aberta: registra ao abrir e soma o tempo visível ao sair, trocar de aba ou fechar.
  useEffect(() => {
    const ref = novaRef();
    let desde: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    rastrear({ tipo: 'pagina', ref, caminho: url });
    const fechar = () => {
      if (desde == null) return;
      const seg = Math.round((Date.now() - desde) / 1000);
      desde = null;
      if (seg >= 1) rastrear({ tipo: 'duracao', ref, seg: Math.min(seg, 3600) });
    };
    const aoMudar = () => { if (document.visibilityState === 'hidden') { fechar(); enviarRastro(); } else desde = Date.now(); };
    const aoSair = () => { fechar(); enviarRastro(); };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', aoSair);
    return () => { document.removeEventListener('visibilitychange', aoMudar); window.removeEventListener('pagehide', aoSair); fechar(); };
  }, [url]);

  // Cópia da sacola no servidor. A primeira leitura não vai (outro aparelho com a sacola vazia não apaga a do celular).
  const primeira = useRef(true);
  const pendente = useRef<EventoRastro | null>(null);
  useEffect(() => {
    if (!pronta) return;
    if (primeira.current) { primeira.current = false; return; }
    pendente.current = { tipo: 'carrinho', itens: itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })) };
    const t = setTimeout(soltar, 800);
    return () => clearTimeout(t);
  }, [itens, pronta]);
  function soltar() { if (pendente.current) rastrear(pendente.current); pendente.current = null; }
  useEffect(() => {
    const aoSair = () => { soltar(); enviarRastro(); };
    const aoMudar = () => { if (document.visibilityState === 'hidden') aoSair(); };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', aoSair);
    return () => { document.removeEventListener('visibilitychange', aoMudar); window.removeEventListener('pagehide', aoSair); aoSair(); };
  }, []);

  return null;
}
