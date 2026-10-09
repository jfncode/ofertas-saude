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
