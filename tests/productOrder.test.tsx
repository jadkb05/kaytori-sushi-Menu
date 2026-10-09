/**
 * Page Produits : flèches ↑ / ↓ (ordre dans la catégorie) — positions calculées sur la
 * catégorie complète, RPC admin_save_product existante sur PostgreSQL en mémoire (RLS réelle),
 * rechargement après chaque tentative, rendu bureau / mobile (même balisage).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import { buildProductList, filterProducts, type AdminProduct } from "../src/admin/lib/menuAdmin";
import { moveProduct, moveTarget, runProductMove } from "../src/admin/lib/productOrder";
import { ProductsPage } from "../src/admin/pages/ProductsPage";
import { toParityModel } from "../src/data/menuParity";
import { rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const PLATS_THAI_MIGRATION = readFileSync(new URL("../supabase/migrations/20261012000000_plats_thai_manual_order.sql", import.meta.url), "utf8");

let db: PGlite;
let admin: SupabaseClient;
let seedDump: string;

const adminProducts = async () => buildProductList(await fetchMenuRows(admin));
const inCategory = (list: AdminProduct[], categoryId: string) => list.filter((p) => p.categoryId === categoryId);
const names = (list: AdminProduct[], categoryId: string) => inCategory(list, categoryId).map((p) => p.name);
const find = (list: AdminProduct[], name: string) => list.find((p) => p.name === name)!;
/** Ordre affiché sur le menu public (même code que MenuPage). */
const publicOrder = (rows: MenuRows, category: string) =>
  toParityModel(rowsToMenu(rows)).products.filter((p) => p.category === category).map((p) => p.name);
const byCategory = (rows: MenuRows, except: string) =>
  JSON.stringify(rows.products.filter((p) => p.category_id !== except).sort((a, b) => (a.id < b.id ? -1 : 1)));
/** Client qui échoue si la RPC est appelée (déplacement refusé avant tout appel). */
const noRpcClient = { rpc: () => { throw new Error("RPC appelée"); } } as unknown as SupabaseClient;

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  admin = createPgliteSupabase(db, ADMIN);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await runSeed(db);
  await db.exec("update public.categories set display_mode = 'list' where id = 'plats-thai'");
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées").toBe(seedDump);
});
afterAll(() => db.close());

describe("positions dans la catégorie (liste complète, masqués compris)", () => {
  it("1…N par catégorie, indépendantes du filtre et de la recherche", async () => {
    const list = await adminProducts();
    const starters = inCategory(list, "starters");
    expect(starters.map((p) => p.position)).toEqual(starters.map((_, i) => i + 1));
    expect(starters.every((p) => p.categoryTotal === starters.length && p.manualOrder)).toBe(true);
    // Filtré : mêmes objets, mêmes positions (jamais l'index dans les résultats).
    const salmon = filterProducts(list, { query: "saumon", categoryId: "california-roll" });
    expect(salmon.length).toBeGreaterThan(0);
    for (const p of salmon) expect(p.position).toBe(find(list, p.name).position);
    expect(salmon.some((p, i) => p.position !== i + 1)).toBe(true);
  });

  it("produit masqué : compté dans les positions", async () => {
    const [first, second] = inCategory(await adminProducts(), "salades");
    await db.exec(`update public.products set is_active = false where id = '${first.id}'`);
    const after = inCategory(await adminProducts(), "salades");
    expect(after[0]).toMatchObject({ id: first.id, position: 1, visible: false });
    expect(after[1]).toMatchObject({ id: second.id, position: 2 });
    expect(moveTarget(after[1], "up")).toBe(1);
  });

  it("limites : ↑ impossible en 1re position, ↓ impossible en dernière ; ordre automatique : aucune flèche", async () => {
    const list = await adminProducts();
    const starters = inCategory(list, "starters");
    expect(moveTarget(starters[0], "up")).toBeNull();
    expect(moveTarget(starters[0], "down")).toBe(2);
    expect(moveTarget(starters.at(-1)!, "down")).toBeNull();
    expect(moveTarget(starters.at(-1)!, "up")).toBe(starters.length - 1);
    const assort = inCategory(list, "assortiments");
    expect(assort.every((p) => !p.manualOrder && moveTarget(p, "up") === null && moveTarget(p, "down") === null)).toBe(true);
    // Refusé avant tout appel réseau.
    expect(await moveProduct(noRpcClient, starters[0], "up")).toEqual({ ok: false, error: `« ${starters[0].name} » est déjà en première position.` });
    expect((await moveProduct(noRpcClient, starters.at(-1)!, "down")).ok).toBe(false);
    expect(await moveProduct(noRpcClient, assort[3], "up")).toEqual({ ok: false, error: "Cette catégorie utilise un ordre automatique." });
  });
});

