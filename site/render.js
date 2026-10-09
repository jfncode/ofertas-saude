export function renderizarCard(o) {
  const preco = o.precoAntigo && o.desconto
    ? `<span class="antigo">R$ ${o.precoAntigo}</span> <strong>R$ ${o.preco}</strong> <em>-${o.desconto}%</em>`
    : `<strong>R$ ${o.preco}</strong>`;
  return `<article class="card" data-cat="${o.categoria}">
    <img src="${o.imagem}" alt="${o.titulo}" loading="lazy">
    <span class="tag">${o.categoria}</span>
    <h3>${o.titulo}</h3>
    <p class="preco">${preco}</p>
    <a class="btn" href="${o.urlAfiliado}" target="_blank" rel="nofollow sponsored noopener">🛒 Comprar</a>
  </article>`;
}
