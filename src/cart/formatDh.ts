/** Formate un montant en dirhams (affichage FR). */
export function formatDhAmount(value: number): string {
  const n = Math.round(value * 100) / 100;
  const [int, dec = ""] = n.toFixed(2).split(".");
  return `${int},${dec}`;
}
