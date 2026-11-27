#!/usr/bin/env node
/**
 * Gera app/Models e app/Enums a partir do prisma/schema.prisma do sistema em Next (docs/29, fase 0).
 * Roda uma vez para criar o ponto de partida; depois os models são mantidos à mão. Não sobrescreve arquivo existente
 * (use --forcar para sobrescrever).
 *   node ferramentas/gerar-modelos.mjs [--forcar]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const schema = readFileSync(path.resolve(raiz, '../prisma/schema.prisma'), 'utf8');
const forcar = process.argv.includes('--forcar');

// ---------- Leitura do schema ----------
const enums = new Map();
for (const m of schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm))
  enums.set(m[1], m[2].split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(l => l && !l.startsWith('///')));

const modelos = new Map();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const corpo = m[2].split('\n');
  const campos = [];
  let tabela = m[1], idComposto = null, docPendente = [];
  for (const bruta of corpo) {
    const l = bruta.trim();
    if (l.startsWith('///')) { docPendente.push(l.slice(3).trim()); continue; }
    if (!l || l.startsWith('//')) continue;
    if (l.startsWith('@@map')) { tabela = l.match(/"(.+)"/)[1]; continue; }
    if (l.startsWith('@@id')) { idComposto = l.match(/\[(.+)\]/)[1].split(',').map(s => s.trim()); continue; }
    if (l.startsWith('@@')) continue;
    const [nome, tipoBruto, ...resto] = l.replace(/\/\/.*$/, '').split(/\s+/);
    const attrs = resto.join(' ');
    const lista = tipoBruto.endsWith('[]');
    const opcional = tipoBruto.endsWith('?');
    const tipo = tipoBruto.replace(/[\[\]?]/g, '');
    const rel = attrs.match(/@relation\(([^)]*)\)/);
    let relacao = null;
    if (rel) {
      const nomeRel = rel[1].match(/^"([^"]+)"/)?.[1] ?? rel[1].match(/name:\s*"([^"]+)"/)?.[1] ?? null;
      const fields = rel[1].match(/fields:\s*\[([^\]]+)\]/)?.[1].split(',').map(s => s.trim()) ?? null;
      relacao = { nome: nomeRel, fields };
    }
    campos.push({ nome, tipo, lista, opcional, attrs, relacao, doc: docPendente.join(' ') });
    docPendente = [];
  }
  modelos.set(m[1], { nome: m[1], tabela, campos, idComposto });
}

// ---------- Tradução ----------
const ESCALARES = new Set(['String', 'Int', 'BigInt', 'Boolean', 'DateTime', 'Decimal', 'Json', 'Float']);
const ehRelacao = c => modelos.has(c.tipo);

function cast(c) {
  if (enums.has(c.tipo)) return `\\App\\Enums\\${c.tipo}::class`;
  switch (c.tipo) {
    case 'Boolean': return "'boolean'";
    case 'Int': return "'integer'";
    case 'BigInt': return "'integer'";
    case 'Float': return "'float'";
    case 'Decimal': return "'decimal:2'";
    case 'Json': return "'array'";
    case 'DateTime': return "'datetime'";
    default: return null;
  }
}

/** Do outro lado de uma relação de lista/opcional: o campo com @relation(fields) que aponta para este modelo. */
function chaveDoOutroLado(modelo, campo) {
  const outro = modelos.get(campo.tipo);
  const candidatos = outro.campos.filter(c => c.tipo === modelo.nome && c.relacao?.fields && (campo.relacao?.nome ? c.relacao.nome === campo.relacao.nome : !c.relacao.nome || modelos.get(modelo.nome).campos.filter(x => x.tipo === outro.nome).length === 1));
  const alvo = candidatos.find(c => (c.relacao.nome ?? null) === (campo.relacao?.nome ?? null)) ?? candidatos[0];
  if (!alvo) throw new Error(`Sem chave para ${modelo.nome}.${campo.nome} → ${campo.tipo}`);
  return alvo.relacao.fields[0];
}

