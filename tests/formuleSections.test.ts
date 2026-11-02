/**
 * Sections formules sur le menu public (regroupement, ordre, descriptions).
 */
import { describe, expect, it } from "vitest";
import {
  FORMULE_SECTION_PROMO,
  FORMULE_SECTION_SOLO_DUO_FAMILY,
  formulePublicCategory,
} from "../src/data/formulesPromos";
import {
  formuleSectionDescriptionMap,
  publishedFormules,
  replaceFormules,
  splitFormulesForPublicMenu,
} from "../src/data/formulesMenu";
import { FORMULES_CATEGORY_ID, FORMULES_PROMOS_CATEGORY } from "../src/data/formulesPromos";
import { getStaticMenu } from "../src/data/menuSource";
import { formuleSectionSubtitle } from "../src/menu/menuDisplay";

describe("formule sections : menu public (données, UI inchangée)", () => {
  it("conserve le découpage heuristique sur le menu statique", () => {
    const menu = splitFormulesForPublicMenu(getStaticMenu());
    expect(menu.categories[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(menu.categories[1]).toBe(FORMULE_SECTION_PROMO);
    expect(menu.formuleSectionNames?.[0]).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
  });

  it("un renommage de section ne recrée pas l'ancien libellé heuristique sur le menu public", () => {
    const split = splitFormulesForPublicMenu(getStaticMenu());
    const renamed = publishedFormules(
      { id: FORMULES_CATEGORY_ID, is_active: true },
      [
        {
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
          is_active: true,
          formule_section_id: "formules-solo-duo-family",
        },
        {
          id: "formule-zen-box",
          category_id: FORMULES_CATEGORY_ID,
          name: "Zen Box",
          description: "",
          price: "109.00",
          currency: "MAD",
          image_url: "/formules/zen-box.jpeg",
          thumb_small_url: null,
          thumb_large_url: null,
          sort_order: 2,
          is_active: true,
          formule_section_id: "promo",
        },
      ],
      [
        { id: "formules-solo-duo-family", name: "Formules Famille", description: null, sort_order: 0, is_active: true },
        { id: "promo", name: FORMULE_SECTION_PROMO, description: null, sort_order: 1, is_active: true },
      ],
    )!;
    const sections = [
      { id: "formules-solo-duo-family", name: "Formules Famille", description: null, sort_order: 0, is_active: true },
      { id: "promo", name: FORMULE_SECTION_PROMO, description: null, sort_order: 1, is_active: true },
    ];
    const next = replaceFormules(split, renamed, sections);
    expect(next.categories.filter((c) => c === "Formules Famille")).toHaveLength(1);
    expect(next.categories).toContain(FORMULE_SECTION_PROMO);
    expect(next.categories).not.toContain(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(next.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(next.items.filter((it) => it.category === FORMULE_SECTION_SOLO_DUO_FAMILY)).toHaveLength(0);
    expect(next.items.find((it) => it.id === "formule-duo")?.category).toBe("Formules Famille");
    expect(next.items.find((it) => it.id === "formule-zen-box")?.category).toBe(FORMULE_SECTION_PROMO);
  });

  it("ne mélange jamais le fallback heuristique aux sections dynamiques", () => {
    const split = splitFormulesForPublicMenu(getStaticMenu());
    expect(split.categories).toContain(FORMULE_SECTION_SOLO_DUO_FAMILY);
    expect(split.categories).toContain(FORMULE_SECTION_PROMO);
    const dynamic = publishedFormules(
      { id: FORMULES_CATEGORY_ID, is_active: true },
      [
        {
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
          is_active: true,
          formule_section_id: "formules-solo-duo-family",
        },
        {
          id: "formule-zen-box",
          category_id: FORMULES_CATEGORY_ID,
          name: "Zen Box",
          description: "",
          price: "109.00",
          currency: "MAD",
          image_url: "/formules/zen-box.jpeg",
          thumb_small_url: null,
          thumb_large_url: null,
          sort_order: 2,
          is_active: true,
          formule_section_id: "promo",
        },
      ],
      [
        { id: "formules-solo-duo-family", name: "Formules Solo / Duo / Family", description: null, sort_order: 0, is_active: true },
        { id: "formule-midi", name: "Formule Midi", description: null, sort_order: 1, is_active: true },
        { id: "promo", name: "Promos", description: null, sort_order: 2, is_active: true },
      ],
    )!;
    const next = replaceFormules(split, dynamic, [
      { id: "formules-solo-duo-family", name: "Formules Solo / Duo / Family", description: null, sort_order: 0, is_active: true },
      { id: "formule-midi", name: "Formule Midi", description: null, sort_order: 1, is_active: true },
      { id: "promo", name: "Promos", description: null, sort_order: 2, is_active: true },
    ]);
    expect(next.categories.filter((c) => c === "Formules Solo / Duo / Family")).toHaveLength(1);
    expect(next.categories.filter((c) => c === "Promos")).toHaveLength(1);
    expect(next.categories).not.toContain(FORMULE_SECTION_PROMO);
    expect(next.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(next.items.filter((it) => it.id === "formule-duo")).toHaveLength(1);
    expect(next.items.filter((it) => it.id === "formule-zen-box")).toHaveLength(1);
    expect(next.items.find((it) => it.id === "formule-zen-box")?.category).toBe("Promos");
  });

  it("respecte l'ordre sort_order des sections et expose les descriptions non vides", () => {
    const products = [
      {
        id: "formule-zen-box",
        category_id: FORMULES_CATEGORY_ID,
        name: "Zen Box",
        description: "",
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
        is_active: true,
        formule_section_id: "formules-solo-duo-family",
      },
    ];
    const secs = [
      {
        id: "promo",
        name: "Promos",
        description: "Offres du moment",
        sort_order: 0,
        is_active: true,
      },
      {
        id: "formules-solo-duo-family",
        name: "Formules Solo / Duo / Family",
        description: "Nos formules pour toutes les envies",
        sort_order: 1,
        is_active: true,
      },
      {
        id: "formule-midi",
        name: "Formule Midi",
        description: "   ",
        sort_order: 2,
        is_active: true,
      },
    ];
    const items = publishedFormules({ id: FORMULES_CATEGORY_ID, is_active: true }, products, secs)!;
    const next = replaceFormules(splitFormulesForPublicMenu(getStaticMenu()), items, secs);
    expect(next.categories.filter((c) => next.formuleSectionNames?.includes(c))).toEqual([
      "Promos",
      "Formules Solo / Duo / Family",
    ]);
    expect(next.formuleSectionDescriptions).toEqual({
      Promos: "Offres du moment",
      "Formules Solo / Duo / Family": "Nos formules pour toutes les envies",
    });
    expect(next.formuleSectionDescriptions?.["Formule Midi"]).toBeUndefined();
    expect(formuleSectionDescriptionMap(secs, ["Promos", "Formule Midi"])).toEqual({
      Promos: "Offres du moment",
    });
    expect(formuleSectionSubtitle(next.formuleSectionDescriptions, "Promos")).toBe("Offres du moment");
    expect(formuleSectionSubtitle(next.formuleSectionDescriptions, "Formule Midi")).toBeNull();
    expect(formuleSectionSubtitle({ Promo: "  " }, "Promo")).toBeNull();
  });

  it("utilise le nom de section Supabase quand il est fourni", () => {
    const items = publishedFormules(
      { id: FORMULES_CATEGORY_ID, is_active: true },
      [
        {
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
          is_active: true,
          formule_section_id: "formules-solo-duo-family",
        },
      ],
      [
        {
          id: "formules-solo-duo-family",
          name: FORMULE_SECTION_SOLO_DUO_FAMILY,
          sort_order: 0,
          is_active: true,
        },
      ],
    );
    expect(items).toEqual([
      expect.objectContaining({
        id: "formule-duo",
        category: FORMULE_SECTION_SOLO_DUO_FAMILY,
        priceMAD: "279.00",
      }),
    ]);
    expect(items?.[0]?.category).not.toBe(FORMULES_PROMOS_CATEGORY);
  });
});
