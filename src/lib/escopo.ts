import type { Papel } from '@prisma/client';

/**
 * Regras de escopo, sem dependência do Next: também rodam nos scripts de manutenção. A sessão fica em server/permissoes.ts.
 */
export type Usuario = { id: string; name: string; email: string; papel: Papel; telefone: string | null; aceitouPrivacidadeEm: Date | null };

/** Filtro para consultas: o vendedor só enxerga o que é dele; o gestor enxerga tudo. */
export function escopoVendedor(u: Usuario): { vendedorId?: string } {
  return u.papel === 'gestor' ? {} : { vendedorId: u.id };
}

/** Atendimento online: a vendedora vê os dela; o gestor vê tudo, inclusive os sem responsável. */
export function escopoAtendimento(u: Usuario): { responsavelId?: string } {
  return u.papel === 'gestor' ? {} : { responsavelId: u.id };
}

export function podeAtender(u: Usuario, a: { responsavelId: string | null }) {
  return u.papel === 'gestor' || a.responsavelId === u.id;
}

export function podeAcessar(u: Usuario, registro: { vendedorId: string }) {
  return u.papel === 'gestor' || registro.vendedorId === u.id;
}
