export function extrairUrl(texto) {
  const m = texto.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

export function formatarCandidata(oferta) {
  const preco = oferta.preco != null ? `R$ ${oferta.preco}` : 's/ preço';
  const desc = oferta.desconto ? ` (-${oferta.desconto}%)` : '';
  return [
    `🔎 <b>Oferta candidata</b> [${oferta.categoria}]`,
    `${oferta.titulo}`,
    `💰 ${preco}${desc}`,
    `🔗 Produto: ${oferta.urlProduto}`,
    '',
    '↩️ <i>Responda esta mensagem colando seu link de afiliado.</i>',
  ].join('\n');
}

export async function enviarCandidatas(ofertas, pendentes, { enviar }) {
  const jaPendentes = new Set(pendentes.map(p => p.id));
  const novas = [];
  for (const oferta of ofertas) {
    if (jaPendentes.has(oferta.id)) continue;
    const telegramMessageId = await enviar(formatarCandidata(oferta));
    novas.push({ ...oferta, telegramMessageId });
  }
  return novas;
}

export function resolverPendentes(pendentes, updates) {
  const porMsgId = new Map(pendentes.map(p => [p.telegramMessageId, p]));
  const resolvidos = new Set();
  const publicaveis = [];
  for (const u of updates) {
    const pend = porMsgId.get(u.replyToMessageId);
    if (!pend) continue;
    const url = extrairUrl(u.texto);
    if (!url) continue;
    const { telegramMessageId, ...resto } = pend;
    publicaveis.push({ ...resto, urlAfiliado: url, publicadoEm: new Date().toISOString() });
    resolvidos.add(pend.id);
  }
  const restantes = pendentes.filter(p => !resolvidos.has(p.id));
  return { publicaveis, restantes };
}
