import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Ordem fixa dos arquivos: os invariantes do seed rodam primeiro (banco recém-semeado), os invariantes finais por
 * último (depois de tudo que a suíte fez pelo sistema), e o resto em ordem alfabética.
 */
export default class OrdemDosArquivos extends BaseSequencer {
  async sort(arquivos: TestSpecification[]) {
    const peso = (f: string) => (f.endsWith('/invariantes.test.ts') ? 0 : f.includes('/zz-') ? 2 : 1);
    return [...arquivos].sort((a, b) => peso(a.moduleId) - peso(b.moduleId) || a.moduleId.localeCompare(b.moduleId));
  }
  async shard(arquivos: TestSpecification[]) {
    return arquivos;
  }
}
