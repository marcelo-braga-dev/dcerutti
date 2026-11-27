/** POST de JSON fora do fluxo de páginas do Inertia (montador, buscas), com o token CSRF do cookie do Laravel. */
export async function postJson<T>(url: string, dados: unknown): Promise<T> {
  const xsrf = decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');
  const r = await fetch(url, {
    method: 'POST', credentials: 'same-origin', body: JSON.stringify(dados),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf, 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (r.status === 422) {
    const corpo = await r.json();
    const primeiro = Object.values(corpo.errors ?? {})[0] as string[] | undefined;
    return { ok: false, erro: primeiro?.[0] ?? corpo.message ?? 'Confira os dados.' } as T;
  }
  if (!r.ok) return { ok: false, erro: 'Não foi possível concluir. Tente novamente.' } as T;
  return r.json();
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  return r.json();
}
