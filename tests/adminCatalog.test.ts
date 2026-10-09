/**
 * Phase 3E : admin_save_product et admin_delete_product (migration 20261009000000) sur PostgreSQL
 * en mémoire, RLS réelle. Après chaque test, la base est remise à l'état du seed (vérifié).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MenuRows, ProductRow } from "../src/data/menuRows";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const SALADES = YUMLO_MENU.filter((it) => it.category === "Salades").map((it) => it.id); // 8, sort_order 41…48
const CALIFORNIA = YUMLO_MENU.filter((it) => it.category === "California Roll").map((it) => it.id); // 14
const RIZ = YUMLO_MENU.find((it) => it.name === "Riz Cantonais")!; // 5 variantes, prix parent statique 49
const ASSORT = YUMLO_MENU.filter((it) => it.category === "Assortiments").map((it) => it.id);

let db: PGlite;
let admin: SupabaseClient;
let seedDump: string;

const save = (client: SupabaseClient, id: string, product: object = {}, variants: object[] | null = null, position: number | null = null) =>
  client.rpc("admin_save_product", { p_product_id: id, p_product: product, p_variants: variants, p_position: position });
const del = (client: SupabaseClient, id: string) => client.rpc("admin_delete_product", { p_product_id: id });
const rows = () => readMenuRows(db);
/** Ordre affiché d'une catégorie (sort_order puis id) : ids + valeurs. */
const order = (r: MenuRows, categoryId: string) =>
  r.products.filter((p) => p.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1));
const ids = (r: MenuRows, c: string) => order(r, c).map((p) => p.id);
const product = (r: MenuRows, id: string) => r.products.find((p) => p.id === id)!;
const variants = (r: MenuRows, id: string) => r.variants.filter((v) => v.product_id === id).sort((a, b) => a.sort_order - b.sort_order);
const auditCount = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.audit_log")).rows[0].n;
const lastAudit = async () =>
  (await db.query<{ action: string; entity_id: string; user_id: string; payload: Record<string, any> }>(
    "select action, entity_id, user_id, payload from public.audit_log order by created_at desc limit 1",
  )).rows[0];
