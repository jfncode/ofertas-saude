import { adicionarOfertas } from './ofertas-store.js';
import { resolverPendentes } from './fila-telegram.js';

export async function executar(deps) {
  let ofertas = await deps.carregar('ofertas');
  let pendentes = await deps.carregar('pendentes');
  let offset = await deps.carregar('offset');
  let publicadas = 0;

  // Publica cada oferta nova; só registra em `ofertas` as que o canal aceitou.
  // Retorna as ofertas efetivamente publicadas (p/ o chamador saber o que falhou).
  const publicar = async (lista) => {
    const existentes = new Set(ofertas.map(o => o.id));
    const publicadasOk = [];
    for (const o of lista) {
      if (existentes.has(o.id)) continue;
      existentes.add(o.id);
      try {
        await deps.publicarNoCanal(o);
        publicadasOk.push(o);
        publicadas++;
      } catch (err) {
        console.error('[publicar] canal falhou:', err.message);
      }
    }
    const { resultado } = adicionarOfertas(ofertas, publicadasOk);
    ofertas = resultado;
    return publicadasOk;
  };

  // 1. Colher respostas do Telegram e publicar resolvidos. Inclui pendentes já
  //    resolvidos em runs anteriores que falharam ao publicar (têm urlAfiliado mas
  //    ainda não entraram em `ofertas`), p/ não perder o link de afiliado colado.
  try {
    const { updates, proximoOffset } = await deps.buscarRespostas(offset);
    offset = proximoOffset;
    const { publicaveis, restantes } = resolverPendentes(pendentes, updates);
    const resolvidosRetidos = restantes.filter(p => p.urlAfiliado);
    const aguardandoLink = restantes.filter(p => !p.urlAfiliado);
    const paraPublicar = [...publicaveis, ...resolvidosRetidos];
    const publicadosOk = await publicar(paraPublicar);
    const idsOk = new Set(publicadosOk.map(o => o.id));
    const falhados = paraPublicar.filter(o => !idsOk.has(o.id));
    pendentes = [...aguardandoLink, ...falhados];
  } catch (err) { console.error('[fila] colher respostas falhou:', err.message); }

  // 2. Esteira AliExpress (automática). Dedup ANTES de filtrar p/ não gastar Gemini
  //    com itens já conhecidos.
  if (deps.temCredenciaisAE()) {
    try {
      const brutas = await deps.garimparAE(deps.keywords);
      const conhecidos = new Set(ofertas.map(o => o.id));
      const novas = brutas.filter(b => !conhecidos.has(b.id));
      const enriquecidas = await deps.filtrar(novas);
      await publicar(enriquecidas);
    } catch (err) { console.error('[AE] esteira falhou:', err.message); }
  }

  // 3. Esteira Mercado Livre (vai pra fila). Dedup ANTES de filtrar (ofertas ∪ pendentes).
  try {
    const brutas = await deps.garimparML(deps.keywords);
    const jaConhecidos = new Set([...ofertas.map(o => o.id), ...pendentes.map(p => p.id)]);
    const novas = brutas.filter(b => !jaConhecidos.has(b.id));
    const enriquecidas = await deps.filtrar(novas);
    for (const oferta of enriquecidas) {
      const telegramMessageId = await deps.enviarCandidata(oferta);
      pendentes.push({ ...oferta, telegramMessageId });
    }
  } catch (err) { console.error('[ML] esteira falhou:', err.message); }

  await deps.salvar('ofertas', ofertas);
  await deps.salvar('pendentes', pendentes);
  await deps.salvar('offset', offset);
  return { publicadas };
}
