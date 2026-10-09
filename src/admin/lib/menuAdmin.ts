/**
 * Données de l'admin dérivées des lignes Supabase (fonctions pures, testables).
 * Un produit est « visible » s'il est actif ET que sa catégorie est active
 * (même règle que la RLS publique et que le menu public).
 */
import { formatDhAmount } from "../../cart/formatDh";
import type { CategoryDisplayMode, MenuRows } from "../../data/menuRows";
import { dishThumbs } from "../../menu/menuDisplay";

export type DashboardStats = {
  activeCategories: number;
  totalCategories: number;
  visibleProducts: number;
  hiddenProducts: number;
  totalProducts: number;
  activeVariants: number;
  totalVariants: number;
};

export type AdminProduct = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** « 69,00 » — prix de base. */
  price: string;
  /** Prix affiché sur le menu public (« dès » = variante active la moins chère). */
  displayPrice: string;
  imageUrl: string | null;
  isActive: boolean;
  categoryActive: boolean;
  visible: boolean;
  variantCount: number;
  variantLabels: string[];
  /** Position dans SA catégorie (1…categoryTotal, produits masqués compris), quel que soit le filtre affiché. */
  position: number;
  categoryTotal: number;
  /** Ordre manuel (display_mode « list » chargé de la base) : flèches ↑ / ↓ ; sinon « Ordre automatique ». */
  manualOrder: boolean;
};

export type AdminCategory = {
  id: string;
  name: string;
  sortOrder: number;
  /** Position humaine dans l'ordre du menu (1…N, masquées comprises). */
  position: number;
  isActive: boolean;
  displayMode: CategoryDisplayMode;
  productCount: number;
  visibleProductCount: number;
};

/**
 * Vignette de la liste : la vignette 224 px n'est utilisée que si elle correspond encore à la
 * photo actuelle (après un changement de photo depuis l'admin, elle désigne l'ancienne).
 */
function listImage(imageUrl: string | null, thumbSmall: string | null): string | null {
  if (thumbSmall && imageUrl && dishThumbs(imageUrl)?.small === thumbSmall) return thumbSmall;
  return imageUrl;
}

const price = (v: number | string) => formatDhAmount(typeof v === "number" ? v : Number.parseFloat(v));

export function computeDashboardStats(rows: MenuRows): DashboardStats {
  const activeCats = new Set(rows.categories.filter((c) => c.is_active).map((c) => c.id));
  const visibleProducts = rows.products.filter((p) => p.is_active && activeCats.has(p.category_id)).length;
  return {
    activeCategories: activeCats.size,
    totalCategories: rows.categories.length,
    visibleProducts,
    hiddenProducts: rows.products.length - visibleProducts,
    totalProducts: rows.products.length,
    activeVariants: rows.variants.filter((v) => v.is_active).length,
    totalVariants: rows.variants.length,
  };
}

/** Produits dans l'ordre du menu : ordre des catégories, puis ordre des produits. */
export function buildProductList(rows: MenuRows): AdminProduct[] {
  const categories = new Map(rows.categories.map((c) => [c.id, c]));
  const variantsByProduct = new Map<string, typeof rows.variants>();
  for (const v of rows.variants) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }
  const catOrder = (id: string) => categories.get(id)?.sort_order ?? Number.MAX_SAFE_INTEGER;
  const totals = new Map<string, number>();
  for (const p of rows.products) totals.set(p.category_id, (totals.get(p.category_id) ?? 0) + 1);
  // Rang dans la catégorie : même ordre que l'éditeur et que la RPC (sort_order, puis id).
  const seen = new Map<string, number>();

  return [...rows.products]
    .sort((a, b) => catOrder(a.category_id) - catOrder(b.category_id) || a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => {
      const position = (seen.get(p.category_id) ?? 0) + 1;
      seen.set(p.category_id, position);
      const cat = categories.get(p.category_id);
      const variants = [...(variantsByProduct.get(p.id) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const activePrices = variants.filter((v) => v.is_active).map((v) => Number(v.price));
      const categoryActive = cat?.is_active ?? false;
      return {
        id: p.id,
        name: p.name,
        categoryId: p.category_id,
        categoryName: cat?.name ?? p.category_id,
        price: price(p.price),
        displayPrice: activePrices.length > 0 ? price(Math.min(...activePrices)) : price(p.price),
        imageUrl: listImage(p.image_url, p.thumb_small_url),
        isActive: p.is_active,
        categoryActive,
        visible: p.is_active && categoryActive,
        variantCount: variants.length,
        variantLabels: variants.map((v) => v.label),
        position,
        categoryTotal: totals.get(p.category_id)!,
        manualOrder: cat?.display_mode === "list",
      };
    });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .trim();
}

export type ProductFilter = { query: string; categoryId: string | null };

/** Recherche (nom, sans accents) et filtre par catégorie. */
export function filterProducts(list: AdminProduct[], { query, categoryId }: ProductFilter): AdminProduct[] {
  const q = normalize(query);
  return list.filter(
    (p) => (!categoryId || p.categoryId === categoryId) && (q === "" || normalize(p.name).includes(q)),
  );
}

export function buildCategoryList(rows: MenuRows): AdminCategory[] {
  return [...rows.categories]
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c, i) => {
      const products = rows.products.filter((p) => p.category_id === c.id);
      return {
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        position: i + 1,
        isActive: c.is_active,
        displayMode: c.display_mode,
        productCount: products.length,
        visibleProductCount: c.is_active ? products.filter((p) => p.is_active).length : 0,
      };
    });
}

export const DISPLAY_MODE_LABELS: Record<CategoryDisplayMode, string> = {
  list: "Liste",
  plats_thai_sorted: "Tri spécial Plats Thaï",
  assortiments_by_pcs: "Groupé par nombre de pièces",
};
