'use client';

import { TelaDeErro } from '@/components/ui/erro';

export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <TelaDeErro error={error} retry={retry} voltar={{ href: '/painel', rotulo: 'Voltar ao painel' }} />;
}
