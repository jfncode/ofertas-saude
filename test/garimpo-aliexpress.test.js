import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinar, normalizarItemAE, garimparAliExpress } from '../src/garimpo-aliexpress.js';

test('assinar é determinística, independe de ordem e dá 64 hex maiúsculos', () => {
  const a = assinar({ b: '2', a: '1' }, 'segredo');
  const b = assinar({ a: '1', b: '2' }, 'segredo');
  assert.equal(a, b);
  assert.match(a, /^[0-9A-F]{64}$/);
});

test('normalizarItemAE usa promotion_link como link de afiliado', () => {
  const o = normalizarItemAE({
    product_id: '456', product_title: 'Massageador',
    target_sale_price: '50.00', target_original_price: '100.00',
    product_main_image_url: 'http://img', promotion_link: 'http://ae/afil'
  }, 'track1');
  assert.equal(o.id, 'ae-456');
  assert.equal(o.fonte, 'aliexpress');
  assert.equal(o.urlAfiliado, 'http://ae/afil');
  assert.equal(o.desconto, 50);
});

test('garimparAliExpress devolve ofertas com link de afiliado', async () => {
  const fakeResp = { aliexpress_affiliate_product_query_response: { resp_result: { result: { products: { product: [
    { product_id: '1', product_title: 'Luva nitrílica', target_sale_price: '10.00', target_original_price: '10.00', product_main_image_url: 'i', promotion_link: 'http://ae/1' }
  ] } } } } };
  const fetchFn = async () => ({ ok: true, json: async () => fakeResp });
  const itens = await garimparAliExpress(['luva'], { fetchFn, appKey: 'k', appSecret: 's', trackingId: 't' });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].urlAfiliado, 'http://ae/1');
});

test('garimparAliExpress continua após erro em uma keyword', async () => {
  let chamada = 0;
  const fetchFn = async () => {
    chamada++;
    if (chamada === 1) throw new Error('falha de rede');
    return { ok: true, json: async () => ({ aliexpress_affiliate_product_query_response: { resp_result: { result: { products: { product: [
      { product_id: '9', product_title: 'Massageador', target_sale_price: '50.00', target_original_price: '100.00', product_main_image_url: 'i', promotion_link: 'http://ae/9' }
    ] } } } } }) };
  };
  const itens = await garimparAliExpress(['a', 'b'], { fetchFn, appKey: 'k', appSecret: 's', trackingId: 't' });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].id, 'ae-9');
});