describe("déplacement (RPC admin_save_product)", () => {
  it("produit du milieu : ↑ puis ↓ ; persisté, catégorie inchangée, autres catégories intactes, journal", async () => {
    const before = await readMenuRows(db);
    const list = await adminProducts();
    const salades = names(list, "salades");
    const middle = find(list, salades[3]);

    expect(await moveProduct(admin, middle, "up")).toEqual({ ok: true, position: 3 });
    const up = await adminProducts(); // rechargement depuis la base
    const expectedUp = [...salades];
    [expectedUp[2], expectedUp[3]] = [expectedUp[3], expectedUp[2]];
    expect(names(up, "salades")).toEqual(expectedUp);
    expect(find(up, middle.name)).toMatchObject({ position: 3, categoryId: "salades" });
    expect(publicOrder(await readMenuRows(db), "Salades")).toEqual(expectedUp);

    expect(await moveProduct(admin, find(up, middle.name), "down")).toEqual({ ok: true, position: 4 });
    const down = await readMenuRows(db);
    expect(names(buildProductList(down), "salades")).toEqual(salades);
    expect(byCategory(down, "salades")).toBe(byCategory(before, "salades"));
    // Mêmes valeurs sort_order qu'au départ, rien d'autre modifié (prix, variantes, catégorie…).
    expect(JSON.stringify(down)).toBe(JSON.stringify(before));
    const logs = (await db.query<{ action: string; entity_id: string }>("select action, entity_id from public.audit_log where entity_id = $1", [middle.id])).rows;
    expect(logs).toEqual([{ action: "product.update", entity_id: middle.id }, { action: "product.update", entity_id: middle.id }]);
  });

  it("dernier produit d'une catégorie : ne passe jamais dans la suivante", async () => {
    const before = await readMenuRows(db);
    const list = await adminProducts();
    const last = inCategory(list, "starters").at(-1)!;
    expect((await moveProduct(admin, last, "down")).ok).toBe(false);
    // Même en forçant une position hors limites, la RPC refuse (aucun changement de catégorie).
    const forced = await moveProduct(admin, { ...last, categoryTotal: last.categoryTotal + 1 }, "down");
    expect(forced).toMatchObject({ ok: false });
    expect((forced as { error: string }).error).toMatch(/Position invalide/);
    expect(JSON.stringify(await readMenuRows(db))).toBe(JSON.stringify(before));
  });

  it("avec recherche active : échange avec le vrai voisin de la catégorie, même s'il n'est pas affiché", async () => {
    const list = await adminProducts();
    const full = names(list, "california-roll");
    const shown = filterProducts(list, { query: "saumon", categoryId: "california-roll" });
    const target = shown.find((p) => p.position > 1 && !shown.some((s) => s.position === p.position - 1))!;
    expect(target, "un résultat dont le voisin du dessus est masqué par la recherche").toBeDefined();
    const hiddenNeighbour = full[target.position - 2];
    await moveProduct(admin, target, "up");
    const after = names(await adminProducts(), "california-roll");
    expect(after[target.position - 2]).toBe(target.name);
    expect(after[target.position - 1]).toBe(hiddenNeighbour);
    expect([...after].sort()).toEqual([...full].sort());
  });

  it("compte non admin : refusé par la base, rien modifié", async () => {
    const before = JSON.stringify(await readMenuRows(db));
    const middle = inCategory(await adminProducts(), "salades")[3];
    const res = await moveProduct(createPgliteSupabase(db, USER), middle, "up");
    expect(res).toMatchObject({ ok: false });
    expect(JSON.stringify(await readMenuRows(db))).toBe(before);
  });
});

