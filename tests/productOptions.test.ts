/**
 * Personnalisation du Wok (protéine + sauce obligatoire) : seul ce plat est concerné, ses prix
 * restent ceux des variantes, et la sauce arrive dans la ligne panier et dans WhatsApp.
 */
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage, type CartLine } from "../src/cart/buildOrderMessage";
import { FORMULES_PROMOS_ITEMS } from "../src/data/formulesPromos";
import { FORMULE_DUO_2_ID, PRODUCT_CUSTOMIZATIONS, customizedCartLine } from "../src/data/productOptions";
import { YUMLO_MENU } from "../src/data/yumloMenu";

const WOK_ID = "083ac320dd";
const wok = YUMLO_MENU.find((it) => it.id === WOK_ID)!;
const custom = PRODUCT_CUSTOMIZATIONS[WOK_ID];
const variant = (id: string) => wok.variants!.find((v) => v.id === id)!;

describe("configuration", () => {
  it("seuls le Wok et la Formule Duo 2 sont personnalisés (Vermicelle et les autres plats inchangés)", () => {
    expect(Object.keys(PRODUCT_CUSTOMIZATIONS)).toEqual([WOK_ID, FORMULE_DUO_2_ID]);
    expect(wok.name).toBe("Wok");
    expect(wok.category).toBe("Wok & Thaï");
  });

  it("protéines et prix : ceux des variantes existantes (aucun prix modifié)", () => {
    expect(wok.variants!.map((v) => [v.id, v.priceMAD])).toEqual([
      ["vegetarien", "49.00"],
      ["poulet", "59.00"],
      ["boeuf", "64.00"],
      ["crevettes", "64.00"],
      ["fruits-de-mer", "74.00"],
    ]);
  });

  it("section « Choix de Sauces » : 3 sauces avec leur description, sans prix", () => {
    expect(custom.variantTitle).toBe("Wok");
    expect(custom.groups).toHaveLength(1);
    const [sauces] = custom.groups;
    expect(sauces.title).toBe("Choix de Sauces");
    expect(sauces.options.map((o) => o.label)).toEqual(["Teriyaki", "Oyster", "Sweet Chili"]);
    expect(sauces.options.map((o) => o.description)).toEqual([
      "Sucrée",
      "Salée",
      "Sucrée, un peu piquante",
    ]);
    expect(sauces.options.every((o) => !("priceMAD" in o))).toBe(true);
  });
});

describe("ligne panier", () => {
  it("id et nom incluent la protéine et la sauce", () => {
    expect(customizedCartLine(wok, variant("poulet"), custom, { sauce: "teriyaki" })).toEqual({
      id: "083ac320dd:poulet:sauce=teriyaki",
      name: "Wok — Poulet — Sauce : Teriyaki",
    });
    // La description reste dans la fenêtre de choix : elle n'entre pas dans le nom (panier, WhatsApp).
    expect(customizedCartLine(wok, variant("poulet"), custom, { sauce: "teriyaki" }).name).not.toContain("Sucrée");
  });

  it("deux sauces différentes → deux lignes distinctes", () => {
    const a = customizedCartLine(wok, variant("boeuf"), custom, { sauce: "oyster" });
    const b = customizedCartLine(wok, variant("boeuf"), custom, { sauce: "sweet-chili" });
    expect(a.id).not.toBe(b.id);
  });

  it("refuse une ligne sans sauce", () => {
    expect(() => customizedCartLine(wok, variant("poulet"), custom, {})).toThrow();
  });
});

describe("message WhatsApp", () => {
  it("affiche la protéine et la sauce ; les autres lignes gardent leur format", () => {
    const wokLine = customizedCartLine(wok, variant("crevettes"), custom, { sauce: "sweet-chili" });
    const lines: CartLine[] = [
      { id: wokLine.id, name: wokLine.name, unitPriceDh: 64, quantity: 2 },
      { id: "f9047d3930", name: "Bento A", unitPriceDh: 105, quantity: 1 },
    ];
    const message = buildWhatsappOrderMessage(lines, 233);
    expect(message).toContain("• 2× [Wok & Thaï] Wok — Crevettes — Sauce : Sweet Chili — 128,00 DH");
    expect(message).toContain("• 1× [Bentos] Bento A — 105,00 DH");
  });
});

