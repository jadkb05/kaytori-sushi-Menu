/**
 * Optimisation des photos avant téléversement : dimensions (1254 px max, proportions, pas
 * d'agrandissement), format (WebP, repli JPEG), qualité 0,85 → 0,70 pour viser ≤ 250 Ko, fichier
 * d'origine conservé s'il est déjà optimal, erreurs ; puis enchaînement validation → optimisation →
 * Storage (RLS Storage réelle, PostgreSQL en mémoire). Le rendu réel est vérifié dans Chrome.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PHOTO_MAX_DIMENSION,
  PHOTO_TARGET_BYTES,
  defaultPhotoOptimizer,
  optimizePhoto,
  qualitySteps,
  targetDimensions,
  type ImageCodec,
  type OutputMime,
} from "../src/admin/lib/photoOptimize";
import { PHOTO_MAX_BYTES, sha256Hex, uploadProductPhoto } from "../src/admin/lib/productPhoto";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const PRODUCT = YUMLO_MENU[0];

/** Fausse photo : le contenu décrit les dimensions (« 4000x3000 »), complété jusqu'à `bytes`. */
function photo(width: number, height: number, type: string, bytes = 1_000_000, name = "photo"): File {
  const head = `${width}x${height};`;
  const ext = type.split("/")[1].replace("jpeg", "jpg");
  return new File([head + "x".repeat(Math.max(0, bytes - head.length))], `${name}.${ext}`, { type });
}

type Call = { width: number; height: number; mime: OutputMime; quality: number };

/** Faux codec : poids ≈ pixels × qualité × densité (densité élevée = photo très détaillée). */
function fakeCodec({ webp = true, density = 0.25, failDecode = false } = {}) {
  const calls: Call[] = [];
  const closed = { count: 0 };
  const codec: ImageCodec = {
    async decode(file) {
      if (failDecode) throw new Error("decode");
      const [w, h] = (await file.text()).split(";")[0].split("x").map(Number);
      return { width: w, height: h, source: null, close: () => void closed.count++ };
    },
    async encode(_image, width, height, mime, quality) {
      calls.push({ width, height, mime, quality });
      if (mime === "image/webp" && !webp) return null;
      return new Blob([new Uint8Array(Math.round(width * height * quality * density))], { type: mime });
    },
  };
  return { codec, calls, closed };
}

describe("dimensions cibles", () => {
  it("paysage, portrait, carré : plus grand côté ramené à 1254 px, proportions conservées", () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 1254, height: 941 });
    expect(targetDimensions(3000, 4000)).toEqual({ width: 941, height: 1254 });
    expect(targetDimensions(2508, 2508)).toEqual({ width: 1254, height: 1254 });
    expect(targetDimensions(6000, 1000)).toEqual({ width: 1254, height: 209 });
  });

  it("petite image ou exactement 1254 px : jamais agrandie", () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(1254, 1254)).toEqual({ width: 1254, height: 1254 });
    expect(targetDimensions(1255, 10)).toEqual({ width: 1254, height: 10 });
  });

  it("qualités essayées : 0,85 → 0,70 par pas de 0,05", () => {
    expect(qualitySteps()).toEqual([0.85, 0.8, 0.75, 0.7]);
  });
});

