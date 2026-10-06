/**
 * Source Supabase du menu (activée par VITE_MENU_SOURCE=supabase, voir menuSource.ts).
 *
 * Lit les tables categories / products / product_variants (RLS : contenu actif pour le public)
 * et renvoie exactement le format de l'app V1 via rowsToMenu().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase/client";
import type { MenuSource } from "./menuSource";
import { rowsToMenu, type CategoryRow, type MenuRows, type ProductRow, type VariantRow } from "./menuRows";

const CATEGORY_COLUMNS = "id, name, sort_order, is_active, display_mode";
const PRODUCT_COLUMNS =
  "id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active";
const VARIANT_COLUMNS = "product_id, id, label, price, sort_order, is_active";

/**
 * Lignes brutes des 3 tables du menu, telles que la RLS les autorise pour la session courante
 * (public : actives uniquement ; admin : toutes, y compris masquées). Partagé avec l'admin.
 */
export async function fetchMenuRows(supabase: SupabaseClient): Promise<MenuRows> {
  const [categories, products, variants] = await Promise.all([
    supabase.from("categories").select(CATEGORY_COLUMNS).order("sort_order"),
    supabase.from("products").select(PRODUCT_COLUMNS).order("sort_order"),
    supabase.from("product_variants").select(VARIANT_COLUMNS).order("sort_order"),
  ]);
  for (const res of [categories, products, variants]) {
    if (res.error) throw new Error(`Lecture Supabase impossible : ${res.error.message}`);
  }
  return {
    categories: categories.data as CategoryRow[],
    products: products.data as ProductRow[],
    variants: variants.data as VariantRow[],
  };
}

export const supabaseMenuSource: MenuSource = {
  id: "supabase",
  load: async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants)");
    }
    return rowsToMenu(await fetchMenuRows(supabase));
  },
};