function gerarModelo(m) {
  const id = m.campos.find(c => /@id\b/.test(c.attrs));
  const cuid = id && /@default\(cuid\(\)\)/.test(id.attrs);
  const campo = n => m.campos.find(c => c.nome === n);
  const criado = ['criadoEm', 'createdAt', 'criadaEm'].find(n => campo(n) && /now\(\)/.test(campo(n).attrs));
  const atualizado = ['atualizadoEm', 'updatedAt', 'atualizadaEm'].find(n => campo(n) && /@updatedAt/.test(campo(n).attrs));
  const usuario = m.nome === 'User';
  const linhas = [];
  linhas.push('<?php', '', 'namespace App\\Models;', '');
  const usos = new Set();
  if (cuid) usos.add('App\\Models\\Concerns\\TemCuid');
  const rels = [];
  for (const c of m.campos.filter(ehRelacao)) {
    const classe = c.tipo === 'User' ? 'User' : c.tipo;
    if (c.relacao?.fields) {
      usos.add('Illuminate\\Database\\Eloquent\\Relations\\BelongsTo');
      const ref = c.relacao && c.attrs.match(/references:\s*\[(\w+)\]/)?.[1];
      rels.push(`    public function ${c.nome}(): BelongsTo\n    {\n        return $this->belongsTo(${classe}::class, '${c.relacao.fields[0]}'${ref && ref !== 'id' ? `, '${ref}'` : ''});\n    }`);
    } else if (c.lista) {
      usos.add('Illuminate\\Database\\Eloquent\\Relations\\HasMany');
      rels.push(`    public function ${c.nome}(): HasMany\n    {\n        return $this->hasMany(${classe}::class, '${chaveDoOutroLado(m, c)}');\n    }`);
    } else {
      usos.add('Illuminate\\Database\\Eloquent\\Relations\\HasOne');
      rels.push(`    public function ${c.nome}(): HasOne\n    {\n        return $this->hasOne(${classe}::class, '${chaveDoOutroLado(m, c)}');\n    }`);
    }
  }
  const lista = [...usos].sort();
  if (usuario) lista.unshift('Illuminate\\Foundation\\Auth\\User as Authenticatable', 'Illuminate\\Notifications\\Notifiable');
  for (const u of lista) linhas.push(`use ${u};`);
  if (lista.length) linhas.push('');
  linhas.push('/**', ` * Tabela \`${m.tabela}\` (gerado de prisma/schema.prisma; mantido à mão daqui em diante).`);
  for (const c of m.campos.filter(c => !ehRelacao(c) && c.doc)) linhas.push(` * - ${c.nome}: ${c.doc}`);
  linhas.push(' */');
  linhas.push(`class ${m.nome} extends ${usuario ? 'Authenticatable' : 'Modelo'}`, '{');
  const traits = [cuid && 'TemCuid', usuario && 'Notifiable'].filter(Boolean);
  if (traits.length) linhas.push(`    use ${traits.join(', ')};`, '');
  linhas.push(`    protected $table = '${m.tabela}';`);
  if (m.idComposto) {
    linhas.push('', `    /** Chave composta (${m.idComposto.join(', ')}): o Eloquent não tem; grave e apague por consulta. */`, '    protected $primaryKey = null;', '', '    public $incrementing = false;');
  } else if (id && id.nome !== 'id') {
    linhas.push(`    protected $primaryKey = '${id.nome}';`);
  }
  if (id && !m.idComposto && (id.tipo === 'String') && !cuid) linhas.push('', "    protected $keyType = 'string';", '', '    public $incrementing = false;');
  if (id && !m.idComposto && id.tipo === 'Int' && !/autoincrement/.test(id.attrs)) linhas.push('', '    public $incrementing = false;');
  if (!criado && !atualizado) linhas.push('', '    public $timestamps = false;');
  else {
    linhas.push('', `    const CREATED_AT = ${criado ? `'${criado}'` : 'null'};`, '', `    const UPDATED_AT = ${atualizado ? `'${atualizado}'` : 'null'};`);
  }
  if (usuario) linhas.push('', '    protected $guarded = [];', '', "    protected $dateFormat = 'Y-m-d H:i:s.v';");
  const casts = m.campos.filter(c => !ehRelacao(c) && !(id && c.nome === id.nome && c.tipo === 'String')).map(c => [c.nome, cast(c)]).filter(([, v]) => v);
  if (casts.length) {
    linhas.push('', '    protected function casts(): array', '    {', '        return [');
    for (const [n, v] of casts) linhas.push(`            '${n}' => ${v},`);
    linhas.push('        ];', '    }');
  }
  for (const r of rels) linhas.push('', r);
  linhas.push('}', '');
  return linhas.join('\n');
}

/** a_combinar → ACombinar, freteGratis → FreteGratis, no_ar → NoAr. */
const caso = v => v.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');

function gerarEnum(nome, valores) {
  return ['<?php', '', 'namespace App\\Enums;', '', `/** Gerado de prisma/schema.prisma (enum ${nome}). O valor é o que está gravado no banco. */`, `enum ${nome}: string`, '{', ...valores.map(v => `    case ${caso(v)} = '${v}';`), '}', ''].join('\n');
}

// ---------- Escrita ----------
let escritos = 0, pulados = 0;
const gravar = (arquivo, conteudo) => {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  if (existsSync(arquivo) && !forcar) { pulados++; return; }
  writeFileSync(arquivo, conteudo);
  escritos++;
};
for (const [nome, valores] of enums) gravar(path.join(raiz, 'app/Enums', `${nome}.php`), gerarEnum(nome, valores));
for (const m of modelos.values()) gravar(path.join(raiz, 'app/Models', `${m.nome}.php`), gerarModelo(m));
console.log(`${enums.size} enums, ${modelos.size} models: ${escritos} escritos, ${pulados} já existiam.`);
void ESCALARES;
