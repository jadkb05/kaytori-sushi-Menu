/**
 * Formules publiées : lues dans Supabase (catégorie formules-promos) et posées sur le menu
 * statique, sans remplacer les autres catégories. Sans catégorie en base, le menu statique reste.
 */
import type { YumloMenuItem } from "./yumloMenu";
import { FORMULES_CATEGORY_ID, FORMULES_PROMOS_CATEGORY } from "./formulesPromos";
import { formatDbPrice, type ProductRow } from "./menuRows";
import type { MenuSnapshot } from "./menuSource";

export type FormuleCategoryProbe = { id: string; is_active: boolean } | null;

/**
 * null : catégorie absente ou lecture impossible → conserver les affiches statiques.
 * tableau : source Supabase (éventuellement vide si tout est désactivé).
 */
export function publishedFormules(
  category: FormuleCategoryProbe,
  products: readonly ProductRow[],
): YumloMenuItem[] | null {
  if (!category || category.id !== FORMULES_CATEGORY_ID) return null;
  if (!category.is_active) return [];
  return products
    .filter((p) => p.category_id === FORMULES_CATEGORY_ID && p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => ({
      id: p.id,
      category: FORMULES_PROMOS_CATEGORY,
      name: p.name,
      description: p.description ?? "",
      priceMAD: formatDbPrice(p.price),
      currency: p.currency || "MAD",
      image: p.image_url ?? "",
    }));
}

/** Remplace uniquement les formules. Les autres plats, leur ordre et leurs champs restent intacts. */
export function replaceFormules(menu: MenuSnapshot, items: readonly YumloMenuItem[]): MenuSnapshot {
  const rest = menu.items.filter((it) => it.category !== FORMULES_PROMOS_CATEGORY);
  const categories = menu.categories.includes(FORMULES_PROMOS_CATEGORY)
    ? menu.categories
    : [FORMULES_PROMOS_CATEGORY, ...menu.categories];
  return {
    ...menu,
    categories,
    items: [
      ...items.map((it) => ({ ...it, category: FORMULES_PROMOS_CATEGORY })),
      ...rest,
    ],
  };
}

/** Lecture publique (produits actifs seulement). null si Supabase n'est pas configuré ou si la catégorie n'existe pas. */
export async function fetchPublishedFormules(): Promise<YumloMenuItem[] | null> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) return null;
  const { getSupabaseClient } = await import("../lib/supabase/client");
  const client = getSupabaseClient();
  if (!client) return null;
  const category = await client
    .from("categories")
    .select("id, is_active")
    .eq("id", FORMULES_CATEGORY_ID)
    .maybeSingle();
  if (category.error || !category.data) return null;
  const products = await client
    .from("products")
    .select("id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active")
    .eq("category_id", FORMULES_CATEGORY_ID)
    .eq("is_active", true)
    .order("sort_order");
  if (products.error) return null;
  return publishedFormules(category.data, (products.data ?? []) as ProductRow[]);
}
