/**
 * Versions allégées des photos Supabase : URL de transformation (ratio conservé), rien hors Supabase.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseImageSrcSet, supabaseImageUrl } from "../src/lib/supabase/imageTransform";
import { dishThumbs } from "../src/menu/menuDisplay";

const BASE = "https://exemple.supabase.co";
const PHOTO = `${BASE}/storage/v1/object/public/menu-images/cover/c1/abc.png`;

describe("imageTransform", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("transforme une photo Supabase publique en conservant le ratio (resize=contain)", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    expect(supabaseImageUrl(PHOTO, 640)).toBe(
      `${BASE}/storage/v1/render/image/public/menu-images/cover/c1/abc.png?width=640&resize=contain&quality=75`,
    );
    expect(supabaseImageSrcSet(PHOTO, [640, 960])).toMatch(/width=640.* 640w, .*width=960.* 960w$/);
  });

  it("laisse intactes les images locales, étrangères ou sans Supabase configuré", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    expect(supabaseImageUrl("/formules/zen-box.jpeg", 640)).toBeNull();
    expect(supabaseImageUrl("https://autre.supabase.co/storage/v1/object/public/x.png", 640)).toBeNull();
    expect(supabaseImageSrcSet("/banner/a.webp", [640])).toBeNull();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(supabaseImageUrl(PHOTO, 640)).toBeNull();
  });

  it("dishThumbs : vignettes 224 / 288 px pour une photo Supabase, inchangé pour les fichiers locaux", () => {
    vi.stubEnv("VITE_SUPABASE_URL", BASE);
    const thumbs = dishThumbs(PHOTO);
    expect(thumbs?.small).toContain("width=224");
    expect(thumbs?.large).toContain("width=288");
    expect(thumbs?.srcSet).toBe(`${thumbs?.small} 224w, ${thumbs?.large} 288w`);
    expect(dishThumbs("/menu-hd-sushi/maki.png")).toEqual({
      small: "/menu-thumbs/menu-hd-sushi/maki-224.webp",
      large: "/menu-thumbs/menu-hd-sushi/maki-336.webp",
      srcSet: "/menu-thumbs/menu-hd-sushi/maki-224.webp 224w, /menu-thumbs/menu-hd-sushi/maki-336.webp 336w",
    });
  });
});