describe("clic sur une flèche : message et rechargement", () => {
  it("succès : message, liste relue", async () => {
    const middle = inCategory(await adminProducts(), "salades")[3];
    let refreshed = 0;
    const notice = await runProductMove(admin, middle, "down", async () => (refreshed++, true));
    expect(notice).toEqual({ success: `« ${middle.name} » déplacé en position 5 dans « Salades ».` });
    expect(refreshed).toBe(1);
  });

  it("échec de la RPC : erreur claire, liste relue (ordre enregistré affiché, rien d'optimiste)", async () => {
    const middle = inCategory(await adminProducts(), "salades")[3];
    const failing = { rpc: async () => ({ data: null, error: { message: "TypeError: Failed to fetch" } }) } as unknown as SupabaseClient;
    let refreshed = 0;
    const notice = await runProductMove(failing, middle, "up", async () => (refreshed++, true));
    expect(notice.error).toBe(`Impossible de déplacer « ${middle.name} ». Enregistrement impossible : vérifiez votre connexion Internet.`);
    expect(refreshed).toBe(1);
    const missing = { rpc: async () => ({ data: null, error: { message: "Could not find the function", code: "PGRST202" } }) } as unknown as SupabaseClient;
    expect((await runProductMove(missing, middle, "up", async () => true)).error).toMatch(/fonction non installée/);
  });

  it("déplacé mais rechargement impossible : le dire", async () => {
    const middle = inCategory(await adminProducts(), "salades")[3];
    const notice = await runProductMove(admin, middle, "up", async () => false);
    expect(notice.error).toMatch(/a été déplacé, mais la liste n'a pas pu être rechargée/);
  });
});

describe("rendu bureau et mobile (même balisage)", () => {
  const render = async () => {
    const rows = await fetchMenuRows(admin);
    return renderToStaticMarkup(
      <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {}, refresh: async () => true }}>
        <ProductsPage client={admin} />
      </AdminMenuDataContext.Provider>,
    );
  };
  const escape = (label: string) => label.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${escape(label)}[^"]*"[^>]*>`))?.[0] ?? "";

  it("colonne Ordre, position, flèches désactivées aux limites, colonnes existantes conservées", async () => {
    const html = await render();
    const starters = inCategory(await adminProducts(), "starters");
    expect(html).toContain(">Ordre</th>");
    for (const th of ["Photo", "Nom", "Catégorie", "Prix", "Variantes", "Statut"]) expect(html).toContain(`>${th}</th>`);
    expect(html).toContain("Modifier");
    expect(button(html, `Monter ${starters[0].name}`)).toContain('disabled=""');
    expect(button(html, `Descendre ${starters[0].name}`)).not.toContain('disabled=""');
    expect(button(html, `Descendre ${starters.at(-1)!.name}`)).toContain('disabled=""');
    expect(button(html, `Monter ${starters.at(-1)!.name}`)).not.toContain('disabled=""');
    expect(button(html, `Monter ${starters[1].name} (position 2 sur ${starters.length} dans Starters)`)).not.toBe("");
    // Mobile (< 1024 px) : ↑ / position / ↓ en colonne, cibles tactiles de 40 px.
    expect(button(html, `Monter ${starters[1].name}`)).toContain("max-lg:min-h-[40px]");
    expect(button(html, `Monter ${starters[1].name}`)).toContain("max-lg:order-1");
    expect(html).toContain("max-lg:grid-cols-[2.75rem_3rem_minmax(0,1fr)_auto]");
  });

  it("Assortiments : « Ordre automatique », aucune flèche", async () => {
    const html = await render();
    const assort = inCategory(await adminProducts(), "assortiments");
    expect(html.match(/Ordre automatique/g)).toHaveLength(assort.length);
    for (const p of assort) expect(button(html, `Monter ${p.name}`)).toBe("");
  });
});

describe("catégories à ordre automatique", () => {
  it("Assortiments : intertitres « pcs » et ordre automatiques inchangés", async () => {
    const rows = await readMenuRows(db);
    const sections = toParityModel(rowsToMenu(rows)).products.filter((p) => p.category === "Assortiments").map((p) => p.section);
    expect(new Set(sections)).toContain("Assortiments 16 pcs");
    expect(new Set(sections)).toContain("Assortiments 24 pcs");
    // Même une position envoyée de force n'y change rien (la RPC l'ignore en ordre automatique).
    const p = inCategory(await adminProducts(), "assortiments")[3];
    await admin.rpc("admin_save_product", { p_product_id: p.id, p_product: {}, p_variants: null, p_position: 1 });
    expect(JSON.stringify(await readMenuRows(db))).toBe(JSON.stringify(rows));
  });

  it("Plats Thaï avant sa migration (production actuelle) : « Ordre automatique », pas de flèches", async () => {
    await db.exec(`update public.products set sort_order = 179 where id = '18b0c7ab53';
                   update public.products set sort_order = 177 where id = '9e1d2c99ca';
                   update public.products set sort_order = 178 where id = '55088e9b04';
                   update public.categories set display_mode = 'plats_thai_sorted' where id = 'plats-thai';`);
    const thai = inCategory(await adminProducts(), "plats-thai");
    expect(thai.every((p) => !p.manualOrder)).toBe(true);
    expect(await moveProduct(noRpcClient, thai[1], "up")).toEqual({ ok: false, error: "Cette catégorie utilise un ordre automatique." });

    // Après la migration (display_mode relu de la base) : flèches actives, déplacement persisté.
    await db.exec(PLATS_THAI_MIGRATION);
    const after = inCategory(await adminProducts(), "plats-thai");
    expect(after.every((p) => p.manualOrder)).toBe(true);
    const redCurry = find(after, "Red Curry Thaï");
    expect(redCurry.position).toBe(2);
    expect(await moveProduct(admin, redCurry, "down")).toEqual({ ok: true, position: 3 });
    const rows = await readMenuRows(db);
    expect(publicOrder(rows, "Plats Thaï").slice(0, 4)).toEqual(["Boeuf Bulgogi", "Ananas Aigre Doux", "Red Curry Thaï", "Corean Chicken"]);
    await db.exec("delete from public.audit_log");
  });
});
