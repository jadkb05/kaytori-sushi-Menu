/**
 * Phase 3B : édition d'un produit depuis /admin — formulaire, validation, sauvegarde via la RPC
 * admin_update_product (PostgreSQL en mémoire, RLS réelle), relecture, menu public Supabase vs statique.
 * Chaque test qui écrit restaure exactement la base (seed) et le vérifie.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import {
  buildUpdatePayload,
  findUnappliedChanges,
  hasErrors,
  isEmptyPayload,
  loadProductForEdit,
  parsePrice,
  saveProduct,
  validateProductForm,
  type ProductEditData,
} from "../src/admin/lib/productEditor";
import { ADMIN_ROUTES, productEditPath, resolveAdminRoute } from "../src/admin/lib/routes";
import { ProductEditPage } from "../src/admin/pages/ProductEditPage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const BOBUN = YUMLO_MENU.find((it) => it.name === "Bobun")!;
const RED_CURRY = YUMLO_MENU.find((it) => it.name === "Red Curry Thaï")!;

let db: PGlite;
let seedDump: string;
const adminClient = () => createPgliteSupabase(db, ADMIN);
const adminRows = () => fetchMenuRows(adminClient());
const edit = async (id: string) => loadProductForEdit(await adminRows(), id)!;

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("route /admin/products/:id", () => {
  it("admin → page d'édition ; non connecté → login ; non-admin → refus", () => {
    const path = productEditPath(BOBUN.id);
    expect(path).toBe(`/admin/products/${BOBUN.id}`);
    expect(resolveAdminRoute(path, { status: "admin", email: "" })).toEqual({ kind: "page", page: "productEdit", productId: BOBUN.id });
    expect(resolveAdminRoute(`${path}/`, { status: "admin", email: "" })).toEqual({ kind: "page", page: "productEdit", productId: BOBUN.id });
    expect(resolveAdminRoute(`${path}/x`, { status: "admin", email: "" })).toEqual({ kind: "redirect", to: ADMIN_ROUTES.dashboard });
    expect(resolveAdminRoute(path, { status: "signedOut" })).toEqual({ kind: "redirect", to: ADMIN_ROUTES.login });
    expect(resolveAdminRoute(path, { status: "notAdmin", email: "" })).toEqual({ kind: "page", page: "denied" });
  });
});

describe("chargement pour édition", () => {
  it("produit simple et produit à variantes, valeurs de la base", async () => {
    const bobun = await edit(BOBUN.id);
    expect(bobun.hasVariants).toBe(false);
    expect(bobun.form).toMatchObject({ name: "Bobun", price: "69.00", categoryId: "salades", isActive: true, variants: [] });
    const curry = await edit(RED_CURRY.id);
    expect(curry.hasVariants).toBe(true);
    expect(curry.form.variants.map((v) => [v.id, v.label, v.price])).toEqual(
      RED_CURRY.variants!.map((v) => [v.id, v.label, v.priceMAD]),
    );
    expect(loadProductForEdit(await adminRows(), "inexistant")).toBeNull();
  });
});

describe("validation du formulaire", () => {
  let bobun: ProductEditData;
  let curry: ProductEditData;
  beforeAll(async () => {
    bobun = await edit(BOBUN.id);
    curry = await edit(RED_CURRY.id);
  });

  it("formulaire d'origine valide", () => {
    expect(hasErrors(validateProductForm(bobun.form, bobun))).toBe(false);
    expect(hasErrors(validateProductForm(curry.form, curry))).toBe(false);
  });

  it("erreurs en français : nom, prix, catégorie, position", () => {
    const e = validateProductForm({ ...bobun.form, name: "  ", price: "-1", categoryId: "x" }, bobun);
    expect(e.name).toBe("Le nom est obligatoire.");
    expect(e.price).toMatch(/^Prix invalide/);
    expect(e.categoryId).toBe("Choisissez une catégorie existante.");
    expect(validateProductForm({ ...bobun.form, position: "1.5" }, bobun).position).toMatch(/^Position invalide/);
    for (const bad of ["abc", "", "10.005", "-0.5", "1e3"]) expect(parsePrice(bad), bad).toBeNull();
    expect(parsePrice("69,50")).toBe(69.5);
    expect(parsePrice("0")).toBe(0);
  });

  it("variantes : libellé, prix, ordre ; prix parent ignoré", () => {
    const form = {
      ...curry.form,
      price: "n'importe quoi",
      variants: curry.form.variants.map((v, i) => (i === 0 ? { ...v, label: "", price: "-2", sortOrder: "-1" } : v)),
    };
    const e = validateProductForm(form, curry);
    expect(e.price).toBeUndefined();
    expect(e.variants[curry.form.variants[0].id]).toEqual({
      label: "Le libellé est obligatoire.",
      price: "Prix invalide.",
      sortOrder: "Ordre invalide.",
    });
  });

  it("données envoyées : uniquement les champs modifiés, jamais id / image_url / currency / prix parent", () => {
    expect(isEmptyPayload(buildUpdatePayload(bobun, bobun.form))).toBe(true);
    const p = buildUpdatePayload(bobun, { ...bobun.form, name: " Bobun ", price: "70,5" });
    expect(p).toEqual({ product: { price: 70.5 }, variants: [] });
    const c = buildUpdatePayload(curry, {
      ...curry.form,
      price: "1",
      variants: curry.form.variants.map((v) => (v.id === "boeuf" ? { ...v, price: "75" } : v)),
    });
    expect(c).toEqual({ product: {}, variants: [{ id: "boeuf", price: 75 }] });
    for (const payload of [p, c]) {
      expect(Object.keys(payload.product)).not.toContain("id");
      expect(Object.keys(payload.product)).not.toContain("image_url");
      expect(Object.keys(payload.product)).not.toContain("currency");
    }
  });
});

describe("sauvegarde (RPC admin_update_product, RLS réelle)", () => {
  it("produit simple : nom, description, prix, catégorie, statut, ordre — relus depuis la base", async () => {
    const bobun = await edit(BOBUN.id);
    const form = {
      ...bobun.form,
      name: "Bobun test",
      description: "Description test",
      price: "72,50",
      categoryId: "plats-thai",
      isActive: false,
    };
    const payload = buildUpdatePayload(bobun, form);
    const res = await saveProduct(adminClient(), BOBUN.id, payload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(findUnappliedChanges(payload, res.saved)).toEqual([]);

    const reloaded = await edit(BOBUN.id);
    expect(reloaded.form).toMatchObject({
      name: "Bobun test",
      description: "Description test",
      price: "72.50",
      categoryId: "plats-thai",
      isActive: false,
    });
    // IDs, photo, vignettes et devise inchangés.
    expect(reloaded.product).toMatchObject({
      id: BOBUN.id,
      image_url: bobun.product.image_url,
      thumb_small_url: bobun.product.thumb_small_url,
      thumb_large_url: bobun.product.thumb_large_url,
      currency: "MAD",
    });
  });

  it("produit à variantes : une variante (prix, ordre, statut) ; autres variantes et prix parent intacts", async () => {
    const curry = await edit(RED_CURRY.id);
    const form = {
      ...curry.form,
      variants: curry.form.variants.map((v) => (v.id === "crevette" ? { ...v, price: "77", sortOrder: "8", isActive: false } : v)),
    };
    const payload = buildUpdatePayload(curry, form);
    expect(payload).toEqual({ product: {}, variants: [{ id: "crevette", price: 77, sort_order: 8, is_active: false }] });
    const res = await saveProduct(adminClient(), RED_CURRY.id, payload);
    expect(res.ok).toBe(true);
    const after = await edit(RED_CURRY.id);
    for (const v of after.variants) {
      const old = curry.variants.find((x) => x.id === v.id)!;
      if (v.id === "crevette") expect(v).toMatchObject({ price: "77.00", sort_order: 8, is_active: false });
      else expect(v).toEqual(old);
    }
    expect(after.product.price).toBe(curry.product.price);
    expect(after.product.image_url).toBe(curry.product.image_url);
    expect(after.variants.map((v) => v.id).sort()).toEqual(curry.variants.map((v) => v.id).sort());
  });

  it("utilisateur connecté non admin : refus, aucune donnée modifiée", async () => {
    const bobun = await edit(BOBUN.id);
    const before = JSON.stringify(await readMenuRows(db));
    const res = await saveProduct(createPgliteSupabase(db, USER), BOBUN.id, buildUpdatePayload(bobun, { ...bobun.form, price: "1" }));
    expect(res).toEqual({ ok: false, error: "Accès refusé : ce compte n'a pas les droits administrateur." });
    expect(JSON.stringify(await readMenuRows(db))).toBe(before);
  });
});

describe("menu public : Supabase reflète la modification, le statique ne change pas", () => {
  it("après édition, la source Supabase affiche la nouvelle valeur ; yumloMenu.ts est intact", async () => {
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    const bobun = await edit(BOBUN.id);
    const res = await saveProduct(adminClient(), BOBUN.id, buildUpdatePayload(bobun, { ...bobun.form, name: "Bobun modifié", price: "71" }));
    expect(res.ok).toBe(true);

    // Menu public en mode Supabase (visiteur anonyme, RLS publique).
    const publicRows: MenuRows = await fetchMenuRows(createPgliteSupabase(db, null));
    const fromSupabase = rowsToMenu(publicRows).items.find((it) => it.id === BOBUN.id)!;
    expect(fromSupabase).toMatchObject({ name: "Bobun modifié", priceMAD: "71.00", image: BOBUN.image });

    // Menu statique : strictement identique à la référence.
    const staticItem = getStaticMenu().items.find((it) => it.id === BOBUN.id)!;
    expect(staticItem).toMatchObject({ name: "Bobun", priceMAD: "69.00" });
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });
});

describe("rendu de la page d'édition (sans navigateur)", () => {
  it("produit simple (prix éditable) et produit à variantes (prix sur les variantes), photo en lecture seule", async () => {
    const rows = await adminRows();
    const render = (id: string) =>
      renderToStaticMarkup(
        <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {} }}>
          <ProductEditPage productId={id} client={adminClient()} />
        </AdminMenuDataContext.Provider>,
      );
    const simple = render(BOBUN.id);
    expect(simple).toContain('id="p-price"');
    expect(simple).toContain(`src="${BOBUN.image}"`);
    expect(simple).toContain("Enregistrer");
    expect(simple).toContain("Annuler");
    const withVariants = render(RED_CURRY.id);
    expect(withVariants).not.toContain('id="p-price"');
    expect(withVariants).toContain("Produit à variantes → gérer les prix au niveau des variantes.");
    expect((withVariants.match(/id="v-[^"]+-label"/g) ?? []).length).toBe(4);
    expect(render("inexistant")).toContain("Produit introuvable");
  });
});
