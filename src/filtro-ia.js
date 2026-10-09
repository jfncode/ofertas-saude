const CATEGORIAS = ['Saúde', 'Odonto', 'Fitness', 'Cuidado pessoal'];

export function construirPrompt(oferta) {
  return [
    'Você classifica produtos para um site de ofertas de SAÚDE e BEM-ESTAR',
    '(consumidor final) e ODONTO. Responda APENAS um JSON válido, sem comentários.',
    `Produto: "${oferta.tituloOriginal}".`,
    `Campos: relevante (boolean — true só se for do nicho saúde/bem-estar/odonto),`,
    `categoria (um de: ${CATEGORIAS.join(', ')} ou null se não relevante),`,
    `titulo (string curta e atraente em português do Brasil, ou null).`,
    'Formato: {"relevante":bool,"categoria":"...","titulo":"..."}',
  ].join(' ');
}

export function interpretarResposta(texto) {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return { relevante: false, categoria: null, titulo: null };
  try {
    const obj = JSON.parse(texto.slice(inicio, fim + 1));
    return {
      relevante: Boolean(obj.relevante),
      categoria: obj.categoria ?? null,
      titulo: obj.titulo ?? null,
    };
  } catch {
    return { relevante: false, categoria: null, titulo: null };
  }
}

export async function filtrarOfertas(ofertasBrutas, { callModel }) {
  const out = [];
  for (const oferta of ofertasBrutas) {
    try {
      const resposta = await callModel(construirPrompt(oferta));
      const { relevante, categoria, titulo } = interpretarResposta(resposta);
      if (relevante && categoria && CATEGORIAS.includes(categoria)) {
        out.push({ ...oferta, categoria, titulo: titulo || oferta.tituloOriginal });
      }
    } catch (err) {
      console.error(`[IA] erro ao filtrar ${oferta.id}:`, err.message);
    }
  }
  return out;
}
