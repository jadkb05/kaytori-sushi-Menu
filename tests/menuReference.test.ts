/**
 * Tests de référence (Phase 0 CMS) : le menu public doit rester strictement identique
 * à la référence figée dans tests/fixtures/ (catégories, ordre, IDs, prix, descriptions,
 * images, variantes) et le message WhatsApp doit garder exactement le même format.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage } from "../src/cart/buildOrderMessage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { ACTIVE_MENU_SOURCE, getMenu, getStaticMenu } from "../src/data/menuSource";
import { YUMLO_CATEGORIES, YUMLO_MENU } from "../src/data/yumloMenu";
import {
  MENU_REFERENCE_FILE,
  WHATSAPP_REFERENCE_FILE,
  cartTotalDh,
  sampleCartLines,
} from "./referenceCases";

const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;
const current = toParityModel(getStaticMenu());

describe("source du menu", () => {
  it("la source active est le fichier statique yumloMenu.ts", async () => {
    expect(ACTIVE_MENU_SOURCE.id).toBe("static");
    const menu = getStaticMenu();
    expect(menu.items).toBe(YUMLO_MENU);
    expect(menu.categories).toBe(YUMLO_CATEGORIES);
    expect(await getMenu()).toBe(menu);
  });
});

describe("référence du menu", () => {
  it("contient 31 catégories, 214 plats et 67 variantes", () => {
    expect(current.categories).toHaveLength(31);
    expect(current.products).toHaveLength(214);
    expect(current.products.reduce((n, p) => n + p.variants.length, 0)).toBe(67);
  });

  it("est identique à la référence figée (parité parfaite)", () => {
    expect(compareParityModels(reference, current)).toEqual([]);
    expect(current).toEqual(reference);
  });

  it("IDs uniques (plats) et IDs de variantes uniques par plat", () => {
    const ids = current.products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of current.products) {
      const vids = p.variants.map((v) => v.id);
      expect(new Set(vids).size, p.name).toBe(vids.length);
    }
  });

  it("prix au format « 69.00 »", () => {
    const re = /^\d+\.\d{2}$/;
    for (const p of current.products) {
      expect(p.priceMAD, p.name).toMatch(re);
      for (const v of p.variants) expect(v.priceMAD, `${p.name} — ${v.label}`).toMatch(re);
    }
  });

  it("chaque image affichée (et ses vignettes) existe dans public/", () => {
    const publicFile = (path: string) => new URL(`../public${path}`, import.meta.url);
    for (const p of current.products) {
      expect(existsSync(publicFile(p.displayedImage)), `${p.name} : ${p.displayedImage}`).toBe(true);
      if (p.thumbs) {
        expect(existsSync(publicFile(p.thumbs.small)), p.thumbs.small).toBe(true);
        expect(existsSync(publicFile(p.thumbs.large)), p.thumbs.large).toBe(true);
      }
    }
  });
});

describe("comparaison de parité", () => {
  it("détecte un prix, une image, une variante et un ordre modifiés", () => {
    const altered = structuredClone(reference);
    altered.products[0].priceMAD = "999.00";
    altered.products[1].displayedImage = "/autre.jpg";
    const withVariant = altered.products.find((p) => p.variants.length > 0)!;
    withVariant.variants.pop();
    altered.categories[2].productIds.reverse();
    const diffs = compareParityModels(reference, altered);
    expect(diffs.some((d) => d.includes("priceMAD"))).toBe(true);
    expect(diffs.some((d) => d.includes("displayedImage"))).toBe(true);
    expect(diffs.some((d) => d.includes("variants"))).toBe(true);
    expect(diffs.some((d) => d.startsWith("ordre des plats"))).toBe(true);
  });

  it("détecte un plat manquant ou en trop", () => {
    const altered = structuredClone(reference);
    const removed = altered.products.shift()!;
    altered.products.push({ ...removed, id: "nouveau-id" });
    const diffs = compareParityModels(reference, altered);
    expect(diffs).toContain(`plat manquant : ${removed.id} (${removed.name})`);
    expect(diffs).toContain(`plat en trop : nouveau-id (${removed.name})`);
  });
});

describe("message WhatsApp", () => {
  it("garde exactement le même format qu'à la référence", () => {
    const lines = sampleCartLines(getStaticMenu());
    const message = buildWhatsappOrderMessage(lines, cartTotalDh(lines));
    expect(message).toBe(readFileSync(WHATSAPP_REFERENCE_FILE, "utf8"));
  });
});
