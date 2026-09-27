import Image from 'next/image';
import { otimizavel } from '@/lib/imagens';


/** Foto de produto 3:4. Usa o otimizador do Next para hosts conhecidos; outros endereços vão direto. */
export function Foto({ src, alt, sizes, prioridade, className = '' }: { src?: string | null; alt: string; sizes: string; prioridade?: boolean; className?: string }) {
  if (!src) return <div className={`absolute inset-0 grid place-items-center bg-bege text-suave rotulo ${className}`}>Sem foto</div>;
  if (!otimizavel(src))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading={prioridade ? 'eager' : 'lazy'} className={`absolute inset-0 size-full object-cover ${className}`} />;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={prioridade} className={`object-cover ${className}`} />;
}