/** Formule Duo 2 (produit Supabase, sans variante) : un plat obligatoire parmi cinq. */
describe("Formule Duo 2 : plat au choix", () => {
  const duo2 = {
    id: FORMULE_DUO_2_ID,
    category: "Formules Solo / Duo / Family",
    name: "Formule Duo 2",
    priceMAD: "239.00",
  };
  const duo2Custom = PRODUCT_CUSTOMIZATIONS[FORMULE_DUO_2_ID];
  const PLATS = [
    ["basilic-thai", "Basilic Thaï"],
    ["champignon-bambou", "Champignon Bambou"],
    ["chop-suey", "Chop Suey"],
    ["coreen-chicken", "Coréen Chicken"],
    ["sate", "Saté"],
  ] as const;

  it("section « Choisissez votre plat » : 5 plats, sans prix ni variante, message si aucun choix", () => {
    expect(duo2Custom.variantTitle).toBeUndefined();
    expect(duo2Custom.groups).toHaveLength(1);
    const [plat] = duo2Custom.groups;
    expect(plat.title).toBe("Choisissez votre plat");
    expect(plat.missingMessage).toBe("Veuillez choisir votre plat");
    expect(plat.options.map((o) => [o.id, o.label])).toEqual(PLATS);
    expect(plat.options.every((o) => !("priceMAD" in o))).toBe(true);
  });

  it("Formule Duo (1) et les autres formules statiques n'ont aucun choix", () => {
    expect(FORMULES_PROMOS_ITEMS.length).toBeGreaterThan(0);
    for (const f of FORMULES_PROMOS_ITEMS) expect(PRODUCT_CUSTOMIZATIONS[f.id]).toBeUndefined();
  });

  it.each(PLATS)("ligne panier pour %s : nom de la formule inchangé + plat", (id, label) => {
    expect(customizedCartLine(duo2, null, duo2Custom, { plat: id })).toEqual({
      id: `${FORMULE_DUO_2_ID}:plat=${id}`,
      name: `Formule Duo 2 — Plat : ${label}`,
    });
  });

  it("refuse une ligne sans plat", () => {
    expect(() => customizedCartLine(duo2, null, duo2Custom, {})).toThrow();
  });

  it("plusieurs Duo 2 avec des plats différents : lignes séparées dans WhatsApp, prix inchangé", () => {
    const sate = customizedCartLine(duo2, null, duo2Custom, { plat: "sate" });
    const chop = customizedCartLine(duo2, null, duo2Custom, { plat: "chop-suey" });
    expect(sate.id).not.toBe(chop.id);
    const lines: CartLine[] = [
      { id: sate.id, name: sate.name, unitPriceDh: 239, quantity: 2 },
      { id: chop.id, name: chop.name, unitPriceDh: 239, quantity: 1 },
      { id: "formule-duo", name: "Formule Duo", unitPriceDh: 279, quantity: 1 },
    ];
    const categories = new Map([
      [FORMULE_DUO_2_ID, duo2.category],
      ["formule-duo", "Formules Solo / Duo / Family"],
    ]);
    const message = buildWhatsappOrderMessage(lines, 996, categories);
    expect(message).toContain("• 2× [Formules Solo / Duo / Family] Formule Duo 2 — Plat : Saté — 478,00 DH");
    expect(message).toContain("• 1× [Formules Solo / Duo / Family] Formule Duo 2 — Plat : Chop Suey — 239,00 DH");
    expect(message).toContain("• 1× [Formules Solo / Duo / Family] Formule Duo — 279,00 DH");
    expect(message).toContain("Total : 996,00 DH");
  });
});
