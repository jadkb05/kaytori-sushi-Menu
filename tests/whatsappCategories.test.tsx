/**
 * WhatsApp : la catégorie de chaque ligne vient du menu réellement chargé (menu de production),
 * avec repli sur le menu de référence ; le format du message est strictement inchangé.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage, categoryLookupFromMenu, type CartLine } from "../src/cart/buildOrderMessage";
import { CartProvider, useCart } from "../src/cart/CartContext";
import { getMenu, getStaticMenu, type MenuSnapshot } from "../src/data/menuSource";
import { PRODUCTION_MENU } from "../src/data/productionMenu";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { MenuProvider, useOptionalMenu } from "../src/menu/MenuProvider";
import { WHATSAPP_REFERENCE_FILE, cartTotalDh, sampleCartLines } from "./referenceCases";

const SALADE = YUMLO_MENU.find((it) => it.category === "Salades")!;
const reference = readFileSync(WHATSAPP_REFERENCE_FILE, "utf8");
const line = (id: string, name: string, unitPriceDh: number, quantity = 1): CartLine => ({ id, name, unitPriceDh, quantity });

/** Message construit comme le fait CartContext : catégories du menu chargé. */
const messageFor = (menu: MenuSnapshot, lines: CartLine[]) =>
  buildWhatsappOrderMessage(lines, cartTotalDh(lines), categoryLookupFromMenu(menu.items));

describe("format inchangé (référence validée)", () => {
  it("sans source de catégories : identique octet par octet à la référence", () => {
    const lines = sampleCartLines(getStaticMenu());
    expect(buildWhatsappOrderMessage(lines, cartTotalDh(lines))).toBe(reference);
  });

  it("menu de référence chargé : identique à la référence", () => {
    expect(messageFor(getStaticMenu(), sampleCartLines(getStaticMenu()))).toBe(reference);
  });
});

describe("catégories du menu de production", () => {
  const menu = getMenu();
  const variantItem = menu.items.find((it) => it.variants?.length)!;
  const midi = menu.items.find((it) => it.formuleSectionId === "formule-midi")!;
  const newOnly = menu.items.find((it) => !YUMLO_MENU.some((y) => y.id === it.id))!;

  it("plat présent seulement en production (absent du menu de référence) : catégorie connue", () => {
    expect(newOnly).toBeDefined();
    const msg = messageFor(menu, [line(newOnly.id, newOnly.name, Number(newOnly.priceMAD))]);
    expect(msg).toContain(`• 1× [${newOnly.category}] ${newOnly.name} — `);
  });

  it("formule : catégorie = nom de sa section (ex. Formules Midi)", () => {
    expect(midi.category).toBe(PRODUCTION_MENU.formuleSectionNames![1]);
    const msg = messageFor(menu, [line(midi.id, midi.name, Number(midi.priceMAD))]);
    expect(msg).toContain(`• 1× [${midi.category}] ${midi.name} — `);
  });

  it("plat à variante : catégorie retrouvée via l'id de base (`platId:variantId`)", () => {
    const v = variantItem.variants![0];
    const msg = messageFor(menu, [line(`${variantItem.id}:${v.id}`, `${variantItem.name} — ${v.label}`, Number(v.priceMAD), 2)]);
    expect(msg).toContain(`• 2× [${variantItem.category}] ${variantItem.name} — ${v.label} — `);
  });

  it("gabarit complet inchangé : en-tête, lignes, total, signature", () => {
    const lines = sampleCartLines(menu);
    const msg = messageFor(menu, lines);
    const body = reference.split("\n");
    const out = msg.split("\n");
    // Mêmes lignes fixes que la référence (seules les lignes de plats et le total dépendent du panier).
    expect(out.slice(0, 4)).toEqual(body.slice(0, 4));
    expect(out.slice(-6, -4)).toEqual(body.slice(-6, -4));
    expect(out.slice(-3)).toEqual(body.slice(-3));
    expect(msg).toContain(`Total : `);
  });

  it("repli : produit inconnu du menu chargé → catégorie de référence ; inconnu partout → sans étiquette", () => {
    const partial: MenuSnapshot = { categories: [], items: [] };
    expect(messageFor(partial, [line(SALADE.id, SALADE.name, 59)])).toContain(`• 1× [Salades] ${SALADE.name}`);
    expect(messageFor(partial, [line("zzz", "Mystère", 10)])).toContain("• 1× Mystère — 10,00 DH");
  });
});

describe("branchement panier ↔ menu chargé", () => {
  function Probe() {
    const menu = useOptionalMenu();
    const { whatsappOrderUrl } = useCart();
    return <p data-items={menu?.items.length ?? "none"}>{whatsappOrderUrl}</p>;
  }

  it("useOptionalMenu : menu de production dans MenuProvider, null en dehors (le panier fonctionne sans menu)", () => {
    const inside = renderToStaticMarkup(
      <MenuProvider>
        <CartProvider>
          <Probe />
        </CartProvider>
      </MenuProvider>,
    );
    expect(inside).toContain(`data-items="${PRODUCTION_MENU.items.length}"`);
    const outside = renderToStaticMarkup(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    expect(outside).toContain('data-items="none"');
  });
});
