import { describe, expect, it } from "vitest";
import { reorderIds } from "../src/admin/lib/adminDnd";
import {
  FORMULE_SECTION_DESCRIPTION_MIGRATION_HINT,
  buildFormuleSectionUpdateChanges,
  formuleSectionDescriptionError,
  formuleSectionNameError,
  formuleSectionPosition,
  newFormuleSectionId,
  orderedFormuleSections,
  ranksInOrderedGroup,
  resolveFormuleSectionId,
  sectionMoveTarget,
  updateFormuleSection,
} from "../src/admin/lib/formuleSectionAdmin";
import { readFileSync } from "node:fs";
import { formuleCountInSection } from "../src/admin/lib/formuleAdmin";
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
import { createMigratedDb, runSeed } from "./helpers/supabaseTestDb";

describe("formule sections : helpers", () => {
  const sections = [
    {
      id: "formules-solo-duo-family",
      name: FORMULE_SECTION_SOLO_DUO_FAMILY,
      description: null,
      sort_order: 0,
      is_active: true,
    },
    { id: "formule-midi", name: "Formule Midi", description: null, sort_order: 1, is_active: true },
    { id: "promo", name: FORMULE_SECTION_PROMO, description: "Offres du moment", sort_order: 2, is_active: true },
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

  it("ordonne les sections et calcule la position humaine", () => {
    expect(orderedFormuleSections([...sections].reverse()).map((s) => s.id)).toEqual([
      "formules-solo-duo-family",
      "formule-midi",
      "promo",
    ]);
    expect(formuleSectionPosition(sections, "formule-midi")).toBe(2);
    expect(sectionMoveTarget(1, 3, "up")).toBeNull();
    expect(sectionMoveTarget(1, 3, "down")).toBe(2);
    expect(sectionMoveTarget(3, 3, "down")).toBeNull();
    expect(formuleSectionDescriptionError("x".repeat(161))).toMatch(/160/);
    expect(formuleSectionDescriptionError("Nos formules pour toutes les envies")).toBeNull();
  });

  it("réordonne les ids pour le glisser-déposer dans une section", () => {
    expect(reorderIds(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(reorderIds(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("calcule des rangs 1…N indépendants par section (pas le total catégorie)", () => {
    const solo = ranksInOrderedGroup(["formule-duo", "formule-family"]);
    const promo = ranksInOrderedGroup([
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
    expect(solo.get("formule-duo")).toEqual({ position: 1, total: 2 });
    expect(solo.get("formule-family")).toEqual({ position: 2, total: 2 });
    expect(promo.get("formule-zen-box")).toEqual({ position: 1, total: 10 });
    expect(promo.get("formule-master-box")).toEqual({ position: 10, total: 10 });
    expect(sectionMoveTarget(1, 2, "up")).toBeNull();
    expect(sectionMoveTarget(1, 2, "down")).toBe(2);
    expect(sectionMoveTarget(2, 2, "up")).toBe(1);
    expect(sectionMoveTarget(2, 2, "down")).toBeNull();
    expect(sectionMoveTarget(5, 10, "up")).toBe(4);
    expect(sectionMoveTarget(5, 10, "down")).toBe(6);
  });

  it("n'envoie description à la RPC que si la migration 09 est disponible", () => {
    expect(
      buildFormuleSectionUpdateChanges({
        name: "Promos",
        description: "Offres du moment",
        descriptionSupported: true,
      }),
    ).toEqual({
      ok: true,
      changes: { name: "Promos", description: "Offres du moment" },
    });
    expect(
      buildFormuleSectionUpdateChanges({
        name: "Promos",
        description: "  ",
        descriptionSupported: true,
      }),
    ).toEqual({ ok: true, changes: { name: "Promos", description: null } });
    expect(
      buildFormuleSectionUpdateChanges({
        name: "Promos",
        description: null,
        descriptionSupported: true,
      }),
    ).toEqual({ ok: true, changes: { name: "Promos", description: null } });
    // Sans 09 : renommer seul (pas de clé description) pour ne pas déclencher la RPC 08.
    expect(
      buildFormuleSectionUpdateChanges({
        name: "Promos",
        description: "",
        descriptionSupported: false,
      }),
    ).toEqual({ ok: true, changes: { name: "Promos" } });
    expect(
      buildFormuleSectionUpdateChanges({
        name: "Promos",
        description: "Texte",
        descriptionSupported: false,
      }),
    ).toEqual({ ok: false, error: FORMULE_SECTION_DESCRIPTION_MIGRATION_HINT });
  });

  it("le script 09 autorise description dans admin_update_formule_section", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261024180000_formule_section_description.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/not in \('name', 'is_active', 'description'\)/);
    expect(sql).toMatch(/add column if not exists description text/i);
    const legacy = readFileSync(
      new URL("../supabase/migrations/20261024000000_formule_sections.sql", import.meta.url),
      "utf8",
    );
    expect(legacy).toMatch(/not in \('name', 'is_active'\)/);
    expect(legacy).not.toMatch(/not in \('name', 'is_active', 'description'\)/);
  });

  it("compte les offres d'une section sans mélanger les autres", () => {
    const assigns = [
      { productId: "formule-duo", sectionId: "formules-solo-duo-family" },
      { productId: "formule-family", sectionId: "formules-solo-duo-family" },
      { productId: "formule-zen-box", sectionId: "promo" },
      { productId: "formule-yaki-box", sectionId: "promo" },
      { productId: "formule-orphan", sectionId: null },
    ];
    expect(formuleCountInSection(assigns, "formules-solo-duo-family")).toBe(2);
    expect(formuleCountInSection(assigns, "promo")).toBe(2);
    expect(formuleCountInSection(assigns, "promo", "formule-zen-box")).toBe(1);
    expect(formuleCountInSection(assigns, "formule-midi")).toBe(0);
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

describe("formule sections : ordre et description (RPC)", () => {
  it("persiste le déplacement de section et la description sans toucher aux offres", async () => {
    const { createPgliteSupabase } = await import("./helpers/pgliteSupabase");
    const db = await createMigratedDb();
    await runSeed(db);
    await db.exec(`
      update public.products set formule_section_id = 'formules-solo-duo-family'
        where id in ('formule-duo', 'formule-family');
      update public.products set formule_section_id = 'promo'
        where id = 'formule-zen-box';
      insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
      insert into public.admin_users (user_id) values ('11111111-1111-1111-1111-111111111111');
    `);
    const admin = createPgliteSupabase(db, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@kaytori.test",
    });

    const duoSortBefore = (
      await db.query<{ sort_order: number }>(`select sort_order from public.products where id = 'formule-duo'`)
    ).rows[0]!.sort_order;

    // Descendre Solo/Duo/Family (1 → 2) : ordre des sections seulement.
    const move = await admin.rpc("admin_update_formule_section", {
      p_section_id: "formules-solo-duo-family",
      p_changes: {},
      p_position: 2,
    });
    expect(move.error).toBeNull();

    const order = await db.query<{ id: string; name: string; description: string | null }>(
      `select id, name, description from public.formule_sections order by sort_order, id`,
    );
    expect(order.rows.map((r) => r.id)).toEqual(["formule-midi", "formules-solo-duo-family", "promo"]);
    expect(new Set(order.rows.map((r) => r.id)).size).toBe(3);

    // Description seule (sans renommer).
    const descOnly = await updateFormuleSection(admin, "formules-solo-duo-family", {
      description: "Nos formules pour toutes les envies",
      descriptionSupported: true,
    });
    expect(descOnly.ok).toBe(true);
    if (descOnly.ok) {
      expect(descOnly.section.description).toBe("Nos formules pour toutes les envies");
      expect(descOnly.section.name).toBe(FORMULE_SECTION_SOLO_DUO_FAMILY);
    }

    // Nom seul (description inchangée).
    const nameOnly = await updateFormuleSection(admin, "formules-solo-duo-family", {
      name: "Formules Famille",
      descriptionSupported: true,
    });
    expect(nameOnly.ok).toBe(true);
    const afterName = await db.query<{ name: string; description: string | null }>(
      `select name, description from public.formule_sections where id = 'formules-solo-duo-family'`,
    );
    expect(afterName.rows[0]).toEqual({
      name: "Formules Famille",
      description: "Nos formules pour toutes les envies",
    });

    const duoSortAfter = (
      await db.query<{ sort_order: number }>(`select sort_order from public.products where id = 'formule-duo'`)
    ).rows[0]!.sort_order;
    expect(duoSortAfter).toBe(duoSortBefore);

    // Description vide → null (pas d'espace fantôme côté public).
    const clear = await updateFormuleSection(admin, "formules-solo-duo-family", {
      description: "  ",
      descriptionSupported: true,
    });
    expect(clear.ok).toBe(true);
    const cleared = await db.query<{ description: string | null }>(
      `select description from public.formule_sections where id = 'formules-solo-duo-family'`,
    );
    expect(cleared.rows[0]?.description).toBeNull();

    // Message d'erreur clair si la RPC 08 rejette encore le champ.
    const legacyReject = await updateFormuleSection(
      {
        rpc: async () => ({
          data: null,
          error: { message: "Champ de section non modifiable : description.", code: "P0001" },
        }),
      } as never,
      "formules-solo-duo-family",
      { description: "x", descriptionSupported: true },
    );
    expect(legacyReject).toEqual({ ok: false, error: FORMULE_SECTION_DESCRIPTION_MIGRATION_HINT });

    await db.close();
  });
});

describe("formule sections : ordre dans la section (RPC)", () => {
  it("Monter / Descendre ne réordonne que la section cible", async () => {
    const { createPgliteSupabase } = await import("./helpers/pgliteSupabase");
    const db = await createMigratedDb();
    await runSeed(db);
    await db.exec(`
      update public.products set formule_section_id = 'formules-solo-duo-family'
        where id in ('formule-duo', 'formule-family');
      update public.products set formule_section_id = 'promo'
        where id in (
          'formule-zen-box', 'formule-yaki-box', 'formule-fry-box', 'formule-spring-box',
          'formule-kyoto-box', 'formule-nara-box', 'formule-crispy-box', 'formule-party-box',
          'formule-fusion-box', 'formule-master-box'
        );
      insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
      insert into public.admin_users (user_id) values ('11111111-1111-1111-1111-111111111111');
    `);
    const admin = createPgliteSupabase(db, {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@kaytori.test",
    });

    const promoBefore = await db.query<{ id: string }>(
      `select id from public.products
        where formule_section_id = 'promo' order by sort_order, id`,
    );
    expect(promoBefore.rows.map((r) => r.id)).toHaveLength(10);

    // Descendre Duo (1 → 2) dans Solo/Duo/Family uniquement.
    const { error } = await admin.rpc("admin_set_formule_section", {
      p_product_id: "formule-duo",
      p_section_id: "formules-solo-duo-family",
      p_position: 2,
    });
    expect(error).toBeNull();

    const soloAfter = await db.query<{ id: string }>(
      `select id from public.products
        where formule_section_id = 'formules-solo-duo-family' order by sort_order, id`,
    );
    expect(soloAfter.rows.map((r) => r.id)).toEqual(["formule-family", "formule-duo"]);

    const promoAfter = await db.query<{ id: string }>(
      `select id from public.products
        where formule_section_id = 'promo' order by sort_order, id`,
    );
    expect(promoAfter.rows.map((r) => r.id)).toEqual(promoBefore.rows.map((r) => r.id));

    const ranksSolo = ranksInOrderedGroup(soloAfter.rows.map((r) => r.id));
    expect(ranksSolo.get("formule-family")).toEqual({ position: 1, total: 2 });
    expect(ranksSolo.get("formule-duo")).toEqual({ position: 2, total: 2 });
    const ranksPromo = ranksInOrderedGroup(promoAfter.rows.map((r) => r.id));
    expect(ranksPromo.get("formule-zen-box")?.total).toBe(10);

    await db.close();
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
