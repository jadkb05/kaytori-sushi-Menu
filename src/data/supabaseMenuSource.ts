/**
 * Source Supabase du menu (préparée en Phase 1, NON active).
 *
 * Lit les tables categories / products / product_variants (RLS : contenu actif uniquement)
 * et renvoie exactement le format de l'app V1 via rowsToMenu().
 * Elle n'est importée par aucune page : le menu public reste sur la source statique.
 */
import { getSupabaseClient } from "../lib/supabase/client";
import type { MenuSource } from "./menuSource";
import { rowsToMenu, type CategoryRow, type ProductRow, type VariantRow } from "./menuRows";

const CATEGORY_COLUMNS = "id, name, sort_order, is_active, display_mode";
const PRODUCT_COLUMNS =
  "id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active";
const VARIANT_COLUMNS = "product_id, id, label, price, sort_order, is_active";

export const supabaseMenuSource: MenuSource = {
  id: "supabase",
  load: async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants)");
    }
    const [categories, products, variants] = await Promise.all([
      supabase.from("categories").select(CATEGORY_COLUMNS).order("sort_order"),
      supabase.from("products").select(PRODUCT_COLUMNS).order("sort_order"),
      supabase.from("product_variants").select(VARIANT_COLUMNS).order("sort_order"),
    ]);
    for (const res of [categories, products, variants]) {
      if (res.error) throw new Error(`Lecture Supabase impossible : ${res.error.message}`);
    }
    return rowsToMenu({
      categories: categories.data as CategoryRow[],
      products: products.data as ProductRow[],
      variants: variants.data as VariantRow[],
    });
  },
};
