import { describe, expect, it } from "vitest";
import {
  formuleSectionNameError,
  newFormuleSectionId,
  orderedFormuleSections,
  resolveFormuleSectionId,
} from "../src/admin/lib/formuleSectionAdmin";
import {
  FORMULE_SECTION_PROMO,
  FORMULE_SECTION_SOLO_DUO_FAMILY,
  formulePublicCategory,
} from "../src/data/formulesPromos";
import { publishedFormules, replaceFormules, splitFormulesForPublicMenu } from "../src/data/formulesMenu";
import { FORMULES_CATEGORY_ID, FORMULES_PROMOS_CATEGORY } from "../src/data/formulesPromos";
import { getStaticMenu } from "../src/data/menuSource";
import { createMigratedDb, runSeed } from "./helpers/supabaseTestDb";

describe("formule sections : helpers", () => {
  const sections = [
    { id: "formules-solo-duo-family", name: FORMULE_SECTION_SOLO_DUO_FAMILY, sort_order: 0, is_active: true },
    { id: "formule-midi", name: "Formule Midi", sort_order: 1, is_active: true },
    { id: "promo", name: FORMULE_SECTION_PROMO, sort_order: 2, is_active: true },
  ];

  it("refuse un nom vide ou en double", () => {
    expect(formuleSectionNameError("  ", sections)).toMatch(/obligatoire/i);
    expect(formuleSectionNameError("Promo", sections)).toMatch(/déjà/i);
    expect(formuleSectionNameError("Soirée", sections)).toBeNull();
  });

  it("génère un id stable unique", () => {
    expect(newFormuleSectionId("Soirée Spéciale", sections)).toBe("soiree-speciale");
    expect(newFormuleSectionId("Promo", sections)).toMatch(/^promo-\d+$/);
  });

  it("ne résout la section que via l'affectation persistée (pas d'heuristique)", () => {
    expect(resolveFormuleSectionId({ id: "formule-duo", name: "Formule Duo" }, sections, "promo")).toBe("promo");
    expect(resolveFormuleSectionId({ id: "formule-duo", name: "Formule Duo" }, sections, null)).toBeNull();
    expect(formulePublicCategory({ id: "formule-zen-box", name: "Zen Box" })).toBe(FORMULE_SECTION_PROMO);
  });

  it("ordonne les sections", () => {
    expect(orderedFormuleSections([...sections].reverse()).map((s) => s.id)).toEqual([
      "formules-solo-duo-family",
      "formule-midi",
      "promo",
    ]);
  });
});

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
        { id: "formules-solo-duo-family", name: "Formules Famille", sort_order: 0, is_active: true },
        { id: "promo", name: FORMULE_SECTION_PROMO, sort_order: 1, is_active: true },
      ],
    )!;
    const sections = [
      { id: "formules-solo-duo-family", name: "Formules Famille", sort_order: 0, is_active: true },
      { id: "promo", name: FORMULE_SECTION_PROMO, sort_order: 1, is_active: true },
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
        { id: "formules-solo-duo-family", name: "Formules Solo / Duo / Family", sort_order: 0, is_active: true },
        { id: "formule-midi", name: "Formule Midi", sort_order: 1, is_active: true },
        { id: "promo", name: "Promos", sort_order: 2, is_active: true },
      ],
    )!;
    const next = replaceFormules(split, dynamic, [
      { id: "formules-solo-duo-family", name: "Formules Solo / Duo / Family", sort_order: 0, is_active: true },
      { id: "formule-midi", name: "Formule Midi", sort_order: 1, is_active: true },
      { id: "promo", name: "Promos", sort_order: 2, is_active: true },
    ]);
    expect(next.categories.filter((c) => c === "Formules Solo / Duo / Family")).toHaveLength(1);
    expect(next.categories.filter((c) => c === "Promos")).toHaveLength(1);
    expect(next.categories).not.toContain(FORMULE_SECTION_PROMO);
    expect(next.categories).not.toContain(FORMULES_PROMOS_CATEGORY);
    expect(next.items.filter((it) => it.id === "formule-duo")).toHaveLength(1);
    expect(next.items.filter((it) => it.id === "formule-zen-box")).toHaveLength(1);
    expect(next.items.find((it) => it.id === "formule-zen-box")?.category).toBe("Promos");
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

describe("formule sections : migration", () => {
  it("crée la table, les 3 sections initiales et la colonne produit", async () => {
    const db = await createMigratedDb();
    await runSeed(db);
    // Le seed arrive après la migration : on rejoue l'affectation idempotente (comme 08 en prod après catalogue).
    await db.exec(`
      update public.products set formule_section_id = 'formules-solo-duo-family'
        where id in ('formule-duo', 'formule-family') and formule_section_id is null;
      update public.products set formule_section_id = 'promo'
        where id in (
          'formule-zen-box', 'formule-yaki-box', 'formule-fry-box', 'formule-spring-box',
          'formule-kyoto-box', 'formule-nara-box', 'formule-crispy-box', 'formule-party-box',
          'formule-fusion-box', 'formule-master-box'
        ) and formule_section_id is null;
    `);
    const sections = await db.query<{ id: string; name: string }>(
      "select id, name from public.formule_sections order by sort_order",
    );
    expect(sections.rows.map((r) => r.id)).toEqual([
      "formules-solo-duo-family",
      "formule-midi",
      "promo",
    ]);
    const duo = await db.query<{ formule_section_id: string | null }>(
      "select formule_section_id from public.products where id = 'formule-duo'",
    );
    expect(duo.rows[0]?.formule_section_id).toBe("formules-solo-duo-family");
    const zen = await db.query<{ formule_section_id: string | null }>(
      "select formule_section_id from public.products where id = 'formule-zen-box'",
    );
    expect(zen.rows[0]?.formule_section_id).toBe("promo");
    await db.close();
  });
});
