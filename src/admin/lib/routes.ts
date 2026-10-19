/**
 * Routes de l'espace /admin (sans dépendance de routing) et règles d'accès par route.
 * Ce module est léger : App.tsx l'importe pour savoir s'il faut charger l'admin.
 */
import type { AdminAccess } from "./auth";

export const ADMIN_ROUTES = {
  dashboard: "/admin",
  login: "/admin/login",
  products: "/admin/products",
  categories: "/admin/categories",
  productNew: "/admin/products/new",
  formules: "/admin/formules",
  formuleNew: "/admin/formules/new",
} as const;

/** /admin/products/:id — édition d'un produit existant. */
export function productEditPath(productId: string): string {
  return `${ADMIN_ROUTES.products}/${encodeURIComponent(productId)}`;
}

export function formuleEditPath(formuleId: string): string {
  return `${ADMIN_ROUTES.formules}/${encodeURIComponent(formuleId)}`;
}

export type AdminContentPage =
  | "dashboard"
  | "products"
  | "categories"
  | "formules"
  | "productEdit"
  | "productCreate"
  | "formuleEdit"
  | "formuleCreate";
export type AdminPage = AdminContentPage | "login" | "denied" | "unconfigured" | "error";

export type AdminRouteDecision =
  | { kind: "loading" }
  | { kind: "redirect"; to: string }
  | { kind: "page"; page: AdminPage; productId?: string };

/** « /admin/products/ » → « /admin/products ». */
export function normalizeAdminPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function isAdminPath(pathname: string): boolean {
  const p = normalizeAdminPath(pathname);
  return p === "/admin" || p.startsWith("/admin/");
}

const CONTENT_PAGES: Record<string, AdminContentPage> = {
  [ADMIN_ROUTES.dashboard]: "dashboard",
  [ADMIN_ROUTES.products]: "products",
  [ADMIN_ROUTES.categories]: "categories",
  // Avant /admin/products/:id : « new » n'est jamais un ID produit (10 caractères hexadécimaux).
  [ADMIN_ROUTES.productNew]: "productCreate",
  [ADMIN_ROUTES.formules]: "formules",
  [ADMIN_ROUTES.formuleNew]: "formuleCreate",
};

/** « /admin/products/743455af94 » → « 743455af94 » (un seul segment), sinon null. */
function productIdFromPath(path: string): string | null {
  const prefix = `${ADMIN_ROUTES.products}/`;
  if (!path.startsWith(prefix)) return null;
  const segment = path.slice(prefix.length);
  if (segment === "" || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Décide quoi afficher pour un chemin /admin selon l'accès :
 * - non connecté → /admin/login ;
 * - connecté sans droits (absent de admin_users) → accès refusé ;
 * - admin → page demandée (login → tableau de bord, chemin inconnu → tableau de bord).
 */
export function resolveAdminRoute(pathname: string, access: AdminAccess): AdminRouteDecision {
  const path = normalizeAdminPath(pathname);
  switch (access.status) {
    case "loading":
      return { kind: "loading" };
    case "unconfigured":
      return { kind: "page", page: "unconfigured" };
    case "error":
      return { kind: "page", page: "error" };
    case "signedOut":
      return path === ADMIN_ROUTES.login
        ? { kind: "page", page: "login" }
        : { kind: "redirect", to: ADMIN_ROUTES.login };
    case "notAdmin":
      return { kind: "page", page: "denied" };
    case "admin": {
      const page = CONTENT_PAGES[path];
      if (page) return { kind: "page", page };
      const formulePrefix = `${ADMIN_ROUTES.formules}/`;
      if (path.startsWith(formulePrefix)) {
        const segment = path.slice(formulePrefix.length);
        if (segment !== "" && !segment.includes("/")) {
          try {
            return { kind: "page", page: "formuleEdit", productId: decodeURIComponent(segment) };
          } catch {
            return { kind: "redirect", to: ADMIN_ROUTES.formules };
          }
        }
      }
      const productId = productIdFromPath(path);
      if (productId) return { kind: "page", page: "productEdit", productId };
      return { kind: "redirect", to: ADMIN_ROUTES.dashboard };
    }
  }
}
