import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adicionarOfertas } from '../src/ofertas-store.js';

test('adicionarOfertas deduplica por id', () => {
  const existentes = [{ id: 'ml-1', titulo: 'A' }];
  const novas = [{ id: 'ml-1', titulo: 'A dup' }, { id: 'ml-2', titulo: 'B' }];
  const { resultado, adicionadas } = adicionarOfertas(existentes, novas);
  assert.equal(resultado.length, 2);
  assert.deepEqual(adicionadas.map(o => o.id), ['ml-2']);
});
