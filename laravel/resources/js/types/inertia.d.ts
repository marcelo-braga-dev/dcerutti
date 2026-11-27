import type { Token } from '@/tema/cores';

export type Papel = 'cliente' | 'vendedor' | 'gestor';
export type UsuarioLogado = { id: string; nome: string; email: string; papel: Papel };
export type Imagem = { url: string; largura: number; altura: number };
export type IdentidadePublica = { nome: string; slogan: string | null; cores: Partial<Record<Token, string>>; logo: Imagem; logoClara: Imagem };

/** Props que toda página recebe (app/Http/Middleware/HandleInertiaRequests.php). */
export type PropsCompartilhadas = {
  usuario: UsuarioLogado | null;
  identidade: IdentidadePublica;
  flash: { sucesso: string | null; erro: string | null; avisarCliente?: boolean };
  /** Só para a equipe, nas telas do painel: contadores e áreas ligadas do menu (D-35). */
  /** Só nas telas da loja (app/Http/Middleware/AcessoLoja.php). */
  loja?: {
    atalhos: { rotulo: string; href: string }[]; favoritos: number[]; cliente: boolean; rastrear: boolean; whatsapp: string; instagram: string;
    cidadeCondicional: string; parcelas: number; frete: { valor: number; gratisAcima: number } | null;
  };
  painel: { pendentes: number; notificacoes: number; atendimento: boolean; fila?: number; vitrines: boolean; pagamentos: boolean } | null;
};

declare module '@inertiajs/core' {
  export interface InertiaConfig {
    sharedPageProps: PropsCompartilhadas;
  }
}
