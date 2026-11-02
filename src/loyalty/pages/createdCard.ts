/**
 * Carte qui vient d'être créée, transmise en mémoire de la page d'inscription à la page de la
 * carte (navigation sans rechargement) : affichage immédiat, sans second appel. Jamais stockée.
 */
import type { PublicCard } from "../lib/api";

let created: { token: string; card: PublicCard } | null = null;

export function rememberCreatedCard(result: { token: string; card: PublicCard }): void {
  created = { token: result.token, card: result.card };
}

/** Lue une seule fois, pour ce jeton uniquement. */
export function takeCreatedCard(token: string): PublicCard | null {
  if (!created || created.token !== token) return null;
  const card = created.card;
  created = null;
  return card;
}
