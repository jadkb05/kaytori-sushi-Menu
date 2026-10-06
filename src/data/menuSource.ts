/**
 * Couche d'accès aux données du menu.
 *
 * Phase 0 (préparation CMS) : la seule source active est le fichier statique `yumloMenu.ts`.
 * Une future source Supabase implémentera la même interface `MenuSource` ; le reste de l'app
 * ne lit le menu qu'à travers ce module (le panier et WhatsApp ne sont pas encore concernés).
 */
import { YUMLO_CATEGORIES, YUMLO_MENU, type YumloMenuItem } from "./yumloMenu";

/** Menu complet, dans le format consommé par l'app V1. */
export type MenuSnapshot = {
  /** Noms des catégories, dans l'ordre d'affichage. */
  categories: readonly string[];
  /** Plats, dans l'ordre du fichier source (l'ordre d'affichage par catégorie en découle). */
  items: readonly YumloMenuItem[];
};

/** « supabase » : préparée (supabaseMenuSource.ts) mais jamais active à ce stade. */
export type MenuSourceId = "static" | "supabase";

export type MenuSource = {
  id: MenuSourceId;
  load: () => Promise<MenuSnapshot>;
};

const STATIC_SNAPSHOT: MenuSnapshot = {
  categories: YUMLO_CATEGORIES,
  items: YUMLO_MENU,
};

/** Menu statique (yumloMenu.ts), disponible immédiatement : mêmes objets que les exports d'origine. */
export function getStaticMenu(): MenuSnapshot {
  return STATIC_SNAPSHOT;
}

export const staticMenuSource: MenuSource = {
  id: "static",
  load: async () => STATIC_SNAPSHOT,
};

/** Source utilisée par le menu public. Phases 0 et 1 : toujours le fichier statique. */
export const ACTIVE_MENU_SOURCE: MenuSource = staticMenuSource;

/** Charge le menu depuis la source active. */
export function getMenu(): Promise<MenuSnapshot> {
  return ACTIVE_MENU_SOURCE.load();
}
