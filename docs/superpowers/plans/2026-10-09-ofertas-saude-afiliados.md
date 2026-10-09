# Ofertas Saúde — Agregador de Afiliados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um agregador de ofertas de saúde que garimpa Mercado Livre (link manual via fila no Telegram) e AliExpress (link 100% automático via API), filtra com IA, publica num site estático (GitHub Pages) e num canal Telegram, rodando sozinho por GitHub Actions.

**Architecture:** Duas esteiras de garimpo (ML e AliExpress) normalizam ofertas num formato comum, passam por um filtro de relevância/categoria via Gemini, e caem num `site/ofertas.json` versionado no git. AliExpress gera o link de afiliado pela própria API e publica direto; Mercado Livre exige link manual, resolvido por polling do Telegram (`getUpdates` com offset persistido no repo). Um orquestrador único (`run.js`) roda a cada execução do cron.

**Tech Stack:** Node.js 20, `node:test` (runner nativo, sem dependências), `fetch` nativo, `node:crypto` (assinatura AliExpress), Telegram Bot API (REST), Gemini API (REST), GitHub Actions (cron + commit).

## Global Constraints

- **Runtime:** Node.js 20+. Nenhuma dependência npm em runtime no MVP (só APIs nativas).
- **Testabilidade:** toda função que faz I/O de rede recebe o cliente/`fetchFn` por parâmetro (injeção de dependência); testes nunca batem na rede real.
- **Idempotência:** nunca republicar oferta cujo `id` já existe em `site/ofertas.json`.
- **Resiliência:** falha de uma esteira (ML ou AliExpress) loga e NÃO derruba a outra.
- **Fallback AliExpress:** se faltarem credenciais (`ALIEXPRESS_APP_KEY`/`ALIEXPRESS_APP_SECRET`/`ALIEXPRESS_TRACKING_ID`), a esteira AliExpress é pulada sem erro.
- **Idioma/copy:** títulos e chamadas geradas pela IA em **português do Brasil**, com acentuação correta.
- **Formato do id:** `ml-<MLBxxxx>` para Mercado Livre, `ae-<productId>` para AliExpress.
- **Categorias válidas:** `Saúde`, `Odonto`, `Fitness`, `Cuidado pessoal`.
- **Segredos:** lidos só de variáveis de ambiente (`process.env`), nunca hardcoded nem commitados.

---

### Task 1: Scaffold do projeto + store de ofertas

**Files:**
- Create: `package.json`
- Create: `src/ofertas-store.js`
- Create: `test/ofertas-store.test.js`
- Create: `data/.gitkeep`

**Interfaces:**
- Consumes: nada (tarefa base).
- Produces:
  - `carregarOfertas(caminho) -> Promise<Array<Oferta>>` — lê o JSON; se o arquivo não existe, retorna `[]`.
  - `salvarOfertas(caminho, ofertas) -> Promise<void>` — escreve o JSON com indentação de 2 espaços.
  - `adicionarOfertas(existentes, novas) -> { resultado: Array<Oferta>, adicionadas: Array<Oferta> }` — concatena deduplicando por `id`; `adicionadas` são só as que não existiam.
  - Tipo `Oferta`: `{ id, fonte, categoria, titulo, preco, precoAntigo, desconto, imagem, urlAfiliado, publicadoEm }`.

- [ ] **Step 1: Escrever o package.json**

```json
{
  "name": "ofertas-saude",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "start": "node src/run.js"
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

```javascript
// test/ofertas-store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adicionarOfertas } from '../src/ofertas-store.js';

