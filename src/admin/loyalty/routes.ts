/**
 * Routes de l'espace fidélité du personnel (/admin/fidelite…). Module léger : AdminApp l'importe
 * pour savoir s'il faut charger cet espace (chargé à part, sans les données du menu).
 *
 *   /admin/fidelite                    tableau de bord Kaytôri Club
 *   /admin/fidelite/clients            gestion des clients : liste, recherche, filtres, inscription
 *   /admin/fidelite/recompenses        catalogue et gestion des récompenses en points
 *   /admin/fidelite/points             paramètres du programme, valeur du point et code secret QR
 *   /admin/fidelite/clients/:cardId    fiche client : solde, attribution ticket, échange, historique
 *
 * Le scan de QR code ne passe plus par l'administration : le manager scanne le QR code du client
 * directement avec l'appareil photo de son téléphone, ce qui ouvre /fidelite/scan/:code.
 */

export const STAFF_ROUTES = {
  home: "/admin/fidelite",
  clients: "/admin/fidelite/clients",
  rewards: "/admin/fidelite/recompenses",
  points: "/admin/fidelite/points",
} as const;

export type StaffRoute =
  | { page: "home" }
  | { page: "clients" }
  | { page: "rewards" }
  | { page: "points" }
  | { page: "card"; cardId: string }
  | { page: "redirect"; to: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function normalize(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function isStaffLoyaltyPath(pathname: string): boolean {
  const p = normalize(pathname);
  return p === STAFF_ROUTES.home || p.startsWith(`${STAFF_ROUTES.home}/`);
}

export function staffCardPath(cardId: string): string {
  return `${STAFF_ROUTES.clients}/${encodeURIComponent(cardId)}`;
}

/** Un seul segment après le préfixe, décodé ; null sinon. */
function segmentAfter(path: string, prefix: string): string | null {
  if (!path.startsWith(`${prefix}/`)) return null;
  const segment = path.slice(prefix.length + 1);
  if (segment === "" || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Chemin → page. Chemin inconnu (ou identifiant mal formé) : retour à l'accueil de la fidélité. */
export function resolveStaffRoute(pathname: string): StaffRoute {
  const p = normalize(pathname);
  if (p === STAFF_ROUTES.home) return { page: "home" };
  if (p === STAFF_ROUTES.clients) return { page: "clients" };
  if (p === STAFF_ROUTES.rewards) return { page: "rewards" };
  if (p === STAFF_ROUTES.points || p === "/admin/fidelite/parametres") return { page: "points" };
  const cardId = segmentAfter(p, STAFF_ROUTES.clients);
  if (cardId !== null) return UUID.test(cardId) ? { page: "card", cardId } : { page: "redirect", to: STAFF_ROUTES.clients };
  return { page: "redirect", to: STAFF_ROUTES.home };
}
