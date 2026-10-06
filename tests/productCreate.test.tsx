/**
 * Phase 3D : création d'un produit depuis /admin — route, validation (photo obligatoire),
 * données envoyées, création complète (photo Storage + RPC admin_create_product) sur PostgreSQL
 * en mémoire avec RLS réelle, et visibilité dans le menu public Supabase. Base restaurée après chaque test.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildCreatePayload,
  categoryInsertInfo,
  createProduct,
  emptyNewProductForm,
  newProductId,
  validateNewProduct,
  variantSlug,
  type NewProductForm,
} from "../src/admin/lib/productCreate";
import { uploadProductPhoto } from "../src/admin/lib/productPhoto";
import { ADMIN_ROUTES, resolveAdminRoute } from "../src/admin/lib/routes";
import { ProductCreateForm } from "../src/admin/pages/ProductCreatePage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu, type MenuRows } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { dishImage } from "../src/menu/menuDisplay";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const NEW_ID = "c0ffee0001";
const SALADES = YUMLO_MENU.filter((it) => it.category === "Salades");
const jpeg = () => new File(["photo-test"], "photo.jpg", { type: "image/jpeg" });

let db: PGlite;
let rows: MenuRows;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const form = (over: Partial<NewProductForm> = {}): NewProductForm => ({
  name: "Salade Test",
  description: "Description test",
  categoryId: "salades",
  price: "59,50",
  isActive: true,
  position: "4",
  variants: [],
  ...over,
});
const storageNames = async () => (await db.query<{ name: string }>("select name from storage.objects order by name")).rows.map((r) => r.name);

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
  rows = await fetchMenuRows(createPgliteSupabase(db, ADMIN));
});
afterEach(async () => {
  await db.exec(`delete from public.products where id = '${NEW_ID}'; delete from storage.objects;`);
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("route et outils", () => {
  it("/admin/products/new : page de création (jamais lue comme un ID), protégée", () => {
    expect(resolveAdminRoute(ADMIN_ROUTES.productNew, { status: "admin", email: "" })).toEqual({ kind: "page", page: "productCreate" });
    expect(resolveAdminRoute(ADMIN_ROUTES.productNew, { status: "signedOut" })).toEqual({ kind: "redirect", to: ADMIN_ROUTES.login });
    expect(resolveAdminRoute(ADMIN_ROUTES.productNew, { status: "notAdmin", email: "" })).toEqual({ kind: "page", page: "denied" });
  });

  it("ID produit : 10 caractères hexadécimaux, aléatoire", () => {
    const ids = new Set(Array.from({ length: 50 }, newProductId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{10}$/);
  });

  it("ID de variante dérivé du libellé, comme les variantes existantes", () => {
    expect(variantSlug("Bœuf")).toBe("boeuf");
    expect(variantSlug("Fruits de mer")).toBe("fruits-de-mer");
    expect(variantSlug("  Crevette Épicée ")).toBe("crevette-epicee");
  });

  it("catégorie normale (N produits → positions 1…N+1) et catégorie automatique", () => {
    expect(categoryInsertInfo(rows, "salades")).toEqual({ count: 8, automatic: false });
    expect(categoryInsertInfo(rows, "plats-thai")).toMatchObject({ automatic: true });
    expect(categoryInsertInfo(rows, "inexistante")).toBeNull();
    const empty = emptyNewProductForm(rows.categories, rows);
    expect(empty).toMatchObject({ categoryId: "starters", position: "14", isActive: true, variants: [] });
  });
});

describe("validation", () => {
  const photo = { type: "image/jpeg", size: 1000 };
  it("formulaire valide (sans variantes, positions 1 et N+1)", () => {
    expect(validateNewProduct(form(), rows, photo)).toEqual({ variants: {} });
    expect(validateNewProduct(form({ position: "1" }), rows, photo)).toEqual({ variants: {} });
    expect(validateNewProduct(form({ position: "9" }), rows, photo)).toEqual({ variants: {} });
  });

  it("photo obligatoire et valide", () => {
    expect(validateNewProduct(form(), rows, null).photo).toBe("La photo est obligatoire pour créer un produit.");
    expect(validateNewProduct(form(), rows, { type: "image/gif", size: 1000 }).photo).toMatch(/^Format non accepté/);
  });

  it("nom, catégorie, prix", () => {
    expect(validateNewProduct(form({ name: " " }), rows, photo).name).toBe("Le nom est obligatoire.");
    expect(validateNewProduct(form({ categoryId: "x" }), rows, photo).categoryId).toBe("Choisissez une catégorie existante.");
    for (const price of ["", "-1", "abc", "10.005"]) expect(validateNewProduct(form({ price }), rows, photo).price, price).toMatch(/^Prix invalide/);
  });

  it("position : 1…N+1 (Salades : 1…9) ; ignorée pour une catégorie automatique", () => {
    expect(validateNewProduct(form({ position: "0" }), rows, photo).position).toBe("La position minimum est 1.");
    expect(validateNewProduct(form({ position: "10" }), rows, photo).position).toBe("La position maximum est 9 (fin de la catégorie).");
    expect(validateNewProduct(form({ position: "1.5" }), rows, photo).position).toMatch(/^Position invalide/);
    expect(validateNewProduct(form({ categoryId: "plats-thai", position: "0" }), rows, photo).position).toBeUndefined();
  });

  it("variantes : libellé, doublons, prix ; prix parent ignoré", () => {
    const v = (key: string, label: string, price = "64", sortOrder = "0") => ({ key, label, price, sortOrder, isActive: true });
    const e = validateNewProduct(form({ price: "", variants: [v("a", "Bœuf"), v("b", "boeuf"), v("c", "", "-1", "x")] }), rows, photo);
    expect(e.price).toBeUndefined();
    expect(e.variants.b.label).toMatch(/déjà utilisé/);
    expect(e.variants.c).toEqual({ label: "Le libellé est obligatoire.", price: "Prix invalide.", sortOrder: "Ordre invalide." });
  });
});

describe("données envoyées à admin_create_product", () => {
  it("sans variantes : prix ; avec variantes : pas de prix parent ; catégorie automatique : position nulle", () => {
    const simple = buildCreatePayload(form(), rows, NEW_ID, "https://x/y.jpg");
    expect(simple).toEqual({
      p_product: { id: NEW_ID, name: "Salade Test", description: "Description test", category_id: "salades", is_active: true, image_url: "https://x/y.jpg", price: 59.5 },
      p_variants: [],
      p_position: 4,
    });
    const withVariants = buildCreatePayload(
      form({ variants: [{ key: "a", label: " Fruits de mer ", price: "79", sortOrder: "1", isActive: false }] }),
      rows,
      NEW_ID,
      "https://x/y.jpg",
    );
    expect(withVariants.p_product).not.toHaveProperty("price");
    expect(withVariants.p_variants).toEqual([{ id: "fruits-de-mer", label: "Fruits de mer", price: 79, sort_order: 1, is_active: false }]);
    expect(buildCreatePayload(form({ categoryId: "plats-thai" }), rows, NEW_ID, "u").p_position).toBeNull();
  });
});

describe("création complète (photo Storage + RPC, RLS réelle)", () => {
  it("produit simple au milieu (position 4) : photo déposée, image_url correcte, visible dans le menu Supabase", async () => {
    const res = await createProduct(admin(), form(), rows, jpeg(), uploadProductPhoto, NEW_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.imageUrl).toMatch(new RegExp(`/menu-images/products/${NEW_ID}/[0-9a-f]{32}\\.jpg$`));
    expect(await storageNames()).toEqual([res.imageUrl.split("/menu-images/")[1]]);

    const salades = rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null))).items.filter((it) => it.category === "Salades");
    expect(salades.map((it) => it.id)).toEqual([...SALADES.slice(0, 3).map((it) => it.id), NEW_ID, ...SALADES.slice(3).map((it) => it.id)]);
    const item = salades[3];
    expect(item).toMatchObject({ name: "Salade Test", priceMAD: "59.50", image: res.imageUrl });
    expect(dishImage(item)).toBe(res.imageUrl);
  });

  it("avec variantes, en première position", async () => {
    const res = await createProduct(
      admin(),
      form({
        position: "1",
        variants: [
          { key: "a", label: "Poulet", price: "64", sortOrder: "0", isActive: true },
          { key: "b", label: "Bœuf", price: "69,5", sortOrder: "1", isActive: true },
        ],
      }),
      rows,
      jpeg(),
      uploadProductPhoto,
      NEW_ID,
    );
    expect(res.ok).toBe(true);
    const item = rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null))).items.filter((it) => it.category === "Salades")[0];
    expect(item).toMatchObject({ id: NEW_ID, priceMAD: "64.00" });
    expect(item.variants).toEqual([
      { id: "poulet", label: "Poulet", priceMAD: "64.00" },
      { id: "boeuf", label: "Bœuf", priceMAD: "69.50" },
    ]);
  });

  it("échec du téléversement → aucun produit créé, aucun appel de création", async () => {
    const before = await readMenuRows(db);
    let rpcCalled = false;
    const client = { ...admin(), rpc: () => ((rpcCalled = true), Promise.resolve({ data: null, error: null })) } as unknown as SupabaseClient;
    const res = await createProduct(client, form(), rows, jpeg(), async () => ({ ok: false, error: "Téléversement impossible : réseau" }), NEW_ID);
    expect(res).toEqual({ ok: false, error: "Téléversement impossible : réseau", failedStep: "photo", uploadedPath: null });
    expect(rpcCalled).toBe(false);
    expect(await readMenuRows(db)).toEqual(before);
  });

  it("échec de la création (RPC) → aucun produit, fichier conservé et signalé", async () => {
    const before = await readMenuRows(db);
    const real = admin();
    const client = { ...real, rpc: () => Promise.resolve({ data: null, error: { message: "réseau indisponible" } }) } as unknown as SupabaseClient;
    const res = await createProduct(client, form(), rows, jpeg(), uploadProductPhoto, NEW_ID);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failedStep).toBe("create");
    expect(res.uploadedPath).toMatch(new RegExp(`^products/${NEW_ID}/`));
    expect(await readMenuRows(db)).toEqual(before);
    expect(await storageNames()).toEqual([res.uploadedPath]);
  });

  it("utilisateur connecté non admin → refusé dès la photo, rien créé", async () => {
    const before = await readMenuRows(db);
    const res = await createProduct(createPgliteSupabase(db, USER), form(), rows, jpeg(), uploadProductPhoto, NEW_ID);
    expect(res).toMatchObject({ ok: false, failedStep: "photo" });
    expect(await readMenuRows(db)).toEqual(before);
    expect(await storageNames()).toEqual([]);
  });

  it("menu statique inchangé, parité de référence intacte", async () => {
    await createProduct(admin(), form(), rows, jpeg(), uploadProductPhoto, NEW_ID);
    expect(getStaticMenu().items.some((it) => it.id === NEW_ID)).toBe(false);
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });
});

describe("rendu du formulaire (sans navigateur)", () => {
  it("photo obligatoire : bouton désactivé tant qu'aucune photo n'est choisie ; position 1…N+1", () => {
    const html = renderToStaticMarkup(<ProductCreateForm rows={rows} client={admin()} onCreated={() => {}} />);
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Créer le produit<\/button>/);
    expect(html).toContain("Ajoutez une photo pour pouvoir créer le produit.");
    expect(html).toMatch(/id="n-position" type="number"[^>]*min="1" max="14"[^>]*value="14"/);
    expect(html).toContain("+ Ajouter une variante");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
  });
});
