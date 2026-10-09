/**
 * Recherche du menu : catégories puis plats, accents / casse / mots partiels, aucun résultat.
 * Lecture seule sur le menu statique (identique au menu Supabase).
 */
import { describe, expect, it } from "vitest";
import { getStaticMenu } from "../src/data/menuSource";
import { normalizeSearch, searchMenu, type SearchMatch } from "../src/menu/menuSearch";

const menu = getStaticMenu();
const labels = (matches: SearchMatch[]) =>
  matches.map((m) => (m.kind === "category" ? `[${m.category}]` : `${m.item.category} › ${m.displayName}`));

describe("normalisation", () => {
  it("accents, casse et ponctuation ignorés", () => {
    expect(normalizeSearch("  Thon ÉPICÉ ")).toBe("thon epice");
    expect(normalizeSearch("Wok & Thaï")).toBe("wok thai");
    expect(normalizeSearch("Poké Bowl")).toBe("poke bowl");
  });
});

describe("searchMenu", () => {
  it("« Wok » : la section Wok & Thaï d'abord, puis le plat Wok", () => {
    const res = searchMenu(menu, "Wok");
    expect(res[0]).toMatchObject({ kind: "category", category: "Wok & Thaï", count: 4 });
    expect(labels(res)).toContain("Wok & Thaï › Wok");
  });

  it("plat exact : premier plat proposé", () => {
    const res = searchMenu(menu, "Tropical");
    const firstProduct = res.find((m) => m.kind === "product");
    expect(firstProduct && firstProduct.kind === "product" && firstProduct.displayName).toBe("Tropical");
    expect(firstProduct && firstProduct.kind === "product" && firstProduct.item.name).toBe("Tartare Tropical");
  });

  it("nom réel avec préfixe de catégorie aussi trouvé (« Aromaki Ibiza »)", () => {
    const res = searchMenu(menu, "aromaki ibiza");
    expect(labels(res)[0]).toBe("Aromaki › Ibiza");
  });

  it("accents et casse : « poke » trouve Poké Bowl, « BŒUF » les plats au bœuf", () => {
    expect(searchMenu(menu, "poke")[0]).toMatchObject({ kind: "category", category: "Poké Bowl" });
    const boeuf = labels(searchMenu(menu, "BŒUF"));
    expect(boeuf.length).toBeGreaterThan(0);
    expect(boeuf.every((l) => /b(œ|oe)uf/i.test(l))).toBe(true);
  });

  it("mots partiels, dans n'importe quel ordre : « avo saum » → plats Saumon Avocat", () => {
    const res = labels(searchMenu(menu, "avo saum"));
    expect(res).toContain("Tartare › Saumon Avocat");
    expect(res).toContain("Chirashi › Saumon Avocat");
  });

  it("singulier d'une catégorie au pluriel : « soupe » → section Soupes", () => {
    expect(searchMenu(menu, "soupe")[0]).toMatchObject({ kind: "category", category: "Soupes" });
  });

  it("aucun résultat, requête vide", () => {
    expect(searchMenu(menu, "pizza 4 fromages xyz")).toEqual([]);
    expect(searchMenu(menu, "   ")).toEqual([]);
  });

  it("au plus 20 plats, sans modifier les données", () => {
    const before = JSON.stringify(menu.items);
    const res = searchMenu(menu, "saumon");
    expect(res.filter((m) => m.kind === "product").length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(menu.items)).toBe(before);
  });
});
