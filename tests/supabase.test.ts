/**
 * Phase 1 CMS : schéma Supabase, seed et parité, testés sur un vrai PostgreSQL en mémoire (PGlite)
 * avec les fichiers réels de supabase/ (migrations + seed.sql).
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { categorySlug, menuToRows, rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { ACTIVE_MENU_SOURCE, getMenu, getStaticMenu } from "../src/data/menuSource";
import { supabaseMenuSource } from "../src/data/supabaseMenuSource";
import { YUMLO_CATEGORIES, YUMLO_MENU } from "../src/data/yumloMenu";
import { dishThumbs } from "../src/menu/menuDisplay";
import { buildSeedSql } from "../scripts/supabaseSeed";
import { actAs, createMigratedDb, readMenuRows, readSeedSql, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

const staticMenu = getStaticMenu();
const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

/** Contenu comparable des tables (sans les horodatages). */
async function tableDump(db: PGlite): Promise<string> {
  return JSON.stringify(await readMenuRows(db));
}

describe("migration + seed (PostgreSQL en mémoire)", () => {
  let db: PGlite;
  let rows: MenuRows;

  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    rows = await readMenuRows(db);
  });
  afterAll(() => db.close());

  it("la migration s'applique et crée le bucket public menu-images", async () => {
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "admin_users",
      "audit_log",
      "categories",
      "product_variants",
      "products",
    ]);
    const bucket = await db.query("select id, public from storage.buckets where id = 'menu-images'");
    expect(bucket.rows).toEqual([{ id: "menu-images", public: true }]);
  });

  it("seed : 31 catégories, 214 produits, 67 variantes", () => {
    expect(rows.categories).toHaveLength(31);
    expect(rows.products).toHaveLength(214);
    expect(rows.variants).toHaveLength(67);
  });

  it("seed idempotent : relancé deux fois, aucune ligne ajoutée ni modifiée", async () => {
    const before = await tableDump(db);
    await runSeed(db);
    await runSeed(db);
    expect(await tableDump(db)).toBe(before);
  });

  it("IDs produits et IDs de variantes conservés exactement, dans le même ordre", () => {
    expect(rows.products.map((p) => p.id)).toEqual(YUMLO_MENU.map((it) => it.id));
    const staticVariants = YUMLO_MENU.flatMap((it) => (it.variants ?? []).map((v) => `${it.id}:${v.id}`));
    const dbVariants = [...rows.variants]
      .sort((a, b) => rows.products.findIndex((p) => p.id === a.product_id) - rows.products.findIndex((p) => p.id === b.product_id) || a.sort_order - b.sort_order)
      .map((v) => `${v.product_id}:${v.id}`);
    expect(dbVariants).toEqual(staticVariants);
  });

  it("catégories : ordre, noms, slugs et règles d'affichage particulières", () => {
    expect(rows.categories.map((c) => c.name)).toEqual([...YUMLO_CATEGORIES]);
    expect(rows.categories.map((c) => c.id)).toEqual(YUMLO_CATEGORIES.map(categorySlug));
    const modes = Object.fromEntries(rows.categories.map((c) => [c.name, c.display_mode]));
    expect(modes["Plats Thaï"]).toBe("list");
    expect(modes["Assortiments"]).toBe("assortiments_by_pcs");
    expect(Object.values(modes).filter((m) => m === "list")).toHaveLength(30);
  });

  it("prix, descriptions, images et vignettes conservés champ par champ", () => {
    const byId = new Map(rows.products.map((p) => [p.id, p]));
    for (const it of YUMLO_MENU) {
      const p = byId.get(it.id)!;
      expect(Number(p.price).toFixed(2), it.name).toBe(it.priceMAD);
      expect(p.description, it.name).toBe(it.description);
      expect(p.name).toBe(it.name);
      expect(p.currency).toBe(it.currency);
      expect(p.image_url).toBe(it.image);
      const thumbs = dishThumbs(it.image);
      expect(p.thumb_small_url).toBe(thumbs?.small ?? null);
      expect(p.thumb_large_url).toBe(thumbs?.large ?? null);
    }
  });

  it("base → menu : identique à yumloMenu.ts (mêmes objets, champ par champ)", () => {
    const menu = rowsToMenu(rows);
    expect(menu.categories).toEqual([...YUMLO_CATEGORIES]);
    expect(menu.items).toEqual([...YUMLO_MENU]);
  });

  it("parité STATIC === SUPABASE (modèle de parité, sous-sections comprises)", () => {
    const model = toParityModel(rowsToMenu(rows));
    expect(compareParityModels(toParityModel(staticMenu), model)).toEqual([]);
    expect(compareParityModels(reference, model)).toEqual([]);
    expect(model).toEqual(reference);
  });

  it("le seed versionné (supabase/seed.sql) est à jour avec yumloMenu.ts", () => {
    expect(readSeedSql()).toBe(buildSeedSql(menuToRows(staticMenu)));
  });
});

