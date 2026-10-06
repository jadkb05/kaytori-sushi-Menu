/**
 * Position dans la catégorie : l'admin saisit une position humaine (1 = premier) ; la conversion
 * vers sort_order redistribue les valeurs existantes de la catégorie. Sauvegarde via la RPC
 * admin_update_product (PostgreSQL en mémoire, RLS réelle), menu Supabase réordonné, statique intact.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import {
  buildEditPlan,
  isFormDirty,
  loadProductForEdit,
  planCategoryReorder,
  positionError,
  saveProductEdits,
  validateProductForm,
  type PhotoSelection,
  type ProductEditData,
} from "../src/admin/lib/productEditor";
import { ProductEditPage } from "../src/admin/pages/ProductEditPage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu, type ProductRow } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const SALADES = YUMLO_MENU.filter((it) => it.category === "Salades");
const FOURTH = SALADES[3]; // « Salade Exotic Chicken », actuellement 4e sur 8
const PLATS_THAI = YUMLO_MENU.find((it) => it.category === "Plats Thaï")!;

const noPhoto = {
  uploadPhoto: async () => ({ ok: false as const, error: "inutilisé" }),
  saveImageUrl: async () => ({ ok: false as const, error: "inutilisé" }),
};

let db: PGlite;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const edit = async (id: string) => loadProductForEdit(await fetchMenuRows(admin()), id)!;
/** Ordre affiché de « Salades » dans le menu public en mode Supabase (visiteur anonyme). */
const publicSalades = async () =>
  rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null))).items.filter((it) => it.category === "Salades");

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'); insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("position affichée", () => {
  it("position humaine (4 sur 8), pas la valeur sort_order interne", async () => {
    const e = await edit(FOURTH.id);
    expect(e.product.sort_order).toBe(44); // valeur interne, différente de la position
    expect(e.position).toEqual({ position: 4, total: 8, automatic: false });
    expect(e.form.position).toBe("4");
  });

  it("catégorie à ordre automatique (Plats Thaï) : position non éditable", async () => {
    const e = await edit(PLATS_THAI.id);
    expect(e.position.automatic).toBe(true);
    expect(validateProductForm({ ...e.form, position: "0" }, e).position).toBeUndefined();
    expect(buildEditPlan(e, { ...e.form, position: "1" })).toEqual({ payload: { product: {}, variants: [] }, siblingSortOrders: [] });
  });
});

describe("conversion position → sort_order", () => {
  const siblings = (values: number[]): ProductRow[] =>
    values.map((sort_order, i) => ({ id: `p${i + 1}`, sort_order }) as ProductRow);

  it("4 → 1 : les valeurs existantes sont redistribuées, seuls les produits 1 à 4 changent", () => {
    const s = siblings([41, 42, 43, 44, 45, 46, 47, 48]);
    expect(planCategoryReorder(s, "p4", 1)).toEqual([
      { id: "p4", sort_order: 41 },
      { id: "p1", sort_order: 42 },
      { id: "p2", sort_order: 43 },
      { id: "p3", sort_order: 44 },
    ]);
    expect(planCategoryReorder(s, "p4", 4)).toEqual([]);
  });

  it("aller-retour : revenir à la position d'origine redonne exactement les valeurs d'origine", () => {
    const s = siblings([41, 42, 43, 44, 45]);
    const moved = s.map((p) => ({ ...p, sort_order: planCategoryReorder(s, "p4", 1).find((c) => c.id === p.id)?.sort_order ?? p.sort_order }));
    const back = moved.map((p) => ({ ...p, sort_order: planCategoryReorder(moved, "p4", 4).find((c) => c.id === p.id)?.sort_order ?? p.sort_order }));
    expect(back).toEqual(s);
  });

  it("valeurs non consécutives conservées ; doublons → renumérotation sans ambiguïté", () => {
    expect(planCategoryReorder(siblings([3, 10, 25]), "p3", 1)).toEqual([
      { id: "p3", sort_order: 3 },
      { id: "p1", sort_order: 10 },
      { id: "p2", sort_order: 25 },
    ]);
    const changes = planCategoryReorder(siblings([5, 5, 7]), "p3", 1);
    const result = ["p1", "p2", "p3"].map((id) => changes.find((c) => c.id === id)?.sort_order ?? { p1: 5, p2: 5, p3: 7 }[id]);
    expect(new Set(result).size).toBe(3);
    expect(changes.find((c) => c.id === "p3")!.sort_order).toBeLessThan(Math.min(...result.filter((_, i) => i !== 2)));
  });
});

describe("validation de la position", () => {
  it("entier entre 1 et le nombre de produits de la catégorie", () => {
    expect(positionError("1", 8)).toBeNull();
    expect(positionError("8", 8)).toBeNull();
    expect(positionError("0", 8)).toBe("La position minimum est 1.");
    expect(positionError("-2", 8)).toBe("La position minimum est 1.");
    expect(positionError("9", 8)).toBe("La position maximum est 8 (nombre de produits de la catégorie).");
    expect(positionError("1.5", 8)).toBe("Position invalide : nombre entier (1, 2, 3…).");
    expect(positionError("abc", 8)).toBe("Position invalide : nombre entier (1, 2, 3…).");
    expect(positionError("", 8)).toBe("Indiquez une position.");
  });

  it("catégorie changée dans le formulaire : position ignorée tant que la catégorie n'est pas enregistrée", async () => {
    const e = await edit(FOURTH.id);
    const form = { ...e.form, categoryId: "starters", position: "1" };
    expect(validateProductForm({ ...form, position: "99" }, e).position).toBeUndefined();
    expect(buildEditPlan(e, form)).toEqual({ payload: { product: { category_id: "starters" }, variants: [] }, siblingSortOrders: [] });
  });
});

