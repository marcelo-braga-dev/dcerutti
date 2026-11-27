import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

createInertiaApp({
  title: titulo => (titulo ? `${titulo} · D’Cerutti` : 'D’Cerutti'),
  // Cada página num pedaço separado, carregado quando é aberta.
  resolve: nome => {
    const paginas = import.meta.glob('./Pages/**/*.tsx');
    const pagina = paginas[`./Pages/${nome}.tsx`];
    if (!pagina) throw new Error(`Página não encontrada: ${nome}`);
    return pagina() as never;
  },
  setup({ el, App, props }) {
    createRoot(el!).render(<App {...props} />);
  },
  progress: { color: '#6d402a' },
});
