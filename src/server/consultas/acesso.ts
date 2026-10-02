import 'server-only';
import type { Usuario } from '../permissoes';

/**
 * Camada de leitura (consultas/). As páginas não importam `db`: leem por aqui, e cada função recebe o usuário e aplica
 * o escopo dele. Assim a regra "vendedor só vê o que é dele" fica em um lugar só.
 */
export function exigirGestor(u: Usuario) {
  if (u.papel !== 'gestor') throw new Error('Consulta restrita ao gestor.');
}
