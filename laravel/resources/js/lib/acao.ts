import { router } from '@inertiajs/react';

/**
 * Manda uma ação ao servidor (POST do Inertia) e devolve a mensagem de erro de regra, ou null se deu certo. Os erros
 * de negócio chegam em `errors.erro` (Controller::tentar); os de validação, no primeiro campo.
 */
export function enviarAcao(url: string, dados: Record<string, unknown> = {}): Promise<string | null> {
  return new Promise(resolve => {
    router.post(url, dados as never, {
      preserveScroll: true,
      onSuccess: () => resolve(null),
      onError: erros => resolve(erros.erro ?? Object.values(erros)[0] ?? 'Não foi possível concluir.'),
    });
  });
}
