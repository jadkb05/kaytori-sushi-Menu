/**
 * Plats Thaï : passage de l'ordre automatique (plats_thai_sorted) à l'ordre manuel (list)
 * par la migration 20261012000000 / production 05 (aperçu) et 06 (application).
 * L'état « avant migration » est celui de la production : seed d'origine (Chicken Katsu 179,
 * Chop Suey 177, Pavé de Saumon 178) et display_mode = 'plats_thai_sorted'.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categorySlots, loadCatalogEdit, buildSaveRequest } from "../src/admin/lib/productSave";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { menuCategoryDisplayMode, rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { groupItemsForMenuTab } from "../src/data/menuTabSections";
import type { YumloMenuItem } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const MIGRATION = readFileSync(new URL("../supabase/migrations/20261012000000_plats_thai_manual_order.sql", import.meta.url), "utf8");
const PREVIEW = readFileSync(new URL("../supabase/production/05_plats_thai_preview_readonly.sql", import.meta.url), "utf8");
const APPLY = readFileSync(new URL("../supabase/production/06_plats_thai_manual_order.sql", import.meta.url), "utf8");
const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const RED_CURRY = "36987b1e67";
/** Ordre affiché aujourd'hui en production (menu public, tri automatique). */
const VISIBLE_ORDER = [
  "Boeuf Bulgogi", "Red Curry Thaï", "Ananas Aigre Doux", "Corean Chicken", "Saté", "Basilic Thaï",
  "Champignon & Bambou", "Chicken Katsu", "Chop Suey", "Pavé de Saumon", "Teppanyaki",
];

let db: PGlite;
let admin: SupabaseClient;

/** Remet la base dans l'état de la production actuelle (avant migration). */
async function productionState() {
  await runSeed(db);
  // Retire les plats ajoutés par un test (le seed ne supprime rien).
  await db.exec(`delete from public.products where category_id = 'plats-thai' and id not in (select id from public.products where sort_order between 170 and 180);
                 update public.products set sort_order = 179 where id = '18b0c7ab53';
                 update public.products set sort_order = 177 where id = '9e1d2c99ca';
                 update public.products set sort_order = 178 where id = '55088e9b04';
                 update public.categories set display_mode = 'plats_thai_sorted' where id = 'plats-thai';
                 delete from public.audit_log;`);
}
const rows = () => readMenuRows(db);
/** Plats Thaï tels qu'affichés par le menu public (même code que MenuPage). */
function publicThai(r: MenuRows): string[] {
  const menu = rowsToMenu(r);
  const items = menu.items.filter((it) => it.category === "Plats Thaï");
  return groupItemsForMenuTab("Plats Thaï", items, menuCategoryDisplayMode(menu, "Plats Thaï")).flatMap((g) => g.items.map((it) => it.name));
}
const thaiSortOrders = (r: MenuRows) =>
  Object.fromEntries(r.products.filter((p) => p.category_id === "plats-thai").map((p) => [p.name, p.sort_order]));
const byId = <T extends { id: string }>(list: T[]) => [...list].sort((x, y) => (x.id < y.id ? -1 : 1));
const outsideThai = (r: MenuRows) =>
  JSON.stringify({
    p: r.products.filter((p) => p.category_id !== "plats-thai"),
    thaiData: byId(r.products.filter((p) => p.category_id === "plats-thai")).map(({ sort_order: _s, ...rest }) => rest),
    v: r.variants,
    c: r.categories.map(({ display_mode: _d, ...c }) => c),
    modes: r.categories.filter((c) => c.id !== "plats-thai").map((c) => c.display_mode),
  });
const audits = async () =>
  (await db.query<{ action: string; entity_id: string; payload: Record<string, any> }>("select action, entity_id, payload from public.audit_log")).rows;

beforeAll(async () => {
  db = await createMigratedDb();
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'); insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  admin = createPgliteSupabase(db, ADMIN);
});
beforeEach(productionState);
afterAll(() => db.close());

