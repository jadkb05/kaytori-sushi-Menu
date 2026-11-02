/**
 * Photos de couverture : ordre public, formule liée, données de production (src/data/menu.json).
 */
import { describe, expect, it } from "vitest";
import {
  COVER_PRODUCT_LINKS,
  PRODUCTION_COVER_AUTOPLAY,
  PRODUCTION_COVER_SLIDES,
  activeCoverSlides,
  buildCoverSlides,
  FALLBACK_COVER_SLIDE,
  preloadedCoverAutoplay,
  preloadedCoverSlides,
  resolveCoverProductId,
} from "../src/data/coverBanners";
import { PRODUCTION_MENU_DATA } from "../src/data/productionMenu";

describe("coverBanners (helpers)", () => {
  it("ordonne et filtre les actives pour le carrousel public", () => {
    const slides = activeCoverSlides([
      { id: "b", image_url: "/b.jpg", is_active: true, sort_order: 2 },
      { id: "a", image_url: "/a.jpg", is_active: false, sort_order: 0 },
      { id: "c", image_url: "/c.jpg", is_active: true, sort_order: 1 },
    ]);
    expect(slides.map((s) => s.id)).toEqual(["c", "b"]);
    expect(FALLBACK_COVER_SLIDE.imageUrl).toContain("kaytori-makis");
  });

  it("résout le product_id (DB ou associations affiches formules)", () => {
    expect(resolveCoverProductId({ id: "cover-778984f58f", product_id: null })).toBe("formule-duo");
    expect(resolveCoverProductId({ id: "cover-778984f58f", product_id: "formule-family" })).toBe("formule-family");
    expect(resolveCoverProductId({ id: "cover-default", product_id: null })).toBeNull();
    expect(COVER_PRODUCT_LINKS["cover-5bdc163cc0"]).toBe("721f54c1ed");
  });
});

describe("couvertures de production", () => {
  it("21 couvertures dans l'ordre sort_order puis id, toutes servies depuis /media/", () => {
    const rows = [...PRODUCTION_MENU_DATA.cover_banners].sort(
      (a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    expect(PRODUCTION_COVER_SLIDES.map((s) => s.id)).toEqual(rows.map((r) => r.id));
    expect(PRODUCTION_COVER_SLIDES).toHaveLength(21);
    for (const s of PRODUCTION_COVER_SLIDES) expect(s.imageUrl).toMatch(/^\/media\/cover\/[^/]+\/[0-9a-f]{32}\.(jpe?g|png|webp)$/);
  });

  it("formule liée : nom et prix du catalogue ; 20 couvertures sur 21 sont commandables", () => {
    const linked = PRODUCTION_COVER_SLIDES.filter((s) => s.productId);
    expect(linked).toHaveLength(20);
    for (const s of linked) {
      const p = PRODUCTION_MENU_DATA.products.find((x) => x.id === s.productId)!;
      expect(s.productName).toBe(p.name);
      expect(s.productPriceMAD).toBe(Number(p.price).toFixed(2));
    }
  });

  it("produit lié masqué ou inconnu : couverture décorative (sans « + »)", () => {
    const data = {
      categories: [{ id: "c", name: "C", sort_order: 0, is_active: true, display_mode: "list" as const }],
      products: [],
      cover_banners: [{ id: "x", image_url: "/media/cover/x/a.jpg", storage_path: null, sort_order: 0, is_active: true, product_id: "absent" }],
    };
    expect(buildCoverSlides(data)[0].productId).toBeNull();
  });

  it("défilement automatique désactivé (réglage de production), connu immédiatement", () => {
    expect(PRODUCTION_MENU_DATA.site_settings.cover_autoplay).toBe(false);
    expect(PRODUCTION_COVER_AUTOPLAY).toBe(false);
    expect(preloadedCoverAutoplay()).toBe(false);
    expect(preloadedCoverSlides()).toEqual([...PRODUCTION_COVER_SLIDES]);
  });
});
