/**
 * Formules sur le menu public : sections, remplacement, publication.
 */
import { describe, expect, it } from "vitest";
import {
  FORMULE_SECTION_PROMO,
  FORMULE_SECTION_SOLO_DUO_FAMILY,
  FORMULES_CATEGORY_ID,
  FORMULES_PROMOS_CATEGORY,
  formulePublicCategory,
  isFormuleCarouselCategory,
} from "../src/data/formulesPromos";
import { publishedFormules, replaceFormules, splitFormulesForPublicMenu } from "../src/data/formulesMenu";
import { getStaticMenu } from "../src/data/menuSource";


describe("formules : menu public", () => {
  it("classe Duo/Family en Solo/Duo/Family et les boxes en Promo", () => {
    expect(formulePublicCategory({ id: "formule-duo", name: "Formule Duo" })).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(formulePublicCategory({ id: "formule-family", name: "Formule Family" })).toBe(
      FORMULE_SECTION_SOLO_DUO_FAMILY,
    );
    expect(formulePublicCategory({ id: "formule-solo", name: "Formule Solo" })).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(formulePublicCategory({ id: "formule-midi", name: "Formule Midi" })).toBe("Formule Midi");
    expect(formulePublicCategory({ id: "formule-zen-box", name: "Zen Box" })).toBe(FORMULE_SECTION_PROMO);
    expect(formulePublicCategory({ id: "formule-master-box", name: "Master Box" })).toBe(FORMULE_SECTION_PROMO);
  });

  it("scinde le menu public en sections sans doubler ni inventer d'offres", () => {
    const menu = splitFormulesForPublicMenu(getStaticMenu());
    expect(menu.categories[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(menu.categories[1]).toBe(FORMULE_SECTION_PROMO);
    expect(menu.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(menu.categories).not.toContain("Formule Midi");
    expect(menu.items.filter((it) => it.category === FORMULE_SECTION_SOLO_DUO_FAMILY).map((it) => it.id)).toEqual([
      "formule-duo",
      "formule-family",
    ]);
    const promos = menu.items.filter((it) => it.category === FORMULE_SECTION_PROMO);
    expect(promos).toHaveLength(10);
    expect(promos.map((it) => it.id)).toEqual([
      "formule-zen-box",
      "formule-yaki-box",
      "formule-fry-box",
      "formule-spring-box",
      "formule-kyoto-box",
      "formule-nara-box",
      "formule-crispy-box",
      "formule-party-box",
      "formule-fusion-box",
      "formule-master-box",
    ]);
    expect(menu.items.filter((it) => isFormuleCarouselCategory(it.category))).toHaveLength(12);
  });

  it("remplace seulement les formules et garde les autres plats", () => {
    const menu = getStaticMenu();
    const next = replaceFormules(menu, [
      {
        id: "formule-duo",
        category: FORMULES_PROMOS_CATEGORY,
        name: "Formule Duo",
        description: "Pour deux personnes",
        priceMAD: "280.00",
        currency: "MAD",
        image: "/formules/formule-duo.jpeg",
      },
    ]);
    expect(next.items.filter((it) => it.category === FORMULE_SECTION_SOLO_DUO_FAMILY).map((it) => it.id)).toEqual([
      "formule-duo",
    ]);
    expect(next.items.find((it) => it.id === "formule-duo")?.priceMAD).toBe("280.00");
    const classic = menu.items.filter((it) => !isFormuleCarouselCategory(it.category));
    expect(next.items.filter((it) => !isFormuleCarouselCategory(it.category))).toEqual(classic);
    expect(next.categories[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
  });

  it("après renommage de section Supabase : un seul libellé, pas de doublon avec l'ancien nom heuristique", () => {
    const alreadySplit = splitFormulesForPublicMenu(getStaticMenu());
    expect(alreadySplit.categories).toContain(FORMULE_SECTION_SOLO_DUO_FAMILY);
    // Simule fetchPublishedFormules après renommage admin « Formules Solo / Duo / Family » → « Formules Famille ».
    const fromSupabase = [
      {
        id: "formule-duo",
        category: "Formules Famille",
        name: "Formule Duo",
        description: "Pour deux personnes",
        priceMAD: "279.00",
        currency: "MAD",
        image: "/formules/formule-duo.jpeg",
      },
      {
        id: "formule-family",
        category: "Formules Famille",
        name: "Formule Family",
        description: "Pour quatre personnes",
        priceMAD: "539.00",
        currency: "MAD",
        image: "/formules/formule-family.jpeg",
      },
      {
        id: "formule-zen-box",
        category: "Promos",
        name: "Zen Box",
        description: "16 pièces",
        priceMAD: "109.00",
        currency: "MAD",
        image: "/formules/zen-box.jpeg",
      },
    ];
    const sections = [
      { id: "formules-solo-duo-family", name: "Formules Famille", description: null, sort_order: 0, is_active: true },
      { id: "formule-midi", name: "Formule Midi", description: null, sort_order: 1, is_active: true },
      { id: "promo", name: "Promos", description: null, sort_order: 2, is_active: true },
    ];
    const next = replaceFormules(alreadySplit, fromSupabase, sections);
    expect(next.categories.filter((c) => c === "Formules Famille")).toHaveLength(1);
    expect(next.categories.filter((c) => c === "Promos")).toHaveLength(1);
    expect(next.categories).not.toContain(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(next.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(next.categories).not.toContain(FORMULE_SECTION_PROMO);
    expect(next.items.filter((it) => it.id === "formule-duo")).toHaveLength(1);
    expect(next.items.filter((it) => it.id === "formule-zen-box")).toHaveLength(1);
    expect(next.items.find((it) => it.id === "formule-duo")?.category).toBe("Formules Famille");
    expect(next.items.find((it) => it.id === "formule-zen-box")?.category).toBe("Promos");
    expect(next.formuleSectionNames).toEqual(["Formules Famille", "Promos"]);
  });

  it("en mode dynamique, une offre sans formule_section_id n'apparaît pas sous Formules & Promos", () => {
    const alreadySplit = splitFormulesForPublicMenu(getStaticMenu());
    const items = publishedFormules(
      { id: "formules-promos", is_active: true },
      [
        {
          id: "formule-zen-box",
          category_id: "formules-promos",
          name: "Zen Box",
          description: "16 pièces",
          price: "109.00",
          currency: "MAD",
          image_url: "/formules/zen-box.jpeg",
          thumb_small_url: null,
          thumb_large_url: null,
          sort_order: 1,
          is_active: true,
          formule_section_id: "promo",
        },
        {
          id: "formule-orphan",
          category_id: "formules-promos",
          name: "Orpheline",
          description: "",
          price: "99.00",
          currency: "MAD",
          image_url: "/formules/zen-box.jpeg",
          thumb_small_url: null,
          thumb_large_url: null,
          sort_order: 2,
          is_active: true,
          formule_section_id: null,
        },
      ],
      [{ id: "promo", name: "Promos", description: null, sort_order: 0, is_active: true }],
    )!;
    const next = replaceFormules(alreadySplit, items, [{ id: "promo", name: "Promos", description: null, sort_order: 0, is_active: true }]);
    expect(next.categories).toEqual(expect.arrayContaining(["Promos"]));
    expect(next.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(next.categories).not.toContain(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(next.categories).not.toContain(FORMULE_SECTION_PROMO);
    const formuleIds = next.items
      .filter((it) => isFormuleCarouselCategory(it.category, next.formuleSectionNames))
      .map((it) => it.id);
    expect(formuleIds).toEqual(["formule-zen-box"]);
    expect(next.items.find((it) => it.id === "formule-orphan")).toBeUndefined();
  });

  it("remonte les formules en tête même si la catégorie était en fin de menu (source Supabase)", async () => {
    const { promoteFormulesCategory } = await import("../src/data/formulesMenu");
    const menu = getStaticMenu();
    const atEnd = {
      ...menu,
      categories: [...menu.categories.filter((c) => c !== FORMULES_PROMOS_CATEGORY), FORMULES_PROMOS_CATEGORY],
    };
    expect(atEnd.categories.at(-1)).toBe(FORMULES_PROMOS_CATEGORY);
    const promoted = promoteFormulesCategory(atEnd);
    expect(promoted.categories[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(promoted.categories[1]).toBe(FORMULE_SECTION_PROMO);
    const replaced = replaceFormules(
      atEnd,
      menu.items.filter((it) => it.category === FORMULES_PROMOS_CATEGORY),
    );
    expect(replaced.categories[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(replaced.categories.filter((c) => c === FORMULES_PROMOS_CATEGORY)).toHaveLength(0);
  });

  it("une formule désactivée n'est pas publiée ; une catégorie absente laisse le statique", () => {
    const product = {
      id: "formule-duo",
      category_id: FORMULES_CATEGORY_ID,
      name: "Formule Duo",
      description: "",
      price: "279.00",
      currency: "MAD",
      image_url: "/formules/formule-duo.jpeg",
      thumb_small_url: null,
      thumb_large_url: null,
      sort_order: 1,
      is_active: false,
    };
    expect(publishedFormules({ id: FORMULES_CATEGORY_ID, is_active: true }, [product])).toEqual([]);
    expect(publishedFormules(null, [product])).toBeNull();
    expect(publishedFormules({ id: FORMULES_CATEGORY_ID, is_active: false }, [{ ...product, is_active: true }])).toEqual([]);
  });
});
