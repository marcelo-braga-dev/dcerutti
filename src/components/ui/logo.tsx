import Image from 'next/image';
import type { Imagem } from '@/lib/identidade';
import { nomeComSlogan } from '@/lib/loja';

/** Logo da identidade visual (D-25). O tamanho vem do `className` (altura ou largura fixa, a outra automática). */
export function Logo({ img, className = '', prioridade, alt }: { img: Imagem; className?: string; prioridade?: boolean; alt?: string }) {
  return <Image src={img.url} alt={alt ?? nomeComSlogan()} width={img.largura} height={img.altura} sizes="240px" className={className} priority={prioridade} />;
}
