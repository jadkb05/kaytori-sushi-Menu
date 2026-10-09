/**
 * Phase 3E : édition complète (productSave.ts + page) — positions humaines, variantes
 * (ajout / modification / suppression / ordre), changement de catégorie avec position, photo dans
 * la même transaction, suppression du produit ; PostgreSQL en mémoire, RLS réelle ; menu public
 * Supabase vs statique. La base est restaurée exactement après chaque test.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import { uploadProductPhoto } from "../src/admin/lib/productPhoto";
import {
  buildSaveRequest,
  categorySlots,
  deleteCatalogProduct,
  isCatalogDirty,
  isEmptySaveRequest,
  loadCatalogEdit,
  orderedVariants,
  saveCatalogProduct,
  validateCatalogForm,
  variantFinalId,
  type CatalogEditData,
  type CatalogForm,
  type EditVariant,
} from "../src/admin/lib/productSave";
import { ProductEditPage } from "../src/admin/pages/ProductEditPage";
import { buildWhatsappOrderMessage } from "../src/cart/buildOrderMessage";
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
const RIZ = YUMLO_MENU.find((it) => it.name === "Riz Cantonais")!;
const SALADES = YUMLO_MENU.filter((it) => it.category === "Salades").map((it) => it.id);
const CALIFORNIA = YUMLO_MENU.filter((it) => it.category === "California Roll").map((it) => it.id);
const ASSORT = YUMLO_MENU.find((it) => it.category === "Assortiments")!;
const jpeg = () => new File(["nouvelle-photo"], "photo.jpg", { type: "image/jpeg" });

let db: PGlite;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const adminRows = () => fetchMenuRows(admin());
const edit = async (id: string) => loadCatalogEdit(await adminRows(), id)!;
const publicMenu = async () => rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null)));
const newVariant = (label: string, price: string, position: string): EditVariant => ({
  key: `n:${label}`,
  existingId: null,
  label,
  price,
  position,
  isActive: true,
});

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await db.exec("delete from storage.objects");
  await runSeed(db);
  await db.exec(`delete from public.product_variants where product_id = '${RIZ.id}' and id not in (${RIZ.variants!.map((v) => `'${v.id}'`).join(",")})`);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("positions humaines", () => {
  it("produit : 1…N dans sa catégorie, 1…N+1 dans une autre ; produits masqués signalés ; automatique", async () => {
    const rows = await adminRows();
    expect(categorySlots(rows, "salades", SALADES[0])).toEqual({ max: 8, hidden: 0, automatic: false });
    expect(categorySlots(rows, "california-roll", SALADES[0])).toEqual({ max: 15, hidden: 0, automatic: false });
    expect(categorySlots(rows, "assortiments", SALADES[0])?.automatic).toBe(true);
    await db.exec(`update public.products set is_active = false where id = '${SALADES[5]}'`);
    expect(categorySlots(await adminRows(), "salades", SALADES[0])?.hidden).toBe(1);
  });

  it("variantes : affichées 1, 2, 3… (jamais 0)", async () => {
    const e = await edit(RIZ.id);
    expect(e.form.variants.map((v) => [v.existingId, v.position])).toEqual(RIZ.variants!.map((v, i) => [v.id, String(i + 1)]));
    expect(e.currentPosition).toBeGreaterThanOrEqual(1);
  });

  it("ordre final déterministe (position saisie, puis ordre actuel en cas d'égalité)", () => {
    const v = (key: string, position: string) => ({ ...newVariant(key, "1", position), key });
    expect(orderedVariants([v("a", "2"), v("b", "1"), v("c", "2"), v("d", "1")]).map((x) => x.key)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("variantes : identifiants et validation", () => {
  let e: CatalogEditData;
  beforeAll(async () => {
    e = await edit(RIZ.id);
  });

  it("identifiant : existant conservé (même si renommé), nouveau dérivé du libellé", () => {
    expect(variantFinalId({ ...e.form.variants[1], label: "Poulet grillé" })).toBe("poulet");
    expect(variantFinalId(newVariant("Bœuf  Fumé ", "1", "1"))).toBe("boeuf-fume");
    expect(variantFinalId(newVariant("Fruits de mer", "1", "1"))).toBe("fruits-de-mer");
  });

  it("« Poulet » et « Poulet  » : même identifiant → « Cette variante existe déjà. »", () => {
    const form = { ...e.form, variants: [...e.form.variants, newVariant("Poulet ", "60", "6")] };
    const errors = validateCatalogForm(form, e);
    expect(errors.variants["n:Poulet "].label).toBe("Cette variante existe déjà.");
  });

  it("libellé, prix, position de variante ; prix parent requis seulement sans variante", () => {
    const bad = { ...e.form, variants: [{ ...e.form.variants[0], label: " ", price: "-1", position: "9" }, ...e.form.variants.slice(1)] };
    expect(validateCatalogForm(bad, e).variants[e.form.variants[0].key]).toEqual({
      label: "Le libellé est obligatoire.",
      price: "Prix invalide.",
      position: "La position maximum est 5.",
    });
    expect(validateCatalogForm({ ...e.form, price: "x" }, e).price).toBeUndefined();
    expect(validateCatalogForm({ ...e.form, variants: [], price: "x" }, e).price).toMatch(/^Prix invalide/);
  });

  it("position produit : 1…N (même catégorie) ou 1…N+1 (nouvelle catégorie)", async () => {
    const s = await edit(SALADES[3]);
    expect(validateCatalogForm({ ...s.form, position: "9" }, s).position).toBe("La position maximum est 8.");
    expect(validateCatalogForm({ ...s.form, categoryId: "california-roll", position: "15" }, s).position).toBeUndefined();
    expect(validateCatalogForm({ ...s.form, categoryId: "california-roll", position: "16" }, s).position).toBe("La position maximum est 15.");
    expect(validateCatalogForm({ ...s.form, position: "0" }, s).position).toBe("La position minimum est 1.");
  });
});

describe("données envoyées et détection des modifications", () => {
  it("rien de modifié → requête vide ; variantes inchangées → non envoyées", async () => {
    const e = await edit(RIZ.id);
    expect(isEmptySaveRequest(buildSaveRequest(e, e.form))).toBe(true);
    expect(buildSaveRequest(e, { ...e.form, name: "Riz" })).toEqual({ p_product_id: RIZ.id, p_product: { name: "Riz" }, p_variants: null, p_position: null });
  });

  it("chaque modification seule active « Enregistrer » (y compris ajout/retrait de variante, position, photo)", async () => {
    const e = await edit(RIZ.id);
    const f = e.form;
    const photo = { file: jpeg(), previewUrl: "blob:x" };
    expect(isCatalogDirty(f, f, null)).toBe(false);
    for (const [what, form] of Object.entries({
      nom: { ...f, name: "x" },
      description: { ...f, description: "x" },
      catégorie: { ...f, categoryId: "salades" },
      statut: { ...f, isActive: false },
      position: { ...f, position: "1" },
      "variante modifiée": { ...f, variants: f.variants.map((v, i) => (i === 0 ? { ...v, price: "1.00" } : v)) },
      "variante ajoutée": { ...f, variants: [...f.variants, newVariant("Saumon", "89", "6")] },
      "variante retirée": { ...f, variants: f.variants.slice(1) },
    } satisfies Record<string, CatalogForm>)) {
      expect(isCatalogDirty(f, form, null), what).toBe(true);
    }
    expect(isCatalogDirty(f, f, photo), "photo seule").toBe(true);
  });

  it("catégorie changée → catégorie + position cible ; vers une catégorie automatique → sans position", async () => {
    const s = await edit(SALADES[1]);
    expect(buildSaveRequest(s, { ...s.form, categoryId: "california-roll", position: "3" })).toMatchObject({
      p_product: { category_id: "california-roll" },
      p_position: 3,
    });
    expect(buildSaveRequest(s, { ...s.form, categoryId: "assortiments" }).p_position).toBeNull();
  });
});

describe("enregistrement réel (RPC admin_save_product, RLS)", () => {
  it("Bento-type : supprimer « Bœuf », ajouter « Saumon », modifier « Poulet », réordonner — une seule sauvegarde", async () => {
    const e = await edit(RIZ.id);
    const kept = e.form.variants.filter((v) => v.existingId !== "boeuf").map((v) => (v.existingId === "poulet" ? { ...v, price: "55" } : v));
    // Positions finales : saumon 1er, puis l'ordre actuel des variantes conservées.
    const form = {
      ...e.form,
      variants: [newVariant("Saumon", "89", "1"), ...kept.map((v, i) => ({ ...v, position: String(i + 2) }))],
    };
    expect(validateCatalogForm(form, e)).toEqual({ variants: {} });
    const res = await saveCatalogProduct(admin(), e, form, null, uploadProductPhoto);
    expect(res).toEqual({ ok: true, name: "Riz Cantonais" });

    const item = (await publicMenu()).items.find((it) => it.id === RIZ.id)!;
    expect(item.variants!.map((v) => [v.id, v.priceMAD])).toEqual([
      ["saumon", "89.00"],
      ["vegetarien", "44.00"],
      ["poulet", "55.00"],
      ["crevettes", "64.00"],
      ["fruits-de-mer", "69.00"],
    ]);
    expect(item.priceMAD).toBe("44.00"); // prix parent recalculé (variante active la moins chère)
    expect(getStaticMenu().items.find((it) => it.id === RIZ.id)!.variants!.map((v) => v.id)).toEqual(RIZ.variants!.map((v) => v.id));
  });

  it("changement de catégorie Salades → California en 3e position, photo dans la même transaction", async () => {
    const s = await edit(SALADES[1]);
    const res = await saveCatalogProduct(admin(), s, { ...s.form, categoryId: "california-roll", position: "3" }, jpeg(), uploadProductPhoto);
    expect(res.ok).toBe(true);
    const menu = await publicMenu();
    expect(menu.items.filter((it) => it.category === "Salades").map((it) => it.id)).toEqual(SALADES.filter((id) => id !== SALADES[1]));
    const cal = menu.items.filter((it) => it.category === "California Roll").map((it) => it.id);
    expect(cal).toEqual([CALIFORNIA[0], CALIFORNIA[1], SALADES[1], ...CALIFORNIA.slice(2)]);
    expect(menu.items.find((it) => it.id === SALADES[1])!.image).toMatch(/\/menu-images\/products\//);
  });

  it("échec du téléversement → rien n'est modifié ; échec de l'enregistrement → base intacte, fichier signalé", async () => {
    const s = await edit(SALADES[0]);
    const before = await readMenuRows(db);
    const r1 = await saveCatalogProduct(admin(), s, { ...s.form, name: "X" }, jpeg(), async () => ({ ok: false, error: "réseau" }));
    expect(r1).toEqual({ ok: false, error: "réseau", failedStep: "photo", uploadedPath: null });
    const real = admin();
    const flaky = { ...real, rpc: () => Promise.resolve({ data: null, error: { message: "réseau indisponible" } }) } as unknown as SupabaseClient;
    const r2 = await saveCatalogProduct(flaky, s, { ...s.form, name: "X" }, jpeg(), uploadProductPhoto);
    expect(r2).toMatchObject({ ok: false, failedStep: "save" });
    if (!r2.ok) expect(r2.uploadedPath).toMatch(new RegExp(`^products/${SALADES[0]}/`));
    expect(await readMenuRows(db)).toEqual(before);
  });

  it("utilisateur connecté non admin : refusé", async () => {
    const s = await edit(SALADES[0]);
    const res = await saveCatalogProduct(createPgliteSupabase(db, USER), s, { ...s.form, name: "X" }, null, uploadProductPhoto);
    expect(res).toMatchObject({ ok: false, error: "Accès refusé : ce compte n'a pas les droits administrateur." });
  });
});

describe("suppression d'un produit", () => {
  it("admin : absent du menu Supabase, suivants remontés ; menu statique inchangé", async () => {
    expect(await deleteCatalogProduct(admin(), SALADES[2])).toEqual({ ok: true });
    const menu = await publicMenu();
    expect(menu.items.some((it) => it.id === SALADES[2])).toBe(false);
    expect(menu.items.filter((it) => it.category === "Salades").map((it) => it.id)).toEqual(SALADES.filter((id) => id !== SALADES[2]));
    expect(getStaticMenu().items.some((it) => it.id === SALADES[2])).toBe(true);
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });

  it("non-admin : « Impossible de supprimer ce produit. »", async () => {
    const res = await deleteCatalogProduct(createPgliteSupabase(db, USER), SALADES[2]);
    expect(res).toEqual({ ok: false, error: "Impossible de supprimer ce produit. Accès refusé : ce compte n'a pas les droits administrateur." });
  });
});

describe("régression panier / WhatsApp", () => {
  it("message WhatsApp inchangé pour les produits existants (format validé)", () => {
    const lines = [
      { id: SALADES[0], name: YUMLO_MENU.find((it) => it.id === SALADES[0])!.name, unitPriceDh: 59, quantity: 1 },
      { id: `${RIZ.id}:poulet`, name: "Riz Cantonais — Poulet", unitPriceDh: 54, quantity: 2 },
    ];
    const message = buildWhatsappOrderMessage(lines, 167);
    expect(message).toContain(`• 1× [Salades] ${lines[0].name} — 59,00 DH`);
    expect(message).toContain("• 2× [Wok & Thaï] Riz Cantonais — Poulet — 108,00 DH");
  });
});

describe("rendu de la page d'édition", () => {
  let rows: MenuRows;
  beforeAll(async () => {
    rows = await adminRows();
  });
  const render = (id: string) =>
    renderToStaticMarkup(
      <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {} }}>
        <ProductEditPage productId={id} client={admin()} />
      </AdminMenuDataContext.Provider>,
    );

  it("variantes en positions 1…N, ajout, suppression du produit (sans dialogue ouvert), aucun terme technique", () => {
    const html = render(RIZ.id);
    for (let i = 1; i <= 5; i++) expect(html).toMatch(new RegExp(`id="v-[a-z-]+-position"[^>]*max="5"[^>]*value="${i}"`));
    expect(html).toContain("+ Ajouter une variante");
    expect(html).toContain("Supprimer le produit");
    expect(html).not.toContain("Supprimer ce produit ?"); // confirmation seulement après clic
    expect(html).toContain("Référence interne");
    for (const term of ["sort_order", "category_id", "image_url", "product_id", "variant_id", "ID :"]) expect(html).not.toContain(term);
  });

  it("catégorie automatique : « Position automatique » sans champ", () => {
    const html = render(ASSORT.id);
    expect(html).toContain("Position automatique");
    expect(html).not.toContain('id="p-position"');
  });
});
