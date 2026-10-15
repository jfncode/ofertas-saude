import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarPreco } from '../site/formato.js';

test('formata número inteiro com duas casas e vírgula decimal', () => {
  assert.equal(formatarPreco(80), '80,00');
});

test('formata número quebrado arredondando para duas casas', () => {
  assert.equal(formatarPreco(79.9), '79,90');
  assert.equal(formatarPreco(12.5), '12,50');
});

test('usa ponto como separador de milhar', () => {
  assert.equal(formatarPreco(1234.56), '1.234,56');
  assert.equal(formatarPreco(1000000), '1.000.000,00');
});

test('aceita string numérica', () => {
  assert.equal(formatarPreco('49.90'), '49,90');
});

test('NaN guard: valor inválido devolve null', () => {
  assert.equal(formatarPreco(NaN), null);
  assert.equal(formatarPreco(undefined), null);
  assert.equal(formatarPreco(null), null);
  assert.equal(formatarPreco('abc'), null);
  assert.equal(formatarPreco(Infinity), null);
});