describe("migration : ordre affiché conservé exactement", () => {
  it("avant / après : même ordre public, display_mode list, sort_order réattribués (mêmes valeurs)", async () => {
    const before = await rows();
    expect(publicThai(before)).toEqual(VISIBLE_ORDER);
    await db.exec(MIGRATION);
    const after = await rows();
    expect(publicThai(after)).toEqual(VISIBLE_ORDER);
    expect(after.categories.find((c) => c.id === "plats-thai")!.display_mode).toBe("list");
    expect(thaiSortOrders(after)).toMatchObject({ "Chicken Katsu": 177, "Chop Suey": 178, "Pavé de Saumon": 179 });
    expect(Object.values(thaiSortOrders(after)).sort()).toEqual(Object.values(thaiSortOrders(before)).sort());
    // Rien d'autre ne bouge : IDs, prix, variantes, images, autres catégories et leurs modes.
    expect(outsideThai(after)).toBe(outsideThai(before));
    // Résultat identique au seed (menu statique aligné).
    await runSeed(db);
    expect(JSON.stringify(await rows())).toBe(JSON.stringify(after));
  });

  it("journal : une entrée category.ordering (avant / après) ; relancée : aucun effet", async () => {
    await db.exec(MIGRATION);
    const [log] = await audits();
    expect(log).toMatchObject({ action: "category.ordering", entity_id: "plats-thai" });
    expect(log.payload.display_mode).toEqual({ before: "plats_thai_sorted", after: "list" });
    expect(log.payload.after.map((p: { name: string }) => p.name)).toEqual(VISIBLE_ORDER);
    const once = JSON.stringify(await rows());
    await db.exec(MIGRATION);
    expect(JSON.stringify(await rows())).toBe(once);
    expect(await audits()).toHaveLength(1);
  });

  it("aperçu 05 (lecture seule) = résultat de la migration ; 06 contient la migration à l'identique", async () => {
    const before = JSON.stringify(await rows());
    const preview = (await db.query<{ id: string; nom: string; sort_order_apres: number; controle: string }>(PREVIEW)).rows;
    expect(JSON.stringify(await rows())).toBe(before);
    expect(preview.map((r) => r.nom)).toEqual(VISIBLE_ORDER);
    expect(preview.every((r) => r.controle === "ok")).toBe(true);
    expect(APPLY).toContain(MIGRATION.trimEnd());
    const res = await db.exec(APPLY);
    const applied = res.at(-1)!.rows as Array<{ id: string; sort_order: number; display_mode: string }>;
    expect(applied.map((r) => [r.id, r.sort_order])).toEqual(preview.map((r) => [r.id, r.sort_order_apres]));
    expect(applied.every((r) => r.display_mode === "list")).toBe(true);
  });

  it("produit masqué et valeurs sort_order en double : ordre conservé, renumérotation sans doublon", async () => {
    await db.exec(`update public.products set is_active = false where id = '9e1d2c99ca';
                   update public.products set sort_order = 171 where id = '9eba998f82';`);
    const visibleBefore = publicThai(await rows());
    await db.exec(MIGRATION);
    const after = await rows();
    expect(publicThai(after)).toEqual(visibleBefore);
    const values = after.products.filter((p) => p.category_id === "plats-thai").map((p) => p.sort_order).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 11 }, (_, i) => 170 + i));
  });

  it("base vide (nouveau projet) : sans effet", async () => {
    await db.exec(`delete from public.product_variants; delete from public.products; delete from public.categories;`);
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
    expect(await audits()).toHaveLength(0);
  });
});

