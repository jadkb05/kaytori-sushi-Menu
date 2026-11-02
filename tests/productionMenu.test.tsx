/**
 * Menu statique de production (src/data/menu.json, export Supabase du 2026-11-02) :
 * contenu, règles de visibilité et de tri, formules, options, couvertures et photos locales.
 * La parité avec la base vivante se vérifie avec `npm run menu:parity` (scripts/production-parity.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { COVER_IMAGE_WIDTHS, PRODUCTION_COVER_SLIDES } from "../src/data/coverBanners";
import { casablancaLocalToUtc, isFormuleMidiAvailableAt, isFormuleMidiOffer } from "../src/data/formuleMidiAvailability";
import { menuCategoryDisplayMode, menuCategoryPcsHeadings } from "../src/data/menuRows";
import { groupItemsForMenuTab } from "../src/data/menuTabSections";
import { PRODUCT_CUSTOMIZATIONS } from "../src/data/productOptions";
import { buildPublicMenu, PRODUCTION_MENU, PRODUCTION_MENU_DATA, type ProductionMenuData } from "../src/data/productionMenu";
import { mediaImageSrcSet, mediaImageUrl } from "../src/lib/media";
import { MenuProvider } from "../src/menu/MenuProvider";
import { resolveMenuDeepLink } from "../src/menu/menuDeepLinks";
import { categoryAnchorId, dishImage, dishThumbs } from "../src/menu/menuDisplay";
import { MenuPage } from "../src/pages/MenuPage";

const data = PRODUCTION_MENU_DATA;
const menu = PRODUCTION_MENU;
const publicFile = (path: string) => new URL(`../public${path}`, import.meta.url);
const FORMULE_WIDTHS = [360, 540, 750, 960];

describe("contenu exporté de la production", () => {
  it("37 catégories, 274 produits, 70 variantes, 3 sections, 21 couvertures — toutes actives", () => {
    expect(data.categories).toHaveLength(37);
    expect(data.products).toHaveLength(274);
    expect(data.product_variants).toHaveLength(70);
    expect(data.formule_sections).toHaveLength(3);
    expect(data.cover_banners).toHaveLength(21);
    for (const rows of [data.categories, data.products, data.product_variants, data.formule_sections, data.cover_banners]) {
      expect(rows.every((r) => r.is_active)).toBe(true);
    }
  });

  it("aucune URL Supabase, aucun secret", () => {
    const raw = readFileSync(new URL("../src/data/menu.json", import.meta.url), "utf8");
    expect(raw).not.toMatch(/supabase\.co|storage\/v1|apikey|service_role|sb_publishable|eyJhbGci/i);
  });

  it("identifiants uniques, prix entiers en MAD, références cohérentes", () => {
    for (const rows of [data.categories, data.products, data.formule_sections, data.cover_banners]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
    const cats = new Set(data.categories.map((c) => c.id));
    const prods = new Set(data.products.map((p) => p.id));
    const sections = new Set(data.formule_sections.map((s) => s.id));
    for (const p of data.products) {
      expect(cats.has(p.category_id)).toBe(true);
      expect(p.currency).toBe("MAD");
      expect(Number.isInteger(Number(p.price))).toBe(true);
      if (p.formule_section_id) expect(sections.has(p.formule_section_id)).toBe(true);
    }
    for (const v of data.product_variants) expect(prods.has(v.product_id)).toBe(true);
  });
});

describe("menu affiché (mêmes fonctions que l'ancien chargement Supabase)", () => {
  it("3 sections formules en tête, puis les 36 autres catégories dans l'ordre sort_order", () => {
    const sections = [...data.formule_sections].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.name);
    const others = [...data.categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((c) => c.id !== "formules-promos")
      .map((c) => c.name);
    expect(menu.formuleSectionNames).toEqual(sections);
    expect(menu.categories).toEqual([...sections, ...others]);
    expect(menu.items).toHaveLength(274);
  });

  it("plats d'une catégorie dans l'ordre sort_order, prix « 0.00 », variantes ordonnées", () => {
    for (const c of data.categories.filter((c) => c.id !== "formules-promos")) {
      const expected = data.products
        .filter((p) => p.category_id === c.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => p.id);
      expect(menu.items.filter((it) => it.category === c.name).map((it) => it.id)).toEqual(expected);
    }
    for (const it of menu.items) {
      const p = data.products.find((x) => x.id === it.id)!;
      expect(it.priceMAD).toBe(Number(p.price).toFixed(2));
      expect(it.description).toBe(p.description ?? "");
      const variants = data.product_variants
        .filter((v) => v.product_id === it.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => v.id);
      expect((it.variants ?? []).map((v) => v.id)).toEqual(variants);
    }
  });

  it("formules : 20 offres, chacune sous le nom de sa section", () => {
    const formules = menu.items.filter((it) => it.formuleSectionId);
    expect(formules).toHaveLength(20);
    for (const it of formules) {
      expect(it.category).toBe(data.formule_sections.find((s) => s.id === it.formuleSectionId)!.name);
    }
  });

  it("Formule Midi : offres repérées par leur section ; lun–ven 11h30–17h (Casablanca)", () => {
    const midi = menu.items.filter((it) => it.formuleSectionId === "formule-midi");
    expect(midi.length).toBeGreaterThan(0);
    expect(midi.every(isFormuleMidiOffer)).toBe(true);
    expect(menu.items.filter(isFormuleMidiOffer)).toEqual(midi);
    // Heures murales de Casablanca (décalage UTC fourni par la base de fuseaux horaires).
    expect(isFormuleMidiAvailableAt(casablancaLocalToUtc(2026, 11, 3, 12, 0))).toBe(true); // mardi 12:00
    expect(isFormuleMidiAvailableAt(casablancaLocalToUtc(2026, 11, 3, 11, 29))).toBe(false); // mardi 11:29
    expect(isFormuleMidiAvailableAt(casablancaLocalToUtc(2026, 11, 3, 17, 0))).toBe(true); // mardi 17:00
    expect(isFormuleMidiAvailableAt(casablancaLocalToUtc(2026, 11, 3, 17, 1))).toBe(false); // mardi 17:01
    expect(isFormuleMidiAvailableAt(casablancaLocalToUtc(2026, 11, 7, 12, 0))).toBe(false); // samedi 12:00
  });

  it("liens profonds des sections formules résolus sur le menu de production", () => {
    expect(resolveMenuDeepLink("#formules-solo-duo-family", menu)).toBe(menu.formuleSectionNames![0]);
    expect(resolveMenuDeepLink("#formules-midi", menu)).toBe(menu.formuleSectionNames![1]);
    expect(resolveMenuDeepLink("#promos", menu)).toBe(menu.formuleSectionNames![2]);
    expect(resolveMenuDeepLink(`#${categoryAnchorId("Nigiri")}`, menu)).toBe("Nigiri");
  });

  it("Assortiments : ordre manuel avec sous-titres « Assortiments XX pcs »", () => {
    const name = data.categories.find((c) => c.id === "assortiments")!.name;
    expect(menuCategoryDisplayMode(menu, name)).toBe("list");
    expect(menuCategoryPcsHeadings(menu, name)).toBe(true);
    const items = menu.items.filter((it) => it.category === name);
    const groups = groupItemsForMenuTab(name, items, "list", true);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((g) => /^Assortiments \d+ pcs$/.test(g.title))).toBe(true);
    expect(groups.flatMap((g) => g.items.map((it) => it.id))).toEqual(items.map((it) => it.id));
  });

  it("options (Wok, Formule Duo 2) : plats présents dans le menu de production", () => {
    for (const id of Object.keys(PRODUCT_CUSTOMIZATIONS)) expect(menu.items.some((it) => it.id === id)).toBe(true);
  });

  it("MenuProvider : menu complet dès le premier rendu, ni chargement ni écran d'erreur", () => {
    const html = renderToStaticMarkup(
      <MenuProvider>
        <CartProvider>
          <MenuPage />
        </CartProvider>
      </MenuProvider>,
    );
    expect(html).not.toContain("Chargement du menu");
    expect(html).not.toContain("Menu momentanément indisponible");
    for (const c of menu.categories) expect(html).toContain(`id="heading-${categoryAnchorId(c)}"`);
  });
});

describe("règles de visibilité (ex-RLS) appliquées par buildPublicMenu", () => {
  const base: ProductionMenuData = {
    source: "test",
    categories: [
      { id: "formules-promos", name: "Formules & Promos", sort_order: 0, is_active: true, display_mode: "list" },
      { id: "a", name: "A", sort_order: 1, is_active: true, display_mode: "list" },
      { id: "b", name: "B", sort_order: 2, is_active: false, display_mode: "list" },
    ],
    products: [
      { id: "p1", category_id: "a", name: "P1", description: null, price: 10, currency: "MAD", image_url: null, thumb_small_url: null, thumb_large_url: null, sort_order: 1, is_active: true, formule_section_id: null },
      { id: "p2", category_id: "a", name: "P2", description: null, price: 10, currency: "MAD", image_url: null, thumb_small_url: null, thumb_large_url: null, sort_order: 0, is_active: false, formule_section_id: null },
      { id: "p3", category_id: "b", name: "P3", description: null, price: 10, currency: "MAD", image_url: null, thumb_small_url: null, thumb_large_url: null, sort_order: 0, is_active: true, formule_section_id: null },
      { id: "f1", category_id: "formules-promos", name: "F1", description: null, price: 99, currency: "MAD", image_url: null, thumb_small_url: null, thumb_large_url: null, sort_order: 0, is_active: true, formule_section_id: "s1" },
      { id: "f2", category_id: "formules-promos", name: "F2", description: null, price: 99, currency: "MAD", image_url: null, thumb_small_url: null, thumb_large_url: null, sort_order: 1, is_active: true, formule_section_id: "s2" },
    ],
    product_variants: [
      { product_id: "p1", id: "v1", label: "V1", price: 12, sort_order: 0, is_active: true },
      { product_id: "p1", id: "v2", label: "V2", price: 13, sort_order: 1, is_active: false },
      { product_id: "p2", id: "v3", label: "V3", price: 14, sort_order: 0, is_active: true },
    ],
    formule_sections: [
      { id: "s1", name: "S1", description: "", sort_order: 0, is_active: true },
      { id: "s2", name: "S2", description: null, sort_order: 1, is_active: false },
    ],
    cover_banners: [],
    site_settings: { cover_autoplay: false },
  };

  it("catégorie, produit, variante et section inactifs : jamais affichés", () => {
    const m = buildPublicMenu(base);
    expect(m.categories).toEqual(["S1", "A"]);
    expect(m.items.map((it) => it.id)).toEqual(["f1", "p1"]);
    expect(m.items.find((it) => it.id === "p1")!.variants!.map((v) => v.id)).toEqual(["v1"]);
  });

  it("catégorie formules masquée : aucune formule publiée", () => {
    const m = buildPublicMenu({
      ...base,
      categories: base.categories.map((c) => (c.id === "formules-promos" ? { ...c, is_active: false } : c)),
    });
    expect(m.items.map((it) => it.id)).toEqual(["p1"]);
  });
});

describe("photos locales (/media/) : présentes, intactes, versions allégées générées", () => {
  const sha32 = (path: string) => createHash("sha256").update(readFileSync(publicFile(path))).digest("hex").slice(0, 32);

  it("chaque photo affichée existe ; une photo /media/ correspond à son empreinte SHA-256", () => {
    const images = new Set([...menu.items.map(dishImage), ...PRODUCTION_COVER_SLIDES.map((s) => s.imageUrl)]);
    let media = 0;
    for (const src of images) {
      expect(src, "image vide").toBeTruthy();
      expect(existsSync(publicFile(src)), src).toBe(true);
      if (src.startsWith("/media/")) {
        media++;
        expect(sha32(src), src).toBe(src.split("/").pop()!.replace(/\.[^.]+$/, ""));
      }
    }
    expect(media).toBe(282);
  });

  it("vignettes des plats (224 / 288), affiches formules (360–960) et couvertures (640–1280) présentes", () => {
    for (const it of menu.items) {
      const src = dishImage(it);
      const thumbs = dishThumbs(src);
      if (!src.startsWith("/media/")) continue;
      expect(thumbs, src).not.toBeNull();
      expect(existsSync(publicFile(thumbs!.small)), thumbs!.small).toBe(true);
      expect(existsSync(publicFile(thumbs!.large)), thumbs!.large).toBe(true);
      if (it.formuleSectionId) {
        for (const w of FORMULE_WIDTHS) expect(existsSync(publicFile(mediaImageUrl(src, w)!)), `${src} ${w}`).toBe(true);
      }
    }
    for (const s of PRODUCTION_COVER_SLIDES) {
      for (const w of COVER_IMAGE_WIDTHS) expect(existsSync(publicFile(mediaImageUrl(s.imageUrl, w)!)), `${s.imageUrl} ${w}`).toBe(true);
    }
  });

  it("nommage des versions allégées : même dossier, « -<largeur>.webp » ; hors /media/ : aucune", () => {
    expect(mediaImageUrl("/media/products/p1/abc.jpg", 224)).toBe("/media/products/p1/abc-224.webp");
    expect(mediaImageSrcSet("/media/cover/c/abc.png", [640, 960])).toBe("/media/cover/c/abc-640.webp 640w, /media/cover/c/abc-960.webp 960w");
    expect(mediaImageUrl("/formules/duo.jpeg", 224)).toBeNull();
    expect(mediaImageUrl("https://x.supabase.co/storage/v1/object/public/menu-images/a.jpg", 224)).toBeNull();
    expect(mediaImageUrl("/media/logo.svg", 224)).toBeNull();
  });
});
