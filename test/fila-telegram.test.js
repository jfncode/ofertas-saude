// test/fila-telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverPendentes, extrairUrl } from '../src/fila-telegram.js';

test('extrairUrl pega a primeira URL do texto', () => {
  assert.equal(extrairUrl('aqui: https://mercadolivre.com/sec/abc fim'), 'https://mercadolivre.com/sec/abc');
  assert.equal(extrairUrl('sem link'), null);
});

test('resolverPendentes casa reply com pendente e vira publicável', () => {
  const pendentes = [{ id: 'ml-2', titulo: 'B', telegramMessageId: 101 }];
  const updates = [{ texto: 'https://ml/sec/xyz', replyToMessageId: 101 }];
  const { publicaveis, restantes } = resolverPendentes(pendentes, updates);
  assert.equal(publicaveis.length, 1);
  assert.equal(publicaveis[0].urlAfiliado, 'https://ml/sec/xyz');
  assert.ok(publicaveis[0].publicadoEm);
  assert.equal(restantes.length, 0);
});
