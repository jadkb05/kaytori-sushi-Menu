/**
 * Liens directs (#formules-solo-duo-family, #formules-midi, #promos).
 */
import { describe, expect, it } from "vitest";
import { promoteFormulesCategory, replaceFormules, type FormuleSectionProbe } from "../src/data/formulesMenu";
import { getStaticMenu, type MenuSnapshot } from "../src/data/menuSource";
import type { YumloMenuItem } from "../src/data/yumloMenu";
import { menuDeepLinkFromHash, resolveMenuDeepLink } from "../src/menu/menuDeepLinks";
import { categoryAnchorId } from "../src/menu/menuDisplay";

const SECTIONS: FormuleSectionProbe[] = [
  { id: "formules-solo-duo-family", name: "Formules Solo - Duo - Family", sort_order: 0, is_active: true },
  { id: "formule-midi", name: "Formules Midi", sort_order: 1, is_active: true },
  { id: "promo", name: "Promotions", sort_order: 2, is_active: true },
];

const OFFERS: [string, string, string][] = [
  ["9d7cb6c1f9", "Formule Solo", "formules-solo-duo-family"],
  ["formule-duo", "Formule Duo 1", "formules-solo-duo-family"],
  ["f1f534eefe", "Formule Duo 2", "formules-solo-duo-family"],
  ["formule-family", "Formule Family", "formules-solo-duo-family"],
  ["721f54c1ed", "Formule Californie", "formule-midi"],
  ["formule-zen-box", "Zen Box", "promo"],
];

/** Même forme que le menu public Supabase (sections dynamiques, libellés de l'admin). */
function supabaseLike(sections: FormuleSectionProbe[]): MenuSnapshot {
  const items: YumloMenuItem[] = OFFERS.map(([id, name, sectionId]) => ({
    id,
    category: sections.find((s) => s.id === sectionId)!.name,
    name,
    description: "",
    priceMAD: "99.00",
    currency: "MAD",
    image: "",
    formuleSectionId: sectionId,
  }));
  return replaceFormules(promoteFormulesCategory(getStaticMenu()), items, sections);
}

const SUPABASE_LIKE = supabaseLike(SECTIONS);

describe("liens directs du menu (3 sections formules)", () => {
  it("chaque lien mène à sa section", () => {
    expect(resolveMenuDeepLink("#formules-solo-duo-family", SUPABASE_LIKE)).toBe("Formules Solo - Duo - Family");
    expect(resolveMenuDeepLink("#formules-midi", SUPABASE_LIKE)).toBe("Formules Midi");
    expect(resolveMenuDeepLink("#promos", SUPABASE_LIKE)).toBe("Promotions");
  });

  it("sections renommées dans l'admin : les liens suivent l'identifiant de section", () => {
    const renamed = supabaseLike(
      SECTIONS.map((s) => ({ ...s, name: { "formules-solo-duo-family": "Nos menus", "formule-midi": "Le déjeuner", promo: "Bons plans" }[s.id]! })),
    );
    expect(resolveMenuDeepLink("#formules-solo-duo-family", renamed)).toBe("Nos menus");
    expect(resolveMenuDeepLink("#formules-midi", renamed)).toBe("Le déjeuner");
    expect(resolveMenuDeepLink("#promos", renamed)).toBe("Bons plans");
  });

  it("menu statique (repli) : Solo-Duo-Family et Promos trouvés ; Midi absent → sans effet", () => {
    const menu = promoteFormulesCategory(getStaticMenu());
    expect(resolveMenuDeepLink("#formules-solo-duo-family", menu)).toBe("Formules Solo / Duo / Family");
    expect(resolveMenuDeepLink("#promos", menu)).toBe("Promo");
    expect(resolveMenuDeepLink("#formules-midi", menu)).toBeNull();
  });

  it("hash absent ou inconnu : aucune cible (navigation inchangée) ; ancres de section acceptées", () => {
    expect(resolveMenuDeepLink("", SUPABASE_LIKE)).toBeNull();
    expect(resolveMenuDeepLink("#", SUPABASE_LIKE)).toBeNull();
    expect(resolveMenuDeepLink("#formules-solo", SUPABASE_LIKE)).toBeNull();
    expect(resolveMenuDeepLink("#%E0%A4%A", SUPABASE_LIKE)).toBeNull();
    const starters = SUPABASE_LIKE.categories.find((c) => !/formule|promo/i.test(c))!;
    expect(resolveMenuDeepLink(`#${categoryAnchorId(starters)}`, SUPABASE_LIKE)).toBe(starters);
  });

  it("lecture du hash insensible à la casse et aux espaces", () => {
    expect(menuDeepLinkFromHash("#Formules-Midi ")).toBe("formules-midi");
    expect(resolveMenuDeepLink("#PROMOS", SUPABASE_LIKE)).toBe("Promotions");
  });
});
