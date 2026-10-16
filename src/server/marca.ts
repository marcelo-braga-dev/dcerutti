import 'server-only';
import { cache } from 'react';
import { lerConfig } from './config';
import { coresDe, cssDoTema, LOGO_CLARA_PADRAO, LOGO_PADRAO } from '@/lib/identidade';
import { NOME_PADRAO, SLOGAN_PADRAO } from '@/lib/loja';

/** Identidade visual em uso (D-25): as cores completas, o CSS das que mudaram e as logos, com a marca de fábrica no que faltar. */
export const marcaAtual = cache(async () => {
  const id = (await lerConfig()).identidade;
  const nome = id.nome || NOME_PADRAO, slogan = id.slogan ?? SLOGAN_PADRAO;
  return {
    nome, slogan, nomeComSlogan: slogan ? `${nome} — ${slogan}` : nome,
    cores: coresDe(id),
    css: cssDoTema(id.cores),
    logo: id.logo ?? LOGO_PADRAO,
    logoClara: id.logoClara ?? LOGO_CLARA_PADRAO,
    favicon: id.favicon,
  };
});
