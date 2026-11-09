import { describe, expect, it } from 'vitest';
import { conferirVitrine, gerarSlug, legendaSugerida, ofertaVale, proximosStatus, urlInstagramValida, vitrineAtiva } from '@/lib/vitrines';

describe('gerarSlug', () => {
  it('sem acento, curto e nunca vazio', () => {
    expect(gerarSlug('Novidades de Inverno!')).toBe('novidades-de-inverno');
    expect(gerarSlug('  Coração & Ação  ')).toBe('coracao-acao');
    expect(gerarSlug('!!!')).toBe('vitrine');
    expect(gerarSlug('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe('urlInstagramValida', () => {
  it('só https do Instagram', () => {
    expect(urlInstagramValida(' https://www.instagram.com/p/abc/ ')).toBe('https://www.instagram.com/p/abc/');
    expect(urlInstagramValida('https://instagram.com/dcerutti_')).toBe('https://instagram.com/dcerutti_');
    for (const ruim of ['http://www.instagram.com/p/a', 'javascript:alert(1)', 'https://instagram.com.falso.com/p/a', 'https://falso.com/instagram.com', 'https://user:senha@instagram.com/', 'https://instagram.com:8080/', 'qualquer', ''])
      expect(urlInstagramValida(ruim)).toBeNull();
  });
});

describe('situações', () => {
  it('live: rascunho → agendada → no ar → encerrada → arquivada', () => {
    expect(proximosStatus('live', 'rascunho')).toEqual(['agendada']);
    expect(proximosStatus('live', 'agendada')).toEqual(['no_ar', 'rascunho']);
    expect(proximosStatus('live', 'no_ar')).toEqual(['encerrada']);
    expect(proximosStatus('live', 'encerrada')).toEqual(['arquivada']);
    expect(proximosStatus('live', 'publicada')).toEqual([]);
  });
  it('publicação: rascunho → publicada → encerrada, que pode voltar', () => {
    expect(proximosStatus('post', 'rascunho')).toEqual(['publicada']);
    expect(proximosStatus('reels', 'publicada')).toEqual(['encerrada']);
    expect(proximosStatus('story', 'encerrada')).toEqual(['arquivada', 'publicada']);
    expect(proximosStatus('post', 'no_ar')).toEqual([]);
    expect(proximosStatus('post', 'arquivada')).toEqual(['encerrada']);
  });
  it('quem está ativa', () => {
    expect(['agendada', 'no_ar', 'publicada'].every(vitrineAtiva)).toBe(true);
    expect(['rascunho', 'encerrada', 'arquivada'].some(vitrineAtiva)).toBe(false);
  });
});

describe('ofertaVale', () => {
  const agora = new Date('2026-11-10T12:00:00Z');
  it('ativa e dentro da data', () => {
    expect(ofertaVale({ status: 'publicada', ofertaAte: null }, agora)).toBe(true);
    expect(ofertaVale({ status: 'no_ar', ofertaAte: new Date('2026-11-11T00:00:00Z') }, agora)).toBe(true);
    expect(ofertaVale({ status: 'publicada', ofertaAte: new Date('2026-11-09T00:00:00Z') }, agora)).toBe(false);
    expect(ofertaVale({ status: 'encerrada', ofertaAte: null }, agora)).toBe(false);
    expect(ofertaVale({ status: 'rascunho', ofertaAte: null }, agora)).toBe(false);
  });
});

describe('conferirVitrine', () => {
  const peca = { nome: 'Blusa', imagens: 1, videos: 1, tamanhos: 3, ativa: true };
  it('aponta o que falta, sem bloquear', () => {
    expect(conferirVitrine({ tipo: 'post', urlInstagram: null, inicioPrevisto: null, pecas: [] })).toEqual(expect.arrayContaining(['Adicione pelo menos uma peça.', 'Falta o link da publicação no Instagram.', 'Falta a legenda da publicação.']));
    expect(conferirVitrine({ tipo: 'live', urlInstagram: null, inicioPrevisto: null, pecas: [peca] })).toEqual(['Marque a data e a hora da live.']);
    expect(conferirVitrine({ tipo: 'post', urlInstagram: 'x', inicioPrevisto: null, legenda: 'y', pecas: [{ ...peca, tamanhos: 0 }, { ...peca, nome: 'B', imagens: 0, tamanhos: 1 }, { ...peca, nome: 'C', ativa: false }] }))
      .toEqual(['Blusa: sem estoque.', 'B: só um tamanho disponível.', 'B: sem foto.', 'C: fora do catálogo; não aparece na página.']);
    expect(conferirVitrine({ tipo: 'live', urlInstagram: null, inicioPrevisto: new Date(), pecas: [{ ...peca, videos: 0 }] })).toEqual(['Blusa: sem vídeo (opcional).']);
  });
  it('legenda aponta para o endereço curto', () => {
    expect(legendaSugerida({ tipo: 'live', titulo: 'Live', dominio: 'loja.com' })).toContain('loja.com/live');
    expect(legendaSugerida({ tipo: 'post', titulo: 'Post', dominio: 'loja.com' })).toContain('loja.com/vitrines');
  });
});
