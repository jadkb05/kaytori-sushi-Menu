/**
 * Construction du seed SQL (supabase/seed.sql) à partir du menu statique.
 * Idempotent : upsert par clé primaire (ON CONFLICT … DO UPDATE), aucune suppression.
 */
import type { MenuRows } from "../src/data/menuRows";

export const SEED_FILE = new URL("../supabase/seed.sql", import.meta.url);

function lit(v: string | number | boolean | null): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

function upsert(table: string, columns: string[], key: string[], rows: Record<string, unknown>[]): string {
  const values = rows
    .map((r) => `  (${columns.map((c) => lit(r[c] as string | number | boolean | null)).join(", ")})`)
    .join(",\n");
  const updates = columns
    .filter((c) => !key.includes(c))
    .map((c) => `  ${c} = excluded.${c}`)
    .join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values}\non conflict (${key.join(", ")}) do update set\n${updates};\n`;
}

export function buildSeedSql(rows: MenuRows): string {
  return [
    "-- =============================================================================",
    "-- Seed du menu Kaytôri — GÉNÉRÉ par `npm run supabase:seed` depuis src/data/yumloMenu.ts.",
    "-- Ne pas éditer à la main.",
    "--",
    `-- ${rows.categories.length} catégories, ${rows.products.length} produits, ${rows.variants.length} variantes.`,
    "-- Idempotent : relançable sans doublon (upsert par clé primaire, aucune suppression).",
    "-- Attention : un nouveau passage remet les lignes concernées à l'état du fichier statique.",
    "-- =============================================================================",
    "",
    "begin;",
    "",
    upsert(
      "public.categories",
      ["id", "name", "sort_order", "is_active", "display_mode"],
      ["id"],
      rows.categories,
    ),
    upsert(
      "public.products",
      [
        "id",
        "category_id",
        "name",
        "description",
        "price",
        "currency",
        "image_url",
        "thumb_small_url",
        "thumb_large_url",
        "sort_order",
        "is_active",
      ],
      ["id"],
      rows.products,
    ),
    upsert(
      "public.product_variants",
      ["product_id", "id", "label", "price", "sort_order", "is_active"],
      ["product_id", "id"],
      rows.variants,
    ),
    "commit;",
    "",
  ].join("\n");
}
