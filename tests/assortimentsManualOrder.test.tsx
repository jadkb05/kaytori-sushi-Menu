/**
 * Assortiments : passage de l'ordre automatique (assortiments_by_pcs) à l'ordre manuel (list) par
 * supabase/production/16 (aperçu) et 17 (application, données uniquement). Ensuite : flèches ↑ / ↓
 * de l'admin (même RPC que les autres produits), persistance, menu public (sous-titres « pcs »
 * conservés dans l'ordre choisi) et photo. L'état « avant » est celui de la production (seed).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import { buildProductList } from "../src/admin/lib/menuAdmin";
import { moveTarget, runProductMove } from "../src/admin/lib/productOrder";
import { uploadProductPhoto } from "../src/admin/lib/productPhoto";
import { categorySlots, loadCatalogEdit, saveCatalogProduct } from "../src/admin/lib/productSave";
import { ProductsPage } from "../src/admin/pages/ProductsPage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { menuCategoryDisplayMode, menuCategoryPcsHeadings, rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { groupItemsForMenuTab } from "../src/data/menuTabSections";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import type { YumloMenuItem } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const PREVIEW = readFileSync(new URL("../supabase/production/16_assortiments_preview_readonly.sql", import.meta.url), "utf8");
const APPLY = readFileSync(new URL("../supabase/production/17_assortiments_manual_order.sql", import.meta.url), "utf8");
/** Le bloc DO seul (sans begin / commit / select final), pour les tests d'arrêt dans une transaction. */
const DO_BLOCK = APPLY.slice(APPLY.indexOf("do $assortiments$"), APPLY.indexOf("$assortiments$;") + "$assortiments$;".length);
const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const PRIME_BOX = "d99671dda4";
const FUNNY = "f7e59011ae";
/** Ordre affiché aujourd'hui sur le menu public (tri automatique par format puis nom). */
const VISIBLE_ORDER = [
  "California Box 16 pcs", "Crunchy Box 16 pcs", "Eby Lovers 16 pcs", "Funny 16 pcs", "Prime Box 16 pcs",
  "Summer 20 pcs",
  "Aromaki Lovers 24 pcs", "California Lovers 24 pcs", "Crunchy Lovers 24 pcs", "Deluxe 24 pcs",
  "Delice 30 pcs", "Enjoy Box 30 pcs", "Jocker 30 pcs",
  "Dream 36 pcs", "Extasy 40", "Gourmet 36 pcs",
  "Festival 48 pcs", "Fiesta 48 pcs", "Happy Box 44 pcs",
  "Carnaval 60 pcs", "Family Box 60 pcs",
];
const TITLES = ["Assortiments 16 pcs", "Assortiments 20 pcs", "Assortiments 24 pcs", "Assortiments 30 pcs", "Assortiments 36 pcs", "Assortiments 48 pcs", "Assortiments 60 pcs"];

let db: PGlite;
let admin: SupabaseClient;

