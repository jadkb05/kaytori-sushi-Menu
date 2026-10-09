/**
 * Phase 3D : fonction SQL admin_create_product (migration 20261008000000), PostgreSQL en mémoire
 * avec la RLS réelle. Après chaque test, la base est remise à l'état du seed (vérifié).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { dishImage } from "../src/menu/menuDisplay";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const SALADES = YUMLO_MENU.filter((it) => it.category === "Salades");
const NEW_ID = "f00dcafe01";
const IMAGE = "https://test.supabase.co/storage/v1/object/public/menu-images/products/f00dcafe01/abc.jpg";

let db: PGlite;
let admin: SupabaseClient;
let seedDump: string;

const base = (over: Record<string, unknown> = {}) => ({
  id: NEW_ID,
  name: "Salade Test",
  description: "Description test",
  price: 59,
  category_id: "salades",
  is_active: true,
  image_url: IMAGE,
  ...over,
});
const create = (client: SupabaseClient, product: object, variants: object[] = [], position: number | null = null) =>
  client.rpc("admin_create_product", { p_product: product, p_variants: variants, p_position: position });
const publicCategory = async (name: string) =>
  rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null))).items.filter((it) => it.category === name);
const auditCount = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.audit_log")).rows[0].n;

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  admin = createPgliteSupabase(db, ADMIN);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  // Restauration : suppression du produit créé (ses variantes suivent) + seed (sort_order d'origine).
  await db.exec(`delete from public.products where id = '${NEW_ID}'`);
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("création réussie", () => {
  it("produit simple en dernière position (N+1) : aucun produit décalé", async () => {
    const before = await readMenuRows(db);
    const res = await create(admin, base(), [], SALADES.length + 1);
    expect(res.error).toBeNull();
    const after = await readMenuRows(db);
    const created = after.products.find((p) => p.id === NEW_ID)!;
    expect(created).toMatchObject({ name: "Salade Test", description: "Description test", price: "59.00", currency: "MAD", category_id: "salades", image_url: IMAGE, is_active: true, sort_order: 49 });
    expect(after.products.filter((p) => p.id !== NEW_ID)).toEqual(before.products); // existants intacts
    expect((await publicCategory("Salades")).map((it) => it.id)).toEqual([...SALADES.map((it) => it.id), NEW_ID]);
  });

  it("position 1 : premier, les 8 autres décalés d'un cran dans le même ordre, sans doublon", async () => {
    expect((await create(admin, base(), [], 1)).error).toBeNull();
    const order = await publicCategory("Salades");
    expect(order.map((it) => it.id)).toEqual([NEW_ID, ...SALADES.map((it) => it.id)]);
    const sorts = (await readMenuRows(db)).products.filter((p) => p.category_id === "salades").map((p) => p.sort_order);
    expect(new Set(sorts).size).toBe(sorts.length);
  });

  it("insertion au milieu (position 4) : 3 produits avant, 5 après, ordre conservé", async () => {
    expect((await create(admin, base(), [], 4)).error).toBeNull();
    const ids = (await publicCategory("Salades")).map((it) => it.id);
    expect(ids).toEqual([...SALADES.slice(0, 3).map((it) => it.id), NEW_ID, ...SALADES.slice(3).map((it) => it.id)]);
    // Les produits existants ne changent que de sort_order (prix, images, descriptions intacts).
    const byId = new Map(SALADES.map((it) => [it.id, it]));
    for (const it of await publicCategory("Salades")) if (it.id !== NEW_ID) expect(it).toEqual(byId.get(it.id));
  });

  it("avec variantes : prix parent = variante ACTIVE la moins chère (Phase 3E), variantes créées dans l'ordre", async () => {
    const res = await create(admin, base({ price: undefined }), [
      { id: "poulet", label: "Poulet", price: 64, sort_order: 0 },
      { id: "fruits-de-mer", label: "Fruits de mer", price: 59.5, sort_order: 1, is_active: false },
    ], 2);
    expect(res.error).toBeNull();
    const rows = await readMenuRows(db);
    // « Fruits de mer » (59,50) est inactive : le prix parent est celui de la variante active la moins chère.
    expect(rows.products.find((p) => p.id === NEW_ID)!.price).toBe("64.00");
    expect(rows.variants.filter((v) => v.product_id === NEW_ID)).toEqual([
      { product_id: NEW_ID, id: "poulet", label: "Poulet", price: "64.00", sort_order: 0, is_active: true },
      { product_id: NEW_ID, id: "fruits-de-mer", label: "Fruits de mer", price: "59.50", sort_order: 1, is_active: false },
    ]);
  });

  it("catégorie à ordre automatique (Assortiments) : position ignorée, ajout en fin", async () => {
    const before = await readMenuRows(db);
    const res = await create(admin, base({ category_id: "assortiments" }), [], 1);
    expect(res.error).toBeNull();
    const after = await readMenuRows(db);
    const maxAssort = Math.max(...before.products.filter((p) => p.category_id === "assortiments").map((p) => p.sort_order));
    expect(after.products.find((p) => p.id === NEW_ID)!.sort_order).toBe(maxAssort + 1);
    expect(after.products.filter((p) => p.id !== NEW_ID)).toEqual(before.products);
  });

  it("journal : une entrée product.create avec le produit, la position et les décalages", async () => {
    const count = await auditCount();
    await create(admin, base(), [], 1);
    expect(await auditCount()).toBe(count + 1);
    const log = (await db.query<{ action: string; entity_id: string; user_id: string; payload: { position: number; shifted: unknown[] } }>(
      "select action, entity_id, user_id, payload from public.audit_log order by created_at desc limit 1",
    )).rows[0];
    expect(log).toMatchObject({ action: "product.create", entity_id: NEW_ID, user_id: ADMIN.id });
    expect(log.payload.position).toBe(1);
    expect(log.payload.shifted).toHaveLength(SALADES.length);
  });

  it("menu public Supabase : produit visible avec sa photo ; menu statique inchangé", async () => {
    await create(admin, base(), [], 4);
    const item = (await publicCategory("Salades")).find((it) => it.id === NEW_ID)!;
    expect(item).toMatchObject({ name: "Salade Test", priceMAD: "59.00", image: IMAGE });
    expect(dishImage(item)).toBe(IMAGE);
    expect(getStaticMenu().items.some((it) => it.id === NEW_ID)).toBe(false);
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });
});

describe("refus et rollback : la base n'est jamais modifiée", () => {
  async function expectRejected(client: SupabaseClient, product: object, variants: object[], position: number | null, message: RegExp) {
    const dump = JSON.stringify(await readMenuRows(db));
    const logs = await auditCount();
    const res = await create(client, product, variants, position);
    expect(res.error, "doit échouer").not.toBeNull();
    expect(res.error!.message).toMatch(message);
    expect(JSON.stringify(await readMenuRows(db))).toBe(dump);
    expect(await auditCount()).toBe(logs);
  }

  it("utilisateur non admin / visiteur", async () => {
    await expectRejected(createPgliteSupabase(db, USER), base(), [], 1, /Accès refusé/);
    await expectRejected(createPgliteSupabase(db, null), base(), [], 1, /permission denied/);
  });

  it("nom, catégorie, prix, photo", async () => {
    await expectRejected(admin, base({ name: "  " }), [], 1, /nom du produit est obligatoire/);
    await expectRejected(admin, base({ category_id: "inexistante" }), [], 1, /Catégorie inexistante/);
    await expectRejected(admin, base({ category_id: undefined }), [], 1, /catégorie est obligatoire/);
    await expectRejected(admin, base({ price: -1 }), [], 1, /Prix invalide/);
    await expectRejected(admin, base({ price: 1.234 }), [], 1, /Prix invalide/);
    await expectRejected(admin, base({ price: undefined }), [], 1, /prix est obligatoire/);
    await expectRejected(admin, base({ image_url: undefined }), [], 1, /photo est obligatoire/);
    await expectRejected(admin, base({ image_url: "  " }), [], 1, /photo est obligatoire/);
  });

  it("ID invalide ou déjà utilisé, champ non autorisé", async () => {
    await expectRejected(admin, base({ id: "PAS-HEX" }), [], 1, /Identifiant produit invalide/);
    await expectRejected(admin, base({ id: SALADES[0].id }), [], 1, /déjà utilisé/);
    await expectRejected(admin, base({ sort_order: 1 }), [], 1, /non autorisé : sort_order/);
    await expectRejected(admin, base({ currency: "EUR" }), [], 1, /non autorisé : currency/);
  });

  it("position hors limites (0, N+2, absente) dans une catégorie normale", async () => {
    await expectRejected(admin, base(), [], 0, /Position invalide : entre 1 et 9/);
    await expectRejected(admin, base(), [], SALADES.length + 2, /Position invalide/);
    await expectRejected(admin, base(), [], null, /Position invalide/);
  });

  it("variantes invalides, prix parent avec variantes", async () => {
    const ok = { id: "poulet", label: "Poulet", price: 64, sort_order: 0 };
    await expectRejected(admin, base(), [ok], 1, /prix se définit au niveau des variantes/);
    const p = base({ price: undefined });
    await expectRejected(admin, p, [ok, { ...ok }], 1, /même identifiant/);
    await expectRejected(admin, p, [{ ...ok, label: " " }], 1, /libellé de la variante poulet est obligatoire/);
    await expectRejected(admin, p, [{ ...ok, price: -2 }], 1, /Prix invalide pour la variante/);
    await expectRejected(admin, p, [{ ...ok, sort_order: 1.5 }], 1, /Ordre invalide pour la variante/);
    await expectRejected(admin, p, [{ ...ok, id: "Poulet Épicé" }], 1, /Identifiant de variante invalide/);
  });

  it("échec à la dernière étape (journal) après décalage + produit + variantes → tout est annulé", async () => {
    await db.exec("revoke insert on public.audit_log from authenticated");
    try {
      await expectRejected(
        admin,
        base({ price: undefined }),
        [{ id: "poulet", label: "Poulet", price: 64, sort_order: 0 }],
        1,
        /permission denied for table audit_log/,
      );
    } finally {
      await db.exec("grant insert on public.audit_log to authenticated");
    }
  });
});