describe("RLS et Storage", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    await db.exec(`insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
                   insert into public.admin_users (user_id) values ('${ADMIN_ID}');`);
  });
  afterAll(() => db.close());

  it("public (anon) : lit tout le menu actif", async () => {
    await actAs(db, "anon");
    const menu = rowsToMenu(await readMenuRows(db));
    await actAs(db, "owner");
    expect(menu.items).toEqual([...YUMLO_MENU]);
  });

  it("public (anon) : ne voit ni produit, ni variante, ni catégorie désactivés", async () => {
    const withVariants = YUMLO_MENU.find((it) => it.variants?.length)!;
    await db.exec(`update public.products set is_active = false where id = '${withVariants.id}';
                   update public.categories set is_active = false where id = 'desserts';`);
    await actAs(db, "anon");
    const rows = await readMenuRows(db);
    await actAs(db, "owner");
    await db.exec(`update public.products set is_active = true where id = '${withVariants.id}';
                   update public.categories set is_active = true where id = 'desserts';`);
    expect(rows.products.some((p) => p.id === withVariants.id)).toBe(false);
    expect(rows.variants.some((v) => v.product_id === withVariants.id)).toBe(false);
    expect(rows.categories.some((c) => c.id === "desserts")).toBe(false);
    expect(rows.products.some((p) => p.category_id === "desserts")).toBe(false);
  });

  it("public (anon) : aucune écriture possible", async () => {
    await actAs(db, "anon");
    await expect(db.exec("update public.products set price = 1")).rejects.toThrow();
    await expect(
      db.exec("insert into public.categories (id, name, sort_order) values ('x', 'X', 99)"),
    ).rejects.toThrow();
    await expect(db.query("select * from public.admin_users")).rejects.toThrow();
    await expect(db.query("select * from public.audit_log")).rejects.toThrow();
    await expect(
      db.exec("insert into storage.objects (bucket_id, name) values ('menu-images', 'x.jpg')"),
    ).rejects.toThrow();
    await actAs(db, "owner");
  });

  it("utilisateur connecté non admin : ne peut rien modifier", async () => {
    await actAs(db, { userId: USER_ID });
    const res = await db.query("update public.products set price = 1 returning id");
    await expect(
      db.exec("insert into storage.objects (bucket_id, name) values ('menu-images', 'x.jpg')"),
    ).rejects.toThrow();
    await actAs(db, "owner");
    expect(res.rows).toHaveLength(0);
    const prices = await db.query<{ n: number }>("select count(*)::int as n from public.products where price = 1");
    expect(prices.rows[0].n).toBe(0);
  });

  it("admin : peut modifier le menu, journaliser et déposer une image", async () => {
    const id = YUMLO_MENU[0].id;
    await actAs(db, { userId: ADMIN_ID });
    const res = await db.query(`update public.products set description = 'test' where id = '${id}' returning id`);
    await db.exec(`insert into public.audit_log (user_id, action, entity_type, entity_id)
                   values ('${ADMIN_ID}', 'update', 'product', '${id}')`);
    await db.exec("insert into storage.objects (bucket_id, name) values ('menu-images', 'test.jpg')");
    await actAs(db, "owner");
    expect(res.rows).toHaveLength(1);
    // Retour à l'état du seed (la base de test reste fidèle au statique).
    await runSeed(db);
    const menu = rowsToMenu(await readMenuRows(db));
    expect(menu.items).toEqual([...YUMLO_MENU]);
  });
});

describe("script de vérification RLS (supabase/tests/rls_check.sql)", () => {
  it("tous les contrôles sont OK et la base reste à l'état du seed", async () => {
    const db = await createMigratedDb();
    await runSeed(db);
    const before = await tableDump(db);
    const sql = readFileSync(new URL("../supabase/tests/rls_check.sql", import.meta.url), "utf8");
    const out = await db.exec(sql);
    const results = out[out.length - 1].rows as { test: string; ok: boolean; detail: string }[];
    expect(results).toHaveLength(16);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    // Rollback interne : aucune trace des essais.
    expect(await tableDump(db)).toBe(before);
    const leftovers = await db.query<{ n: number }>(
      `select (select count(*) from public.admin_users)::int + (select count(*) from public.audit_log)::int
            + (select count(*) from storage.objects)::int + (select count(*) from auth.users)::int as n`,
    );
    expect(leftovers.rows[0].n).toBe(0);
    await db.close();
  });
});

describe("conversion des données et source", () => {
  it("prix renvoyés en nombre par l'API Supabase → format « 69.00 »", () => {
    const rows = menuToRows(staticMenu);
    const asApi: MenuRows = {
      categories: rows.categories,
      products: rows.products.map((p) => ({ ...p, price: Number(p.price) })),
      variants: rows.variants.map((v) => ({ ...v, price: Number(v.price) })),
    };
    expect(rowsToMenu(asApi).items).toEqual([...YUMLO_MENU]);
  });

  it("la source Supabase est préparée mais la source active reste STATIC", async () => {
    expect(supabaseMenuSource.id).toBe("supabase");
    expect(ACTIVE_MENU_SOURCE.id).toBe("static");
    expect((await getMenu()).items).toBe(YUMLO_MENU);
  });

  it("sans configuration, la source Supabase échoue proprement", async () => {
    // Configuration vide imposée pour ce test seulement (indépendant de .env.local).
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    try {
      await expect(supabaseMenuSource.load()).rejects.toThrow("Supabase non configuré");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
