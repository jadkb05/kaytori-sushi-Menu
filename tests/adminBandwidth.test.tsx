/**
 * Bande passante Supabase : vignettes allégées dans l'admin (repli sur l'original hors Supabase),
 * couvertures servies au plus en 1280 px, nouvelles couvertures redimensionnées (1600 px) en WebP.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_LIST_PHOTO_WIDTH, ADMIN_PREVIEW_PHOTO_WIDTH, AdminPhoto } from "../src/admin/components/AdminPhoto";
import { uploadCoverPhoto } from "../src/admin/lib/coverBannerAdmin";
import { COVER_LIMITS, optimizePhoto, type ImageCodec } from "../src/admin/lib/photoOptimize";
import { COVER_IMAGE_WIDTHS, coverSlideSrcSet } from "../src/data/coverBanners";

const BASE = "https://exemple.supabase.co";
const PHOTO = `${BASE}/storage/v1/object/public/menu-images/products/p1/abc.jpg`;
const COVER = `${BASE}/storage/v1/object/public/menu-images/cover/c1/def.png`;

/** Fausse photo : le contenu décrit les dimensions (« 4000x2000 »), complété jusqu'à `bytes`. */
function photo(width: number, height: number, type: string, bytes = 2_000_000): File {
  const head = `${width}x${height};`;
  return new File([head + "x".repeat(bytes - head.length)], `photo.${type.split("/")[1]}`, { type });
}

const codec: ImageCodec = {
  async decode(file) {
    const [width, height] = (await file.text()).split(";")[0].split("x").map(Number);
    return { width, height, source: null };
  },
  async encode(_image, width, height, mime, quality) {
    return new Blob([new Uint8Array(Math.round(width * height * quality * 0.2))], { type: mime });
  },
};

describe("AdminPhoto : version allégée Supabase, original sinon", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("photo Supabase → transformation à la largeur demandée, attributs conservés", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    const html = renderToStaticMarkup(
      <AdminPhoto src={PHOTO} photoWidth={ADMIN_LIST_PHOTO_WIDTH} alt="" width={48} height={48} loading="lazy" className="h-12" />,
    );
    expect(html).toContain(`src="${BASE}/storage/v1/render/image/public/menu-images/products/p1/abc.jpg?width=160&amp;resize=contain&amp;quality=75"`);
    expect(html).toContain('width="48"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('class="h-12"');
    expect(ADMIN_PREVIEW_PHOTO_WIDTH).toBe(640);
  });

  it("fichier local, aperçu blob: ou Supabase non configuré → original inchangé", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    for (const src of ["/menu-thumbs/menu-hd-onglet3/burger-224.webp", "blob:https://www.kaytori.com/1234"]) {
      expect(renderToStaticMarkup(<AdminPhoto src={src} photoWidth={160} alt="" />)).toContain(`src="${src}"`);
    }
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(renderToStaticMarkup(<AdminPhoto src={PHOTO} photoWidth={160} alt="" />)).toContain(`src="${PHOTO}"`);
  });
});

describe("couvertures : 1280 px au plus côté menu", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("srcset Supabase 640 / 960 / 1280, sans 1600", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    expect(COVER_IMAGE_WIDTHS).toEqual([640, 960, 1280]);
    const srcSet = coverSlideSrcSet({ id: "c1", imageUrl: COVER, productId: null }) ?? "";
    expect(srcSet.split(", ").map((part) => part.split(" ")[1])).toEqual(["640w", "960w", "1280w"]);
    expect(srcSet).not.toContain("width=1600");
  });
});

describe("nouvelles couvertures : 1600 px maximum, WebP", () => {
  it("COVER_LIMITS : PNG 4000 × 2000 → WebP 1600 × 800 ; photo déjà petite et légère conservée", async () => {
    const res = await optimizePhoto(photo(4000, 2000, "image/png"), codec, COVER_LIMITS);
    expect(res).toMatchObject({ ok: true, transformed: true, width: 1600, height: 800 });
    if (res.ok) expect(res.file.type).toBe("image/webp");
    const small = photo(1200, 600, "image/webp", 120_000);
    expect(await optimizePhoto(small, codec, COVER_LIMITS)).toMatchObject({ ok: true, transformed: false, file: small });
  });

  it("uploadCoverPhoto envoie le fichier optimisé (cover/…/*.webp, cache 1 an)", async () => {
    const sent: { path: string; file: Blob; options: Record<string, unknown> }[] = [];
    const client = {
      storage: {
        from: () => ({
          upload: async (path: string, file: Blob, options: Record<string, unknown>) => {
            sent.push({ path, file, options });
            return { data: { path }, error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}/storage/v1/object/public/menu-images/${path}` } }),
        }),
      },
    } as unknown as SupabaseClient;
    const res = await uploadCoverPhoto(client, "cover-abc", photo(4000, 2000, "image/png"), (f) =>
      optimizePhoto(f, codec, COVER_LIMITS),
    );
    expect(res.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toMatch(/^cover\/cover-abc\/[0-9a-f]{32}\.webp$/);
    expect(sent[0].file.type).toBe("image/webp");
    expect(sent[0].options).toMatchObject({ contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (res.ok) expect(res.publicUrl).toBe(`${BASE}/storage/v1/object/public/menu-images/${sent[0].path}`);
  });

  it("photo illisible : erreur, rien n'est envoyé", async () => {
    const upload = vi.fn();
    const client = { storage: { from: () => ({ upload }) } } as unknown as SupabaseClient;
    const res = await uploadCoverPhoto(client, "cover-abc", photo(10, 10, "image/png", 100), async () => ({
      ok: false,
      error: "Impossible de lire cette photo",
    }));
    expect(res).toEqual({ ok: false, error: "Impossible de lire cette photo" });
    expect(upload).not.toHaveBeenCalled();
  });
});
