'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { enviarRastro, ligarRastro, novaRef, rastrear, type EventoRastro } from '@/lib/rastro';
import { useSacola } from './sacola';

/**
 * Histórico do cliente (docs/21): registra as páginas abertas e o tempo em cada uma, os cliques para o WhatsApp e a
 * sacola. Só é montado para clientes, com o histórico ligado. O layout não roda de novo a cada navegação, por isso o
 * registro é feito aqui, no navegador, e não no servidor (o prefetch dos links também contaria páginas não abertas).
 */
export function Rastreador() {
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const url = busca ? `${caminho}?${busca}` : caminho;
  const { itens, pronta } = useSacola();

  useEffect(() => {
    ligarRastro(true);
    const aoClicar = (ev: MouseEvent) => {
      const alvo = ev.target instanceof Element ? ev.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"]') : null;
      if (alvo) {
        rastrear({ tipo: 'whatsapp', caminho: location.pathname + location.search });
        enviarRastro();
      }
    };
    document.addEventListener('click', aoClicar, true);
    return () => {
      document.removeEventListener('click', aoClicar, true);
      enviarRastro();
      ligarRastro(false);
    };
  }, []);

  // Uma página aberta: registra ao abrir e soma o tempo visível ao sair, ao trocar de aba ou ao fechar.
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
    const aoMudar = () => {
      if (document.visibilityState === 'hidden') { fechar(); enviarRastro(); }
      else desde = Date.now();
    };
    const aoSair = () => { fechar(); enviarRastro(); };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', aoSair);
    return () => {
      document.removeEventListener('visibilitychange', aoMudar);
      window.removeEventListener('pagehide', aoSair);
      fechar();
    };
  }, [url]);

  // Cópia da sacola no servidor. A primeira leitura (o que já estava no navegador) não é enviada: outro aparelho com a
  // sacola vazia não apaga a sacola que a cliente montou no celular. Espera 800 ms para juntar cliques seguidos, mas
  // quem sai da página antes disso (pôs na sacola e foi direto para a sacola) não perde o envio.
  const primeira = useRef(true);
  const pendente = useRef<EventoRastro | null>(null);
  useEffect(() => {
    if (!pronta) return;
    if (primeira.current) { primeira.current = false; return; }
    pendente.current = { tipo: 'carrinho', itens: itens.map(i => ({ varianteId: i.varianteId, quantidade: i.quantidade })) };
    const t = setTimeout(() => soltar(pendente), 800);
    return () => clearTimeout(t);
  }, [itens, pronta]);
  useEffect(() => {
    const aoMudar = () => { if (document.visibilityState === 'hidden') { soltar(pendente); enviarRastro(); } };
    const aoSair = () => { soltar(pendente); enviarRastro(); };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('pagehide', aoSair);
    return () => {
      document.removeEventListener('visibilitychange', aoMudar);
      window.removeEventListener('pagehide', aoSair);
      aoSair();
    };
  }, []);

  return null;
}

/** Põe na fila o envio da sacola que estava esperando, se houver. */
function soltar(pendente: RefObject<EventoRastro | null>) {
  if (pendente.current) rastrear(pendente.current);
  pendente.current = null;
}
