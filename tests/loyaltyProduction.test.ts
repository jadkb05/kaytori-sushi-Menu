/**
 * Scripts PRODUCTION de la fidélité (supabase/production/13, 14, 15, 98) rejoués sur un projet
 * Supabase simulé où le menu est déjà en place (01_schema.sql + 02_catalog.sql) :
 * installation gardée, vérification en lecture seule, déclaration du personnel, retour arrière.
 * Aucun accès réseau : PostgreSQL en mémoire. Ne prouve pas l'état de la base distante.
 */
import type { PGlite } from "@electric-sql/pglite";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { actAs, createPlatformDb, readMenuRows } from "./helpers/supabaseTestDb";

const file = (name: string) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const MIGRATION = file("migrations/20261026120000_loyalty.sql");
const SCHEMA = file("production/01_schema.sql");
const CATALOG = file("production/02_catalog.sql");
const INSTALL = file("production/13_loyalty.sql");
const VERIFY = file("production/14_loyalty_verify_readonly.sql");
const GRANT = file("production/15_loyalty_grant_staff.template.sql");
const ROLLBACK = file("production/98_loyalty_rollback.sql");
const MENU_ROLLBACK = file("production/99_rollback.sql");
const confirmed = (sql: string, ...settings: string[]) =>
  settings.reduce((s, name) => s.replace(`-- select set_config('${name}'`, `select set_config('${name}'`), sql);

const ADMIN = "11111111-1111-1111-1111-111111111111";

let db: PGlite | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

