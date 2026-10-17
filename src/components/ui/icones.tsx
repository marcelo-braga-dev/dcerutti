/** Ícones de traço (herdam a cor do texto). Decorativos: quem usa dá o nome acessível ao botão ou link. */
type P = { className?: string };
const base = (className = 'size-5') => ({ viewBox: '0 0 24 24', className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconeLupa = ({ className }: P) => <svg {...base(className)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const IconePessoa = ({ className }: P) => <svg {...base(className)}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" /></svg>;
export const IconeSacola = ({ className }: P) => <svg {...base(className)}><path d="M5.5 8h13l-1 12.5h-11z" /><path d="M9 10V6.8a3 3 0 0 1 6 0V10" /></svg>;
export const IconeMenu = ({ className }: P) => <svg {...base(className)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconeFechar = ({ className }: P) => <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconeSeta = ({ className }: P) => <svg {...base(className)}><path d="M9 6l6 6-6 6" /></svg>;
export const IconeCaminhao = ({ className }: P) => <svg {...base(className)}><path d="M3 6.5h11v9H3zM14 9.5h3.5L21 13v2.5h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>;
export const IconeCasa = ({ className }: P) => <svg {...base(className)}><path d="M4 11 12 4.5 20 11v8.5H4z" /><path d="M10 19.5v-5h4v5" /></svg>;
export const IconeSelo = ({ className }: P) => <svg {...base(className)}><path d="M12 3.5l2.3 1.6 2.8-.1.9 2.6 2.2 1.7-.8 2.7.8 2.7-2.2 1.7-.9 2.6-2.8-.1L12 20.5l-2.3-1.6-2.8.1-.9-2.6-2.2-1.7.8-2.7-.8-2.7 2.2-1.7.9-2.6 2.8.1z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconeConversa = ({ className }: P) => <svg {...base(className)}><path d="M4 5.5h16v10H9l-5 4z" /></svg>;
export const IconeCoracao = ({ className }: P) => <svg {...base(className)}><path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.6 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.3 0 5.2 3.1 4.1 6.2C19.5 15.4 12 20 12 20Z" /></svg>;
export const IconeSino = ({ className }: P) => <svg {...base(className)}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></svg>;
export const IconeMais = ({ className }: P) => <svg {...base(className)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconeRecibo = ({ className }: P) => <svg {...base(className)}><path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z" /><path d="M9 8h6M9 11.5h6M9 15h4" /></svg>;
export const IconeCaixaLoja = ({ className }: P) => <svg {...base(className)}><path d="M4 10h16v9.5H4z" /><path d="M6 10V6.5h7V10M15 10V4.5h3V10" /><path d="M8 14h8" /></svg>;
export const IconeLoja = ({ className }: P) => <svg {...base(className)}><path d="M4 9.5 5.5 4.5h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v7.5h13V12M10 19.5v-4.5h4v4.5" /></svg>;