async function productionState() {
  await runSeed(db);
  await db.exec(`delete from public.products where category_id = 'assortiments' and id not in (select id from public.products where sort_order between 181 and 201);
                 delete from public.audit_log;`);
}
const rows = () => readMenuRows(db);
/** Assortiments tels qu'affichés par le menu public (même appel que MenuPage). */
function publicGroups(r: MenuRows) {
  const menu = rowsToMenu(r);
  const items = menu.items.filter((it) => it.category === "Assortiments");
  return groupItemsForMenuTab("Assortiments", items, menuCategoryDisplayMode(menu, "Assortiments"), menuCategoryPcsHeadings(menu, "Assortiments"));
}
const publicNames = (r: MenuRows) => publicGroups(r).flatMap((g) => g.items.map((it) => it.name));
const assort = (r: MenuRows) => buildProductList(r).filter((p) => p.categoryId === "assortiments");
const outside = (r: MenuRows) =>
  JSON.stringify({
    p: r.products.filter((p) => p.category_id !== "assortiments"),
    data: [...r.products.filter((p) => p.category_id === "assortiments")].sort((a, b) => (a.id < b.id ? -1 : 1)).map(({ sort_order: _s, ...rest }) => rest),
    v: r.variants,
    c: r.categories.map(({ display_mode: _d, ...c }) => c),
    modes: r.categories.filter((c) => c.id !== "assortiments").map((c) => c.display_mode),
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

describe("avant le script (production actuelle)", () => {
  it("admin : « Ordre automatique », aucune flèche ; menu public trié par format", async () => {
    const r = await rows();
    expect(assort(r).every((p) => !p.manualOrder && moveTarget(p, "up") === null && moveTarget(p, "down") === null)).toBe(true);
    expect(categorySlots(r, "assortiments", PRIME_BOX)?.automatic).toBe(true);
    expect(publicNames(r)).toEqual(VISIBLE_ORDER);
    expect(publicGroups(r).map((g) => g.title)).toEqual(TITLES);
  });
});

describe("script 17 : ordre public conservé exactement", () => {
  it("avant / après : même menu public (ordre et sous-titres), display_mode list, mêmes valeurs sort_order", async () => {
    const before = await rows();
    const beforeSorts = before.products.filter((p) => p.category_id === "assortiments").map((p) => p.sort_order).sort();
    await db.exec(APPLY);
    const after = await rows();
    expect(after.categories.find((c) => c.id === "assortiments")!.display_mode).toBe("list");
    expect(publicNames(after)).toEqual(VISIBLE_ORDER);
    expect(publicGroups(after).map((g) => g.title)).toEqual(TITLES);
    expect(after.products.filter((p) => p.category_id === "assortiments").map((p) => p.sort_order).sort()).toEqual(beforeSorts);
    // Rien d'autre ne bouge : IDs, noms, prix, photos, variantes, autres catégories et leurs modes.
    expect(outside(after)).toBe(outside(before));
    // Menu public complet = référence figée (parité, sections comprises).
    expect(compareParityModels(reference, toParityModel(rowsToMenu(after)))).toEqual([]);
  });

  it("journal category.ordering (avant / après) ; relancé : aucun effet", async () => {
    await db.exec(APPLY);
    const [log] = await audits();
    expect(log).toMatchObject({ action: "category.ordering", entity_id: "assortiments" });
    expect(log.payload.display_mode).toEqual({ before: "assortiments_by_pcs", after: "list" });
    expect(log.payload.after.map((p: { name: string }) => p.name)).toEqual(VISIBLE_ORDER);
    const once = JSON.stringify(await rows());
    await db.exec(APPLY);
    expect(JSON.stringify(await rows())).toBe(once);
    expect(await audits()).toHaveLength(1);
  });

  it("aperçu 16 : lecture seule, même résultat que 17", async () => {
    const before = JSON.stringify(await rows());
    const preview = (await db.query<{ id: string; nom: string; sort_order_apres: number; controle: string }>(PREVIEW)).rows;
    expect(JSON.stringify(await rows())).toBe(before);
    expect(preview.map((r) => r.nom)).toEqual(VISIBLE_ORDER);
    expect(preview.every((r) => r.controle === "ok")).toBe(true);
    const res = await db.exec(APPLY);
    const applied = res.at(-1)!.rows as Array<{ id: string; sort_order: number; display_mode: string }>;
    expect(applied.map((r) => [r.id, r.sort_order])).toEqual(preview.map((r) => [r.id, r.sort_order_apres]));
    expect(applied.every((r) => r.display_mode === "list")).toBe(true);
  });

  it("produit masqué et sort_order en double : ordre conservé, renumérotation sans doublon", async () => {
    await db.exec(`update public.products set is_active = false where id = '${FUNNY}';
                   update public.products set sort_order = 182 where id = '794bc29deb';`);
    const visibleBefore = publicNames(await rows());
    await db.exec(APPLY);
    const after = await rows();
    expect(publicNames(after)).toEqual(visibleBefore);
    const values = after.products.filter((p) => p.category_id === "assortiments").map((p) => p.sort_order).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 21 }, (_, i) => 181 + i));
    expect(assort(after).find((p) => p.id === FUNNY)!.position).toBe(4); // masqué : position conservée
  });

  it("règle SQL identique au tri TypeScript (formats, Extasy, 44 → 48, sans « pcs », casse, accents)", async () => {
    const NAMES = [
      ...VISIBLE_ORDER, "Mini 8 PCS", "Maxi 100 pcs", "Plateau 12pcs", "Sans format", "Zébu 16 pcs", "éclair 16 pcs",
      "extasy  40 spécial", "Box 44 Pcs", "A-B 24 pcs", "A B 24 pcs", "A.B 24 pcs", "Œuf 30 pcs", "Crème 30 pcs", "Creme brulee 36 pcs",
    ];
    await db.exec("delete from public.products where category_id = 'assortiments';");
    const shuffled = NAMES.map((name, i) => ({ name, sort: (i * 7919) % NAMES.length }));
    for (const [i, it] of shuffled.entries()) {
      await db.query("insert into public.products (id, category_id, name, price, sort_order) values ($1, 'assortiments', $2, 10, $3)", [`t${i}`, it.name, 1000 + it.sort]);
    }
    const items = shuffled
      .map((it, i) => ({ id: `t${i}`, name: it.name, sort: it.sort }))
      .sort((a, b) => a.sort - b.sort)
      .map((it) => ({ id: it.id, name: it.name, category: "Assortiments" }) as YumloMenuItem);
    const expected = groupItemsForMenuTab("Assortiments", items, "assortiments_by_pcs").flatMap((g) => g.items.map((it) => it.id));
    await db.exec(APPLY);
    const after = (await rows()).products.filter((p) => p.category_id === "assortiments").sort((a, b) => a.sort_order - b.sort_order);
    expect(after.map((p) => p.id)).toEqual(expected);
  });

  it("noms à départager par accent ou casse : ARRÊT, rien modifié", async () => {
    await db.exec("insert into public.products (id, category_id, name, price, sort_order) values ('x1', 'assortiments', 'Délice 30 pcs', 10, 300);");
    const before = JSON.stringify(await rows());
    await expect(db.exec(`begin; ${DO_BLOCK} commit;`)).rejects.toThrow(/ARRÊT — rien n'a été modifié : noms à départager/);
    await db.exec("rollback");
    expect(JSON.stringify(await rows())).toBe(before);
    const preview = (await db.query<{ nom: string; controle: string }>(PREVIEW)).rows;
    expect(preview.find((r) => r.nom === "Délice 30 pcs")!.controle).toMatch(/^ARRÊT/);
  });

  it("caractère non garanti (emoji) : ARRÊT, rien modifié", async () => {
    await db.exec(`update public.products set name = 'Funny 16 pcs 🔥' where id = '${FUNNY}';`);
    const before = JSON.stringify(await rows());
    await expect(db.exec(`begin; ${DO_BLOCK} commit;`)).rejects.toThrow(/ordre alphabétique non garanti pour : Funny 16 pcs 🔥/);
    await db.exec("rollback");
    expect(JSON.stringify(await rows())).toBe(before);
  });

  it("catégorie absente : sans effet", async () => {
    await db.exec(`delete from public.product_variants; delete from public.products; delete from public.categories;`);
    await expect(db.exec(APPLY)).resolves.toBeDefined();
    expect(await audits()).toHaveLength(0);
  });
});

