/** Lê os pacotes autoextraíveis do protótipo (ver docs/08-migracao-do-prototipo.md). */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export type Recurso = { mime: string; dados: Buffer };

export function lerPacote(arquivo: string) {
  const html = readFileSync(arquivo, 'utf8');
  const bloco = (tipo: string) => {
    const m = html.match(new RegExp(`<script type="__bundler/${tipo}">\\s*([\\s\\S]*?)\\s*</script>`));
    if (!m) throw new Error(`Bloco __bundler/${tipo} não encontrado em ${arquivo}`);
    return JSON.parse(m[1]);
  };
  const manifest: Record<string, { mime: string; compressed?: boolean; data: string }> = bloco('manifest');
  const nomes: { id: string; uuid: string }[] = bloco('ext_resources');
  const recursos = new Map<string, Recurso>();
  for (const [uuid, e] of Object.entries(manifest)) {
    let dados = Buffer.from(e.data, 'base64');
    if (e.compressed) dados = gunzipSync(dados);
    recursos.set(uuid, { mime: e.mime, dados });
  }
  const porNome = (id: string) => {
    const uuid = nomes.find(n => n.id === id)?.uuid;
    return uuid ? recursos.get(uuid) : undefined;
  };
  return { recursos, porNome, template: bloco('template') as string };
}
