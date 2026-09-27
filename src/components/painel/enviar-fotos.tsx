'use client';

import { useState } from 'react';

/** Envia fotos ao R2 e acrescenta as URLs no campo de imagens do formulário. */
export function EnviarFotos({ campoId }: { campoId: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const campo = document.getElementById(campoId) as HTMLTextAreaElement | null;
    const referencia = (document.getElementById('campo-referencia') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!referencia) return setEstado('Preencha a referência antes de enviar fotos.');
    for (const [i, arquivo] of [...arquivos].entries()) {
      setEstado(`Enviando ${i + 1} de ${arquivos.length}…`);
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referencia, tipo: arquivo.type }) });
      const d = await r.json();
      if (!r.ok) return setEstado(d.erro ?? 'Falha no envio.');
      const up = await fetch(d.url, { method: 'PUT', body: arquivo, headers: { 'Content-Type': arquivo.type } });
      if (!up.ok) return setEstado('Falha ao enviar a foto ao armazenamento.');
      if (campo) campo.value = [campo.value.trim(), d.publica].filter(Boolean).join('\n');
    }
    setEstado('Fotos enviadas. Salve o produto para gravar.');
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="cursor-pointer rotulo border border-marrom-950 px-3 py-2 hover:bg-marrom-950 hover:text-creme">
        Enviar fotos
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={e => enviar(e.target.files)} />
      </label>
      {estado && <span className="text-suave">{estado}</span>}
    </div>
  );
}