test('adicionarOfertas deduplica por id', () => {
  const existentes = [{ id: 'ml-1', titulo: 'A' }];
  const novas = [{ id: 'ml-1', titulo: 'A dup' }, { id: 'ml-2', titulo: 'B' }];
  const { resultado, adicionadas } = adicionarOfertas(existentes, novas);
  assert.equal(resultado.length, 2);
  assert.deepEqual(adicionadas.map(o => o.id), ['ml-2']);
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node --test test/ofertas-store.test.js`
Expected: FAIL com "Cannot find module '../src/ofertas-store.js'" ou "adicionarOfertas is not a function".

- [ ] **Step 4: Implementar o store**

```javascript
// src/ofertas-store.js
import { readFile, writeFile } from 'node:fs/promises';

export async function carregarOfertas(caminho) {
  try {
    const txt = await readFile(caminho, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function salvarOfertas(caminho, ofertas) {
  await writeFile(caminho, JSON.stringify(ofertas, null, 2) + '\n', 'utf8');
}

export function adicionarOfertas(existentes, novas) {
  const vistos = new Set(existentes.map(o => o.id));
  const adicionadas = [];
  for (const o of novas) {
    if (!vistos.has(o.id)) {
      vistos.add(o.id);
      adicionadas.push(o);
    }
  }
  return { resultado: [...existentes, ...adicionadas], adicionadas };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test test/ofertas-store.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json src/ofertas-store.js test/ofertas-store.test.js data/.gitkeep
git commit -m "feat: store de ofertas com dedup por id"
```

---

### Task 2: Garimpo Mercado Livre

**Files:**
- Create: `src/garimpo-ml.js`
- Create: `test/garimpo-ml.test.js`

**Interfaces:**
- Consumes: tipo `Oferta` (parcial; sem `categoria`/`titulo` da IA ainda).
- Produces:
  - `normalizarItemML(item) -> OfertaBruta` onde `OfertaBruta = { id, fonte:'mercadolivre', tituloOriginal, preco, precoAntigo, desconto, imagem, urlProduto }`.
  - `garimparML(keywords, { fetchFn, token, limitePorKeyword=10 }) -> Promise<Array<OfertaBruta>>` — busca cada keyword na API do ML e devolve itens normalizados e deduplicados por `id`.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/garimpo-ml.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarItemML, garimparML } from '../src/garimpo-ml.js';

test('normalizarItemML calcula desconto e monta id', () => {
  const o = normalizarItemML({
    id: 'MLB123', title: 'Oxímetro de Dedo',
    price: 80, original_price: 100,
    thumbnail: 'http://img/x.jpg', permalink: 'http://ml/x'
  });
  assert.equal(o.id, 'ml-MLB123');
  assert.equal(o.fonte, 'mercadolivre');
  assert.equal(o.desconto, 20);
  assert.equal(o.urlProduto, 'http://ml/x');
});

test('garimparML busca keyword e deduplica', async () => {
  const fakeResp = {
    results: [
      { id: 'MLB1', title: 'Luva', price: 10, original_price: null, thumbnail: 't', permalink: 'p' },
      { id: 'MLB1', title: 'Luva dup', price: 10, original_price: null, thumbnail: 't', permalink: 'p' }
    ]
  };
  const fetchFn = async () => ({ ok: true, json: async () => fakeResp });
  const itens = await garimparML(['luva'], { fetchFn });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].id, 'ml-MLB1');
  assert.equal(itens[0].desconto, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/garimpo-ml.test.js`
Expected: FAIL com "Cannot find module '../src/garimpo-ml.js'".

- [ ] **Step 3: Implementar o garimpo**

```javascript
// src/garimpo-ml.js
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
```

> Nota: a API pública do ML pode exigir token em alguns casos. O parâmetro `token` (env `ML_ACCESS_TOKEN`) cobre isso; sem token, tenta sem auth.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/garimpo-ml.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/garimpo-ml.js test/garimpo-ml.test.js
git commit -m "feat: garimpo de ofertas no Mercado Livre"
```

---

### Task 3: Filtro de relevância e copy (Gemini)

**Files:**
- Create: `src/filtro-ia.js`
- Create: `test/filtro-ia.test.js`

**Interfaces:**
- Consumes: `OfertaBruta` da Task 2.
- Produces:
  - `construirPrompt(oferta) -> string`.
  - `interpretarResposta(texto) -> { relevante:boolean, categoria:string|null, titulo:string|null }` — faz parse do JSON retornado pela IA, tolerante a lixo ao redor.
  - `filtrarOfertas(ofertasBrutas, { callModel }) -> Promise<Array<OfertaEnriquecida>>` onde `OfertaEnriquecida = OfertaBruta + { categoria, titulo }`, contendo só as relevantes. `callModel(prompt) -> Promise<string>` é injetado.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/filtro-ia.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarResposta, filtrarOfertas } from '../src/filtro-ia.js';

test('interpretarResposta extrai JSON mesmo com texto ao redor', () => {
  const r = interpretarResposta('Claro:\n```json\n{"relevante":true,"categoria":"Saúde","titulo":"Oxímetro"}\n```');
  assert.equal(r.relevante, true);
  assert.equal(r.categoria, 'Saúde');
  assert.equal(r.titulo, 'Oxímetro');
});

test('filtrarOfertas mantém só relevantes e enriquece', async () => {
  const brutas = [
    { id: 'ml-1', tituloOriginal: 'Oxímetro' },
    { id: 'ml-2', tituloOriginal: 'Capinha de celular' },
  ];
  const callModel = async (prompt) => prompt.includes('Oxímetro')
    ? '{"relevante":true,"categoria":"Saúde","titulo":"Oxímetro de Dedo"}'
    : '{"relevante":false,"categoria":null,"titulo":null}';
  const out = await filtrarOfertas(brutas, { callModel });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ml-1');
  assert.equal(out[0].categoria, 'Saúde');
  assert.equal(out[0].titulo, 'Oxímetro de Dedo');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/filtro-ia.test.js`
Expected: FAIL com "Cannot find module '../src/filtro-ia.js'".

- [ ] **Step 3: Implementar o filtro**

```javascript
// src/filtro-ia.js
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
        out.push({ ...oferta, categoria, titulo: titulo ?? oferta.tituloOriginal });
      }
    } catch (err) {
      console.error(`[IA] erro ao filtrar ${oferta.id}:`, err.message);
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/filtro-ia.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Criar o caller real do Gemini (sem teste de rede)**

```javascript
// src/gemini.js
export async function chamarGemini(prompt, { fetchFn = fetch, apiKey = process.env.GEMINI_API_KEY, modelo = process.env.GEMINI_MODEL || 'gemini-2.5-flash' } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
  const resp = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
```

- [ ] **Step 6: Commit**

```bash
git add src/filtro-ia.js src/gemini.js test/filtro-ia.test.js
git commit -m "feat: filtro de relevância e copy via Gemini"
```

---

### Task 4: Cliente Telegram (baixo nível)

**Files:**
- Create: `src/telegram.js`
- Create: `test/telegram.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `enviarMensagem(texto, { fetchFn, token, chatId, botoes }) -> Promise<number>` — chama `sendMessage`, devolve o `message_id`. `botoes` opcional: array `[{texto, url}]` vira `inline_keyboard`.
  - `buscarRespostas(offset, { fetchFn, token }) -> Promise<{ updates: Array<Update>, proximoOffset: number }>` — chama `getUpdates` a partir de `offset`; `Update` normalizado: `{ texto, replyToMessageId }`.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarMensagem, buscarRespostas } from '../src/telegram.js';

test('enviarMensagem devolve message_id', async () => {
  let corpo;
  const fetchFn = async (_url, opts) => { corpo = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) }; };
  const id = await enviarMensagem('oi', { fetchFn, token: 't', chatId: '1', botoes: [{ texto: 'Comprar', url: 'http://x' }] });
  assert.equal(id, 42);
  assert.ok(corpo.reply_markup.inline_keyboard[0][0].url === 'http://x');
});

test('buscarRespostas normaliza updates e avança offset', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ ok: true, result: [
    { update_id: 10, message: { text: 'http://afiliado/x', reply_to_message: { message_id: 7 } } }
  ] }) });
  const { updates, proximoOffset } = await buscarRespostas(0, { fetchFn, token: 't' });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].texto, 'http://afiliado/x');
  assert.equal(updates[0].replyToMessageId, 7);
  assert.equal(proximoOffset, 11);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/telegram.test.js`
Expected: FAIL com "Cannot find module '../src/telegram.js'".

- [ ] **Step 3: Implementar o cliente**

```javascript
// src/telegram.js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/telegram.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/telegram.js test/telegram.test.js
git commit -m "feat: cliente Telegram (enviar mensagem e buscar respostas)"
```

---

### Task 5: Fila de aprovação do Mercado Livre

**Files:**
- Create: `src/fila-telegram.js`
- Create: `test/fila-telegram.test.js`

**Interfaces:**
- Consumes: `OfertaEnriquecida` (Task 3), `enviarMensagem` (Task 4), store genérico de JSON.
- Produces:
  - `formatarCandidata(oferta) -> string` — mensagem pedindo o link, mostrando produto/preço/URL.
  - `enviarCandidatas(ofertas, pendentes, { enviar }) -> Promise<Array<Pendente>>` — para cada oferta ainda não pendente, envia ao Telegram e devolve os novos `Pendente = OfertaEnriquecida + { telegramMessageId }`. `enviar(texto) -> Promise<number>` é injetado.
  - `resolverPendentes(pendentes, updates) -> { publicaveis: Array<Oferta>, restantes: Array<Pendente> }` — casa cada `update.replyToMessageId` com `pendente.telegramMessageId`, extrai a URL do texto e devolve ofertas prontas (`urlAfiliado` preenchido, `publicadoEm` setado) + os que seguem pendentes.
  - `extrairUrl(texto) -> string|null`.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/fila-telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarCandidatas, resolverPendentes, extrairUrl } from '../src/fila-telegram.js';

test('extrairUrl pega a primeira URL do texto', () => {
  assert.equal(extrairUrl('aqui: https://mercadolivre.com/sec/abc fim'), 'https://mercadolivre.com/sec/abc');
  assert.equal(extrairUrl('sem link'), null);
});

test('enviarCandidatas envia só as novas e guarda message_id', async () => {
  let n = 100;
  const enviar = async () => ++n;
  const ofertas = [{ id: 'ml-1', titulo: 'A' }, { id: 'ml-2', titulo: 'B' }];
  const pendentes = [{ id: 'ml-1', telegramMessageId: 50 }];
  const novas = await enviarCandidatas(ofertas, pendentes, { enviar });
  assert.deepEqual(novas.map(p => p.id), ['ml-2']);
  assert.equal(novas[0].telegramMessageId, 101);
});

test('resolverPendentes casa reply com pendente e vira publicável', () => {
  const pendentes = [{ id: 'ml-2', titulo: 'B', telegramMessageId: 101 }];
  const updates = [{ texto: 'https://ml/sec/xyz', replyToMessageId: 101 }];
  const { publicaveis, restantes } = resolverPendentes(pendentes, updates);
  assert.equal(publicaveis.length, 1);
  assert.equal(publicaveis[0].urlAfiliado, 'https://ml/sec/xyz');
  assert.ok(publicaveis[0].publicadoEm);
  assert.equal(restantes.length, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/fila-telegram.test.js`
