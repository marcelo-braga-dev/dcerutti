// Seed de demonstração fora do Next: `server-only` vira módulo vazio. As regras usadas (sugestões) importam módulos que
// puxam next/navigation, que não carrega com a condição react-server; sem ela, só o `server-only` precisa ser neutralizado.
const Module = require('node:module');
const vazio = require.resolve('./vazio.cjs');
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  return pedido === 'server-only' ? vazio : original.call(this, pedido, ...resto);
};
