import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarCard } from '../site/render.js';

test('renderizarCard inclui título, preço e link de afiliado', () => {
  const html = renderizarCard({ titulo: 'Oxímetro', categoria: 'Saúde', preco: 80, desconto: 20, imagem: 'http://i', urlAfiliado: 'http://afil/x' });
  assert.ok(html.includes('Oxímetro'));
  assert.ok(html.includes('http://afil/x'));
  assert.ok(html.includes('R$ 80,00'));
});

test('renderizarCard neutraliza XSS', () => {
  // Teste 1: injeção de tag maliciosa no título
  const html1 = renderizarCard({
    titulo: '<img src=x onerror=alert(1)>',
    categoria: 'Saúde',
    preco: 10,
    imagem: 'http://i',
    urlAfiliado: 'http://afil/x'
  });
  assert.ok(!html1.includes('<img src=x onerror'), 'não deve incluir tag img maliciosa (raw)');
  assert.ok(html1.includes('&lt;img src=x onerror'), 'deve escapar tag maliciosa como entidade HTML');

  // Teste 2: javascript: scheme no URL de afiliado
  const html2 = renderizarCard({
    titulo: 'Produto',
    categoria: 'Saúde',
    preco: 10,
    imagem: 'http://i',
    urlAfiliado: 'javascript:alert(1)'
  });
  assert.ok(html2.includes('href="#"'), 'deve bloquear javascript: e usar # como fallback');
  assert.ok(!html2.includes('href="javascript:alert(1)"'), 'não deve incluir javascript: href');
});
