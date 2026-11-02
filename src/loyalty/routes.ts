/**
 * Routes publiques de la carte de fidélité. Module léger : App.tsx l'importe pour savoir s'il faut
 * charger l'espace fidélité (chargé à part, sans le menu ni le panier).
 *
 *   /fidelite                     présentation, création de la carte
 *   /fidelite/carte               carte personnelle (accès : #jeton ou jeton gardé sur l'appareil)
 *   /fidelite/scan/:codePublic    cible du QR : neutre pour le public (le personnel : phase admin)
 */

export const LOYALTY_ROUTES = {
  home: "/fidelite",
  card: "/fidelite/carte",
  scan: "/fidelite/scan",
} as const;

export type LoyaltyRoute =
  | { page: "home" }
  | { page: "card" }
  | { page: "scan"; publicCode: string }
  | { page: "redirect"; to: string };

function normalize(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function isLoyaltyPath(pathname: string): boolean {
  const p = normalize(pathname);
  return p === LOYALTY_ROUTES.home || p.startsWith(`${LOYALTY_ROUTES.home}/`);
}

/** Chemin → page. Chemin inconnu sous /fidelite : retour à la présentation. */
export function resolveLoyaltyRoute(pathname: string): LoyaltyRoute {
  const p = normalize(pathname);
  if (p === LOYALTY_ROUTES.home) return { page: "home" };
  if (p === LOYALTY_ROUTES.card) return { page: "card" };
  const prefix = `${LOYALTY_ROUTES.scan}/`;
  if (p.startsWith(prefix)) {
    const segment = p.slice(prefix.length);
    if (segment !== "" && !segment.includes("/")) {
      try {
        return { page: "scan", publicCode: decodeURIComponent(segment) };
      } catch {
        // segment mal encodé : traité comme un chemin inconnu
      }
    }
  }
  return { page: "redirect", to: LOYALTY_ROUTES.home };
}
