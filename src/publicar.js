export function formatarPost(oferta) {
  const linhas = [`🔥 <b>${oferta.titulo}</b> [${oferta.categoria}]`];
  if (oferta.precoAntigo && oferta.desconto) {
    linhas.push(`~R$ ${oferta.precoAntigo}~ ➜ <b>R$ ${oferta.preco}</b> (-${oferta.desconto}%)`);
  } else if (oferta.preco != null) {
    linhas.push(`💰 <b>R$ ${oferta.preco}</b>`);
  }
  return linhas.join('\n');
}

export async function publicarNoCanal(oferta, { enviar }) {
  await enviar(formatarPost(oferta), [{ texto: '🛒 Comprar', url: oferta.urlAfiliado }]);
}
