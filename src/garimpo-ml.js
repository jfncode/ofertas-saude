export function normalizarItemML(item) {
  const preco = item.price ?? 0;
  const precoAntigo = item.original_price ?? null;
  const desconto = precoAntigo && precoAntigo > preco
    ? Math.round((1 - preco / precoAntigo) * 100)
    : 0;
  return {
    id: `ml-${item.id}`,
    fonte: 'mercadolivre',
    tituloOriginal: item.title,
    preco,
    precoAntigo,
    desconto,
    imagem: item.thumbnail,
    urlProduto: item.permalink,
  };
}

export async function garimparML(keywords, { fetchFn = fetch, token, limitePorKeyword = 10 } = {}) {
  const vistos = new Set();
  const out = [];
  for (const kw of keywords) {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(kw)}&limit=${limitePorKeyword}`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const resp = await fetchFn(url, { headers });
      if (!resp.ok) { console.error(`[ML] ${kw}: HTTP ${resp.status}`); continue; }
      const data = await resp.json();
      for (const item of data.results ?? []) {
        const o = normalizarItemML(item);
        if (!vistos.has(o.id)) { vistos.add(o.id); out.push(o); }
      }
    } catch (err) {
      console.error(`[ML] erro na keyword "${kw}":`, err.message);
    }
  }
  return out;
}
