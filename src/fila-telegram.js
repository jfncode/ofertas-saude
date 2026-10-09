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
