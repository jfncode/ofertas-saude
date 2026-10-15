import { formatarPreco } from './formato.js';

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function urlSegura(v) {
  const s = String(v ?? '');
  return /^https?:\/\//i.test(s) ? s : '#';
}

export function renderizarCard(o) {
  const p = formatarPreco(o.preco);
  const pAntigo = formatarPreco(o.precoAntigo);
  const preco = p && pAntigo && o.desconto
    ? `<span class="antigo">R$ ${esc(pAntigo)}</span> <strong>R$ ${esc(p)}</strong> <em>-${esc(o.desconto)}%</em>`
    : p
      ? `<strong>R$ ${esc(p)}</strong>`
      : '';
  return `<article class="card" data-cat="${esc(o.categoria)}">
    <img src="${esc(urlSegura(o.imagem))}" alt="${esc(o.titulo)}" loading="lazy">
    <span class="tag">${esc(o.categoria)}</span>
    <h3>${esc(o.titulo)}</h3>
    <p class="preco">${preco}</p>
    <a class="btn" href="${esc(urlSegura(o.urlAfiliado))}" target="_blank" rel="nofollow sponsored noopener">🛒 Comprar</a>
  </article>`;
}
