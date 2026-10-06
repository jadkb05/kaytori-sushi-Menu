/**
 * Génère supabase/seed.sql depuis le menu statique (yumloMenu.ts) :
 *   npm run supabase:seed
 *
 * N'écrit que le fichier SQL ; ne se connecte à aucune base.
 * Application : `supabase db reset` (local) ou éditeur SQL du projet Supabase.
 */
import { writeFileSync } from "node:fs";
import { menuToRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { SEED_FILE, buildSeedSql } from "./supabaseSeed";

const rows = menuToRows(getStaticMenu());
writeFileSync(SEED_FILE, buildSeedSql(rows));
console.log(
  `supabase/seed.sql écrit : ${rows.categories.length} catégories, ${rows.products.length} produits, ${rows.variants.length} variantes.`,
);
