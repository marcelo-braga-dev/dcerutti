'use client';

// Substitui o layout raiz quando ele mesmo falha: precisa do próprio <html>, sem os estilos globais.
export default function ErroGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f2ec', color: '#2e2520', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0, textAlign: 'center' }}>
        <title>Algo deu errado</title>
        <main style={{ padding: 24 }}>
          <h1>Algo deu errado</h1>
          <p>O site está com um problema. Tente de novo em instantes{error.digest ? ` (código ${error.digest})` : ''}.</p>
          <button type="button" onClick={() => retry()} style={{ padding: '10px 20px', background: '#2e2520', color: '#f6f2ec', border: 0, cursor: 'pointer' }}>Tentar de novo</button>
        </main>
      </body>
    </html>
  );
}
