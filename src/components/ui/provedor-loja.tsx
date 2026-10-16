'use client';

import type { ReactNode } from 'react';
import { lembrarLoja } from '@/lib/loja';

/**
 * Entrega o nome e a assinatura da loja (D-25) aos componentes do navegador. Os componentes 'use client' são
 * pré-renderizados no servidor numa cópia própria dos módulos, que não passa por `lerConfig`; sem isto, eles
 * mostrariam o nome de fábrica na primeira renderização. É o mesmo valor para todas as páginas, então guardar no
 * módulo durante a renderização não mistura nada.
 */
export function ProvedorLoja({ nome, slogan, children }: { nome: string; slogan: string; children: ReactNode }) {
  lembrarLoja({ nome, slogan });
  return children;
}
