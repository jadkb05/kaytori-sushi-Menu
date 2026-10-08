/**
 * Recadrage de la photo d'un produit : calculs du cadrage (zoom, déplacement, zone source,
 * taille du fichier) et enregistrement par le circuit habituel (nouveau fichier Storage,
 * image_url de CE produit seulement, menu public mis à jour). PostgreSQL en mémoire, RLS réelle.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CROP_MIN_SOURCE_SIDE,
  clampCrop,
  cropOutputSide,
  cropRect,
  initialCrop,
  maxCropZoom,
  panCrop,
} from "../src/admin/lib/photoCrop";
import { PHOTO_MAX_DIMENSION } from "../src/admin/lib/photoOptimize";
import { uploadProductPhoto } from "../src/admin/lib/productPhoto";
import { loadCatalogEdit, saveCatalogProduct } from "../src/admin/lib/productSave";
import { rowsToMenu } from "../src/data/menuRows";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

describe("cadrage", () => {
  it("zoom 1 centré : plus grand carré possible", () => {
    expect(cropRect(initialCrop(1254, 1254), 1254, 1254)).toEqual({ x: 0, y: 0, side: 1254 });
    expect(cropRect(initialCrop(1600, 1200), 1600, 1200)).toEqual({ x: 200, y: 0, side: 1200 });
  });

  it("zoom maximal : le carré source garde au moins 512 px, 4× au plus, 1× si la photo est petite", () => {
    expect(maxCropZoom(1254, 1254)).toBeCloseTo(1254 / CROP_MIN_SOURCE_SIDE);
    expect(maxCropZoom(4000, 3000)).toBe(4);
    expect(maxCropZoom(400, 400)).toBe(1);
    expect(clampCrop({ zoom: 10, centerX: 627, centerY: 627 }, 1254, 1254).zoom).toBeCloseTo(1254 / 512);
    expect(clampCrop({ zoom: 0.2, centerX: 627, centerY: 627 }, 1254, 1254).zoom).toBe(1);
  });

  it("zoom 2 : carré moitié, centré ; le centre est borné pour rester dans la photo", () => {
    expect(cropRect({ zoom: 2, centerX: 627, centerY: 627 }, 1254, 1254)).toEqual({ x: 313.5, y: 313.5, side: 627 });
    expect(cropRect({ zoom: 2, centerX: 0, centerY: 5000 }, 1254, 1254)).toEqual({ x: 0, y: 627, side: 627 });
  });

  it("déplacement : glisser vers la droite montre la partie gauche, proportionnellement au zoom", () => {
    const crop = { zoom: 2, centerX: 627, centerY: 627 };
    // Cadre affiché de 300 px pour 627 px source : 30 px d'écran = 62,7 px source.
    const moved = panCrop(crop, 30, -15, 300, 1254, 1254);
    expect(moved.centerX).toBeCloseTo(627 - 62.7);
    expect(moved.centerY).toBeCloseTo(627 + 31.35);
    expect(panCrop(initialCrop(1254, 1254), 100, 100, 300, 1254, 1254)).toEqual(initialCrop(1254, 1254));
  });

  it("taille du fichier : celle de la zone source, jamais agrandie, 1254 px au plus", () => {
    expect(cropOutputSide({ x: 0, y: 0, side: 627 })).toBe(627);
    expect(cropOutputSide({ x: 0, y: 0, side: 3000 })).toBe(PHOTO_MAX_DIMENSION);
  });
});

describe("enregistrement de la photo recadrée", () => {
  const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
  const WOK = YUMLO_MENU.find((it) => it.id === "083ac320dd")!;
  let db: PGlite;
  let seedDump: string;
  const admin = () => createPgliteSupabase(db, ADMIN);
  const cropped = () => new File(["pixels-recadres"], "photo-recadree.webp", { type: "image/webp" });

  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'); insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
    seedDump = JSON.stringify(await readMenuRows(db));
  });
  afterEach(async () => {
    await db.exec("delete from storage.objects");
    await runSeed(db);
    expect(JSON.stringify(await readMenuRows(db))).toBe(seedDump);
  });
  afterAll(() => db.close());

  it("nouveau fichier products/{id}/…, image_url de ce produit seulement, menu public à jour", async () => {
    const before = await readMenuRows(db);
    const data = loadCatalogEdit(await fetchMenuRows(admin()), WOK.id)!;
    // Comme l'éditeur : formulaire d'origine (aucune autre modification) + fichier recadré.
    const res = await saveCatalogProduct(admin(), data, data.form, cropped(), uploadProductPhoto);
    expect(res).toEqual({ ok: true, name: "Wok" });

    const objects = (await db.query<{ name: string }>("select name from storage.objects")).rows.map((r) => r.name);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatch(new RegExp(`^products/${WOK.id}/[0-9a-f]{32}\\.webp$`));

    const after = await readMenuRows(db);
    const wokAfter = after.products.find((p) => p.id === WOK.id)!;
    const wokBefore = before.products.find((p) => p.id === WOK.id)!;
    expect(wokAfter.image_url).toBe(`https://test.supabase.co/storage/v1/object/public/menu-images/${objects[0]}`);
    // Seule image_url change : nom, prix, catégorie, position, variantes intacts.
    expect({ ...wokAfter, image_url: wokBefore.image_url }).toEqual(wokBefore);
    expect(after.variants).toEqual(before.variants);
    expect(after.categories).toEqual(before.categories);
    expect(after.products.filter((p) => p.id !== WOK.id)).toEqual(before.products.filter((p) => p.id !== WOK.id));

    const publicMenu = rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null)));
    expect(publicMenu.items.find((it) => it.id === WOK.id)!.image).toBe(wokAfter.image_url);
  });
});
