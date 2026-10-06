/**
 * Parité STATIC vs SUPABASE, champ par champ (modèle de parité de la Phase 0) :
 *   npm run supabase:parity
 *
 * Lit le projet Supabase configuré dans .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
 * clé publique uniquement) avec la vraie source supabaseMenuSource, et le compare au menu statique.
 * Vérifie en plus les comptages bruts (31 / 214 / 67) et les colonnes de vignettes stockées en base.
 * Lecture seule : n'écrit rien, ne change pas la source active du site.
 *
 * Node 20 : supabase-js exige un WebSocket natif à la création du client ; le script npm lance
 * donc Node avec --experimental-websocket (natif dès Node 22 ; sans effet sur le navigateur).
 */
import { compareParityModels, toParityModel } from "../src/data/menuParity";
import { getStaticMenu } from "../src/data/menuSource";
import { supabaseMenuSource } from "../src/data/supabaseMenuSource";
import { getSupabaseClient, readSupabaseConfig } from "../src/lib/supabase/client";
import { dishThumbs } from "../src/menu/menuDisplay";

if (!readSupabaseConfig()) {
  console.error("Supabase non configuré : copiez .env.example en .env.local et renseignez l'URL et la clé anon.");
  process.exit(2);
}

const staticMenu = getStaticMenu();
const expected = toParityModel(staticMenu);
const actual = toParityModel(await supabaseMenuSource.load());
const diffs = compareParityModels(expected, actual);

// Comptages bruts (lignes lisibles par le public) et vignettes stockées en base.
const supabase = getSupabaseClient()!;
const count = async (table: string) => {
  const { count: n, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} : ${error.message}`);
  return n ?? 0;
};
const counts = {
  categories: await count("categories"),
  products: await count("products"),
  product_variants: await count("product_variants"),
};
const expectedCounts = {
  categories: staticMenu.categories.length,
  products: staticMenu.items.length,
  product_variants: staticMenu.items.reduce((n, it) => n + (it.variants?.length ?? 0), 0),
};
for (const [table, n] of Object.entries(counts)) {
  const want = expectedCounts[table as keyof typeof expectedCounts];
  if (n !== want) diffs.push(`comptage ${table} : attendu ${want}, obtenu ${n}`);
}

const { data: thumbRows, error: thumbError } = await supabase
  .from("products")
  .select("id, name, image_url, thumb_small_url, thumb_large_url");
if (thumbError) throw new Error(`products (vignettes) : ${thumbError.message}`);
const staticById = new Map(staticMenu.items.map((it) => [it.id, it]));
for (const row of thumbRows ?? []) {
  const it = staticById.get(row.id);
  if (!it) continue; // déjà signalé par la parité (plat en trop)
  const want = dishThumbs(it.image);
  if (row.thumb_small_url !== (want?.small ?? null) || row.thumb_large_url !== (want?.large ?? null)) {
    diffs.push(
      `${row.id} (${row.name}) · vignettes en base : attendu ${JSON.stringify(want)}, ` +
        `obtenu ${JSON.stringify({ small: row.thumb_small_url, large: row.thumb_large_url })}`,
    );
  }
}

console.log(
  `Statique : ${expectedCounts.categories} catégories, ${expectedCounts.products} produits, ${expectedCounts.product_variants} variantes`,
);
console.log(
  `Supabase : ${counts.categories} catégories, ${counts.products} produits, ${counts.product_variants} variantes`,
);
if (diffs.length === 0) {
  console.log(
    "Parité parfaite : static === supabase (IDs, noms, descriptions, prix, images, vignettes, ordre, variantes, sous-sections).",
  );
} else {
  console.error(`${diffs.length} écart(s) :`);
  for (const d of diffs.slice(0, 100)) console.error(`  - ${d}`);
  process.exit(1);
}