/** Projet « production » simulé : droits par défaut de Supabase, comptes avec e-mail, menu installé. */
async function productionWithMenu(): Promise<PGlite> {
  const d = await createPlatformDb();
  await d.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    alter table auth.users add column email text;
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@kaytori.test'), ('22222222-2222-2222-2222-222222222222', 'Manager@Kaytori.test');
  `);
  await d.exec(SCHEMA);
  await d.exec(CATALOG);
  await d.exec(`insert into public.admin_users (user_id) values ('${ADMIN}')`);
  return d;
}

/** Objets de la base (hors données) : schémas, tables, fonctions, politiques. */
async function inventory(d: PGlite) {
  await actAs(d, "owner");
  const q = async (sql: string) => (await d.query<{ x: string }>(sql)).rows.map((r) => r.x);
  return {
    schemas: await q("select nspname as x from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by 1"),
    tables: await q("select n.nspname || '.' || relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace where relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema') order by 1"),
    functions: await q("select n.nspname || '.' || proname as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema') order by 1"),
    policies: await q("select policyname as x from pg_policies order by 1"),
  };
}

const verify = async (d: PGlite) => (await d.query<{ controle: string; ok: boolean; detail: string | null }>(VERIFY)).rows;

async function addCard(d: PGlite) {
  const admin = createPgliteSupabase(d, { id: ADMIN, email: "admin@kaytori.test" });
  await admin.rpc("loyalty_update_settings", { p_changes: { is_active: true } });
  const anon = createPgliteSupabase(d, null);
  const res = await anon.rpc("loyalty_register", {
    p_full_name: "Salma Bennani", p_phone: "0612345678", p_token: randomBytes(32).toString("base64url"), p_request_id: randomUUID(),
  });
  expect(res.error).toBeNull();
  await actAs(d, "owner");
}

describe("13_loyalty.sql", () => {
  it("contient la migration à l'identique, dans une transaction, avec une garde", () => {
    expect(INSTALL).toContain(MIGRATION.trimEnd());
    expect(INSTALL).toMatch(/^begin;$/m);
    expect(INSTALL.trimEnd().endsWith("commit;")).toBe(true);
    expect(INSTALL.indexOf("$guard$")).toBeLessThan(INSTALL.indexOf(MIGRATION.trimEnd()));
  });

  it("menu en place → installation, vérification 14 entièrement OK, menu inchangé, programme fermé", async () => {
    db = await productionWithMenu();
    const menuBefore = JSON.stringify(await readMenuRows(db));
    await db.exec(INSTALL);
    const checks = await verify(db);
    expect(checks.filter((c) => !c.ok), JSON.stringify(checks)).toEqual([]);
    expect(checks).toHaveLength(11);
    expect(checks.find((c) => c.controle.startsWith("réglages"))?.detail).toBe("programme fermé, 1 point = 20 centimes");
    expect(JSON.stringify(await readMenuRows(db))).toBe(menuBefore);
  });

  it("relancé : refusé, rien modifié (données de fidélité intactes)", async () => {
    db = await productionWithMenu();
    await db.exec(INSTALL);
    await addCard(db);
    const before = JSON.stringify([await inventory(db), (await db.query("select * from loyalty.events order by seq")).rows]);
    await expect(db.exec(INSTALL)).rejects.toThrow(/ARRÊT — rien n'a été modifié : le schéma loyalty existe déjà/);
    await db.exec("rollback");
    expect(JSON.stringify([await inventory(db), (await db.query("select * from loyalty.events order by seq")).rows])).toBe(before);
  });

  it("sans le menu (is_admin absente) : refusé, rien créé", async () => {
    db = await createPlatformDb();
    const before = await inventory(db);
    await expect(db.exec(INSTALL)).rejects.toThrow(/public\.is_admin\(\) absente/);
    await db.exec("rollback");
    expect(await inventory(db)).toEqual(before);
  });
});

describe("14_loyalty_verify_readonly.sql", () => {
  it("n'écrit rien et détecte un droit accordé par erreur", async () => {
    db = await productionWithMenu();
    await db.exec(INSTALL);
    await addCard(db);
    const before = JSON.stringify([await inventory(db), (await db.query("select * from loyalty.cards")).rows]);
    await verify(db);
    expect(JSON.stringify([await inventory(db), (await db.query("select * from loyalty.cards")).rows])).toBe(before);

    await db.exec("grant usage on schema loyalty to anon; grant execute on function public.loyalty_credit_ticket(uuid, integer, text, uuid, boolean) to anon;");
    const failed = (await verify(db)).filter((c) => !c.ok).map((c) => c.controle);
    expect(failed).toEqual([
      "aucun accès direct au schéma loyalty pour anon / authenticated",
      "anon : exécution limitée aux fonctions publiques et QR",
    ]);
  });
});

describe("15_loyalty_grant_staff.template.sql", () => {
  const filled = (email: string, role: string) => GRANT.replaceAll("<EMAIL_MANAGER>", email).replace("'<ROLE>'", `'${role}'`);

  it("modèle tel quel : refusé (rôle non renseigné)", async () => {
    db = await productionWithMenu();
    await db.exec(INSTALL);
    await expect(db.exec(GRANT)).rejects.toThrow(/rôle « <ROLE> » invalide/);
    await db.exec("rollback");
  });

  it("e-mail (casse indifférente) + rôle : déclaré ; relancé avec un autre rôle : mis à jour ; e-mail inconnu : refusé", async () => {
    db = await productionWithMenu();
    await db.exec(INSTALL);
    await db.exec(filled("manager@kaytori.test", "manager"));
    expect((await db.query("select role from loyalty.staff")).rows).toEqual([{ role: "manager" }]);
    await db.exec(filled("manager@kaytori.test", "owner"));
    expect((await db.query("select role from loyalty.staff")).rows).toEqual([{ role: "owner" }]);
    await expect(db.exec(filled("absent@kaytori.test", "manager"))).rejects.toThrow(/0 compte\(s\) trouvé\(s\)/);
    await db.exec("rollback");
  });
});

describe("98_loyalty_rollback.sql", () => {
  it("sans confirmation : ne fait rien", async () => {
    db = await productionWithMenu();
    await db.exec(INSTALL);
    const before = await inventory(db);
    await expect(db.exec(ROLLBACK)).rejects.toThrow(/confirmation absente/);
    await db.exec("rollback");
    expect(await inventory(db)).toEqual(before);
  });

  it("confirmé, aucune carte : retour exact à l'état d'avant 13 (menu intact) ; réinstallation possible", async () => {
    db = await productionWithMenu();
    const before = await inventory(db);
    const menuBefore = JSON.stringify(await readMenuRows(db));
    await db.exec(INSTALL);
    await db.exec(confirmed(ROLLBACK, "kaytori.confirm_loyalty_rollback"));
    expect(await inventory(db)).toEqual(before);
    expect(JSON.stringify(await readMenuRows(db))).toBe(menuBefore);
    await db.exec(INSTALL);
    expect((await verify(db)).every((c) => c.ok)).toBe(true);
  });

  it("confirmé mais des cartes existent : refusé, données intactes ; avec la seconde confirmation : supprimées", async () => {
    db = await productionWithMenu();
    const before = await inventory(db);
    await db.exec(INSTALL);
    await addCard(db);
    await expect(db.exec(confirmed(ROLLBACK, "kaytori.confirm_loyalty_rollback"))).rejects.toThrow(/1 carte\(s\) et 2 événement\(s\) existent/);
    await db.exec("rollback");
    expect((await db.query("select count(*)::int as n from loyalty.cards")).rows).toEqual([{ n: 1 }]);
    await db.exec(confirmed(ROLLBACK, "kaytori.confirm_loyalty_rollback", "kaytori.confirm_loyalty_data_loss"));
    expect(await inventory(db)).toEqual(before);
  });

  it("98 puis 99 : le menu se retire ensuite comme avant (projet vide)", async () => {
    db = await createPlatformDb();
    await db.exec("alter table auth.users add column email text;");
    const empty = await inventory(db);
    await db.exec(SCHEMA);
    await db.exec(CATALOG);
    await db.exec(INSTALL);
    await db.exec(confirmed(ROLLBACK, "kaytori.confirm_loyalty_rollback"));
    await db.exec(confirmed(MENU_ROLLBACK, "kaytori.confirm_rollback"));
    expect(await inventory(db)).toEqual(empty);
  });
});
