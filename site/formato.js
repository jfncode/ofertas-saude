// Formatação de preço em pt-BR (R$ 1.234,56). Sem dependência de ICU.
export function formatarPreco(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const [inteiro, decimal] = n.toFixed(2).split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${comMilhar},${decimal}`;
}
