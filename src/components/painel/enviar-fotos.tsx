'use client';

import { useState } from 'react';

/** Envia fotos ao servidor (/api/upload) e acrescenta as URLs no campo de imagens do formulário. */
export function EnviarFotos({ campoId }: { campoId: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const campo = document.getElementById(campoId) as HTMLTextAreaElement | null;
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