describe("migration : règle SQL identique au tri TypeScript", () => {
  /** Noms réels du menu + cas limites (sections, casse, accents, ponctuation, chiffres, espaces). */
  const NAMES = [
    ...new Set(getStaticMenu().items.map((it) => it.name)),
    "red curry poulet", "RED CURRY", "Red  Curry Crevette", "Redcurry", "KOREAN BBQ", "corean bowl", "SATE boeuf", "SATÉ crevettes",
    "Bulgogi épicé", "Ananas & crevettes", "Œufs brouillés", "Éclair", "eclairs", "Zébu", "zz top", "10 pcs", "2 pcs",
    "A-B", "A B", "A,B", "A.B", "A'B", "A’B", "A(B)", "A/B", "A&B", "Ab", "Àbc", "Crème brûlée", "Creme Caramel",
  ];

  it("les mêmes noms triés par le SQL et par groupItemsForMenuTab (localeCompare « fr »)", async () => {
    // Noms de même clé primaire (accents/casse seuls) exclus : la migration s'arrête dans ce cas.
    const key = (n: string) => n.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/œ/gi, "oe").toLowerCase();
    const unique = NAMES.filter((n, i) => NAMES.findIndex((m) => key(m) === key(n)) === i);
    expect(unique.length).toBeGreaterThan(200);
    await db.exec("delete from public.product_variants where product_id in (select id from public.products where category_id = 'plats-thai'); delete from public.products where category_id = 'plats-thai';");
    // Ordre d'insertion mélangé (sort_order) pour ne pas favoriser l'ordre d'origine.
    const shuffled = unique.map((name, i) => ({ name, sort: (i * 7919) % unique.length }));
    for (const [i, it] of shuffled.entries()) {
      await db.query("insert into public.products (id, category_id, name, price, sort_order) values ($1, 'plats-thai', $2, 10, $3)", [`t${i}`, it.name, 1000 + it.sort]);
    }
    const items = shuffled
      .map((it, i) => ({ id: `t${i}`, name: it.name, sort: it.sort }))
      .sort((a, b) => a.sort - b.sort)
      .map((it) => ({ id: it.id, name: it.name, category: "Plats Thaï" }) as YumloMenuItem);
    const expected = groupItemsForMenuTab("Plats Thaï", items, "plats_thai_sorted").flatMap((g) => g.items.map((it) => it.id));
    await db.exec(MIGRATION);
    const after = (await rows()).products.filter((p) => p.category_id === "plats-thai").sort((a, b) => a.sort_order - b.sort_order);
    expect(after.map((p) => p.id)).toEqual(expected);
  });

  it("noms à départager par accent ou casse (« Saté » / « Sate ») : ARRÊT, rien modifié", async () => {
    await db.exec("update public.products set name = 'Sate' where id = '9443eb67b5'; insert into public.products (id, category_id, name, price, sort_order) values ('x1', 'plats-thai', 'Saté', 10, 181);");
    const before = JSON.stringify(await rows());
    await expect(db.exec(`begin; ${MIGRATION} commit;`)).rejects.toThrow(/ARRÊT — rien n'a été modifié : noms à départager/);
    await db.exec("rollback");
    expect(JSON.stringify(await rows())).toBe(before);
  });

  it("caractère dont l'ordre n'est pas garanti (emoji, autre alphabet) : ARRÊT, rien modifié", async () => {
    await db.exec("update public.products set name = 'Teppanyaki 🔥' where id = '1568a2e365';");
    const before = JSON.stringify(await rows());
    await expect(db.exec(`begin; ${MIGRATION} commit;`)).rejects.toThrow(/ordre alphabétique non garanti pour : Teppanyaki 🔥/);
    await db.exec("rollback");
    expect(JSON.stringify(await rows())).toBe(before);
    const preview = (await db.query<{ nom: string; controle: string }>(PREVIEW)).rows;
    expect(preview.find((r) => r.nom === "Teppanyaki 🔥")!.controle).toMatch(/^ARRÊT/);
  });
});

describe("avant migration (production actuelle) : Plats Thaï reste automatique", () => {
  it("admin : position non modifiable ; menu public : tri automatique", async () => {
    const r = await rows();
    expect(categorySlots(r, "plats-thai", RED_CURRY)?.automatic).toBe(true);
    expect(publicThai(r)).toEqual(VISIBLE_ORDER);
  });
});

