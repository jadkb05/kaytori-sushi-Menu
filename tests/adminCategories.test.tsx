/**
 * Gestion des catégories : RPC admin_create_category / admin_update_category /
 * admin_delete_category (RLS réelle, journal), logique de l'écran (categoryAdmin.ts), page
 * /admin/categories, et menu public : règles Plats Thaï / Assortiments liées à display_mode
 * (survivent au renommage), WhatsApp avec le nouveau nom. PostgreSQL en mémoire ; la base est
 * restaurée exactement après chaque test.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import {
  categoryNameError,
  categoryProductCount,
  createCategory,
  deleteBlockedMessage,
  deleteCategory,
  newCategoryId,
  orderedCategories,
  parseCategoryPosition,
  updateCategory,
} from "../src/admin/lib/categoryAdmin";
import { buildCategoryList } from "../src/admin/lib/menuAdmin";
import { CategoriesPage } from "../src/admin/pages/CategoriesPage";
import { buildWhatsappOrderMessage, categoryLookupFromMenu } from "../src/cart/buildOrderMessage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { menuCategoryDisplayMode, rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { groupItemsForMenuTab } from "../src/data/menuTabSections";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_CATEGORIES, YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { actAs, createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const SEED_IDS = YUMLO_CATEGORIES.map((name) =>
  name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
);
const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

let db: PGlite;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const adminRows = () => fetchMenuRows(admin());
const publicMenu = async () => rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null)));
const rpc = async (who: typeof ADMIN | null, fn: string, args: Record<string, unknown>) => createPgliteSupabase(db, who).rpc(fn, args);
const order = (rows: MenuRows) => orderedCategories(rows).map((c) => c.id);
const audit = async (action: string) =>
  (await db.query<{ entity_id: string; payload: Record<string, unknown>; user_id: string }>(
    "select entity_id, payload, user_id from public.audit_log where action = $1 order by created_at", [action],
  )).rows;

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await actAs(db, "owner");
  await db.exec(`delete from public.categories where id not in (${SEED_IDS.map((id) => `'${id}'`).join(",")});
                 delete from public.audit_log;`);
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("logique de l'écran", () => {
  let rows: MenuRows;
  beforeAll(async () => {
    rows = await adminRows();
  });

  it("nom : obligatoire, 60 caractères max, unique (casse, espaces, accents/ponctuation)", () => {
    expect(categoryNameError("  ", rows)).toBe("Le nom de la catégorie est obligatoire.");
    expect(categoryNameError("x".repeat(61), rows)).toBe("Nom trop long (60 caractères maximum).");
    expect(categoryNameError("🍣", rows)).toBe("Le nom doit contenir au moins une lettre ou un chiffre.");
    expect(categoryNameError(" salades ", rows)).toBe("Une catégorie porte déjà ce nom.");
    expect(categoryNameError("Plats Thai", rows)).toBe("Un nom trop proche existe déjà (seuls les accents ou la ponctuation diffèrent).");
    expect(categoryNameError("Desserts glacés", rows)).toBeNull();
    // Renommage : son propre nom (ou une variante de casse) reste permis.
    expect(categoryNameError("SALADES", rows, "salades")).toBeNull();
  });

  it("identifiant : slug du nom, suffixe si déjà pris ; jamais dérivé du nom ensuite", () => {
    expect(newCategoryId("Desserts Glacés", rows)).toBe("desserts-glaces");
    expect(newCategoryId("Salades !", rows)).toBe("salades-2");
  });

  it("position, message de suppression, nombre de produits (masqués compris)", () => {
    expect(parseCategoryPosition("3", 31)).toBe(3);
    expect(parseCategoryPosition("0", 31)).toBe("Indiquez une position entre 1 et 31.");
    expect(parseCategoryPosition("32", 31)).toBe("Indiquez une position entre 1 et 31.");
    expect(parseCategoryPosition("2.5", 31)).toBe("Indiquez une position entre 1 et 31.");
    expect(deleteBlockedMessage(8)).toBe("Cette catégorie contient 8 produits. Déplacez-les avant de la supprimer.");
    expect(deleteBlockedMessage(1)).toBe("Cette catégorie contient 1 produit. Déplacez-le avant de la supprimer.");
    expect(categoryProductCount(rows, "salades")).toBe(8);
  });

  it("liste : positions 1…N dans l'ordre du menu", () => {
    const list = buildCategoryList(rows);
    expect(list.map((c) => c.position)).toEqual(list.map((_, i) => i + 1));
    expect(list.map((c) => c.name)).toEqual([...YUMLO_CATEGORIES]);
  });
});

describe("créer", () => {
  it("en dernier par défaut : mode liste, nom nettoyé, journal category.create", async () => {
    const res = await createCategory(admin(), await adminRows(), { name: "  Poke Bowls  ", isActive: true, position: null });
    expect(res).toMatchObject({ ok: true, category: { id: "poke-bowls", name: "Poke Bowls", is_active: true, display_mode: "list" } });
    const rows = await adminRows();
    expect(order(rows)).toEqual([...SEED_IDS, "poke-bowls"]);
    const [log] = await audit("category.create");
    expect(log).toMatchObject({ entity_id: "poke-bowls", user_id: ADMIN.id, payload: { shifted: [] } });
  });

  it("en position k : les suivantes décalées de +1, les autres intactes", async () => {
    const before = await adminRows();
    const res = await createCategory(admin(), before, { name: "Poke Bowls", isActive: false, position: 3 });
    expect(res.ok).toBe(true);
    const after = await adminRows();
    expect(order(after)).toEqual([...SEED_IDS.slice(0, 2), "poke-bowls", ...SEED_IDS.slice(2)]);
    const sort = (rows: MenuRows, id: string) => rows.categories.find((c) => c.id === id)!.sort_order;
    expect(sort(after, "poke-bowls")).toBe(sort(before, SEED_IDS[2]));
    for (const id of SEED_IDS.slice(0, 2)) expect(sort(after, id)).toBe(sort(before, id));
    for (const id of SEED_IDS.slice(2)) expect(sort(after, id)).toBe(sort(before, id) + 1);
    // Masquée : absente du menu public.
    expect((await publicMenu()).categories).not.toContain("Poke Bowls");
    // Suppression (vide) : retour exact à l'ordre d'origine.
    expect(await deleteCategory(admin(), after, "poke-bowls")).toEqual({ ok: true });
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });

  it("refus : nom en double (casse), vide, trop long, identifiant invalide ou pris, position hors bornes", async () => {
    const errors = async (args: Record<string, unknown>) => (await rpc(ADMIN, "admin_create_category", args)).error?.message;
    expect(await errors({ p_id: "x", p_name: "SALADES" })).toBe("Une catégorie porte déjà ce nom.");
    expect(await errors({ p_id: "x", p_name: "   " })).toBe("Le nom de la catégorie est obligatoire.");
    expect(await errors({ p_id: "x", p_name: "x".repeat(61) })).toBe("Nom trop long (60 caractères maximum).");
    expect(await errors({ p_id: "Bad Id", p_name: "Nouveau" })).toBe("Identifiant de catégorie invalide.");
    expect(await errors({ p_id: "salades", p_name: "Nouveau" })).toBe("Identifiant de catégorie déjà utilisé : salades.");
    expect(await errors({ p_id: "nouveau", p_name: "Nouveau", p_position: 33 })).toBe("Position invalide : entre 1 et 32.");
    expect(await errors({ p_id: "nouveau", p_name: "Nouveau", p_position: 0 })).toBe("Position invalide : entre 1 et 32.");
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });

  it("index unique : même un ajout direct ne peut pas dupliquer un nom", async () => {
    const err = await createPgliteSupabase(db, ADMIN).rpc("admin_create_category", { p_id: "a", p_name: "Nouveau" });
    expect(err.error).toBeNull();
    await expect(db.query("insert into public.categories (id, name, sort_order) values ('b', ' nouveau ', 99)")).rejects.toThrow(/categories_name_unique_idx/);
  });
});

describe("modifier : renommer, masquer / afficher, déplacer", () => {
  it("renommer : identifiant, produits et mode d'affichage conservés ; journal before/after", async () => {
    const res = await updateCategory(admin(), "plats-thai", { name: " Wok Thaï " });
    expect(res).toMatchObject({ ok: true, category: { id: "plats-thai", name: "Wok Thaï", display_mode: "plats_thai_sorted" } });
    const rows = await adminRows();
    expect(categoryProductCount(rows, "plats-thai")).toBe(11);
    const [log] = await audit("category.update");
    expect(log.payload).toMatchObject({ before: { name: "Plats Thaï" }, after: { name: "Wok Thaï" }, shifted: [] });
  });

  it("Plats Thaï / Assortiments renommés : même tri et mêmes sous-sections sur le menu public", async () => {
    await updateCategory(admin(), "plats-thai", { name: "Wok Thaï" });
    await updateCategory(admin(), "assortiments", { name: "Plateaux" });
    const menu = await publicMenu();
    const renamed = toParityModel(menu);
    const rename = (c: string) => (c === "Plats Thaï" ? "Wok Thaï" : c === "Assortiments" ? "Plateaux" : c);
    const expected: MenuParityModel = {
      categories: reference.categories.map((c) => ({ ...c, name: rename(c.name) })),
      products: reference.products.map((p) => ({ ...p, category: rename(p.category) })),
    };
    expect(compareParityModels(expected, renamed)).toEqual([]);
    expect(menuCategoryDisplayMode(menu, "Plateaux")).toBe("assortiments_by_pcs");
    const plateaux = groupItemsForMenuTab("Plateaux", menu.items.filter((it) => it.category === "Plateaux"), "assortiments_by_pcs");
    expect(plateaux.map((g) => g.title)).toContain("Assortiments 24 pcs");
  });

  it("nouvelle catégorie nommée « Plats Thaï » après renommage : simple liste (pas de tri spécial)", async () => {
    await updateCategory(admin(), "plats-thai", { name: "Wok Thaï" });
    expect((await createCategory(admin(), await adminRows(), { name: "Plats Thaï", isActive: true, position: null })).ok).toBe(true);
    const menu = await publicMenu();
    expect(menuCategoryDisplayMode(menu, "Plats Thaï")).toBe("list");
    expect(menuCategoryDisplayMode(menu, "Wok Thaï")).toBe("plats_thai_sorted");
    // Menu statique (repli) : règle par nom, inchangée.
    expect(menuCategoryDisplayMode(getStaticMenu(), "Plats Thaï")).toBe("plats_thai_sorted");
  });

  it("WhatsApp : la commande affiche le nouveau nom de la catégorie", async () => {
    await updateCategory(admin(), "salades", { name: "Salades fraîches" });
    const salade = YUMLO_MENU.find((it) => it.category === "Salades")!;
    const msg = buildWhatsappOrderMessage(
      [{ id: salade.id, name: salade.name, unitPriceDh: 59, quantity: 1 }],
      59,
      categoryLookupFromMenu((await publicMenu()).items),
    );
    expect(msg).toContain(`• 1× [Salades fraîches] ${salade.name} — 59,00 DH`);
  });

  it("masquer puis afficher : catégorie et produits retirés du menu public, puis rétablis", async () => {
    await updateCategory(admin(), "salades", { isActive: false });
    let menu = await publicMenu();
    expect(menu.categories).not.toContain("Salades");
    expect(menu.items.some((it) => it.category === "Salades")).toBe(false);
    expect((await adminRows()).products.filter((p) => p.category_id === "salades")).toHaveLength(8);
    await updateCategory(admin(), "salades", { isActive: true });
    menu = await publicMenu();
    expect(compareParityModels(reference, toParityModel(menu))).toEqual([]);
  });

  it("déplacer : redistribution des mêmes valeurs (atomique) ; aller-retour = état d'origine exact", async () => {
    const before = await adminRows();
    const last = SEED_IDS.at(-1)!;
    expect((await updateCategory(admin(), last, { position: 1 })).ok).toBe(true);
    const after = await adminRows();
    expect(order(after)).toEqual([last, ...SEED_IDS.slice(0, -1)]);
    expect(after.categories.map((c) => c.sort_order).sort((a, b) => a - b)).toEqual(before.categories.map((c) => c.sort_order).sort((a, b) => a - b));
    expect((await publicMenu()).categories[0]).toBe(YUMLO_CATEGORIES.at(-1));
    const [log] = await audit("category.update");
    expect((log.payload.shifted as unknown[]).length).toBe(30);
    expect((await updateCategory(admin(), last, { position: 31 })).ok).toBe(true);
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });

  it("nom + position en un seul appel atomique ; une erreur n'applique rien", async () => {
    const res = await updateCategory(admin(), "salades", { name: "Bowls", position: 99 });
    expect(res).toEqual({ ok: false, error: "Position invalide : entre 1 et 31." });
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });

  it("refus : identifiant / mode d'affichage non modifiables, nom en double, catégorie inconnue", async () => {
    const err = async (args: Record<string, unknown>) => (await rpc(ADMIN, "admin_update_category", args)).error?.message;
    expect(await err({ p_category_id: "salades", p_changes: { id: "x" } })).toBe("Champ de catégorie non modifiable : id.");
    expect(await err({ p_category_id: "salades", p_changes: { display_mode: "list" } })).toBe("Champ de catégorie non modifiable : display_mode.");
    expect(await err({ p_category_id: "salades", p_changes: { name: "BENTOS" } })).toBe("Une catégorie porte déjà ce nom.");
    expect(await err({ p_category_id: "salades", p_changes: { is_active: "non" } })).toBe("Statut invalide.");
    expect(await err({ p_category_id: "inconnue", p_changes: {} })).toBe("Catégorie introuvable : inconnue.");
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });
});

describe("supprimer (uniquement si vide)", () => {
  it("catégorie avec produits : refusée avec le nombre exact (produits masqués compris)", async () => {
    const rows = await adminRows();
    expect(await deleteCategory(admin(), rows, "salades")).toEqual({
      ok: false,
      error: "Cette catégorie contient 8 produits. Déplacez-les avant de la supprimer.",
    });
    // La base revérifie, même si l'écran est contourné (ici : 7 produits masqués + 1 visible).
    await db.exec("update public.products set is_active = false where category_id = 'salades'");
    const direct = await rpc(ADMIN, "admin_delete_category", { p_category_id: "salades" });
    expect(direct.error).toMatchObject({ code: "23503", message: "Cette catégorie contient 8 produits. Déplacez-les avant de la supprimer." });
  });

  it("un seul produit : message au singulier", async () => {
    await createCategory(admin(), await adminRows(), { name: "Test", isActive: true, position: null });
    await db.exec("update public.products set category_id = 'test' where id = (select id from public.products where category_id = 'salades' order by sort_order limit 1)");
    const direct = await rpc(ADMIN, "admin_delete_category", { p_category_id: "test" });
    expect(direct.error?.message).toBe("Cette catégorie contient 1 produit. Déplacez-le avant de la supprimer.");
    await db.exec("update public.products set category_id = 'salades' where category_id = 'test'");
  });

  it("catégorie vide : supprimée, suivantes remontées de −1, journal category.delete", async () => {
    await createCategory(admin(), await adminRows(), { name: "Éphémère", isActive: true, position: 1 });
    const before = await adminRows();
    expect(order(before)[0]).toBe("ephemere");
    expect(await deleteCategory(admin(), before, "ephemere")).toEqual({ ok: true });
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
    const [log] = await audit("category.delete");
    expect(log).toMatchObject({ entity_id: "ephemere", payload: { before: { name: "Éphémère" } } });
    expect((log.payload.shifted as unknown[]).length).toBe(31);
  });
});

describe("sécurité", () => {
  it("utilisateur connecté non admin : refus des 3 fonctions, rien modifié", async () => {
    const msg = "Accès refusé : ce compte n'a pas les droits administrateur.";
    const user = createPgliteSupabase(db, USER);
    const rows = await adminRows();
    expect(await createCategory(user, rows, { name: "Pirate", isActive: true, position: null })).toEqual({ ok: false, error: msg });
    expect(await updateCategory(user, "salades", { name: "Pirate" })).toEqual({ ok: false, error: msg });
    const empty = (await createCategory(admin(), rows, { name: "Vide", isActive: true, position: null })).ok;
    expect(empty).toBe(true);
    expect(await deleteCategory(user, await adminRows(), "vide")).toEqual({ ok: false, error: msg });
  });

  it("anonyme : exécution interdite", async () => {
    for (const [fn, args] of [
      ["admin_create_category", { p_id: "x", p_name: "X" }],
      ["admin_update_category", { p_category_id: "salades", p_changes: {} }],
      ["admin_delete_category", { p_category_id: "salades" }],
    ] as const) {
      expect((await rpc(null, fn, args)).error?.message).toMatch(/permission denied/);
    }
  });

  it("security invoker, search_path vide, exécution réservée à authenticated", async () => {
    const res = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[]; anon: boolean; auth: boolean }>(
      `select proname, prosecdef, proconfig,
              has_function_privilege('anon', oid, 'execute') as anon,
              has_function_privilege('authenticated', oid, 'execute') as auth
         from pg_proc where proname in ('admin_create_category', 'admin_update_category', 'admin_delete_category') order by proname`,
    );
    expect(res.rows).toHaveLength(3);
    for (const r of res.rows) expect(r).toMatchObject({ prosecdef: false, proconfig: ['search_path=""'], anon: false, auth: true });
  });

  it("fonction absente (migration non appliquée) : message clair", async () => {
    const missing = createPgliteSupabase(db, ADMIN, { rpcError: "Could not find the function public.admin_update_category" });
    expect(await updateCategory(missing, "salades", { name: "X" })).toEqual({
      ok: false,
      error: "La gestion des catégories n'est pas installée sur Supabase (migration admin_categories).",
    });
  });
});

describe("page /admin/categories (rendu)", () => {
  it("positions 1…31, actions par ligne, ↑ désactivé en tête et ↓ en fin, formulaire de création", async () => {
    const rows = await adminRows();
    const html = renderToStaticMarkup(
      <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {} }}>
        <CategoriesPage client={admin()} />
      </AdminMenuDataContext.Provider>,
    );
    expect((html.match(/>Modifier</g) ?? []).length).toBe(31);
    expect((html.match(/>Masquer</g) ?? []).length).toBe(31);
    expect((html.match(/>Supprimer</g) ?? []).length).toBe(31);
    expect(html).toMatch(/disabled="" aria-label="Monter Starters"/);
    expect(html).toMatch(/disabled="" aria-label="Descendre Boissons"/);
    expect(html).not.toMatch(/disabled="" aria-label="Monter Salades"/);
    expect(html).toContain("Nouvelle catégorie");
    expect(html).toContain('placeholder="32"');
    expect(html).not.toContain("Lecture seule");
  });
});

describe("menu statique (repli) inchangé", () => {
  it("parité exacte avec la référence", () => {
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });
});
