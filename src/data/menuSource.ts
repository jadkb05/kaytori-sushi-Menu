/**
 * Couche d'accès aux données du menu.
 *
 *   UI → MenuProvider → loadMenu() / getMenu() → source active
 *                                                 ├── static   (yumloMenu.ts, par défaut)
 *                                                 └── supabase (VITE_MENU_SOURCE=supabase)
 *
 * La source se choisit avec VITE_MENU_SOURCE. Absente ou invalide → static.
 * Si Supabase est choisi mais indisponible (non configuré, erreur, délai dépassé, menu vide),
 * le menu retombe sur la source statique : le site reste toujours utilisable.
 */
import type { CategoryDisplayMode } from "./menuRows";
import { YUMLO_CATEGORIES, YUMLO_MENU, type YumloMenuItem } from "./yumloMenu";

/** Menu complet, dans le format consommé par l'app V1. */
export type MenuSnapshot = {
  /** Noms des catégories, dans l'ordre d'affichage. */
  categories: readonly string[];
  /** Plats, dans l'ordre du fichier source (l'ordre d'affichage par catégorie en découle). */
  items: readonly YumloMenuItem[];
  /**
   * Mode d'affichage par nom de catégorie, issu de la base (categories.display_mode, attaché à
   * l'identifiant : il survit à un renommage). Absent pour le menu statique : règle par nom.
   */
  displayModes?: Readonly<Record<string, CategoryDisplayMode>>;
};

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

/**
 * Source Supabase chargée à la demande (import dynamique) : en mode statique,
 * le client Supabase n'est jamais téléchargé par le navigateur.
 */
export const lazySupabaseMenuSource: MenuSource = {
  id: "supabase",
  load: async () => (await import("./supabaseMenuSource")).supabaseMenuSource.load(),
};

/**
 * VITE_MENU_SOURCE → source. Absente ou invalide → « static ».
 * (Lecture de la seule variable utile : `import.meta.env` entier serait inliné dans le bundle.)
 */
export function resolveMenuSourceId(
  env: Record<string, unknown> = { VITE_MENU_SOURCE: import.meta.env.VITE_MENU_SOURCE },
): MenuSourceId {
  const raw = typeof env.VITE_MENU_SOURCE === "string" ? env.VITE_MENU_SOURCE.trim().toLowerCase() : "";
  if (raw === "supabase") return "supabase";
  if (raw !== "" && raw !== "static" && import.meta.env.DEV) {
    console.warn(`[menu] VITE_MENU_SOURCE="${raw}" invalide : source statique utilisée.`);
  }
  return "static";
}

export function menuSourceFor(id: MenuSourceId): MenuSource {
  return id === "supabase" ? lazySupabaseMenuSource : staticMenuSource;
}

/** Source utilisée par le menu public (défaut : statique). */
export const ACTIVE_MENU_SOURCE: MenuSource = menuSourceFor(resolveMenuSourceId());

/**
 * Délai maximal de chargement d'une source distante avant repli sur le statique (3 s).
 * supabase-js relance les requêtes en échec réseau : sans ce plafond, l'attente s'allongerait.
 */
export const MENU_LOAD_TIMEOUT_MS = 3000;

export type MenuLoadResult = {
  menu: MenuSnapshot;
  /** Source réellement utilisée (static en cas de repli). */
  sourceId: MenuSourceId;
  /** Raison du repli sur le statique, ou null si la source demandée a répondu. */
  fallbackReason: string | null;
};

/**
 * Charge le menu depuis `source`. Toute erreur d'une source distante déclenche le
 * REPLI STATIQUE (fallback) : le menu de yumloMenu.ts est renvoyé et la raison est signalée.
 */
export async function loadMenu(
  source: MenuSource = ACTIVE_MENU_SOURCE,
  timeoutMs: number = MENU_LOAD_TIMEOUT_MS,
): Promise<MenuLoadResult> {
  if (source.id === "static") {
    return { menu: STATIC_SNAPSHOT, sourceId: "static", fallbackReason: null };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`délai de ${timeoutMs} ms dépassé`)), timeoutMs);
    });
    const menu = await Promise.race([source.load(), timeout]);
    if (menu.categories.length === 0 || menu.items.length === 0) {
      throw new Error("menu vide (aucune catégorie ou aucun produit actif)");
    }
    return { menu, sourceId: source.id, fallbackReason: null };
  } catch (error) {
    // REPLI STATIQUE : la source distante a échoué, le site continue avec yumloMenu.ts.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[menu] Source « ${source.id} » indisponible (${reason}) : repli sur le menu statique.`);
    return { menu: STATIC_SNAPSHOT, sourceId: "static", fallbackReason: reason };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Charge le menu depuis la source active (avec repli statique). */
export async function getMenu(): Promise<MenuSnapshot> {
  return (await loadMenu()).menu;
}

/**
 * Menu disponible immédiatement, sans attente : celui de la source statique quand elle est active,
 * sinon null (le menu distant se charge alors de façon asynchrone).
 */
export function getInitialMenu(source: MenuSource = ACTIVE_MENU_SOURCE): MenuSnapshot | null {
  return source.id === "static" ? STATIC_SNAPSHOT : null;
}
