import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarPost, publicarNoCanal } from '../src/publicar.js';

test('formatarPost mostra preço e desconto', () => {
  const txt = formatarPost({ titulo: 'Oxímetro', categoria: 'Saúde', preco: 80, precoAntigo: 100, desconto: 20 });
  assert.ok(txt.includes('Oxímetro'));
  assert.ok(txt.includes('20%'));
  assert.ok(txt.includes('<s>R$ 100</s>'));
  assert.ok(txt.includes('R$ 80'));
});

test('publicarNoCanal envia com botão Comprar', async () => {
  let recebidoBotoes;
  const enviar = async (_texto, botoes) => { recebidoBotoes = botoes; return 1; };
  await publicarNoCanal({ titulo: 'X', categoria: 'Saúde', preco: 10, urlAfiliado: 'http://afil/x' }, { enviar });
  assert.equal(recebidoBotoes[0].url, 'http://afil/x');
  assert.equal(recebidoBotoes[0].texto, '🛒 Comprar');
});
