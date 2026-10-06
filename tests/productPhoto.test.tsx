/**
 * Phase 3C : photo d'un produit — validation, chemin Storage, téléversement (bucket menu-images,
 * RLS Storage réelle), mise à jour de products.image_url uniquement, enregistrement de la photo
 * seule, et affichage dans le menu public Supabase (menu statique inchangé).
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildEditPlan,
  isFormDirty,
  loadProductForEdit,
  saveProductEdits,
  type PhotoSelection,
} from "../src/admin/lib/productEditor";
import {
  PHOTO_MAX_BYTES,
  photoStoragePath,
  saveProductImageUrl,
  sha256Hex,
  uploadProductPhoto,
  validatePhotoFile,
} from "../src/admin/lib/productPhoto";
import { buildProductList } from "../src/admin/lib/menuAdmin";
import { ProductPhotoField } from "../src/admin/pages/ProductEditPage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { dishImage, dishThumbs } from "../src/menu/menuDisplay";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };
const PRODUCT = YUMLO_MENU.find((it) => it.name === "Saumon Wakamé Avocat")!;

const jpeg = (content = "photo-a") => new File([content], "photo.jpg", { type: "image/jpeg" });
const photoDeps = { uploadPhoto: uploadProductPhoto, saveImageUrl: saveProductImageUrl };

let db: PGlite;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const productRow = async (id: string) =>
  (await db.query<Record<string, unknown>>("select * from public.products where id = $1", [id])).rows[0];
const storageNames = async () =>
  (await db.query<{ name: string }>("select name from storage.objects order by name")).rows.map((r) => r.name);

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
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("validation du fichier", () => {
  it("JPEG, PNG et WebP acceptés", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validatePhotoFile({ type, size: 120_000 }), type).toBeNull();
    }
  });

  it("fichier de plus de 5 Mo refusé (5 Mo pile accepté)", () => {
    expect(validatePhotoFile({ type: "image/jpeg", size: PHOTO_MAX_BYTES })).toBeNull();
    expect(validatePhotoFile({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe("Photo trop volumineuse (5.0 Mo) : 5 Mo maximum.");
  });

  it("format non supporté ou fichier vide refusé", () => {
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", "text/plain", ""]) {
      expect(validatePhotoFile({ type, size: 1000 }), type).toBe("Format non accepté : choisissez une photo JPEG, PNG ou WebP.");
    }
    expect(validatePhotoFile({ type: "image/png", size: 0 })).toBe("Le fichier est vide.");
  });
});

describe("chemin Storage products/{id}/{empreinte}.{ext}", () => {
  it("basé sur l'ID du produit et le contenu (jamais sur le nom)", async () => {
    const hash = await sha256Hex(jpeg());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(photoStoragePath(PRODUCT.id, hash, "image/jpeg")).toBe(`products/${PRODUCT.id}/${hash.slice(0, 32)}.jpg`);
    expect(photoStoragePath(PRODUCT.id, hash, "image/png")).toMatch(/\.png$/);
    expect(photoStoragePath(PRODUCT.id, hash, "image/webp")).toMatch(/\.webp$/);
    expect(await sha256Hex(jpeg())).toBe(hash); // même contenu → même fichier
    expect(await sha256Hex(jpeg("photo-b"))).not.toBe(hash); // autre contenu → autre fichier
  });
});

describe("téléversement (RLS Storage réelle)", () => {
  it("admin : fichier déposé dans menu-images ; même fichier redéposé → réutilisé, pas de doublon", async () => {
    const res = await uploadProductPhoto(admin(), PRODUCT.id, jpeg());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.path).toMatch(new RegExp(`^products/${PRODUCT.id}/[0-9a-f]{32}\\.jpg$`));
    expect(res.publicUrl).toBe(`https://test.supabase.co/storage/v1/object/public/menu-images/${res.path}`);
    expect(await storageNames()).toEqual([res.path]);
    const again = await uploadProductPhoto(admin(), PRODUCT.id, jpeg());
    expect(again).toEqual(res);
    expect(await storageNames()).toEqual([res.path]);
  });

  it("utilisateur connecté non admin et visiteur : téléversement refusé, rien déposé", async () => {
    for (const who of [USER, null]) {
      const res = await uploadProductPhoto(createPgliteSupabase(db, who), PRODUCT.id, jpeg());
      expect(res).toEqual({ ok: false, error: "Accès refusé : ce compte ne peut pas téléverser de photo." });
    }
    expect(await storageNames()).toEqual([]);
  });

  it("fichier invalide : refusé avant tout envoi", async () => {
    const res = await uploadProductPhoto(admin(), PRODUCT.id, new File(["x"], "a.gif", { type: "image/gif" }));
    expect(res.ok).toBe(false);
    expect(await storageNames()).toEqual([]);
  });
});

describe("mise à jour de image_url", () => {
  it("admin : seul image_url change (id, nom, prix, catégorie, devise, vignettes intacts)", async () => {
    const before = await productRow(PRODUCT.id);
    const url = "https://test.supabase.co/storage/v1/object/public/menu-images/products/x/y.jpg";
    expect(await saveProductImageUrl(admin(), PRODUCT.id, url)).toEqual({ ok: true, imageUrl: url });
    const after = await productRow(PRODUCT.id);
    expect(after.image_url).toBe(url);
    const { image_url: _a, updated_at: _b, ...restAfter } = after;
    const { image_url: _c, updated_at: _d, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
  });

  it("non-admin : refusé, image_url inchangée", async () => {
    const before = await productRow(PRODUCT.id);
    const res = await saveProductImageUrl(createPgliteSupabase(db, USER), PRODUCT.id, "https://pirate/x.jpg");
    expect(res).toEqual({ ok: false, error: "Accès refusé : ce compte n'a pas les droits administrateur." });
    expect((await productRow(PRODUCT.id)).image_url).toBe(before.image_url);
  });
});

describe("enregistrement de la photo seule (aucun autre champ modifié)", () => {
  it("téléversement + image_url ; nom, description, prix, catégorie, position, ID, variantes inchangés", async () => {
    const edit = loadProductForEdit(await fetchMenuRows(admin()), PRODUCT.id)!;
    const plan = buildEditPlan(edit, edit.form);
    expect(plan).toEqual({ payload: { product: {}, variants: [] }, siblingSortOrders: [] });
    const before = await readMenuRows(db);

    const res = await saveProductEdits(admin(), PRODUCT.id, plan, jpeg(), photoDeps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.imageUrl).toMatch(new RegExp(`/menu-images/products/${PRODUCT.id}/[0-9a-f]{32}\\.jpg$`));

    const after = await readMenuRows(db);
    const strip = (rows: typeof before) => ({
      ...rows,
      products: rows.products.map((p) => (p.id === PRODUCT.id ? { ...p, image_url: "—" } : p)),
    });
    expect(strip(after)).toEqual(strip(before)); // seul image_url de CE produit a changé
    expect(after.products.find((p) => p.id === PRODUCT.id)!.image_url).toBe(res.imageUrl);
  });

  it("échec du téléversement : image_url inchangée, rien n'est enregistré", async () => {
    const before = await readMenuRows(db);
    const edit = loadProductForEdit(before, PRODUCT.id)!;
    const res = await saveProductEdits(admin(), PRODUCT.id, buildEditPlan(edit, edit.form), jpeg(), {
      uploadPhoto: async () => ({ ok: false, error: "Téléversement impossible : vérifiez votre connexion Internet." }),
      saveImageUrl: saveProductImageUrl,
    });
    expect(res).toEqual({
      ok: false,
      error: "Téléversement impossible : vérifiez votre connexion Internet.",
      failedStep: "photo",
      fieldsSaved: false,
      uploadedPath: null,
    });
    expect(await readMenuRows(db)).toEqual(before);
  });

  it("téléversement réussi mais image_url refusée : erreur, fichier conservé et chemin indiqué", async () => {
    const before = await readMenuRows(db);
    const edit = loadProductForEdit(before, PRODUCT.id)!;
    const res = await saveProductEdits(createPgliteSupabase(db, ADMIN), PRODUCT.id, buildEditPlan(edit, edit.form), jpeg(), {
      uploadPhoto: uploadProductPhoto,
      saveImageUrl: async () => ({ ok: false, error: "Accès refusé : ce compte n'a pas les droits administrateur." }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failedStep).toBe("image_url");
    expect(res.uploadedPath).toMatch(new RegExp(`^products/${PRODUCT.id}/`));
    expect(res.error).toContain(res.uploadedPath!);
    expect(await storageNames()).toEqual([res.uploadedPath]); // pas supprimé
    expect(await readMenuRows(db)).toEqual(before);
  });
});

describe("formulaire : photo seule et annulation", () => {
  const selection: PhotoSelection = { file: jpeg(), previewUrl: "blob:http://localhost/aperçu" };

  it("photo seule → Enregistrer actif ; annulation de la sélection → aucun changement", async () => {
    const edit = loadProductForEdit(await fetchMenuRows(admin()), PRODUCT.id)!;
    expect(isFormDirty(edit.form, edit.form, null)).toBe(false);
    expect(isFormDirty(edit.form, edit.form, selection)).toBe(true);
    // Annuler la sélection = revenir à selectedNewImage = null.
    expect(isFormDirty(edit.form, { ...edit.form }, null)).toBe(false);
  });

  it("aperçu local immédiat de la nouvelle photo (sans téléversement), photo actuelle sinon", () => {
    const withSelection = renderToStaticMarkup(
      <ProductPhotoField currentUrl={PRODUCT.image} selection={selection} error={null} onSelect={() => {}} onClear={() => {}} />,
    );
    expect(withSelection).toContain(`src="${selection.previewUrl}"`);
    expect(withSelection).not.toContain(`src="${PRODUCT.image}"`);
    expect(withSelection).toContain("Nouvelle photo — non enregistrée");
    expect(withSelection).toContain("Annuler la sélection");

    const without = renderToStaticMarkup(
      <ProductPhotoField currentUrl={PRODUCT.image} selection={null} error={null} onSelect={() => {}} onClear={() => {}} />,
    );
    expect(without).toContain(`src="${PRODUCT.image}"`);
    expect(without).toContain("Changer la photo");
    expect(without).not.toContain("Annuler la sélection");
    expect(without).toContain('accept="image/jpeg,image/png,image/webp"');
  });
});

describe("menu public : la photo Supabase est affichée, le statique ne change pas", () => {
  it("après enregistrement, le menu Supabase affiche la nouvelle photo (plus l'ancienne)", async () => {
    const edit = loadProductForEdit(await fetchMenuRows(admin()), PRODUCT.id)!;
    const res = await saveProductEdits(admin(), PRODUCT.id, buildEditPlan(edit, edit.form), jpeg(), photoDeps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const item = rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null))).items.find((it) => it.id === PRODUCT.id)!;
    expect(item.image).toBe(res.imageUrl);
    expect(dishImage(item)).toBe(res.imageUrl);
    expect(dishImage(item)).not.toBe(PRODUCT.image);
    expect(dishThumbs(dishImage(item))).toBeNull(); // pas de vignette locale : la photo d'origine est affichée

    // Liste de l'admin : la nouvelle photo, pas l'ancienne vignette 224 px.
    const listed = buildProductList(await fetchMenuRows(admin())).find((p) => p.id === PRODUCT.id)!;
    expect(listed.imageUrl).toBe(res.imageUrl);

    // Statique : ancienne photo, référence intacte.
    const staticItem = getStaticMenu().items.find((it) => it.id === PRODUCT.id)!;
    expect(dishImage(staticItem)).toBe(PRODUCT.image);
    const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
    expect(compareParityModels(reference, toParityModel(getStaticMenu()))).toEqual([]);
  });
});
