import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarCard } from '../site/render.js';

test('renderizarCard inclui título, preço e link de afiliado', () => {
  const html = renderizarCard({ titulo: 'Oxímetro', categoria: 'Saúde', preco: 80, desconto: 20, imagem: 'http://i', urlAfiliado: 'http://afil/x' });
  assert.ok(html.includes('Oxímetro'));
  assert.ok(html.includes('http://afil/x'));
  assert.ok(html.includes('80'));
});
