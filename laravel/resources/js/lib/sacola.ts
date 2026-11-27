import { useSyncExternalStore } from 'react';
import { rastrear } from './rastro';

/**
 * Sacola no navegador (RF-05; porta de src/components/loja/sacola.tsx). Fica num store do módulo, para sobreviver às
 * trocas de página do Inertia, e no localStorage (mesma chave do sistema em Next). Não guarda nada sensível: preço e
 * estoque são conferidos no servidor ao abrir a sacola e ao enviar.
 */
export type ItemSacola = {
  varianteId: number; referencia: string; nome: string; marca: string; cor: string | null; tamanho: string; codigoInterno: string | null;
  preco: number; imagem: string | null; quantidade: number;
  /** Disponível quando entrou na sacola (B-05). Sem valor em sacolas antigas: vale o limite geral. */
  maximo?: number;
};

export type Conferencia = Record<number, { preco: number; disponivel: number } | null>;

const CHAVE = 'dcerutti-sacola-v1';
const LIMITE = 20;
export const maximoDo = (i: Pick<ItemSacola, 'maximo'>) => Math.min(LIMITE, i.maximo ?? LIMITE);

type Estado = { itens: ItemSacola[]; pronta: boolean; ultimo: { item: Omit<ItemSacola, 'quantidade'>; em: number } | null };
let estado: Estado = { itens: [], pronta: false, ultimo: null };
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<Estado>) {
  estado = { ...estado, ...novo };
  if (novo.itens) try { localStorage.setItem(CHAVE, JSON.stringify(estado.itens)); } catch { /* sem armazenamento */ }
  ouvintes.forEach(o => o());
}

function carregar() {
  if (estado.pronta || typeof window === 'undefined') return;
  let itens: ItemSacola[] = [];
  try { const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); if (Array.isArray(salvo)) itens = salvo; } catch { /* vazia */ }
  estado = { ...estado, itens, pronta: true };
  window.addEventListener('storage', e => {
    if (e.key === CHAVE) try { estado = { ...estado, itens: JSON.parse(e.newValue ?? '[]') }; ouvintes.forEach(o => o()); } catch { /* ignora */ }
  });
}

function assinar(o: () => void) {
  carregar();
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const sacola = {
  /** Devolve false quando a peça já está no máximo disponível. */
  adicionar(i: Omit<ItemSacola, 'quantidade'>): boolean {
    const ex = estado.itens.find(x => x.varianteId === i.varianteId);
    if (ex && ex.quantidade >= maximoDo(i)) return false;
    const itens = ex
      ? estado.itens.map(x => (x.varianteId === i.varianteId ? { ...x, ...i, quantidade: Math.min(maximoDo(i), x.quantidade + 1) } : x))
      : [...estado.itens, { ...i, quantidade: 1 }];
    rastrear({ tipo: 'sacola', varianteId: i.varianteId, delta: 1 });
    mudar({ itens, ultimo: { item: i, em: Date.now() } });
    return true;
  },
  alterar(id: number, delta: number) {
    const x = estado.itens.find(i => i.varianteId === id);
    if (!x) return;
    const real = Math.max(0, Math.min(maximoDo(x), x.quantidade + delta)) - x.quantidade;
    if (real) rastrear({ tipo: 'sacola', varianteId: id, delta: real });
    mudar({ itens: estado.itens.map(i => (i.varianteId === id ? { ...i, quantidade: Math.min(maximoDo(i), i.quantidade + delta) } : i)).filter(i => i.quantidade > 0) });
  },
  remover(id: number) {
    const x = estado.itens.find(i => i.varianteId === id);
    if (x) rastrear({ tipo: 'sacola', varianteId: id, delta: -Math.min(20, x.quantidade) });
    mudar({ itens: estado.itens.filter(i => i.varianteId !== id) });
  },
  limpar() { mudar({ itens: [] }); },
  /** "Comprar de novo": junta as peças (somando quantidades, sem passar do máximo). */
  juntar(novos: ItemSacola[]) {
    const r = [...estado.itens];
    for (const n of novos) {
      const i = r.findIndex(x => x.varianteId === n.varianteId);
      if (i < 0) r.push({ ...n, quantidade: Math.min(maximoDo(n), n.quantidade) });
      else r[i] = { ...r[i], ...n, quantidade: Math.min(maximoDo(n), r[i].quantidade + n.quantidade) };
      rastrear({ tipo: 'sacola', varianteId: n.varianteId, delta: Math.min(20, n.quantidade) });
    }
    mudar({ itens: r });
  },
  /** Aplica a conferência do servidor (preço e máximo de agora) e devolve o que mudou. */
  conferir(c: Conferencia) {
    const precos: string[] = [], ajustados: string[] = [];
    const itens = estado.itens.map(x => {
      const agora = c[x.varianteId];
      if (!agora) return x; // indisponível: fica marcado na tela para remover
      if (Math.abs(agora.preco - x.preco) > 0.004) precos.push(x.nome);
      const quantidade = Math.max(1, Math.min(x.quantidade, agora.disponivel || 1));
      if (quantidade !== x.quantidade) ajustados.push(x.nome);
      return { ...x, preco: agora.preco, maximo: agora.disponivel, quantidade };
    });
    mudar({ itens });
    return { precos, ajustados };
  },
  fecharUltimo() { mudar({ ultimo: null }); },
};

const servidor: Estado = { itens: [], pronta: false, ultimo: null };

export function useSacola() {
  const s = useSyncExternalStore(assinar, () => estado, () => servidor);
  return {
    ...s, ...sacola,
    quantidade: s.itens.reduce((a, i) => a + i.quantidade, 0),
    subtotal: s.itens.reduce((a, i) => a + i.preco * i.quantidade, 0),
  };
}