describe("bouton Enregistrer : actif dès qu'UN élément change", () => {
  let e: ProductEditData;
  beforeAll(async () => {
    e = await edit(YUMLO_MENU.find((it) => it.name === "Red Curry Thaï")!.id);
  });
  const photo = { file: new File(["x"], "photo.jpg", { type: "image/jpeg" }), previewUrl: "blob:test" } as PhotoSelection;

  it("aucun changement → inactif ; chaque changement seul → actif", () => {
    const f = e.form;
    expect(isFormDirty(f, f, null)).toBe(false);
    expect(isFormDirty(f, { ...f }, null)).toBe(false);
    const changes = {
      nom: { ...f, name: f.name + " x" },
      description: { ...f, description: f.description + " x" },
      prix: { ...f, price: "1.00" },
      catégorie: { ...f, categoryId: "salades" },
      statut: { ...f, isActive: !f.isActive },
      position: { ...f, position: "1" },
      variante: { ...f, variants: f.variants.map((v, i) => (i === 0 ? { ...v, price: "70.00" } : v)) },
    };
    for (const [what, form] of Object.entries(changes)) expect(isFormDirty(f, form, null), what).toBe(true);
    expect(isFormDirty(f, f, photo), "photo seule").toBe(true);
  });
});

describe("sauvegarde 4 → 1 via la RPC (base réelle, RLS)", () => {
  it("le produit devient premier, aucun produit perdu ni dupliqué, IDs/prix/images/descriptions intacts, puis retour exact", async () => {
    const before = await publicSalades();
    const e = await edit(FOURTH.id);
    const plan = buildEditPlan(e, { ...e.form, position: "1" });
    expect(plan.payload.product).toEqual({ sort_order: 41 });
    expect(plan.siblingSortOrders.map((c) => c.id)).toEqual(SALADES.slice(0, 3).map((it) => it.id));

    const res = await saveProductEdits(admin(), FOURTH.id, plan, null, noPhoto);
    expect(res.ok).toBe(true);

    const after = await publicSalades();
    expect(after[0].id).toBe(FOURTH.id);
    expect(after.map((it) => it.id)).toEqual([FOURTH.id, ...before.filter((it) => it.id !== FOURTH.id).map((it) => it.id)]);
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map((it) => it.id)).size).toBe(after.length);
    const byId = new Map(before.map((it) => [it.id, it]));
    for (const it of after) expect(it).toEqual(byId.get(it.id)); // prix, images, descriptions, variantes identiques

    // Relecture : nouvelle position affichée dans l'admin.
    expect((await edit(FOURTH.id)).position.position).toBe(1);

    // Retour à l'ordre d'origine via la même logique : valeurs sort_order exactement d'origine.
    const back = await edit(FOURTH.id);
    expect((await saveProductEdits(admin(), FOURTH.id, buildEditPlan(back, { ...back.form, position: "4" }), null, noPhoto)).ok).toBe(true);
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });

  it("menu statique inchangé (yumloMenu.ts)", async () => {
    const e = await edit(FOURTH.id);
    await saveProductEdits(admin(), FOURTH.id, buildEditPlan(e, { ...e.form, position: "1" }), null, noPhoto);
    expect(getStaticMenu().items.filter((it) => it.category === "Salades").map((it) => it.id)).toEqual(SALADES.map((it) => it.id));
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });

  it("échec en cours de décalage : erreur explicite, aucun produit perdu ni dupliqué", async () => {
    const e = await edit(FOURTH.id);
    const plan = buildEditPlan(e, { ...e.form, position: "1" });
    const real = admin();
    const failOn = plan.siblingSortOrders[1].id;
    const flaky = {
      ...real,
      rpc: (fn: string, args: { p_product_id: string }) =>
        args.p_product_id === failOn ? Promise.resolve({ data: null, error: { message: "réseau indisponible" } }) : real.rpc(fn, args),
    } as unknown as SupabaseClient;
    const res = await saveProductEdits(flaky, FOURTH.id, plan, null, noPhoto);
    expect(res).toMatchObject({ ok: false, failedStep: "position", fieldsSaved: true });
    if (!res.ok) expect(res.error).toMatch(/partiellement appliquée/);
    const after = await publicSalades();
    expect(after).toHaveLength(SALADES.length);
    expect(new Set(after.map((it) => it.id))).toEqual(new Set(SALADES.map((it) => it.id)));
  });
});

describe("rendu (sans navigateur)", () => {
  it("champ numérique 1…N pour un ordre manuel ; « Position automatique » sans champ pour Plats Thaï", async () => {
    const rows = await fetchMenuRows(admin());
    const render = (id: string) =>
      renderToStaticMarkup(
        <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {} }}>
          <ProductEditPage productId={id} client={admin()} />
        </AdminMenuDataContext.Provider>,
      );
    const manual = render(FOURTH.id);
    expect(manual).toContain("Position dans la catégorie");
    expect(manual).toMatch(/id="p-position" type="number"[^>]*min="1" max="8"[^>]*value="4"/);
    expect(manual).toContain("1 = premier produit affiché, 2 = deuxième, 3 = troisième…");
    expect(manual).not.toContain("prochaine étape");
    const automatic = render(PLATS_THAI.id);
    expect(automatic).toContain("Position automatique");
    expect(automatic).toContain("Cette catégorie utilise un ordre automatique.");
    expect(automatic).not.toContain('id="p-position"');
  });
});
