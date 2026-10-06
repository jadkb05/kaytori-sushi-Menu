/**
 * Cas de référence partagés entre le script d'export (scripts/export-menu-reference.ts)
 * et les tests (tests/menuReference.test.ts).
 */
import type { CartLine } from "../src/cart/buildOrderMessage";
import type { MenuSnapshot } from "../src/data/menuSource";

export const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);
export const MENU_REFERENCE_FILE = new URL("menu-reference.json", FIXTURES_DIR);
export const WHATSAPP_REFERENCE_FILE = new URL("whatsapp-reference.txt", FIXTURES_DIR);

/**
 * Panier type construit comme le fait l'app (useDishAdd) :
 * plat simple → id du plat ; plat à variantes → `platId:variantId` et « Nom — Variante ».
 */
export function sampleCartLines(menu: MenuSnapshot): CartLine[] {
  const simple = menu.items.filter((it) => !it.variants?.length);
  const withVariants = menu.items.filter((it) => it.variants?.length);
  const pick = [simple[0], simple[Math.floor(simple.length / 2)], simple[simple.length - 1]];
  const lines: CartLine[] = pick.map((it, i) => ({
    id: it.id,
    name: it.name,
    unitPriceDh: Number.parseFloat(it.priceMAD),
    quantity: i + 1,
  }));
  for (const it of [withVariants[0], withVariants[withVariants.length - 1]]) {
    const v = it.variants![it.variants!.length - 1];
    lines.push({
      id: `${it.id}:${v.id}`,
      name: `${it.name} — ${v.label}`,
      unitPriceDh: Number.parseFloat(v.priceMAD),
      quantity: 2,
    });
  }
  return lines;
}

export function cartTotalDh(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.unitPriceDh * l.quantity, 0);
}