describe("optimisation", () => {
  it("grande photo JPEG (paysage) → WebP 1254 px, qualité 0,85, ≤ 250 Ko, nom en .webp", async () => {
    const { codec, calls, closed } = fakeCodec();
    const res = await optimizePhoto(photo(4000, 3000, "image/jpeg", 4_000_000, "IMG_0001"), codec);
    expect(res).toMatchObject({ ok: true, transformed: true, width: 1254, height: 941, quality: 0.85, originalBytes: 4_000_000 });
    if (!res.ok) return;
    expect(res.file.type).toBe("image/webp");
    expect(res.file.name).toBe("IMG_0001.webp");
    expect(res.file.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    expect(calls).toEqual([{ width: 1254, height: 941, mime: "image/webp", quality: 0.85 }]);
    expect(closed.count).toBe(1);
  });

  it("portrait PNG et carré WebP : redimensionnés et convertis", async () => {
    const portrait = await optimizePhoto(photo(3000, 4000, "image/png"), fakeCodec().codec);
    expect(portrait).toMatchObject({ ok: true, width: 941, height: 1254 });
    expect(portrait.ok && portrait.file.type).toBe("image/webp");
    const square = await optimizePhoto(photo(2000, 2000, "image/webp", 900_000), fakeCodec({ density: 0.15 }).codec);
    expect(square).toMatchObject({ ok: true, width: 1254, height: 1254, transformed: true });
    expect(square.ok && square.file.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it("photo très détaillée : qualité abaissée par paliers jusqu'à passer sous 250 Ko", async () => {
    const { codec, calls } = fakeCodec({ density: 0.21 }); // 1254² × q × 0,21 : 0,85 → 274 Ko ; 0,80 → 258 Ko ; 0,75 → 242 Ko
    const res = await optimizePhoto(photo(3000, 3000, "image/jpeg"), codec);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.8, 0.75]);
    expect(res).toMatchObject({ ok: true, quality: 0.75 });
    expect(res.ok && res.file.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
  });

  it("objectif inatteignable : on s'arrête à 0,70 et on garde le plus léger (qualité préservée)", async () => {
    const { codec, calls } = fakeCodec({ density: 0.5 });
    const res = await optimizePhoto(photo(3000, 3000, "image/jpeg"), codec);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.8, 0.75, 0.7]);
    expect(res).toMatchObject({ ok: true, quality: 0.7 });
    expect(res.ok && res.file.size).toBe(Math.round(1254 * 1254 * 0.7 * 0.5));
  });

  it("navigateur sans encodeur WebP : repli JPEG (.jpg)", async () => {
    const { codec, calls } = fakeCodec({ webp: false });
    const res = await optimizePhoto(photo(4000, 3000, "image/png", 3_000_000, "plat.final"), codec);
    expect(res.ok && res.file.type).toBe("image/jpeg");
    expect(res.ok && res.file.name).toBe("plat.final.jpg");
    expect(calls.map((c) => c.mime)).toEqual(["image/webp", "image/jpeg"]);
  });

  it("petite photo JPEG/WebP déjà légère : fichier d'origine conservé tel quel", async () => {
    const { codec, calls } = fakeCodec();
    const small = photo(800, 800, "image/jpeg", 120_000);
    const res = await optimizePhoto(small, codec);
    expect(res).toMatchObject({ ok: true, transformed: false, width: 800, height: 800, quality: null });
    expect(res.ok && res.file).toBe(small);
    expect(calls).toEqual([]);
  });

  it("petite photo mais lourde, ou PNG : recompressée sans être agrandie", async () => {
    const heavy = await optimizePhoto(photo(1000, 800, "image/jpeg", 900_000), fakeCodec().codec);
    expect(heavy).toMatchObject({ ok: true, transformed: true, width: 1000, height: 800 });
    const png = await optimizePhoto(photo(600, 600, "image/png", 100_000), fakeCodec().codec);
    expect(png).toMatchObject({ ok: true, transformed: true, width: 600, height: 600 });
    expect(png.ok && png.file.type).toBe("image/webp");
  });

  it("fichier illisible, dimensions énormes, aucun format encodable : erreur claire", async () => {
    expect(await optimizePhoto(photo(10, 10, "image/jpeg"), fakeCodec({ failDecode: true }).codec)).toEqual({
      ok: false,
      error: "Impossible de lire cette photo : le fichier est peut-être endommagé.",
    });
    expect(await optimizePhoto(photo(10000, 6000, "image/png"), fakeCodec().codec)).toEqual({
      ok: false,
      error: "Photo trop grande (10000 × 6000 pixels) : réduisez-la avant de l'envoyer.",
    });
    const none: ImageCodec = { decode: fakeCodec().codec.decode, encode: async () => null };
    expect(await optimizePhoto(photo(4000, 3000, "image/jpeg"), none)).toEqual({
      ok: false,
      error: "Ce navigateur ne sait pas compresser la photo (WebP ou JPEG).",
    });
  });

  it("hors navigateur (pas de createImageBitmap) : fichier inchangé", async () => {
    const f = photo(4000, 3000, "image/jpeg");
    expect(await defaultPhotoOptimizer(f)).toMatchObject({ ok: true, file: f, transformed: false });
  });
});

describe("téléversement : validation → optimisation → Storage", () => {
  let db: PGlite;
  let seedDump: string;
  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    await db.exec(`insert into auth.users (id) values ('${ADMIN.id}');
                   insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
    seedDump = JSON.stringify(await readMenuRows(db));
  });
  afterEach(async () => {
    await db.exec("delete from storage.objects");
    expect(JSON.stringify(await readMenuRows(db)), "données intactes").toBe(seedDump);
  });
  afterAll(() => db.close());

  /** Client PGlite qui enregistre le fichier et les options réellement envoyés au Storage. */
  function spiedClient(failWith?: string) {
    const client = createPgliteSupabase(db, ADMIN);
    const sent: { path: string; file: Blob; options: { contentType?: string } }[] = [];
    const from = client.storage.from.bind(client.storage);
    vi.spyOn(client.storage, "from").mockImplementation((bucket: string) => {
      const b = from(bucket);
      return {
        ...b,
        upload: async (path: string, file: Blob, options: { contentType?: string }) => {
          sent.push({ path, file, options });
          return failWith ? { data: null, error: { message: failWith } } : b.upload(path, file, options);
        },
      } as unknown as ReturnType<SupabaseClient["storage"]["from"]>;
    });
    return { client, sent };
  }
  const objects = async () => (await db.query<{ name: string }>("select name from storage.objects")).rows.map((r) => r.name);

  it("photo optimisée envoyée (WebP, type et extension cohérents, empreinte du fichier optimisé)", async () => {
    const { client, sent } = spiedClient();
    const original = photo(4000, 3000, "image/jpeg", 4_000_000);
    const res = await uploadProductPhoto(client, PRODUCT.id, original, (f) => optimizePhoto(f, fakeCodec().codec));
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    const { path, file, options } = sent[0];
    expect(file.type).toBe("image/webp");
    expect(options.contentType).toBe("image/webp");
    expect(file.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    expect(path).toBe(`products/${PRODUCT.id}/${(await sha256Hex(file)).slice(0, 32)}.webp`);
    expect(path).not.toContain((await sha256Hex(original)).slice(0, 32));
    expect(await objects()).toEqual([path]);
    expect(res.ok && res.publicUrl).toBe(`https://test.supabase.co/storage/v1/object/public/menu-images/${path}`);
  });

  it("fichier refusé AVANT optimisation (> 5 Mo, format) : rien d'optimisé ni d'envoyé", async () => {
    const { client, sent } = spiedClient();
    const optimize = vi.fn();
    const big = await uploadProductPhoto(client, PRODUCT.id, photo(4000, 3000, "image/jpeg", PHOTO_MAX_BYTES + 1), optimize);
    expect(big).toEqual({ ok: false, error: "Photo trop volumineuse (5.0 Mo) : 5 Mo maximum." });
    const gif = await uploadProductPhoto(client, PRODUCT.id, new File(["GIF89a"], "a.gif", { type: "image/gif" }), optimize);
    expect(gif.ok).toBe(false);
    expect(optimize).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("échec d'optimisation : erreur affichée, rien envoyé", async () => {
    const { client, sent } = spiedClient();
    const res = await uploadProductPhoto(client, PRODUCT.id, photo(10, 10, "image/png"), (f) =>
      optimizePhoto(f, fakeCodec({ failDecode: true }).codec),
    );
    expect(res).toEqual({ ok: false, error: "Impossible de lire cette photo : le fichier est peut-être endommagé." });
    expect(sent).toEqual([]);
  });

  it("échec du téléversement (réseau) : message clair, aucun objet créé", async () => {
    const { client } = spiedClient("Failed to fetch");
    const res = await uploadProductPhoto(client, PRODUCT.id, photo(4000, 3000, "image/jpeg"), (f) => optimizePhoto(f, fakeCodec().codec));
    expect(res).toEqual({ ok: false, error: "Téléversement impossible : vérifiez votre connexion Internet." });
    expect(await objects()).toEqual([]);
  });

  it("même photo envoyée deux fois : même fichier optimisé réutilisé (aucun doublon)", async () => {
    const { client } = spiedClient();
    const opt = (f: File) => optimizePhoto(f, fakeCodec().codec);
    const a = await uploadProductPhoto(client, PRODUCT.id, photo(4000, 3000, "image/jpeg"), opt);
    const b = await uploadProductPhoto(client, PRODUCT.id, photo(4000, 3000, "image/jpeg"), opt);
    expect(a.ok && b.ok && a.path === b.path).toBe(true);
    expect(await objects()).toHaveLength(1);
  });

  it("taille max 1254 px : constante alignée sur les photos actuelles", () => {
    expect(PHOTO_MAX_DIMENSION).toBe(1254);
  });
});