Expected: FAIL com "Cannot find module '../src/fila-telegram.js'".

- [ ] **Step 3: Implementar a fila**

```javascript
// src/fila-telegram.js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/fila-telegram.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fila-telegram.js test/fila-telegram.test.js
git commit -m "feat: fila de aprovação do Mercado Livre via Telegram"
```

---

### Task 6: Publicação no canal Telegram

**Files:**
- Create: `src/publicar.js`
- Create: `test/publicar.test.js`

**Interfaces:**
- Consumes: `Oferta` completa (`urlAfiliado` e `publicadoEm` preenchidos), `enviarMensagem` (Task 4).
- Produces:
  - `formatarPost(oferta) -> string` — texto do post no canal.
  - `publicarNoCanal(oferta, { enviar }) -> Promise<void>` — envia com botão "🛒 Comprar" apontando para `urlAfiliado`. `enviar(texto, botoes) -> Promise<number>` injetado.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/publicar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarPost, publicarNoCanal } from '../src/publicar.js';

test('formatarPost mostra preço e desconto', () => {
  const txt = formatarPost({ titulo: 'Oxímetro', categoria: 'Saúde', preco: 80, precoAntigo: 100, desconto: 20 });
  assert.ok(txt.includes('Oxímetro'));
  assert.ok(txt.includes('20%'));
});

