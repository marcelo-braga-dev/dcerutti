'use client';

import { useState } from 'react';
import { Foto } from '@/components/loja/foto';

/**
 * U-09: fotos do produto como miniaturas (mover, remover, enviar) em vez de uma lista de endereços em texto.
 * O formulário recebe o mesmo campo `imagens` (um endereço por linha, na ordem de exibição).
 */
export function FotosProduto({ inicial }: { inicial: string[] }) {
  const [fotos, setFotos] = useState(inicial);
  const [estado, setEstado] = useState<string | null>(null);
  const [link, setLink] = useState('');

  const mover = (i: number, d: number) => setFotos(f => { const n = [...f]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remover = (i: number) => setFotos(f => f.filter((_, k) => k !== i));

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const referencia = (document.getElementById('campo-referencia') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!referencia) return setEstado('Preencha a referência antes de enviar fotos.');
    for (const [i, arquivo] of [...arquivos].entries()) {
      setEstado(`Enviando ${i + 1} de ${arquivos.length}…`);
      const corpo = new FormData();
      corpo.set('referencia', referencia);
      corpo.set('arquivo', arquivo);
      const r = await fetch('/api/upload', { method: 'POST', body: corpo });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setEstado(d.erro ?? (r.status === 413 ? 'Foto grande demais.' : 'Falha no envio.'));
      setFotos(f => [...f, d.publica]);
    }
    setEstado('Fotos enviadas. Salve o produto para gravar.');
  };

  const adicionarLink = () => {
    const u = link.trim();
    if (!/^https:\/\/\S+$/.test(u)) return setEstado('Use um endereço que comece com https://');
    setFotos(f => [...f, u]);
    setLink('');
    setEstado(null);
  };

  return (
    <div className="grid gap-3">
      <span className="block rotulo text-suave">Fotos (a primeira é a capa)</span>
      <input type="hidden" name="imagens" value={fotos.join('\n')} />
      {fotos.length === 0 ? (
        <p className="text-sm text-suave">Nenhuma foto. O produto aparece com &quot;Sem foto&quot;.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {fotos.map((src, i) => (
            <li key={`${src}-${i}`} className="w-28 grid gap-1">
              <div className="relative aspect-[3/4] bg-bege border border-borda">
                <Foto src={src} alt={`Foto ${i + 1}`} sizes="112px" />
                {i === 0 && <span className="absolute left-1 top-1 bg-marrom-950 text-creme rotulo !text-[0.55rem] px-1.5 py-0.5">Capa</span>}
              </div>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="px-2 disabled:text-borda-forte" aria-label={`Mover foto ${i + 1} para antes`}>←</button>
                <button type="button" onClick={() => remover(i)} className="px-2 text-vermelho" aria-label={`Remover foto ${i + 1}`}>Remover</button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="px-2 disabled:text-borda-forte" aria-label={`Mover foto ${i + 1} para depois`}>→</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rotulo border border-marrom-950 px-3 py-2 hover:bg-marrom-950 hover:text-creme">
          Enviar fotos
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
        </label>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="ou cole um endereço https://" aria-label="Endereço de foto" className="h-10 px-3 border border-borda-forte bg-card flex-1 min-w-48" />
        <button type="button" onClick={adicionarLink} className="rotulo border border-borda-forte px-3 py-2">Adicionar</button>
      </div>
      {estado && <p className="text-sm text-suave" role="status">{estado}</p>}
    </div>
  );
}
