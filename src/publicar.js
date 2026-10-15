import { formatarPreco } from '../site/formato.js';

export function formatarPost(oferta) {
  const linhas = [`🔥 <b>${oferta.titulo}</b> [${oferta.categoria}]`];
  const preco = formatarPreco(oferta.preco);
  const precoAntigo = formatarPreco(oferta.precoAntigo);
  if (preco && precoAntigo && oferta.desconto) {
    linhas.push(`<s>R$ ${precoAntigo}</s> ➜ <b>R$ ${preco}</b> (-${oferta.desconto}%)`);
  } else if (preco) {
    linhas.push(`💰 <b>R$ ${preco}</b>`);
  }
  return linhas.join('\n');
}

export async function publicarNoCanal(oferta, { enviar }) {
  await enviar(formatarPost(oferta), [{ texto: '🛒 Comprar', url: oferta.urlAfiliado }]);
}
