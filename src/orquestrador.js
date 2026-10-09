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
