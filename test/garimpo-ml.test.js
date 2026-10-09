// test/garimpo-ml.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarItemML, garimparML } from '../src/garimpo-ml.js';

test('normalizarItemML calcula desconto e monta id', () => {
  const o = normalizarItemML({
    id: 'MLB123', title: 'Oxímetro de Dedo',
    price: 80, original_price: 100,
    thumbnail: 'http://img/x.jpg', permalink: 'http://ml/x'
  });
  assert.equal(o.id, 'ml-MLB123');
  assert.equal(o.fonte, 'mercadolivre');
  assert.equal(o.desconto, 20);
  assert.equal(o.urlProduto, 'http://ml/x');
});

test('garimparML busca keyword e deduplica', async () => {
  const fakeResp = {
    results: [
      { id: 'MLB1', title: 'Luva', price: 10, original_price: null, thumbnail: 't', permalink: 'p' },
      { id: 'MLB1', title: 'Luva dup', price: 10, original_price: null, thumbnail: 't', permalink: 'p' }
    ]
  };
  const fetchFn = async () => ({ ok: true, json: async () => fakeResp });
  const itens = await garimparML(['luva'], { fetchFn });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].id, 'ml-MLB1');
  assert.equal(itens[0].desconto, 0);
});