describe("après le script : ordre manuel des assortiments dans l'admin", () => {
  beforeEach(() => db.exec(APPLY));

  it("flèches présentes, désactivées aux extrémités ; formulaire : position modifiable", async () => {
    const r = await rows();
    const list = assort(r);
    expect(list.every((p) => p.manualOrder)).toBe(true);
    expect(moveTarget(list[0], "up")).toBeNull();
    expect(moveTarget(list[0], "down")).toBe(2);
    expect(moveTarget(list.at(-1)!, "down")).toBeNull();
    expect(moveTarget(list.at(-1)!, "up")).toBe(20);
    expect(categorySlots(r, "assortiments", PRIME_BOX)).toMatchObject({ max: 21, automatic: false });
    expect(loadCatalogEdit(r, PRIME_BOX)!.currentPosition).toBe(5);

    // Page Produits (même balisage au téléphone, en cartes) : flèches au lieu de « Ordre automatique ».
    const html = renderToStaticMarkup(
      <AdminMenuDataContext.Provider value={{ status: "ready", rows: r, error: null, reload: () => {}, refresh: async () => true }}>
        <ProductsPage client={admin} />
      </AdminMenuDataContext.Provider>,
    );
    expect(html).not.toMatch(/Ordre automatique/);
    const btn = (label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`))?.[0] ?? "";
    expect(btn("Monter Prime Box 16 pcs")).not.toMatch(/ disabled=""/);
    expect(btn("Descendre Prime Box 16 pcs")).not.toMatch(/ disabled=""/);
    expect(btn("Monter California Box 16 pcs")).toMatch(/ disabled=""/);
    expect(btn("Descendre Family Box 60 pcs")).toMatch(/ disabled=""/);
  });

  it("↑ / ↓ : enregistré par la RPC existante, persistant après rechargement, menu public à jour", async () => {
    const before = await rows();
    for (let i = 0; i < 4; i++) {
      const current = assort(await rows()).find((p) => p.id === PRIME_BOX)!;
      const notice = await runProductMove(admin, current, "up", async () => true);
      expect(notice.error).toBeUndefined();
    }
    expect(assort(before).find((p) => p.id === PRIME_BOX)!.position).toBe(5);
    const reloaded = await fetchMenuRows(admin); // rechargement depuis la base
    expect(assort(reloaded).find((p) => p.id === PRIME_BOX)!.position).toBe(1);
    expect(publicNames(reloaded).slice(0, 5)).toEqual(["Prime Box 16 pcs", "California Box 16 pcs", "Crunchy Box 16 pcs", "Eby Lovers 16 pcs", "Funny 16 pcs"]);
    expect(publicGroups(reloaded).map((g) => g.title)).toEqual(TITLES);

    const down = await runProductMove(admin, assort(reloaded).find((p) => p.id === PRIME_BOX)!, "down", async () => true);
    expect(down.success).toMatch(/position 2/);
    expect(publicNames(await rows()).slice(0, 2)).toEqual(["California Box 16 pcs", "Prime Box 16 pcs"]);

    // Seuls les sort_order des assortiments changent (mêmes valeurs) ; journal product.update.
    const after = await rows();
    expect(outside(after)).toBe(outside(before));
    expect((await audits()).filter((a) => a.action === "product.update").length).toBe(5);
  });

  it("format placé au milieu d'un autre : un sous-titre par changement de format, ordre respecté", async () => {
    const summer = assort(await rows()).find((p) => p.name === "Summer 20 pcs")!;
    const { error } = await admin.rpc("admin_save_product", { p_product_id: summer.id, p_product: {}, p_variants: null, p_position: 1 });
    expect(error).toBeNull();
    const groups = publicGroups(await rows());
    expect(groups.map((g) => g.title)).toEqual(["Assortiments 20 pcs", ...TITLES.filter((t) => t !== "Assortiments 20 pcs")]);
    expect(groups[0].items.map((it) => it.name)).toEqual(["Summer 20 pcs"]);
  });

  it("photo d'un assortiment : remplacée par le circuit habituel, ordre et autres photos inchangés", async () => {
    const before = await rows();
    const data = loadCatalogEdit(before, PRIME_BOX)!;
    const res = await saveCatalogProduct(admin, data, data.form, new File(["nouvelle-photo"], "photo.jpg", { type: "image/jpeg" }), uploadProductPhoto);
    expect(res.ok).toBe(true);
    const after = await rows();
    const img = (r: MenuRows, id: string) => r.products.find((p) => p.id === id)!.image_url;
    expect(img(after, PRIME_BOX)).toMatch(/\/menu-images\/products\/d99671dda4\//);
    expect(rowsToMenu(after).items.find((it) => it.id === PRIME_BOX)!.image).toBe(img(after, PRIME_BOX));
    for (const p of before.products.filter((x) => x.id !== PRIME_BOX)) expect(img(after, p.id)).toBe(p.image_url);
    expect(publicNames(after)).toEqual(VISIBLE_ORDER);
    // L'ancienne photo n'est pas supprimée (fichier statique, toujours référencé par le seed / statique).
    expect(img(before, PRIME_BOX)).toBe("/menu-hd-onglet27/assort16-prime-box.png");
  });
});

describe("menu statique (repli) : inchangé", () => {
  it("Assortiments : tri automatique par pièces, sans sous-titres manuels", () => {
    const menu = getStaticMenu();
    expect(menuCategoryDisplayMode(menu, "Assortiments")).toBe("assortiments_by_pcs");
    expect(menuCategoryPcsHeadings(menu, "Assortiments")).toBe(false);
    const items = menu.items.filter((it) => it.category === "Assortiments");
    expect(groupItemsForMenuTab("Assortiments", items).flatMap((g) => g.items.map((it) => it.name))).toEqual(VISIBLE_ORDER);
  });

  it("autre catégorie en « list » : jamais de sous-titres « pcs » (id assortiments uniquement)", async () => {
    await db.exec(APPLY);
    const menu = rowsToMenu(await rows());
    expect(menu.pcsHeadingCategories).toEqual(["Assortiments"]);
    expect(menuCategoryPcsHeadings(menu, "Plats Thaï")).toBe(false);
  });
});
