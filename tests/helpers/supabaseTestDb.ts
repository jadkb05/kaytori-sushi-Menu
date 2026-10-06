/**
 * Base PostgreSQL en mémoire (PGlite) qui imite le strict nécessaire de Supabase
 * (rôles anon/authenticated, auth.uid(), auth.users, storage.buckets/objects)
 * pour appliquer les VRAIES migrations et le VRAI seed du dossier supabase/.
 */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { CategoryRow, MenuRows, ProductRow, VariantRow } from "../../src/data/menuRows";

const SUPABASE_DIR = new URL("../../supabase/", import.meta.url);

/** Équivalent minimal de ce que Supabase fournit avant nos migrations. */
const SUPABASE_PLATFORM_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;

  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

export function migrationFiles(): string[] {
  return readdirSync(new URL("migrations/", SUPABASE_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export function readSeedSql(): string {
  return readFileSync(new URL("seed.sql", SUPABASE_DIR), "utf8");
}

/** Nouvelle base : plateforme simulée + toutes les migrations, sans seed. */
export async function createMigratedDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_PLATFORM_STUB);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(new URL(`migrations/${file}`, SUPABASE_DIR), "utf8"));
  }
  return db;
}

export async function runSeed(db: PGlite): Promise<void> {
  await db.exec(readSeedSql());
}

/** Lit les 3 tables du menu (avec les droits du rôle courant). */
export async function readMenuRows(db: PGlite): Promise<MenuRows> {
  const categories = await db.query<CategoryRow>(
    "select id, name, sort_order, is_active, display_mode from public.categories order by sort_order",
  );
  const products = await db.query<ProductRow>(
    "select id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active from public.products order by sort_order",
  );
  const variants = await db.query<VariantRow>(
    "select product_id, id, label, price, sort_order, is_active from public.product_variants order by product_id, sort_order",
  );
  return { categories: categories.rows, products: products.rows, variants: variants.rows };
}

/** Agit comme un visiteur anonyme, un utilisateur connecté, ou le propriétaire (postgres). */
export async function actAs(db: PGlite, who: "anon" | { userId: string } | "owner"): Promise<void> {
  if (who === "owner") {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  } else if (who === "anon") {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  } else {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who.userId}', false);`);
  }
}
