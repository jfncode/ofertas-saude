const API = 'https://api.telegram.org';

export async function enviarMensagem(texto, { fetchFn = fetch, token, chatId, botoes } = {}) {
  const body = { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: false };
  if (botoes?.length) {
    body.reply_markup = { inline_keyboard: [botoes.map(b => ({ text: b.texto, url: b.url }))] };
  }
  const resp = await fetchFn(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram sendMessage: ${JSON.stringify(data)}`);
  return data.result.message_id;
}

export async function buscarRespostas(offset, { fetchFn = fetch, token } = {}) {
  const resp = await fetchFn(`${API}/bot${token}/getUpdates?offset=${offset}&timeout=0`);
  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram getUpdates: ${JSON.stringify(data)}`);
  let proximoOffset = offset;
  const updates = [];
  for (const u of data.result) {
    proximoOffset = Math.max(proximoOffset, u.update_id + 1);
    const msg = u.message;
    if (msg?.text) {
      updates.push({ texto: msg.text, replyToMessageId: msg.reply_to_message?.message_id ?? null });
    }
  }
  return { updates, proximoOffset };
}
