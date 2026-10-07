/**
 * Scripts PRODUCTION (supabase/production/) rejoués sur un projet Supabase vide simulé :
 * audit en lecture seule, schéma (garde anti-écrasement), catalogue (tables vides uniquement),
 * vérification, parité exacte avec le menu statique, retour arrière, réapplication.
 * Aucun accès réseau : PostgreSQL en mémoire.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu } from "../src/data/menuRows";
import { createPlatformDb, migrationFiles, readMenuRows, readSeedSql } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const file = (name: string) => readFileSync(new URL(`../supabase/production/${name}`, import.meta.url), "utf8");
const SCHEMA = file("01_schema.sql");
const CATALOG = file("02_catalog.sql");
const VERIFY = file("03_verify_readonly.sql");
const ROLLBACK = file("99_rollback.sql");
const CONFIRMED_ROLLBACK = ROLLBACK.replace("-- select set_config('kaytori.confirm_rollback'", "select set_config('kaytori.confirm_rollback'");
const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

let db: PGlite | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

/** Objets du menu CMS présents dans la base (tables, fonctions, politiques Storage, bucket). */
async function inventory(d: PGlite) {
  const q = async (sql: string) => (await d.query<{ x: string }>(sql)).rows.map((r) => r.x);
  return {
    tables: await q("select relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' order by 1"),
    functions: await q("select proname as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1"),
    policies: await q("select policyname as x from pg_policies where schemaname in ('public', 'storage') order by 1"),
    buckets: await q("select id as x from storage.buckets order by 1"),
    objects: await q("select bucket_id || '/' || name as x from storage.objects order by 1"),
  };
}
const verify = async (d: PGlite) => (await d.query<{ controle: string; ok: boolean; detail: string | null }>(VERIFY)).rows;

describe("fichiers générés à jour", () => {
  it("01_schema.sql contient chaque migration à l'identique, dans l'ordre", () => {
    let from = 0;
    for (const f of migrationFiles()) {
      const sql = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8").trimEnd();
      const at = SCHEMA.indexOf(sql, from);
      expect(at, f).toBeGreaterThan(from);
      from = at + sql.length;
    }
    expect(SCHEMA.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("02_catalog.sql contient les données du seed à l'identique", () => {
    const seed = readSeedSql();
    const data = seed.slice(seed.indexOf("insert into public.categories"), seed.lastIndexOf("commit;")).trimEnd();
    expect(CATALOG).toContain(data);
  });
});

describe("projet vide → schéma → catalogue → vérification", () => {
  it("parité exacte avec le menu statique, tous les contrôles OK", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    const checks = await verify(db);
    expect(checks.filter((c) => !c.ok), JSON.stringify(checks)).toEqual([]);
    expect(checks).toHaveLength(13);
    expect(compareParityModels(reference, toParityModel(rowsToMenu(await readMenuRows(db))))).toEqual([]);
  });

  it("audit en lecture seule : n'écrit rien", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec(`alter table auth.users add column email_confirmed_at timestamptz, add column is_anonymous boolean,
      add column raw_app_meta_data jsonb, add column last_sign_in_at timestamptz, add column created_at timestamptz;
      alter table storage.buckets add column created_at timestamptz; alter table storage.objects add column metadata jsonb;`);
    const before = JSON.stringify([await inventory(db), await readMenuRows(db)]);
    const res = await db.query<{ audit: string }>(file("00_audit_readonly.sql"));
    const audit = JSON.parse(res.rows[0].audit);
    expect(audit.target_tables_present).toEqual({ categories: true, products: true, product_variants: true, admin_users: true, audit_log: true });
    expect(audit.storage_buckets[0]).toMatchObject({ id: "menu-images", file_size_limit: 5242880, objects: 0 });
    expect(JSON.stringify([await inventory(db), await readMenuRows(db)])).toBe(before);
  });
});

describe("aucun écrasement", () => {
  it("01 relancé : refusé, rien modifié", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec("update public.products set price = 1 where id = (select id from public.products order by id limit 1)");
    const before = JSON.stringify([await inventory(db), await readMenuRows(db)]);
    await expect(db.exec(SCHEMA)).rejects.toThrow(/ARRÊT — rien n'a été modifié/);
    await db.exec("rollback");
    expect(JSON.stringify([await inventory(db), await readMenuRows(db)])).toBe(before);
  });

  it("02 sur un catalogue non vide (ex. modifié depuis l'admin) : refusé, rien modifié", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec("update public.categories set name = 'Salades (modifié)' where id = 'salades'");
    const before = JSON.stringify(await readMenuRows(db));
    await expect(db.exec(CATALOG)).rejects.toThrow(/le catalogue n'est pas vide \(31 catégories, 214 produits, 67 variantes\)/i);
    await db.exec("rollback");
    expect(JSON.stringify(await readMenuRows(db))).toBe(before);
  });

  it("projet avec un bucket menu-images existant (anciennes images) : 01 refusé, images et bucket intacts", async () => {
    db = await createPlatformDb();
    await db.exec(`insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', false);
                   insert into storage.objects (bucket_id, name) values ('menu-images', 'ancienne/photo.jpg');`);
    const before = await inventory(db);
    await expect(db.exec(SCHEMA)).rejects.toThrow(/bucket menu-images/);
    await db.exec("rollback");
    expect(await inventory(db)).toEqual(before);
  });

  it("projet avec une table « products » d'un autre usage : 01 refusé, table intacte", async () => {
    db = await createPlatformDb();
    await db.exec("create table public.products (id int primary key, label text); insert into public.products values (1, 'existant');");
    await expect(db.exec(SCHEMA)).rejects.toThrow(/table public\.products/);
    await db.exec("rollback");
    expect((await db.query("select * from public.products")).rows).toEqual([{ id: 1, label: "existant" }]);
  });

  it("échec en cours de catalogue : tout est annulé (aucune ligne partielle)", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    const broken = CATALOG.replace("insert into public.product_variants", "insert into public.product_variants_inexistante");
    await expect(db.exec(broken)).rejects.toThrow();
    await db.exec("rollback");
    expect((await db.query("select count(*)::int as n from public.categories")).rows).toEqual([{ n: 0 }]);
  });
});

describe("retour arrière (99_rollback.sql)", () => {
  it("sans confirmation : ne fait rien", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    const before = await inventory(db);
    await expect(db.exec(ROLLBACK)).rejects.toThrow(/confirmation absente/);
    await db.exec("rollback");
    expect(await inventory(db)).toEqual(before);
  });

  it("confirmé, bucket vide : retour exact au projet vide ; réapplication possible", async () => {
    db = await createPlatformDb();
    const empty = await inventory(db);
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec(CONFIRMED_ROLLBACK);
    expect(await inventory(db)).toEqual(empty);
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    expect((await verify(db)).every((c) => c.ok)).toBe(true);
  });

  it("confirmé, bucket avec des photos : base retirée, bucket, politiques et fichiers conservés", async () => {
    db = await createPlatformDb();
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec("insert into storage.objects (bucket_id, name) values ('menu-images', 'products/abc/photo.webp')");
    await db.exec(CONFIRMED_ROLLBACK);
    const inv = await inventory(db);
    expect(inv.tables).toEqual([]);
    expect(inv.buckets).toEqual(["menu-images"]);
    expect(inv.objects).toEqual(["menu-images/products/abc/photo.webp"]);
    expect(inv.policies).toHaveLength(4);
    expect(inv.functions).toEqual(["is_admin"]);
  });
});