test('publicarNoCanal envia com botão Comprar', async () => {
  let recebidoBotoes;
  const enviar = async (_texto, botoes) => { recebidoBotoes = botoes; return 1; };
  await publicarNoCanal({ titulo: 'X', categoria: 'Saúde', preco: 10, urlAfiliado: 'http://afil/x' }, { enviar });
  assert.equal(recebidoBotoes[0].url, 'http://afil/x');
  assert.equal(recebidoBotoes[0].texto, '🛒 Comprar');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/publicar.test.js`
Expected: FAIL com "Cannot find module '../src/publicar.js'".

- [ ] **Step 3: Implementar a publicação**

```javascript
// src/publicar.js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/publicar.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/publicar.js test/publicar.test.js
git commit -m "feat: publicação de oferta no canal Telegram"
```

---

### Task 7: Garimpo AliExpress (automático, gated por credenciais)

**Files:**
- Create: `src/garimpo-aliexpress.js`
- Create: `test/garimpo-aliexpress.test.js`

**Interfaces:**
- Consumes: tipo `Oferta` (com `urlAfiliado` já preenchido).
- Produces:
  - `assinar(params, secret) -> string` — assinatura HMAC-SHA256 (hex maiúsculo) sobre os params ordenados, padrão do AliExpress Open Platform.
  - `normalizarItemAE(produto, trackingId) -> Oferta` — monta `id` `ae-<id>`, usa `promotion_link` como `urlAfiliado`, `publicadoEm` agora.
  - `temCredenciais() -> boolean` — true só se `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` e `ALIEXPRESS_TRACKING_ID` existirem.
  - `garimparAliExpress(keywords, { fetchFn, appKey, appSecret, trackingId }) -> Promise<Array<Oferta>>` — consulta `aliexpress.affiliate.product.query` por keyword; itens já vêm com `promotion_link`.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/garimpo-aliexpress.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinar, normalizarItemAE, garimparAliExpress } from '../src/garimpo-aliexpress.js';

test('assinar é determinística, independe de ordem e dá 64 hex maiúsculos', () => {
  const a = assinar({ b: '2', a: '1' }, 'segredo');
  const b = assinar({ a: '1', b: '2' }, 'segredo');
  assert.equal(a, b);
  assert.match(a, /^[0-9A-F]{64}$/);
});

test('normalizarItemAE usa promotion_link como link de afiliado', () => {
  const o = normalizarItemAE({
    product_id: '456', product_title: 'Massageador',
    target_sale_price: '50.00', target_original_price: '100.00',
    product_main_image_url: 'http://img', promotion_link: 'http://ae/afil'
  }, 'track1');
  assert.equal(o.id, 'ae-456');
  assert.equal(o.fonte, 'aliexpress');
  assert.equal(o.urlAfiliado, 'http://ae/afil');
  assert.equal(o.desconto, 50);
});

test('garimparAliExpress devolve ofertas com link de afiliado', async () => {
  const fakeResp = { aliexpress_affiliate_product_query_response: { resp_result: { result: { products: { product: [
    { product_id: '1', product_title: 'Luva nitrílica', target_sale_price: '10.00', target_original_price: '10.00', product_main_image_url: 'i', promotion_link: 'http://ae/1' }
  ] } } } } };
  const fetchFn = async () => ({ ok: true, json: async () => fakeResp });
  const itens = await garimparAliExpress(['luva'], { fetchFn, appKey: 'k', appSecret: 's', trackingId: 't' });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].urlAfiliado, 'http://ae/1');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/garimpo-aliexpress.test.js`
Expected: FAIL com "Cannot find module '../src/garimpo-aliexpress.js'".

- [ ] **Step 3: Implementar o garimpo AliExpress**

```javascript
// src/garimpo-aliexpress.js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test test/garimpo-aliexpress.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/garimpo-aliexpress.js test/garimpo-aliexpress.test.js
git commit -m "feat: garimpo automático no AliExpress (gated por credenciais)"
```

---

### Task 8: Orquestrador (run.js)

**Files:**
- Create: `src/config.js`
- Create: `data/keywords.json`
- Create: `src/orquestrador.js`
- Create: `src/run.js`
- Create: `test/orquestrador.test.js`

**Interfaces:**
- Consumes: todos os módulos anteriores.
- Produces:
  - `executar(deps) -> Promise<{ publicadas: number }>` em `orquestrador.js`, com TODAS as dependências injetadas (store, garimpos, filtro, fila, publicação, leitura/escrita de pendentes e offset). Resiliência: cada esteira dentro de try/catch.
  - `src/run.js` monta as `deps` reais a partir de `process.env` e chama `executar`.

**Fluxo de `executar`:**
1. Carrega `ofertas`, `pendentes`, `offset`.
2. `buscarRespostas(offset)` → `resolverPendentes` → publica resolvidos (store + canal).
3. Garimpa AliExpress (se `temCredenciais`), filtra, publica direto (store + canal).
4. Garimpa ML, filtra, `enviarCandidatas` → adiciona aos `pendentes`.
5. Salva `ofertas`, `pendentes`, `offset`.

- [ ] **Step 1: Escrever config e keywords**

```javascript
// src/config.js
export const CAMINHOS = {
  ofertas: 'site/ofertas.json',
  pendentes: 'data/pendentes.json',
  offset: 'data/telegram-offset.json',
  keywords: 'data/keywords.json',
};
```

```json
// data/keywords.json
["oxímetro", "termômetro digital", "massageador", "escova de dente elétrica",
 "fio dental", "enxaguante bucal", "whey protein", "creatina", "luva descartável",
 "máscara facial", "álcool em gel", "aparelho de pressão", "balança digital",
 "suplemento vitamina", "colágeno"]
```

- [ ] **Step 2: Escrever o teste que falha (orquestrador com deps fake)**

```javascript
// test/orquestrador.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executar } from '../src/orquestrador.js';

function depsFake(over = {}) {
  const estado = { ofertas: [], pendentes: [], offset: 0, canal: [] };
  return {
    estado,
    carregar: async (k) => structuredClone(estado[k]),
    salvar: async (k, v) => { estado[k] = v; },
    keywords: ['luva'],
    buscarRespostas: async () => ({ updates: [], proximoOffset: 0 }),
    temCredenciaisAE: () => false,
    garimparAE: async () => [],
    garimparML: async () => [{ id: 'ml-1', tituloOriginal: 'Luva', preco: 10, precoAntigo: null, desconto: 0, imagem: 'i', urlProduto: 'p' }],
    filtrar: async (brutas) => brutas.map(b => ({ ...b, categoria: 'Saúde', titulo: b.tituloOriginal })),
    enviarCandidata: async () => 999,
    publicarNoCanal: async (o) => { estado.canal.push(o.id); },
    ...over,
  };
}

test('ML entra na fila (não publica direto)', async () => {
  const deps = depsFake();
  const r = await executar(deps);
  assert.equal(r.publicadas, 0);
  assert.equal(deps.estado.pendentes.length, 1);
  assert.equal(deps.estado.pendentes[0].telegramMessageId, 999);
});

test('resposta pendente vira publicação', async () => {
  const deps = depsFake({
    carregar: async (k) => k === 'pendentes'
      ? [{ id: 'ml-1', titulo: 'Luva', categoria: 'Saúde', preco: 10, telegramMessageId: 50 }]
      : (k === 'offset' ? 0 : []),
    buscarRespostas: async () => ({ updates: [{ texto: 'http://afil/x', replyToMessageId: 50 }], proximoOffset: 11 }),
    garimparML: async () => [],
  });
  const r = await executar(deps);
  assert.equal(r.publicadas, 1);
  assert.ok(deps.estado.canal.includes('ml-1'));
  assert.equal(deps.estado.ofertas[0].urlAfiliado, 'http://afil/x');
});

test('AliExpress publica direto quando há credenciais', async () => {
  const deps = depsFake({
    temCredenciaisAE: () => true,
    garimparAE: async () => [{ id: 'ae-1', fonte: 'aliexpress', tituloOriginal: 'X', preco: 5, precoAntigo: null, desconto: 0, imagem: 'i', urlProduto: 'u', urlAfiliado: 'http://ae/1', publicadoEm: 'now' }],
    garimparML: async () => [],
  });
  const r = await executar(deps);
  assert.equal(r.publicadas, 1);
  assert.ok(deps.estado.canal.includes('ae-1'));
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node --test test/orquestrador.test.js`
Expected: FAIL com "Cannot find module '../src/orquestrador.js'".

- [ ] **Step 4: Implementar o orquestrador**

```javascript
// src/orquestrador.js
import { adicionarOfertas } from './ofertas-store.js';
import { resolverPendentes } from './fila-telegram.js';

export async function executar(deps) {
  let ofertas = await deps.carregar('ofertas');
  let pendentes = await deps.carregar('pendentes');
  let offset = await deps.carregar('offset');
  let publicadas = 0;

  const publicar = async (lista) => {
    const { resultado, adicionadas } = adicionarOfertas(ofertas, lista);
    ofertas = resultado;
    for (const o of adicionadas) {
      try { await deps.publicarNoCanal(o); publicadas++; }
      catch (err) { console.error('[publicar] canal falhou:', err.message); }
    }
  };

  // 1. Colher respostas do Telegram e publicar pendentes resolvidos
  try {
    const { updates, proximoOffset } = await deps.buscarRespostas(offset);
    offset = proximoOffset;
    const { publicaveis, restantes } = resolverPendentes(pendentes, updates);
    pendentes = restantes;
    await publicar(publicaveis);
  } catch (err) { console.error('[fila] colher respostas falhou:', err.message); }

  // 2. Esteira AliExpress (automática)
  if (deps.temCredenciaisAE()) {
    try {
      const brutas = await deps.garimparAE(deps.keywords);
      const enriquecidas = await deps.filtrar(brutas);
      // AliExpress já traz urlAfiliado; filtro preserva os campos
      await publicar(enriquecidas);
    } catch (err) { console.error('[AE] esteira falhou:', err.message); }
  }

  // 3. Esteira Mercado Livre (vai pra fila)
  try {
    const brutas = await deps.garimparML(deps.keywords);
    const enriquecidas = await deps.filtrar(brutas);
    const jaConhecidos = new Set([...ofertas.map(o => o.id), ...pendentes.map(p => p.id)]);
    for (const oferta of enriquecidas) {
      if (jaConhecidos.has(oferta.id)) continue;
      const telegramMessageId = await deps.enviarCandidata(oferta);
      pendentes.push({ ...oferta, telegramMessageId });
    }
  } catch (err) { console.error('[ML] esteira falhou:', err.message); }

  await deps.salvar('ofertas', ofertas);
  await deps.salvar('pendentes', pendentes);
  await deps.salvar('offset', offset);
  return { publicadas };
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `node --test test/orquestrador.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Implementar o run.js (fiação real, sem teste)**

```javascript
// src/run.js
import { readFile, writeFile } from 'node:fs/promises';
import { CAMINHOS } from './config.js';
import { garimparML } from './garimpo-ml.js';
import { garimparAliExpress, temCredenciais } from './garimpo-aliexpress.js';
import { filtrarOfertas } from './filtro-ia.js';
import { chamarGemini } from './gemini.js';
import { enviarMensagem, buscarRespostas } from './telegram.js';
import { formatarCandidata } from './fila-telegram.js';
import { publicarNoCanal } from './publicar.js';
import { executar } from './orquestrador.js';

const env = process.env;
const tg = { token: env.TELEGRAM_TOKEN };
const chatFila = env.TELEGRAM_CHAT_ID;        // você (aprovação)
const chatCanal = env.TELEGRAM_CANAL_ID || env.TELEGRAM_CHAT_ID; // canal público

async function lerJson(caminho, padrao) {
  try { return JSON.parse(await readFile(caminho, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return padrao; throw e; }
}

const deps = {
  keywords: await lerJson(CAMINHOS.keywords, []),
  carregar: async (k) => {
    if (k === 'ofertas') return lerJson(CAMINHOS.ofertas, []);
    if (k === 'pendentes') return lerJson(CAMINHOS.pendentes, []);
    if (k === 'offset') return (await lerJson(CAMINHOS.offset, { offset: 0 })).offset;
  },
  salvar: async (k, v) => {
    const mapa = { ofertas: CAMINHOS.ofertas, pendentes: CAMINHOS.pendentes };
    if (k === 'offset') return writeFile(CAMINHOS.offset, JSON.stringify({ offset: v }, null, 2) + '\n');
    return writeFile(mapa[k], JSON.stringify(v, null, 2) + '\n');
  },
  buscarRespostas: (offset) => buscarRespostas(offset, tg),
  temCredenciaisAE: temCredenciais,
  garimparAE: (kw) => garimparAliExpress(kw, {
    appKey: env.ALIEXPRESS_APP_KEY, appSecret: env.ALIEXPRESS_APP_SECRET, trackingId: env.ALIEXPRESS_TRACKING_ID,
  }),
  garimparML: (kw) => garimparML(kw, { token: env.ML_ACCESS_TOKEN }),
  filtrar: (brutas) => filtrarOfertas(brutas, { callModel: chamarGemini }),
  enviarCandidata: (oferta) => enviarMensagem(formatarCandidata(oferta), { ...tg, chatId: chatFila }),
  publicarNoCanal: (oferta) => publicarNoCanal(oferta, {
    enviar: (texto, botoes) => enviarMensagem(texto, { ...tg, chatId: chatCanal, botoes }),
  }),
};

const { publicadas } = await executar(deps);
console.log(`✅ Execução concluída. Ofertas publicadas: ${publicadas}`);
```

- [ ] **Step 7: Commit**

```bash
git add src/config.js data/keywords.json src/orquestrador.js src/run.js test/orquestrador.test.js
git commit -m "feat: orquestrador das esteiras ML e AliExpress"
```

---

### Task 9: Site estático (GitHub Pages)

**Files:**
- Create: `site/index.html`
- Create: `site/render.js`
- Create: `site/ofertas.json` (semente `[]`)
- Create: `test/site.test.js`

**Interfaces:**
- Consumes: `site/ofertas.json` (gerado pelo orquestrador).
- Produces: página que faz `fetch('ofertas.json')` e renderiza cards com filtro por categoria. Função testável `renderizarCard(oferta) -> string` exposta em `site/render.js` (ESM) e reusada pela página.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// test/site.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarCard } from '../site/render.js';

test('renderizarCard inclui título, preço e link de afiliado', () => {
  const html = renderizarCard({ titulo: 'Oxímetro', categoria: 'Saúde', preco: 80, desconto: 20, imagem: 'http://i', urlAfiliado: 'http://afil/x' });
  assert.ok(html.includes('Oxímetro'));
  assert.ok(html.includes('http://afil/x'));
  assert.ok(html.includes('80'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/site.test.js`
Expected: FAIL com "Cannot find module '../site/render.js'".

- [ ] **Step 3: Implementar render + página**

```javascript
// site/render.js
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
```

```html
<!-- site/index.html -->
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ofertas Saúde — as melhores promoções de saúde e bem-estar</title>
<meta name="description" content="Ofertas selecionadas de saúde, bem-estar, fitness e odonto, atualizadas automaticamente.">
<style>
  :root{--bg:#0b120f;--card:#12201a;--ac:#2BE4B0;--tx:#e8f0ec}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,sans-serif}
  header{padding:2rem 1rem;text-align:center}h1{color:var(--ac);margin:.2rem}
  .filtros{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;padding:0 1rem 1rem}
  .filtros button{background:var(--card);color:var(--tx);border:1px solid #244;border-radius:999px;padding:.4rem 1rem;cursor:pointer}
  .filtros button.ativo{background:var(--ac);color:#04120c;font-weight:700}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem;padding:1rem;max-width:1200px;margin:0 auto}
  .card{background:var(--card);border:1px solid #1d3a30;border-radius:14px;padding:1rem;display:flex;flex-direction:column;gap:.5rem}
  .card img{width:100%;height:170px;object-fit:contain;background:#fff;border-radius:10px}
  .tag{align-self:flex-start;font-size:.75rem;color:var(--ac);border:1px solid var(--ac);border-radius:999px;padding:.1rem .6rem}
  .card h3{font-size:1rem;margin:0}.preco .antigo{text-decoration:line-through;opacity:.6;font-size:.85rem}
  .preco em{color:var(--ac);font-style:normal;font-weight:700}
  .btn{margin-top:auto;text-align:center;background:var(--ac);color:#04120c;font-weight:700;text-decoration:none;padding:.6rem;border-radius:10px}
  .vazio{text-align:center;opacity:.7;padding:3rem}
</style>
</head>
<body>
<header><h1>Ofertas Saúde</h1><p>Promoções de saúde, bem-estar, fitness e odonto — atualizadas automaticamente.</p></header>
<nav class="filtros" id="filtros"></nav>
<main id="lista"><p class="vazio">Carregando ofertas…</p></main>
<script type="module">
import { renderizarCard } from './render.js';
const CATS = ['Todas','Saúde','Odonto','Fitness','Cuidado pessoal'];
const lista = document.getElementById('lista');
const filtros = document.getElementById('filtros');
let ofertas = [], catAtual = 'Todas';
function pintar(){
  const f = catAtual==='Todas'?ofertas:ofertas.filter(o=>o.categoria===catAtual);
  lista.innerHTML = f.length ? f.map(renderizarCard).join('') : '<p class="vazio">Nenhuma oferta nesta categoria ainda.</p>';
}
CATS.forEach(c=>{const b=document.createElement('button');b.textContent=c;if(c==='Todas')b.classList.add('ativo');
  b.onclick=()=>{catAtual=c;[...filtros.children].forEach(x=>x.classList.remove('ativo'));b.classList.add('ativo');pintar();};filtros.appendChild(b);});
fetch('ofertas.json').then(r=>r.json()).then(d=>{ofertas=d.slice().reverse();pintar();})
  .catch(()=>{lista.innerHTML='<p class="vazio">Não foi possível carregar as ofertas.</p>';});
</script>
</body>
</html>
```

```json
// site/ofertas.json
[]
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test test/site.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Verificação visual manual**

Rodar um servidor estático e abrir `http://localhost:5000` no navegador:
Run: `npx --yes serve site -l 5000` (ou `python -m http.server 5000 -d site`)
Expected: página "Ofertas Saúde" carrega, filtros aparecem, mostra "Nenhuma oferta…" com `ofertas.json` vazio.

- [ ] **Step 6: Commit**

```bash
git add site/index.html site/render.js site/ofertas.json test/site.test.js
git commit -m "feat: site estático de ofertas com filtro por categoria"
```

---

### Task 10: GitHub Actions (cron) + README

**Files:**
- Create: `.github/workflows/ofertas.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm test`, `src/run.js`, secrets do repositório.
- Produces: workflow que roda testes, executa o run, commita mudanças em `site/ofertas.json`, `data/pendentes.json`, `data/telegram-offset.json`, e publica o `site/` no GitHub Pages.

- [ ] **Step 1: Escrever o workflow**

```yaml
# .github/workflows/ofertas.yml
name: Garimpo de Ofertas
on:
  schedule:
    - cron: '0 */6 * * *'   # a cada 6 horas (UTC)
  workflow_dispatch: {}
permissions:
  contents: write
  pages: write
  id-token: write
concurrency:
  group: ofertas
  cancel-in-progress: false
jobs:
  garimpar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Testes
        run: npm test
      - name: Executar garimpo
        env:
          TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          TELEGRAM_CANAL_ID: ${{ secrets.TELEGRAM_CANAL_ID }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          ML_ACCESS_TOKEN: ${{ secrets.ML_ACCESS_TOKEN }}
          ALIEXPRESS_APP_KEY: ${{ secrets.ALIEXPRESS_APP_KEY }}
          ALIEXPRESS_APP_SECRET: ${{ secrets.ALIEXPRESS_APP_SECRET }}
          ALIEXPRESS_TRACKING_ID: ${{ secrets.ALIEXPRESS_TRACKING_ID }}
        run: npm start
      - name: Commit das mudanças
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add site/ofertas.json data/pendentes.json data/telegram-offset.json
          git diff --cached --quiet || git commit -m "chore: atualização automática de ofertas [skip ci]"
          git push
      - name: Publicar no GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with: { path: site }
  deploy:
    needs: garimpar
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deploy.outputs.page_url }}' }
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Escrever o README**

```markdown
# Ofertas Saúde — Agregador de Afiliados

Garimpa ofertas de saúde/bem-estar/odonto no Mercado Livre e AliExpress, filtra com IA,
publica num site estático (GitHub Pages) e num canal Telegram. Roda sozinho via GitHub Actions.

## Fluxo
- **AliExpress**: automático — a API gera o link de afiliado e publica direto.
- **Mercado Livre**: garimpo automático, mas o link é manual. O bot manda a oferta no seu
  Telegram privado; você **responde colando o link de afiliado** e a próxima rodada publica.

## Secrets necessários (Settings → Secrets → Actions)
| Secret | Obrigatório | Para quê |
|---|---|---|
| `TELEGRAM_TOKEN` | sim | bot do Telegram |
| `TELEGRAM_CHAT_ID` | sim | seu chat privado (fila de aprovação) |
| `TELEGRAM_CANAL_ID` | sim | canal público de ofertas |
| `GEMINI_API_KEY` | sim | filtro de relevância |
| `ML_ACCESS_TOKEN` | opcional | só se a API do ML exigir auth |
| `ALIEXPRESS_APP_KEY` / `_APP_SECRET` / `_TRACKING_ID` | opcional | liga a esteira AliExpress |

Sem os secrets do AliExpress, o sistema roda só com Mercado Livre (fallback).

## Rodar local
```bash
npm test
npm start   # precisa das variáveis de ambiente acima
```

## Keywords
Edite `data/keywords.json` para ajustar o nicho.
```

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: todos os testes PASS (ofertas-store, garimpo-ml, filtro-ia, telegram, fila-telegram, publicar, garimpo-aliexpress, orquestrador, site).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ofertas.yml README.md
git commit -m "ci: GitHub Actions (cron) + docs de setup"
```

---

## Pós-implementação (ação manual do Jefferson, fora do código)

1. Criar o repositório no GitHub e dar `git push`.
2. **Settings → Pages**: Source = GitHub Actions.
3. **Settings → Secrets → Actions**: cadastrar os secrets da tabela.
4. Criar o **canal Telegram** público, adicionar o bot como admin, pegar o `TELEGRAM_CANAL_ID`.
5. Disparar o workflow manualmente (`workflow_dispatch`) para o primeiro garimpo.
6. (Opcional) Pedir credenciais da API de afiliado do AliExpress para ligar a esteira automática.

## Fase 2 (fora deste plano)
Shopee (quando a API for aprovada), WhatsApp (Baileys com cap/espaçamento anti-ban), domínio próprio, métricas de clique.
