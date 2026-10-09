import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executar } from '../src/orquestrador.js';

function depsFake(over = {}) {
  const estado = { ofertas: [], pendentes: [], offset: 0, canal: [] };
  return {
    estado,
    carregar: async (k) => structuredClone(estado[k]),
    salvar: async (k, v) => { estado[k] = v; },
    keywords: ['luva'],
    buscarRespostas: async () => ({ updates: [], proximoOffset: 0 }),
    temCredenciaisAE: () => false,
    garimparAE: async () => [],
    garimparML: async () => [{ id: 'ml-1', tituloOriginal: 'Luva', preco: 10, precoAntigo: null, desconto: 0, imagem: 'i', urlProduto: 'p' }],
    filtrar: async (brutas) => brutas.map(b => ({ ...b, categoria: 'Saúde', titulo: b.tituloOriginal })),
    enviarCandidata: async () => 999,
    publicarNoCanal: async (o) => { estado.canal.push(o.id); },
    ...over,
  };
}

test('ML entra na fila (não publica direto)', async () => {
  const deps = depsFake();
  const r = await executar(deps);
  assert.equal(r.publicadas, 0);
  assert.equal(deps.estado.pendentes.length, 1);
  assert.equal(deps.estado.pendentes[0].telegramMessageId, 999);
});

test('resposta pendente vira publicação', async () => {
  const deps = depsFake({
    carregar: async (k) => k === 'pendentes'
      ? [{ id: 'ml-1', titulo: 'Luva', categoria: 'Saúde', preco: 10, telegramMessageId: 50 }]
      : (k === 'offset' ? 0 : []),
    buscarRespostas: async () => ({ updates: [{ texto: 'http://afil/x', replyToMessageId: 50 }], proximoOffset: 11 }),
    garimparML: async () => [],
  });
  const r = await executar(deps);
  assert.equal(r.publicadas, 1);
  assert.ok(deps.estado.canal.includes('ml-1'));
  assert.equal(deps.estado.ofertas[0].urlAfiliado, 'http://afil/x');
});

test('AliExpress publica direto quando há credenciais', async () => {
  const deps = depsFake({
    temCredenciaisAE: () => true,
    garimparAE: async () => [{ id: 'ae-1', fonte: 'aliexpress', tituloOriginal: 'X', preco: 5, precoAntigo: null, desconto: 0, imagem: 'i', urlProduto: 'u', urlAfiliado: 'http://ae/1', publicadoEm: 'now' }],
    garimparML: async () => [],
  });
  const r = await executar(deps);
  assert.equal(r.publicadas, 1);
  assert.ok(deps.estado.canal.includes('ae-1'));
});

test('falha no canal não registra a oferta (retry no próximo run)', async () => {
  const deps = depsFake({
    temCredenciaisAE: () => true,
    garimparAE: async () => [{ id: 'ae-fail', fonte: 'aliexpress', tituloOriginal: 'X', preco: 5, precoAntigo: null, desconto: 0, imagem: 'i', urlProduto: 'u', urlAfiliado: 'http://ae/1', publicadoEm: 'now' }],
    garimparML: async () => [],
    publicarNoCanal: async () => { throw new Error('canal fora do ar'); },
  });
  const r = await executar(deps);
  assert.equal(r.publicadas, 0);
  assert.equal(deps.estado.ofertas.some(o => o.id === 'ae-fail'), false);
});
