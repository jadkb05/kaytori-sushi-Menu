/**
 * Couche d'accès aux données du menu.
 *
 *   UI → MenuProvider → getMenu() → PRODUCTION_MENU (src/data/menu.json, productionMenu.ts)
 *
 * Le menu public est statique : données exportées de la base de production (Supabase, archivée
 * dans supabase/), sans aucune requête réseau. Aucun écran d'attente ni d'erreur de chargement.
 *
 * yumloMenu.ts reste le menu de référence historique (mai 2026) : il n'est PLUS affiché.
 * Il sert aux tests de référence et de repli de catégorie pour le message WhatsApp.
 */
import type { CategoryDisplayMode } from "./menuRows";
import { PRODUCTION_MENU } from "./productionMenu";
import { YUMLO_CATEGORIES, YUMLO_MENU, type YumloMenuItem } from "./yumloMenu";

/** Menu complet, dans le format consommé par l'app V1. */
export type MenuSnapshot = {
  /** Noms des catégories, dans l'ordre d'affichage. */
  categories: readonly string[];
  /** Plats, dans l'ordre du fichier source (l'ordre d'affichage par catégorie en découle). */
  items: readonly YumloMenuItem[];
  /**
   * Mode d'affichage par nom de catégorie, issu de la base (categories.display_mode, attaché à
   * l'identifiant : il survit à un renommage). Absent pour le menu de référence : règle par nom.
   */
  displayModes?: Readonly<Record<string, CategoryDisplayMode>>;
  /**
   * Catégories en ordre manuel qui gardent les sous-titres « Assortiments XX pcs » (par nom
   * affiché ; calculé depuis l'identifiant « assortiments », il survit à un renommage).
   * Absent pour le menu de référence (Assortiments y est en tri automatique par pièces).
   */
  pcsHeadingCategories?: readonly string[];
  /**
   * Noms des sections formules (formule_sections), pour le carrousel public.
   * Absent en menu de référence : repli sur les 3 libellés initiaux + heuristique.
   */
  formuleSectionNames?: readonly string[];
  /**
   * Descriptions facultatives par nom de section (clés = libellés affichés).
   * Absent ou chaîne vide : aucun sous-titre sous le nom.
   */
  formuleSectionDescriptions?: Readonly<Record<string, string>>;
};

const REFERENCE_SNAPSHOT: MenuSnapshot = {
  categories: YUMLO_CATEGORIES,
  items: YUMLO_MENU,
};

/**
 * Menu de référence historique (yumloMenu.ts, mai 2026), mêmes objets que les exports d'origine.
 * N'est plus affiché : utilisé par les tests de référence.
 */
export function getStaticMenu(): MenuSnapshot {
  return REFERENCE_SNAPSHOT;
}

/** Menu public : données de production (src/data/menu.json), disponibles immédiatement. */
export function getMenu(): MenuSnapshot {
  return PRODUCTION_MENU;
}
