import { describe, expect, it } from 'vitest';
import { contatoDe, numeroEmUso, situacaoVinculo } from '@/lib/numeros';

const PADRAO = '49988036499';
const numero = (status: string) => ({ telefone: '49999990001', status });

describe('contatoDe (D-31)', () => {
  it('vendedora ativa com número ativo: o número dela, com o nome', () => {
    expect(contatoDe({ name: 'Ana Paula', ativo: true, numeroPrincipal: numero('ativo') }, PADRAO)).toEqual({ telefone: '49999990001', nome: 'Ana Paula' });
  });
  it('sem número, número pausado ou desativado, vendedora inativa ou ausente: o padrão da loja, sem nome', () => {
    const padrao = { telefone: PADRAO, nome: null };
    expect(contatoDe({ name: 'Ana', ativo: true, numeroPrincipal: null }, PADRAO)).toEqual(padrao);
    expect(contatoDe({ name: 'Ana', ativo: true, numeroPrincipal: numero('pausado') }, PADRAO)).toEqual(padrao);
    expect(contatoDe({ name: 'Ana', ativo: true, numeroPrincipal: numero('desativado') }, PADRAO)).toEqual(padrao);
    expect(contatoDe({ name: 'Ana', ativo: false, numeroPrincipal: numero('ativo') }, PADRAO)).toEqual(padrao);
    expect(contatoDe(null, PADRAO)).toEqual(padrao);
  });
  it('numeroEmUso só aceita ativo', () => {
    expect(numeroEmUso({ status: 'ativo' })).toBe(true);
    expect(numeroEmUso({ status: 'pausado' })).toBe(false);
    expect(numeroEmUso(null)).toBe(false);
  });
});

describe('situacaoVinculo', () => {
  const agora = new Date();
  it('as quatro situações', () => {
    expect(situacaoVinculo({ conexao: 'aguardando', fimEm: null, desconectadoEm: null })).toBe('Aguardando conexão');
    expect(situacaoVinculo({ conexao: 'conectado', fimEm: null, desconectadoEm: null })).toBe('Aparelho conectado');
    expect(situacaoVinculo({ conexao: 'conectado', fimEm: agora, desconectadoEm: null })).toBe('Aguardando desconexão');
    expect(situacaoVinculo({ conexao: 'conectado', fimEm: agora, desconectadoEm: agora })).toBe('Encerrado');
  });
});
