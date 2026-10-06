/**
 * Phase 3B : fonction SQL admin_update_product (migration 20261007000000), testée sur PostgreSQL
 * en mémoire avec la RLS réelle (rôles anon / authenticated, auth.uid(), admin_users).
 * Chaque test qui écrit remet la base à l'état du seed : avant/après identiques.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };

const BOBUN = YUMLO_MENU.find((it) => it.name === "Bobun")!;
const RED_CURRY = YUMLO_MENU.find((it) => it.name === "Red Curry Thaï")!;

let db: PGlite;
let admin: SupabaseClient;
let seedDump: string;

type ProductDbRow = Record<string, unknown> & { id: string; price: string; image_url: string; currency: string };
type VariantDbRow = Record<string, unknown> & { product_id: string; id: string; price: string };

async function productRow(id: string): Promise<ProductDbRow> {
  const r = await db.query<ProductDbRow>(
    "select id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active from public.products where id = $1",
    [id],
  );
  return r.rows[0];
}
async function variantRows(productId: string): Promise<VariantDbRow[]> {
  const r = await db.query<VariantDbRow>(
    "select product_id, id, label, price, sort_order, is_active from public.product_variants where product_id = $1 order by id",
    [productId],
  );
  return r.rows;
}
async function auditCount(): Promise<number> {
  return (await db.query<{ n: number }>("select count(*)::int as n from public.audit_log")).rows[0].n;
}
const call = (client: SupabaseClient, productId: string, product: object, variants: object[] = []) =>
  client.rpc("admin_update_product", { p_product_id: productId, p_product: product, p_variants: variants });

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  admin = createPgliteSupabase(db, ADMIN);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  // Restauration exacte : le seed remet toutes les valeurs d'origine.
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
});
afterAll(() => db.close());

describe("admin_update_product — succès", () => {
  it("1. produit simple : nom, description, prix, catégorie, statut, ordre", async () => {
    const before = await productRow(BOBUN.id);
    const res = await call(admin, BOBUN.id, {
      name: "Bobun (test)",
      description: "Description test",
      price: 71.5,
      category_id: "plats-thai",
      is_active: false,
      sort_order: 999,
    });
    expect(res.error).toBeNull();
    const after = await productRow(BOBUN.id);
    expect(after).toMatchObject({
      name: "Bobun (test)",
      description: "Description test",
      price: "71.50",
      category_id: "plats-thai",
      is_active: false,
      sort_order: 999,
    });
    // 8, 9, 10 : id, image_url, vignettes et currency intacts.
    for (const k of ["id", "image_url", "thumb_small_url", "thumb_large_url", "currency"] as const) {
      expect(after[k], k).toBe(before[k]);
    }
    // Valeurs effectivement enregistrées renvoyées par la fonction.
    expect((res.data as { product: ProductDbRow }).product).toMatchObject({ id: BOBUN.id, name: "Bobun (test)", price: 71.5 });
  });

  it("2. produit à variantes : une variante modifiée, les autres intactes", async () => {
    const beforeProduct = await productRow(RED_CURRY.id);
    const beforeVariants = await variantRows(RED_CURRY.id);
    const res = await call(admin, RED_CURRY.id, { name: "Red Curry Thaï (test)" }, [
      { id: "boeuf", label: "Bœuf (test)", price: 76, sort_order: 9, is_active: false },
    ]);
    expect(res.error).toBeNull();
    const afterVariants = await variantRows(RED_CURRY.id);
    expect(afterVariants.map((v) => v.id)).toEqual(beforeVariants.map((v) => v.id));
    for (const v of afterVariants) {
      const old = beforeVariants.find((x) => x.id === v.id)!;
      if (v.id === "boeuf") expect(v).toMatchObject({ label: "Bœuf (test)", price: "76.00", sort_order: 9, is_active: false });
      else expect(v).toEqual(old);
    }
    const afterProduct = await productRow(RED_CURRY.id);
    // 11 : prix parent inchangé.
    expect(afterProduct.price).toBe(beforeProduct.price);
    expect(afterProduct.image_url).toBe(beforeProduct.image_url);
  });

  it("12. audit_log : une entrée avec admin, action, entité et état avant/après", async () => {
    const count = await auditCount();
    await call(admin, BOBUN.id, { price: 70 });
    expect(await auditCount()).toBe(count + 1);
    const log = (
      await db.query<{ user_id: string; action: string; entity_type: string; entity_id: string; payload: { before: { product: { price: number } }; after: { product: { price: number } } } }>(
        "select user_id, action, entity_type, entity_id, payload from public.audit_log order by created_at desc limit 1",
      )
    ).rows[0];
    expect(log).toMatchObject({ user_id: ADMIN.id, action: "product.update", entity_type: "product", entity_id: BOBUN.id });
    expect(log.payload.before.product.price).toBe(69);
    expect(log.payload.after.product.price).toBe(70);
  });
});

describe("admin_update_product — refus et rollback (aucune modification)", () => {
  /** Exécute un appel qui doit échouer et vérifie que rien n'a bougé (produits, variantes, journal). */
  async function expectRejectedWithoutChange(
    client: SupabaseClient,
    productId: string,
    product: object,
    variants: object[],
    message: RegExp,
  ) {
    const dump = JSON.stringify(await readMenuRows(db));
    const logs = await auditCount();
    const res = await call(client, productId, product, variants);
    expect(res.error, "doit échouer").not.toBeNull();
    expect(res.error!.message).toMatch(message);
    expect(JSON.stringify(await readMenuRows(db))).toBe(dump);
    expect(await auditCount()).toBe(logs);
  }

  it("3. utilisateur connecté non admin → refus", async () => {
    await expectRejectedWithoutChange(createPgliteSupabase(db, USER), BOBUN.id, { name: "Piratage" }, [], /Accès refusé/);
  });

  it("3b. visiteur anonyme → refus (pas de droit d'exécution)", async () => {
    await expectRejectedWithoutChange(createPgliteSupabase(db, null), BOBUN.id, { name: "Piratage" }, [], /permission denied/);
  });

  it("4. catégorie inexistante → rollback", async () => {
    await expectRejectedWithoutChange(admin, BOBUN.id, { name: "X", category_id: "inexistante" }, [], /Catégorie inexistante/);
  });

  it("5. variante d'un autre produit → rollback", async () => {
    await expectRejectedWithoutChange(admin, RED_CURRY.id, { name: "X" }, [{ id: "inexistante", label: "Y" }], /Variante inconnue/);
  });

  it("6. prix négatif (produit ou variante) → rollback", async () => {
    await expectRejectedWithoutChange(admin, BOBUN.id, { price: -1 }, [], /Prix invalide/);
    await expectRejectedWithoutChange(admin, RED_CURRY.id, {}, [{ id: "poulet", price: -5 }], /Prix invalide/);
    await expectRejectedWithoutChange(admin, BOBUN.id, { price: 10.005 }, [], /Prix invalide/);
  });

  it("7. sort_order invalide (négatif, décimal, texte) → rollback", async () => {
    await expectRejectedWithoutChange(admin, BOBUN.id, { sort_order: -1 }, [], /Ordre invalide/);
    await expectRejectedWithoutChange(admin, BOBUN.id, { sort_order: 1.5 }, [], /Ordre invalide/);
    await expectRejectedWithoutChange(admin, RED_CURRY.id, {}, [{ id: "poulet", sort_order: "2" }], /Ordre invalide/);
  });

  it("8–10. id, image_url et currency ne sont jamais modifiables", async () => {
    await expectRejectedWithoutChange(admin, BOBUN.id, { id: "autre-id" }, [], /non modifiable : id/);
    await expectRejectedWithoutChange(admin, BOBUN.id, { image_url: "/x.jpg" }, [], /non modifiable : image_url/);
    await expectRejectedWithoutChange(admin, BOBUN.id, { currency: "EUR" }, [], /non modifiable : currency/);
    await expectRejectedWithoutChange(admin, RED_CURRY.id, {}, [{ id: "poulet", product_id: BOBUN.id }], /non modifiable : product_id/);
  });

  it("11. prix parent refusé pour un produit à variantes", async () => {
    await expectRejectedWithoutChange(admin, RED_CURRY.id, { price: 1 }, [], /Produit à variantes/);
  });

  it("nom vide, produit introuvable, variante en double → rollback", async () => {
    await expectRejectedWithoutChange(admin, BOBUN.id, { name: "   " }, [], /nom du produit est obligatoire/);
    await expectRejectedWithoutChange(admin, "inexistant", { name: "X" }, [], /Produit introuvable/);
    await expectRejectedWithoutChange(admin, RED_CURRY.id, {}, [{ id: "poulet", price: 70 }, { id: "poulet", price: 71 }], /Variante en double/);
  });

  it("13. erreur AU MILIEU de l'opération : produit et 1re variante déjà écrits, puis échec → tout est annulé", async () => {
    // Le produit est mis à jour, la variante « poulet » aussi, puis la 2e variante est invalide.
    await expectRejectedWithoutChange(
      admin,
      RED_CURRY.id,
      { name: "Nom qui ne doit pas rester", is_active: false },
      [
        { id: "poulet", label: "Libellé qui ne doit pas rester", price: 1 },
        { id: "boeuf", label: "" },
      ],
      /libellé de la variante boeuf est obligatoire/,
    );
  });

  it("13b. échec à la toute dernière étape (audit_log) → tout est annulé", async () => {
    // Simule un refus d'écriture dans audit_log : produit et variantes sont déjà modifiés à ce stade.
    await db.exec("revoke insert on public.audit_log from authenticated");
    try {
      await expectRejectedWithoutChange(
        admin,
        RED_CURRY.id,
        { name: "Nom qui ne doit pas rester" },
        [{ id: "poulet", price: 1 }],
        /permission denied for table audit_log/,
      );
    } finally {
      await db.exec("grant insert on public.audit_log to authenticated");
    }
  });
});
