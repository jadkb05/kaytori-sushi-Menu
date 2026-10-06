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
} as const;

export type AdminContentPage = "dashboard" | "products" | "categories";
export type AdminPage = AdminContentPage | "login" | "denied" | "unconfigured" | "error";

export type AdminRouteDecision =
  | { kind: "loading" }
  | { kind: "redirect"; to: string }
  | { kind: "page"; page: AdminPage };

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
};

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
      return page ? { kind: "page", page } : { kind: "redirect", to: ADMIN_ROUTES.dashboard };
    }
  }
}
