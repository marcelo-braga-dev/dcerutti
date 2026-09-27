/**
 * Datas do negócio no fuso America/Sao_Paulo (RN-12). No banco tudo é UTC.
 * O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo em -03:00.
 * Se voltar a existir, só `OFFSET` e `inicioDoMes` precisam mudar.
 */
export const TZ = 'America/Sao_Paulo';
const OFFSET = '-03:00';

const partes = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)!.value;
  return { ano: get('year'), mes: get('month'), dia: get('day') };
};

/** "2026-09" do momento informado, no fuso de São Paulo. */
export function mesDe(d: Date = new Date()) {
  const { ano, mes } = partes(d);
  return `${ano}-${mes}`;
}

/** "2026-09-27" no fuso de São Paulo. */
export function diaDe(d: Date = new Date()) {
  const { ano, mes, dia } = partes(d);
  return `${ano}-${mes}-${dia}`;
}

export const inicioDoMes = (ym: string) => new Date(`${ym}-01T00:00:00${OFFSET}`);

export function somarMeses(ym: string, n: number) {
  const [a, m] = ym.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Intervalo [início, fim) do mês em UTC, para consultas. */
export const intervaloDoMes = (ym: string) => ({ gte: inicioDoMes(ym), lt: inicioDoMes(somarMeses(ym, 1)) });

/** "2026-09-27" (campo date do formulário) → meio-dia em São Paulo, longe das viradas de dia. */
export const dataDoFormulario = (iso: string) => new Date(`${iso}T12:00:00${OFFSET}`);

export const formatarData = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ });

export const formatarDataHora = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });

export function nomeDoMes(ym: string) {
  const s = inicioDoMes(ym).toLocaleDateString('pt-BR', { timeZone: TZ, month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const mesValido = (ym: unknown): ym is string => typeof ym === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
