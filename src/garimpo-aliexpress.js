import { createHmac } from 'node:crypto';

const ENDPOINT = 'https://api-sg.aliexpress.com/sync';

export function assinar(params, secret) {
  const base = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

export function normalizarItemAE(p, trackingId) {
  const preco = Number(p.target_sale_price ?? 0);
  const precoAntigo = Number(p.target_original_price ?? 0) || null;
  const desconto = precoAntigo && precoAntigo > preco ? Math.round((1 - preco / precoAntigo) * 100) : 0;
  return {
    id: `ae-${p.product_id}`,
    fonte: 'aliexpress',
    tituloOriginal: p.product_title,
    preco,
    precoAntigo,
    desconto,
    imagem: p.product_main_image_url,
    urlProduto: p.promotion_link,
    urlAfiliado: p.promotion_link,
    publicadoEm: new Date().toISOString(),
  };
}

export function temCredenciais() {
  return Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET && process.env.ALIEXPRESS_TRACKING_ID);
}

export async function garimparAliExpress(keywords, { fetchFn = fetch, appKey, appSecret, trackingId } = {}) {
  const out = [];
  const vistos = new Set();
  for (const kw of keywords) {
    const params = {
      app_key: appKey,
      method: 'aliexpress.affiliate.product.query',
      sign_method: 'hmac-sha256',
      timestamp: String(Date.now()),
      keywords: kw,
      tracking_id: trackingId,
      target_currency: 'BRL',
      target_language: 'pt',
      page_size: '10',
    };
    params.sign = assinar(params, appSecret);
    const qs = new URLSearchParams(params).toString();
    try {
      const resp = await fetchFn(`${ENDPOINT}?${qs}`);
      if (!resp.ok) { console.error(`[AE] ${kw}: HTTP ${resp.status}`); continue; }
      const data = await resp.json();
      const produtos = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ?? [];
      for (const p of produtos) {
        const o = normalizarItemAE(p, trackingId);
        if (!vistos.has(o.id)) { vistos.add(o.id); out.push(o); }
      }
    } catch (err) {
      console.error(`[AE] erro na keyword "${kw}":`, err.message);
    }
  }
  return out;
}
