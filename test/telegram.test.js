import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarMensagem, buscarRespostas } from '../src/telegram.js';

test('enviarMensagem devolve message_id', async () => {
  let corpo;
  const fetchFn = async (_url, opts) => { corpo = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) }; };
  const id = await enviarMensagem('oi', { fetchFn, token: 't', chatId: '1', botoes: [{ texto: 'Comprar', url: 'http://x' }] });
  assert.equal(id, 42);
  assert.ok(corpo.reply_markup.inline_keyboard[0][0].url === 'http://x');
});

test('buscarRespostas normaliza updates e avança offset', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ ok: true, result: [
    { update_id: 10, message: { text: 'http://afiliado/x', reply_to_message: { message_id: 7 } } }
  ] }) });
  const { updates, proximoOffset } = await buscarRespostas(0, { fetchFn, token: 't' });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].texto, 'http://afiliado/x');
  assert.equal(updates[0].replyToMessageId, 7);
  assert.equal(proximoOffset, 11);
});