describe("après migration : position manuelle de Red Curry Thaï", () => {
  beforeEach(() => db.exec(MIGRATION));

  it("admin : position modifiable (1…11), envoyée par le mécanisme d'enregistrement existant", async () => {
    const r = await rows();
    expect(categorySlots(r, "plats-thai", RED_CURRY)).toMatchObject({ max: 11, automatic: false });
    const edit = loadCatalogEdit(r, RED_CURRY)!;
    expect(edit.currentPosition).toBe(2);
    expect(buildSaveRequest(edit, { ...edit.form, position: "5" })).toEqual({ p_product_id: RED_CURRY, p_product: {}, p_variants: null, p_position: 5 });
  });

  it("déplacée en 5e : persistée après rechargement, les autres décalés, menu public à jour", async () => {
    const before = await rows();
    const { error } = await admin.rpc("admin_save_product", { p_product_id: RED_CURRY, p_product: {}, p_variants: null, p_position: 5 });
    expect(error).toBeNull();
    const after = await rows(); // rechargement depuis la base
    expect(loadCatalogEdit(after, RED_CURRY)!.currentPosition).toBe(5);
    const expected = ["Boeuf Bulgogi", "Ananas Aigre Doux", "Corean Chicken", "Saté", "Red Curry Thaï", "Basilic Thaï",
      "Champignon & Bambou", "Chicken Katsu", "Chop Suey", "Pavé de Saumon", "Teppanyaki"];
    expect(publicThai(after)).toEqual(expected);
    // Mêmes valeurs redistribuées, sans doublon ; Red Curry garde ID, prix, variantes (et leur ordre).
    expect(Object.values(thaiSortOrders(after)).sort()).toEqual(Object.values(thaiSortOrders(before)).sort());
    const strip = (r: MenuRows) => ({ p: r.products.find((p) => p.id === RED_CURRY), v: r.variants.filter((v) => v.product_id === RED_CURRY) });
    expect({ ...strip(after).p, sort_order: 0 }).toEqual({ ...strip(before).p, sort_order: 0 });
    expect(strip(after).v).toEqual(strip(before).v);
    expect(JSON.stringify(after.products.filter((p) => p.category_id !== "plats-thai"))).toBe(
      JSON.stringify(before.products.filter((p) => p.category_id !== "plats-thai")),
    );
    expect(after.categories).toEqual(before.categories);
    const [log] = (await audits()).filter((a) => a.action === "product.update");
    expect(log.entity_id).toBe(RED_CURRY);
  });
});

describe("menu statique (repli) et Assortiments", () => {
  it("statique : Plats Thaï en ordre manuel, même ordre que la production", () => {
    const menu = getStaticMenu();
    expect(menuCategoryDisplayMode(menu, "Plats Thaï")).toBe("list");
    const items = menu.items.filter((it) => it.category === "Plats Thaï");
    expect(groupItemsForMenuTab("Plats Thaï", items, "list").flatMap((g) => g.items.map((it) => it.name))).toEqual(VISIBLE_ORDER);
    // Même ordre qu'avec l'ancien tri automatique.
    expect(groupItemsForMenuTab("Plats Thaï", items, "plats_thai_sorted").flatMap((g) => g.items.map((it) => it.name))).toEqual(VISIBLE_ORDER);
  });

  it("Assortiments inchangé : mode automatique, sous-sections « pcs », ordre de référence (avant et après migration)", async () => {
    const check = (r: MenuRows) => {
      expect(r.categories.find((c) => c.id === "assortiments")!.display_mode).toBe("assortiments_by_pcs");
      const model = toParityModel(rowsToMenu(r));
      const pick = (m: MenuParityModel) => m.products.filter((p) => p.category === "Assortiments");
      expect(pick(model)).toEqual(pick(reference));
      expect(new Set(pick(model).map((p) => p.section))).toEqual(
        new Set(["Assortiments 16 pcs", "Assortiments 20 pcs", "Assortiments 24 pcs", "Assortiments 30 pcs", "Assortiments 36 pcs", "Assortiments 48 pcs", "Assortiments 60 pcs"]),
      );
    };
    check(await rows());
    await db.exec(MIGRATION);
    check(await rows());
    // Et le menu public complet = référence figée (parité).
    expect(compareParityModels(reference, toParityModel(rowsToMenu(await rows())))).toEqual([]);
  });
});
