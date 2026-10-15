import Link from 'next/link';
import type { ReactNode } from 'react';
import { AbasConta } from '@/components/loja/abas-conta';
import { IconeWhatsApp } from '@/components/loja/previa-whatsapp';
import { EtiquetaStatus, EtiquetaTipo } from '@/components/ui/status-pedido';
import { formatarData } from '@/lib/datas';
import { linkWhatsApp } from '@/lib/whatsapp';
import { sair } from '@/server/acoes/conta';
import { resumoDaConta } from '@/server/consultas/clientes';
import { cuponsDoClienteLogado } from '@/server/consultas/cupons';
import { exigirPapel } from '@/server/permissoes';
import { lerConfig } from '@/server/config';

/** Área da cliente: nome, resumo (último pedido, favoritos, cupons, quem atende) e as abas. Cada página confere o papel de novo. */
export default async function LayoutMinhaConta({ children }: { children: React.ReactNode }) {
  const [u, cfg] = await Promise.all([exigirPapel(['cliente']), lerConfig()]);
  const [resumo, cupons] = await Promise.all([resumoDaConta(u), cfg.cupons.ligados ? cuponsDoClienteLogado(u) : []]);
  const cuponsDisponiveis = cupons.filter(c => c.situacao === 'disponivel').length;
  const primeiro = u.name.split(' ')[0];

  return (
    <div className="py-8 sm:py-10 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="rotulo text-caramelo mb-2">Minha conta</div>
          <h1 className="titulo text-2xl sm:text-3xl truncate">Olá, {primeiro}</h1>
          <p className="mt-1 text-sm text-suave truncate">{u.email}</p>
        </div>
        <form action={sair}>
          <button className="rotulo text-suave underline underline-offset-4 hover:text-caramelo">Sair</button>
        </form>
      </div>

      {resumo && (
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-px bg-borda border border-borda">
          <Bloco rotulo="Último pedido" href="/minha-conta/pedidos">
            {resumo.ultimoPedido ? (
              <>
                <span className="font-display font-extrabold text-marrom-950">{resumo.ultimoPedido.codigo}</span>
                <span className="flex flex-wrap gap-1 mt-1"><EtiquetaTipo tipo={resumo.ultimoPedido.tipo} /><EtiquetaStatus status={resumo.ultimoPedido.status} /></span>
                <span className="text-xs text-suave mt-1">{formatarData(resumo.ultimoPedido.criadoEm)} · {resumo.pedidos} no total</span>
              </>
            ) : <span className="text-sm text-suave">Nenhum ainda</span>}
          </Bloco>
          <Bloco rotulo="Favoritos" href="/minha-conta/favoritos">
            <span className="font-display font-extrabold text-2xl text-marrom-950">{resumo.favoritos}</span>
            <span className="text-xs text-suave">{resumo.favoritos === 1 ? 'peça guardada' : 'peças guardadas'}</span>
          </Bloco>
          {cfg.cupons.ligados ? (
            <Bloco rotulo="Cupons" href="/minha-conta/cupons">
              <span className="font-display font-extrabold text-2xl text-marrom-950">{cuponsDisponiveis}</span>
              <span className="text-xs text-suave">{cuponsDisponiveis === 1 ? 'disponível para usar' : 'disponíveis para usar'}</span>
            </Bloco>
          ) : (
            <Bloco rotulo="Catálogo" href="/catalogo?ordem=novidades">
              <span className="text-sm text-marrom-950">Ver as novidades</span>
              <span className="text-xs text-suave">Peças que acabaram de chegar</span>
            </Bloco>
          )}
          <div className="bg-card p-4 grid content-start gap-1">
            <span className="rotulo !text-[0.6rem] text-suave">Quem te atende</span>
            {resumo.atendimento ? (
              <>
                <span className="text-sm font-semibold text-marrom-950 truncate">{resumo.atendimento.nome}</span>
                <a href={linkWhatsApp(resumo.atendimento.telefone, `Olá, ${resumo.atendimento.nome.split(' ')[0]}!`)} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-1.5 text-sm text-whatsapp underline underline-offset-4"><IconeWhatsApp className="size-4" />Chamar no WhatsApp</a>
              </>
            ) : (
              <a href={linkWhatsApp(cfg.whatsappLoja, 'Olá! Vim pelo catálogo da D’Cerutti.')} target="_blank" rel="noopener"
                className="inline-flex items-center gap-1.5 text-sm text-whatsapp underline underline-offset-4"><IconeWhatsApp className="size-4" />Falar com a loja</a>
            )}
          </div>
        </div>
      )}

      <AbasConta cupons={cfg.cupons.ligados} />
      <div className="pt-8">{children}</div>
    </div>
  );
}

function Bloco({ rotulo, href, children }: { rotulo: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className="bg-card p-4 grid content-start gap-1 hover:bg-creme">
      <span className="rotulo !text-[0.6rem] text-suave">{rotulo}</span>
      {children}
    </Link>
  );
}
