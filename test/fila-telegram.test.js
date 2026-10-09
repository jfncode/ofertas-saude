// test/fila-telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarCandidatas, resolverPendentes, extrairUrl } from '../src/fila-telegram.js';

test('extrairUrl pega a primeira URL do texto', () => {
  assert.equal(extrairUrl('aqui: https://mercadolivre.com/sec/abc fim'), 'https://mercadolivre.com/sec/abc');
  assert.equal(extrairUrl('sem link'), null);
});

test('enviarCandidatas envia só as novas e guarda message_id', async () => {
  let n = 100;
  const enviar = async () => ++n;
  const ofertas = [{ id: 'ml-1', titulo: 'A' }, { id: 'ml-2', titulo: 'B' }];
  const pendentes = [{ id: 'ml-1', telegramMessageId: 50 }];
  const novas = await enviarCandidatas(ofertas, pendentes, { enviar });
  assert.deepEqual(novas.map(p => p.id), ['ml-2']);
  assert.equal(novas[0].telegramMessageId, 101);
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
