import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarResposta, filtrarOfertas } from '../src/filtro-ia.js';

test('interpretarResposta extrai JSON mesmo com texto ao redor', () => {
  const r = interpretarResposta('Claro:\n```json\n{"relevante":true,"categoria":"Saúde","titulo":"Oxímetro"}\n```');
  assert.equal(r.relevante, true);
  assert.equal(r.categoria, 'Saúde');
  assert.equal(r.titulo, 'Oxímetro');
});

test('filtrarOfertas mantém só relevantes e enriquece', async () => {
  const brutas = [
    { id: 'ml-1', tituloOriginal: 'Oxímetro' },
    { id: 'ml-2', tituloOriginal: 'Capinha de celular' },
  ];
  const callModel = async (prompt) => prompt.includes('Oxímetro')
    ? '{"relevante":true,"categoria":"Saúde","titulo":"Oxímetro de Dedo"}'
    : '{"relevante":false,"categoria":null,"titulo":null}';
  const out = await filtrarOfertas(brutas, { callModel });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ml-1');
  assert.equal(out[0].categoria, 'Saúde');
  assert.equal(out[0].titulo, 'Oxímetro de Dedo');
});
