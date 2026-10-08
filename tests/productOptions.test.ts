/**
 * Personnalisation du Wok (protéine + sauce obligatoire) : seul ce plat est concerné, ses prix
 * restent ceux des variantes, et la sauce arrive dans la ligne panier et dans WhatsApp.
 */
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage, type CartLine } from "../src/cart/buildOrderMessage";
import { PRODUCT_CUSTOMIZATIONS, customizedCartLine } from "../src/data/productOptions";
import { YUMLO_MENU } from "../src/data/yumloMenu";

const WOK_ID = "083ac320dd";
const wok = YUMLO_MENU.find((it) => it.id === WOK_ID)!;
const custom = PRODUCT_CUSTOMIZATIONS[WOK_ID];
const variant = (id: string) => wok.variants!.find((v) => v.id === id)!;

describe("configuration", () => {
  it("seul le Wok est personnalisé (Vermicelle et les autres plats inchangés)", () => {
    expect(Object.keys(PRODUCT_CUSTOMIZATIONS)).toEqual([WOK_ID]);
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

  it("section « Choix de Sauces » : 4 sauces avec leur description, sans prix", () => {
    expect(custom.variantTitle).toBe("Wok");
    expect(custom.groups).toHaveLength(1);
    const [sauces] = custom.groups;
    expect(sauces.title).toBe("Choix de Sauces");
    expect(sauces.options.map((o) => o.label)).toEqual(["Teriyaki", "Oyster", "Sweet Chili", "Aigre Doux"]);
    expect(sauces.options.map((o) => o.description)).toEqual([
      "Sucrée",
      "Salée",
      "Sucrée, un peu piquante",
      undefined,
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
    const b = customizedCartLine(wok, variant("boeuf"), custom, { sauce: "aigre-doux" });
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