/** Toutes les lignes hors catégories indiquées, pour vérifier qu'elles n'ont pas bougé. */
const outside = (r: MenuRows, categories: string[]) =>
  JSON.stringify({ p: r.products.filter((p) => !categories.includes(p.category_id)), v: r.variants, c: r.categories });

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  admin = createPgliteSupabase(db, ADMIN);
  seedDump = JSON.stringify(await rows());
});
afterEach(async () => {
  await runSeed(db); // recrée aussi un produit supprimé et ses variantes
  await db.exec(`delete from public.product_variants where product_id = '${RIZ.id}' and id not in (${RIZ.variants!.map((v) => `'${v.id}'`).join(",")})`);
  expect(JSON.stringify(await rows()), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

async function expectRejected(run: () => PromiseLike<{ error: { message: string } | null }>, message: RegExp) {
  const dump = JSON.stringify(await rows());
  const logs = await auditCount();
  const res = await run();
  expect(res.error, "doit échouer").not.toBeNull();
  expect(res.error!.message).toMatch(message);
  expect(JSON.stringify(await rows())).toBe(dump);
  expect(await auditCount()).toBe(logs);
}

describe("suppression d'un produit", () => {
  it("admin : produit absent, variantes supprimées, suivants remontés sans trou, autres catégories intactes", async () => {
    const before = await rows();
    const target = SALADES[2]; // 3e de Salades
    const res = await del(admin, target);
    expect(res.error).toBeNull();
    const after = await rows();
    expect(after.products.some((p) => p.id === target)).toBe(false);
    expect(after.variants.some((v) => v.product_id === target)).toBe(false);
    expect(ids(after, "salades")).toEqual(SALADES.filter((id) => id !== target));
    expect(order(after, "salades").map((p) => p.sort_order)).toEqual([41, 42, 43, 44, 45, 46, 47]); // pas de trou
    expect(outside(after, ["salades"])).toBe(outside(before, ["salades"]));
  });

  it("produit à variantes : ses variantes suivent la cascade ; journal product.delete avec l'état avant", async () => {
    const res = await del(admin, RIZ.id);
    expect(res.error).toBeNull();
    const after = await rows();
    expect(after.variants.filter((v) => v.product_id === RIZ.id)).toEqual([]);
    expect(after.variants).toHaveLength(67 - RIZ.variants!.length);
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "product.delete", entity_id: RIZ.id, user_id: ADMIN.id });
    expect(log.payload.before.product.name).toBe("Riz Cantonais");
    expect(log.payload.before.variants).toHaveLength(RIZ.variants!.length);
  });

  it("catégorie automatique (Assortiments) : aucun décalage", async () => {
    const before = await rows();
    expect((await del(admin, ASSORT[0])).error).toBeNull();
    const after = await rows();
    for (const p of order(after, "assortiments")) expect(p.sort_order).toBe(product(before, p.id).sort_order);
  });

  it("non-admin, visiteur, produit introuvable, échec du journal → rien n'est supprimé", async () => {
    await expectRejected(() => del(createPgliteSupabase(db, USER), SALADES[0]), /Accès refusé/);
    await expectRejected(() => del(createPgliteSupabase(db, null), SALADES[0]), /permission denied/);
    await expectRejected(() => del(admin, "inexistant"), /Produit introuvable/);
    await db.exec("revoke insert on public.audit_log from authenticated");
    try {
      await expectRejected(() => del(admin, SALADES[2]), /permission denied for table audit_log/);
    } finally {
      await db.exec("grant insert on public.audit_log to authenticated");
    }
  });
});

describe("variantes d'un produit existant (liste finale, une transaction)", () => {
  const current = () =>
    RIZ.variants!.map((v) => ({ id: v.id, label: v.label, price: Number(v.priceMAD), is_active: true }));

  it("variantes non fournies → inchangées, prix parent statique (49) conservé", async () => {
    expect((await save(admin, RIZ.id, { name: "Riz Cantonais" })).error).toBeNull();
    const after = await rows();
    expect(product(after, RIZ.id).price).toBe("49.00");
    expect(variants(after, RIZ.id).map((v) => v.id)).toEqual(RIZ.variants!.map((v) => v.id));
  });

  it("ajout, modification, suppression et réordonnancement en UNE sauvegarde ; IDs conservés", async () => {
    // Supprime « boeuf », ajoute « saumon » en 2e, modifie « poulet », met « fruits-de-mer » en tête.
    const v = current();
    const finalList = [
      { ...v.find((x) => x.id === "fruits-de-mer")!, price: 72 },
      { id: "saumon", label: "Saumon", price: 66 },
      { ...v.find((x) => x.id === "poulet")!, label: "Poulet grillé" },
      v.find((x) => x.id === "vegetarien")!,
      v.find((x) => x.id === "crevettes")!,
    ];
    const res = await save(admin, RIZ.id, {}, finalList);
    expect(res.error).toBeNull();
    const after = variants(await rows(), RIZ.id);
    expect(after.map((x) => [x.id, x.label, x.price, x.sort_order])).toEqual([
      ["fruits-de-mer", "Fruits de mer", "72.00", 0],
      ["saumon", "Saumon", "66.00", 1],
      ["poulet", "Poulet grillé", "54.00", 2],
      ["vegetarien", "Végétarien", "44.00", 3],
      ["crevettes", "Crevettes", "64.00", 4],
    ]);
    const log = await lastAudit();
    expect(log.payload.changes).toMatchObject({
      variants_created: ["saumon"],
      variants_deleted: ["boeuf"],
      variants_updated: ["fruits-de-mer", "poulet", "vegetarien", "crevettes"],
    });
  });

  it("variante en double ou identifiant invalide → refus, rien n'est modifié", async () => {
    const v = current();
    await expectRejected(() => save(admin, RIZ.id, {}, [...v, { id: "poulet", label: "Poulet ", price: 1 }]), /Cette variante existe déjà/);
    await expectRejected(() => save(admin, RIZ.id, {}, [...v, { id: "Poulet Épicé", label: "x", price: 1 }]), /Identifiant de variante invalide/);
    await expectRejected(() => save(admin, RIZ.id, {}, [{ ...v[0], label: " " }]), /libellé de la variante/);
    await expectRejected(() => save(admin, RIZ.id, {}, [{ ...v[0], price: -1 }]), /Prix invalide pour la variante/);
    await expectRejected(() => save(admin, RIZ.id, {}, [{ ...v[0], sort_order: 1 }]), /non modifiable : sort_order/);
  });

  describe("prix parent = variante active la moins chère", () => {
    const price = async () => product(await rows(), RIZ.id).price;
    it("ajout d'une variante moins chère / plus chère", async () => {
      await save(admin, RIZ.id, {}, [...current(), { id: "nature", label: "Nature", price: 39 }]);
      expect(await price()).toBe("39.00");
      await save(admin, RIZ.id, {}, [...current(), { id: "royal", label: "Royal", price: 99 }]);
      expect(await price()).toBe("44.00");
    });
    it("suppression / modification / désactivation de la moins chère", async () => {
      await save(admin, RIZ.id, {}, current().filter((v) => v.id !== "vegetarien"));
      expect(await price()).toBe("54.00");
      await runSeed(db);
      await save(admin, RIZ.id, {}, current().map((v) => (v.id === "vegetarien" ? { ...v, price: 41 } : v)));
      expect(await price()).toBe("41.00");
      await save(admin, RIZ.id, {}, current().map((v) => (v.id === "vegetarien" ? { ...v, is_active: false } : v)));
      expect(await price()).toBe("54.00");
      await save(admin, RIZ.id, {}, current().map((v) => ({ ...v, is_active: false })));
      expect(await price()).toBe("44.00"); // aucune active : repli sur toutes les variantes
    });
    it("prix saisi avec variantes refusé ; toutes les variantes retirées → prix saisi accepté", async () => {
      await expectRejected(() => save(admin, RIZ.id, { price: 10 }, current()), /Produit à variantes/);
      expect((await save(admin, RIZ.id, { price: 50 }, [])).error).toBeNull();
      const after = await rows();
      expect(product(after, RIZ.id).price).toBe("50.00");
      expect(variants(after, RIZ.id)).toEqual([]);
    });
  });
});

describe("position dans la catégorie (atomique)", () => {
  it("déplacement vers le bas (2 → 5) puis vers le haut (5 → 2) : mêmes valeurs, retour exact", async () => {
    const target = SALADES[1];
    expect((await save(admin, target, {}, null, 5)).error).toBeNull();
    let r = await rows();
    expect(ids(r, "salades")).toEqual([SALADES[0], SALADES[2], SALADES[3], SALADES[4], target, ...SALADES.slice(5)]);
    expect(order(r, "salades").map((p) => p.sort_order)).toEqual([41, 42, 43, 44, 45, 46, 47, 48]);
    expect((await save(admin, target, {}, null, 2)).error).toBeNull();
    r = await rows();
    expect(JSON.stringify(r)).toBe(seedDump);
  });

  it("vers la première et la dernière place ; position hors limites refusée", async () => {
    await save(admin, SALADES[5], {}, null, 1);
    expect(ids(await rows(), "salades")[0]).toBe(SALADES[5]);
    await runSeed(db);
    await save(admin, SALADES[0], {}, null, 8);
    expect(ids(await rows(), "salades")[7]).toBe(SALADES[0]);
    await runSeed(db);
    await expectRejected(() => save(admin, SALADES[0], {}, null, 0), /Position invalide : entre 1 et 8/);
    await expectRejected(() => save(admin, SALADES[0], {}, null, 9), /Position invalide/);
  });

  it("catégorie automatique : position ignorée", async () => {
    const before = await rows();
    expect((await save(admin, ASSORT[3], {}, null, 1)).error).toBeNull();
    expect(order(await rows(), "assortiments").map((p) => p.sort_order)).toEqual(order(before, "assortiments").map((p) => p.sort_order));
  });

  it("valeurs en double : ordre final déterministe, sans doublon", async () => {
    await db.exec(`update public.products set sort_order = 41 where id = '${SALADES[1]}'`); // 2 produits à 41
    const before = ids(await rows(), "salades");
    expect((await save(admin, SALADES[4], {}, null, 1)).error).toBeNull();
    const r = await rows();
    expect(ids(r, "salades")).toEqual([SALADES[4], ...before.filter((id) => id !== SALADES[4])]);
    const sorts = order(r, "salades").map((p) => p.sort_order);
    expect(new Set(sorts).size).toBe(8);
  });
});

describe("changement de catégorie avec position", () => {
  it("Salades → California en 3e position : les deux catégories cohérentes, sans trou ni doublon", async () => {
    const before = await rows();
    const moved = SALADES[1];
    const res = await save(admin, moved, { category_id: "california-roll" }, null, 3);
    expect(res.error).toBeNull();
    const after = await rows();
    expect(ids(after, "salades")).toEqual(SALADES.filter((id) => id !== moved));
    expect(order(after, "salades").map((p) => p.sort_order)).toEqual([41, 42, 43, 44, 45, 46, 47]);
    expect(ids(after, "california-roll")).toEqual([CALIFORNIA[0], CALIFORNIA[1], moved, ...CALIFORNIA.slice(2)]);
    const cal = order(after, "california-roll").map((p) => p.sort_order);
    expect(new Set(cal).size).toBe(15);
    const { sort_order: _a, category_id: _b, ...movedAfter } = product(after, moved) as ProductRow;
    const { sort_order: _c, category_id: _d, ...movedBefore } = product(before, moved) as ProductRow;
    expect(movedAfter).toEqual(movedBefore); // seuls catégorie et position changent
    expect(outside(after, ["salades", "california-roll"])).toBe(outside(before, ["salades", "california-roll"]));
    expect((await lastAudit()).payload.changes.category_changed).toBe(true);
  });

  it("sans position : en dernier ; vers une catégorie automatique : en dernier, sans décalage", async () => {
    await save(admin, SALADES[0], { category_id: "california-roll" });
    expect(ids(await rows(), "california-roll").at(-1)).toBe(SALADES[0]);
    await runSeed(db);
    const before = await rows();
    await save(admin, SALADES[0], { category_id: "assortiments" }, null, 1);
    const after = await rows();
    expect(ids(after, "assortiments").at(-1)).toBe(SALADES[0]);
    for (const id of ASSORT) expect(product(after, id).sort_order).toBe(product(before, id).sort_order);
  });

  it("position hors limites dans la nouvelle catégorie → rollback complet (ancienne catégorie intacte)", async () => {
    await expectRejected(() => save(admin, SALADES[1], { category_id: "california-roll", name: "X" }, null, 16), /Position invalide : entre 1 et 15/);
  });
});

describe("photo, journal et sécurité", () => {
  it("photo seule : image_url enregistrée dans la transaction, journal photo_changed, rien d'autre", async () => {
    const before = await rows();
    const url = "https://test.supabase.co/storage/v1/object/public/menu-images/products/x/y.jpg";
    expect((await save(admin, SALADES[0], { image_url: url })).error).toBeNull();
    const after = await rows();
    expect(product(after, SALADES[0]).image_url).toBe(url);
    expect({ ...product(after, SALADES[0]), image_url: "" }).toEqual({ ...product(before, SALADES[0]), image_url: "" });
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "product.update", entity_id: SALADES[0] });
    expect(log.payload.changes.photo_changed).toBe(true);
    expect(log.payload.changes.variants_created).toEqual([]);
  });

  it("une seule entrée de journal par sauvegarde", async () => {
    const count = await auditCount();
    await save(admin, RIZ.id, { name: "Riz" }, [{ id: "poulet", label: "Poulet", price: 54 }], 1);
    expect(await auditCount()).toBe(count + 1);
  });

  it("anonyme et non-admin refusés ; échec du journal → tout annulé (variantes, position, catégorie)", async () => {
    await expectRejected(() => save(createPgliteSupabase(db, null), SALADES[0], { name: "X" }), /permission denied/);
    await expectRejected(() => save(createPgliteSupabase(db, USER), SALADES[0], { name: "X" }), /Accès refusé/);
    await db.exec("revoke insert on public.audit_log from authenticated");
    try {
      await expectRejected(
        () => save(admin, RIZ.id, { category_id: "salades", name: "X" }, [{ id: "saumon", label: "Saumon", price: 1 }], 2),
        /permission denied for table audit_log/,
      );
    } finally {
      await db.exec("grant insert on public.audit_log to authenticated");
    }
  });

  it("champs interdits (id, devise, ordre interne) refusés", async () => {
    await expectRejected(() => save(admin, SALADES[0], { id: "autre" }), /non modifiable : id/);
    await expectRejected(() => save(admin, SALADES[0], { currency: "EUR" }), /non modifiable : currency/);
    await expectRejected(() => save(admin, SALADES[0], { sort_order: 1 }), /non modifiable : sort_order/);
    await expectRejected(() => save(admin, SALADES[0], { image_url: " " }), /Photo invalide/);
  });
});
