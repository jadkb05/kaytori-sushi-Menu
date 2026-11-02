/**
 * Menu public : données de production figées dans src/data/menu.json
 * (export de la base Supabase, scripts/build-static-menu.py), sans aucune requête réseau.
 *
 * Les lignes passent par les mêmes fonctions que l'ancien chargement Supabase :
 *   rowsToMenu()        catégories / produits / variantes (filtre « actif », tri sort_order)
 *   publishedFormules() + replaceFormules()  sections formules
 *   (couvertures : buildCoverSlides() dans coverBanners.ts)
 * Pour modifier le menu : régénérer menu.json (voir le script) ou l'éditer, puis redéployer.
 */
import menuData from "./menu.json";
import { promoteFormulesCategory, publishedFormules, replaceFormules, type FormuleProductRow, type FormuleSectionProbe } from "./formulesMenu";
import { FORMULES_CATEGORY_ID } from "./formulesPromos";
import { rowsToMenu, type CategoryRow, type VariantRow } from "./menuRows";
import type { MenuSnapshot } from "./menuSource";

export type CoverBannerRow = {
  id: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  is_active: boolean;
  product_id: string | null;
};

export type ProductionMenuData = {
  source: string;
  categories: CategoryRow[];
  products: FormuleProductRow[];
  product_variants: VariantRow[];
  formule_sections: FormuleSectionProbe[];
  cover_banners: CoverBannerRow[];
  site_settings: { cover_autoplay: boolean };
};

export const PRODUCTION_MENU_DATA = menuData as ProductionMenuData;

const bySortOrder = <T extends { sort_order: number; id: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lignes → menu affiché, exactement comme l'ancien chargement Supabase (MenuProvider) :
 * menu des 3 tables, puis formules regroupées par section (remplacement intégral).
 */
export function buildPublicMenu(data: ProductionMenuData): MenuSnapshot {
  const categories = data.categories.filter((c) => c.is_active);
  const activeIds = new Set(categories.map((c) => c.id));
  // Règles de visibilité publiques (ex-RLS) : parents actifs requis.
  const products = data.products.filter((p) => p.is_active && activeIds.has(p.category_id));
  const productIds = new Set(products.map((p) => p.id));
  const variants = data.product_variants.filter((v) => v.is_active && productIds.has(v.product_id));

  const menu = rowsToMenu({ categories, products, variants });

  const category = categories.find((c) => c.id === FORMULES_CATEGORY_ID) ?? null;
  const sections = data.formule_sections.filter((s) => s.is_active).sort(bySortOrder);
  const formuleProducts = products.filter((p) => p.category_id === FORMULES_CATEGORY_ID).sort(bySortOrder);
  const formules = publishedFormules(category, formuleProducts, sections);
  // Catégorie formules absente (masquée) : comme l'ancien chargement, découpage heuristique.
  return formules === null ? promoteFormulesCategory(menu) : replaceFormules(menu, formules, sections);
}

/** Menu public (calculé une fois au chargement du module). */
export const PRODUCTION_MENU: MenuSnapshot = buildPublicMenu(PRODUCTION_MENU_DATA);

