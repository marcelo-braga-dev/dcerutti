import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link } from '@inertiajs/react';

/**
 * Ponte entre o MUI e o Inertia: o tema usa isto como `LinkComponent` dos botões e como componente do Link, então
 * qualquer `href` interno navega pelo Inertia. Endereço externo, `target` ou download continuam um <a> comum.
 */
export const LinkInertia = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function LinkInertia(props, ref) {
  const { href, target, download, ...resto } = props;
  if (/^(https?:|mailto:|tel:)/.test(href) || target || download) return <a ref={ref} href={href} target={target} download={download} {...resto} />;
  return <Link ref={ref as never} href={href} {...(resto as object)} />;
});
