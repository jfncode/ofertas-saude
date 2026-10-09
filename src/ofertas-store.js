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
