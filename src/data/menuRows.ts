/**
 * Conversion menu ⇄ lignes de la base (tables categories / products / product_variants).
 *
 * Pur TypeScript, sans dépendance à Supabase : utilisé par le seed (statique → lignes),
 * par la future source Supabase (lignes → menu) et par les tests de parité.
 */
import { dishThumbs } from "../menu/menuDisplay";
import type { MenuSnapshot } from "./menuSource";
import type { YumloMenuItem, YumloMenuVariant } from "./yumloMenu";

export type CategoryDisplayMode = "list" | "plats_thai_sorted" | "assortiments_by_pcs";

/** Prix tel que renvoyé par Postgres (texte) ou par l'API Supabase (nombre). */
type DbPrice = number | string;

export type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  display_mode: CategoryDisplayMode;
};

export type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: DbPrice;
  currency: string;
  image_url: string | null;
  thumb_small_url: string | null;
  thumb_large_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export type VariantRow = {
  product_id: string;
  id: string;
  label: string;
  price: DbPrice;
  sort_order: number;
  is_active: boolean;
};

export type MenuRows = {
  categories: CategoryRow[];
  products: ProductRow[];
  variants: VariantRow[];
};

/** Slug stable d'une catégorie (même normalisation que les ancres du menu). */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Mode d'affichage d'après le NOM : uniquement pour le menu statique (yumloMenu.ts) et le seed.
 * Le menu Supabase utilise categories.display_mode (voir menuCategoryDisplayMode).
 * Plats Thaï est en ordre manuel (« list », ordre du fichier) depuis la migration
 * 20261012000000_plats_thai_manual_order ; « plats_thai_sorted » ne sert plus qu'au retour arrière.
 */
export function categoryDisplayMode(name: string): CategoryDisplayMode {
  if (name === "Assortiments") return "assortiments_by_pcs";
  return "list";
}

/** Mode d'affichage d'une catégorie du menu chargé : celui de la base, sinon la règle par nom. */
export function menuCategoryDisplayMode(menu: MenuSnapshot, category: string): CategoryDisplayMode {
  return menu.displayModes?.[category] ?? categoryDisplayMode(category);
}

/** Menu statique → lignes de la base. Les IDs existants sont repris tels quels. */
export function menuToRows(menu: MenuSnapshot): MenuRows {
  const categories: CategoryRow[] = menu.categories.map((name, i) => ({
    id: categorySlug(name),
    name,
    sort_order: i,
    is_active: true,
    display_mode: categoryDisplayMode(name),
  }));

  const slugByName = new Map(categories.map((c) => [c.name, c.id]));
  if (slugByName.size !== categories.length || new Set(categories.map((c) => c.id)).size !== categories.length) {
    throw new Error("Catégories en double ou slugs en collision");
  }

  const products: ProductRow[] = [];
  const variants: VariantRow[] = [];
  menu.items.forEach((it, i) => {
    const categoryId = slugByName.get(it.category);
    if (!categoryId) throw new Error(`Catégorie inconnue pour ${it.id} : ${it.category}`);
    const thumbs = dishThumbs(it.image);
    products.push({
      id: it.id,
      category_id: categoryId,
      name: it.name,
      description: it.description,
      price: it.priceMAD,
      currency: it.currency,
      image_url: it.image,
      thumb_small_url: thumbs?.small ?? null,
      thumb_large_url: thumbs?.large ?? null,
      // Ordre global du fichier source : l'ordre relatif dans chaque catégorie est conservé.
      sort_order: i,
      is_active: true,
    });
    (it.variants ?? []).forEach((v, j) => {
      variants.push({
        product_id: it.id,
        id: v.id,
        label: v.label,
        price: v.priceMAD,
        sort_order: j,
        is_active: true,
      });
    });
  });

  return { categories, products, variants };
}

/** « 69 », 69 ou « 69.0 » → « 69.00 » (format de prix de l'app). */
export function formatDbPrice(price: DbPrice): string {
  const n = typeof price === "number" ? price : Number.parseFloat(price);
  if (!Number.isFinite(n)) throw new Error(`Prix invalide : ${String(price)}`);
  return n.toFixed(2);
}

const bySortOrder = <T extends { sort_order: number; id: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lignes de la base → menu au format de l'app V1.
 * Seuls les éléments actifs (et dont les parents sont actifs) sont retenus.
 */
export function rowsToMenu(rows: MenuRows): MenuSnapshot {
  const categories = rows.categories.filter((c) => c.is_active).sort(bySortOrder);
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const variantsByProduct = new Map<string, VariantRow[]>();
  for (const v of rows.variants) {
    if (!v.is_active) continue;
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  const items: YumloMenuItem[] = rows.products
    .filter((p) => p.is_active && nameById.has(p.category_id))
    .sort(bySortOrder)
    .map((p) => {
      const variants: YumloMenuVariant[] = (variantsByProduct.get(p.id) ?? [])
        .sort(bySortOrder)
        .map((v) => ({ id: v.id, label: v.label, priceMAD: formatDbPrice(v.price) }));
      const item: YumloMenuItem = {
        id: p.id,
        category: nameById.get(p.category_id)!,
        name: p.name,
        description: p.description ?? "",
        priceMAD: formatDbPrice(p.price),
        currency: p.currency,
        image: p.image_url ?? "",
      };
      return variants.length > 0 ? { ...item, variants } : item;
    });

  return {
    categories: categories.map((c) => c.name),
    items,
    displayModes: Object.fromEntries(categories.map((c) => [c.name, c.display_mode])),
  };
}
