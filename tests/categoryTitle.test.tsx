/**
 * Nombre de pièces après le titre de certaines catégories (affichage uniquement) :
 * les noms réels des catégories (données, Supabase, ancres, ordre) restent inchangés.
 */
import type { PGlite } from "@electric-sql/pglite";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { rowsToMenu } from "../src/data/menuRows";
import { getStaticMenu, staticMenuSource, type MenuSnapshot } from "../src/data/menuSource";
import { YUMLO_CATEGORIES } from "../src/data/yumloMenu";
import { categoryAnchorId, categoryDisplayTitle } from "../src/menu/menuDisplay";
import { MenuProvider } from "../src/menu/MenuProvider";
import { MenuPage } from "../src/pages/MenuPage";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

/** Titres affichés attendus pour les catégories du menu actuel (les autres : nom seul). */
const EXPECTED: Record<string, string> = {
  Yakitori: "Yakitori (2 pcs)",
  Sashimi: "Sashimi (4 pcs)",
  Carpaccio: "Carpaccio (8 pcs)",
  Tacos: "Tacos (2 pcs)",
  "Crispy Rice": "Crispy Rice (2 pcs)",
  Nigiri: "Nigiri (2 pcs)",
  Maki: "Maki (6 pcs)",
  Futomaki: "Futomaki (5 pcs)",
  "California Roll": "California Roll (4 pcs)",
  "Special Roll": "Special Roll (4 pcs)",
  Aromaki: "Aromaki (6 pcs)",
  Blossom: "Blossom (4 pcs)",
  Premium: "Premium (4 pcs)",
  "Makito Fry": "Makito Fry (6 pcs)",
  "Crispy Roll": "Crispy Roll (6 pcs)",
  "Crunchy Roll": "Crunchy Roll (6 pcs)",
};
const expectedTitle = (category: string) => EXPECTED[category] ?? category;

/** Titres h2 des sections, dans l'ordre de la page (premier span du titre = nom affiché). */
function sectionTitles(html: string): { id: string; title: string }[] {
  const re = /<h2 id="heading-([^"]+)"[^>]*><span[^>]*>([^<]*)<\/span>/g;
  return [...html.matchAll(re)].map((m) => ({ id: m[1], title: m[2].replace(/&amp;/g, "&") }));
}

describe("categoryDisplayTitle", () => {
  it("quantités du menu PDF", () => {
    expect(categoryDisplayTitle("Nigiri")).toBe("Nigiri (2 pcs)");
    expect(categoryDisplayTitle("Temakis")).toBe("Temakis (1 pc)");
    expect(categoryDisplayTitle("Futomaki")).toBe("Futomaki (5 pcs)");
    expect(categoryDisplayTitle("California Roll")).toBe("California Roll (4 pcs)");
    expect(categoryDisplayTitle("Tataki")).toBe("Tataki (5 pcs)");
    expect(categoryDisplayTitle("Okinawa")).toBe("Okinawa (4 pcs)");
    expect(categoryDisplayTitle("Gunkan")).toBe("Gunkan (2 pcs)");
    expect(categoryDisplayTitle("Slim Roll")).toBe("Slim Roll (4 pcs)");
    expect(categoryDisplayTitle("Spring Roll")).toBe("Spring Roll (5 pcs)");
    expect(categoryDisplayTitle("Aromaki")).toBe("Aromaki (6 pcs)");
  });

  it("catégorie sans quantité → aucun suffixe", () => {
    for (const c of ["Starters", "Bentos", "Plats Thaï", "Desserts", "Boissons", "Poké Bowl", "nigiri", "Nigiri ", "Aromakis"]) {
      expect(categoryDisplayTitle(c)).toBe(c);
    }
  });

  it("toutes les catégories du menu actuel", () => {
    for (const c of YUMLO_CATEGORIES) expect(categoryDisplayTitle(c)).toBe(expectedTitle(c));
  });
});

describe("menu statique : titres affichés sur la page", () => {
  it("titres avec quantités, ordre et ancres inchangés, données intactes", () => {
    const html = renderToStaticMarkup(
      <MenuProvider source={staticMenuSource}>
        <CartProvider>
          <MenuPage />
        </CartProvider>
      </MenuProvider>,
    );
    const titles = sectionTitles(html);
    const menu = getStaticMenu();
    expect(titles.map((t) => t.id)).toEqual(menu.categories.map(categoryAnchorId));
    expect(titles.map((t) => t.title)).toEqual(menu.categories.map(expectedTitle));
    expect(titles.find((t) => t.id === categoryAnchorId("Nigiri"))!.title).toBe("Nigiri (2 pcs)");
    expect(titles.find((t) => t.id === categoryAnchorId("Starters"))!.title).toBe("Starters");
    // Noms réels inchangés : l'onglet de navigation et les données gardent « Nigiri ».
    expect(html).toContain('data-cat="Nigiri"');
    expect(menu.categories).toContain("Nigiri");
    expect(menu.categories.some((c) => c.includes("pcs"))).toBe(false);
  });
});

describe("menu Supabase (migrations + seed réels)", () => {
  let db: PGlite;
  let supabaseMenu: MenuSnapshot;
  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    supabaseMenu = rowsToMenu(await readMenuRows(db));
  });
  afterAll(() => db.close());

  it("mêmes titres affichés que le statique, noms en base inchangés", async () => {
    expect(supabaseMenu.categories).toEqual([...YUMLO_CATEGORIES]);
    expect(supabaseMenu.categories.map(categoryDisplayTitle)).toEqual(YUMLO_CATEGORIES.map(expectedTitle));
    const rows = await readMenuRows(db);
    expect(rows.categories.find((c) => c.id === "nigiri")!.name).toBe("Nigiri");
    expect(rows.categories.some((c) => c.name.includes("pcs"))).toBe(false);
  });

  it("catégorie créée depuis le CMS avec un nom du mapping (ex. Temakis) → suffixe appliqué", () => {
    const menu = rowsToMenu({
      categories: [
        { id: "temakis", name: "Temakis", sort_order: 0, is_active: true, display_mode: "list" },
        { id: "bentos", name: "Bentos", sort_order: 1, is_active: true, display_mode: "list" },
      ],
      products: [],
      variants: [],
    });
    expect(menu.categories.map(categoryDisplayTitle)).toEqual(["Temakis (1 pc)", "Bentos"]);
  });
});
