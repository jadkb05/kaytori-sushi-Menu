import { SITE } from "../config/site";
import { YUMLO_MENU } from "../data/yumloMenu";
import { formatDhAmount } from "./formatDh";

/** Catégorie de chaque plat, par id de plat. */
export type CategoryLookup = ReadonlyMap<string, string>;

/** Repli : catégories du menu statique (yumloMenu.ts). */
const STATIC_CATEGORY_BY_DISH_ID: CategoryLookup = new Map(
  YUMLO_MENU.map((it) => [it.id, it.category]),
);

/** Table id → catégorie du menu réellement chargé (statique ou Supabase). */
export function categoryLookupFromMenu(items: readonly { id: string; category: string }[]): CategoryLookup {
  return new Map(items.map((it) => [it.id, it.category]));
}

function baseDishId(cartLineId: string): string {
  const sep = cartLineId.indexOf(":");
  return sep >= 0 ? cartLineId.slice(0, sep) : cartLineId;
}

/** id panier = id plat ou `platId:variantId` — catégorie du menu chargé, sinon du menu statique. */
function categoryForCartLineId(cartLineId: string, categories?: CategoryLookup): string | undefined {
  const id = baseDishId(cartLineId);
  return categories?.get(id) ?? STATIC_CATEGORY_BY_DISH_ID.get(id);
}

export type CartLine = {
  id: string;
  name: string;
  /** Prix unitaire en DH (nombre). */
  unitPriceDh: number;
  quantity: number;
};

export function lineSubtotalDh(line: CartLine): number {
  return line.unitPriceDh * line.quantity;
}

/**
 * Message WhatsApp de la commande. Seule la SOURCE de la catégorie est paramétrable
 * (`categories` : menu chargé) ; le texte et le format sont inchangés.
 */
export function buildWhatsappOrderMessage(lines: CartLine[], totalDh: number, categories?: CategoryLookup): string {
  const detail = lines
    .map((l) => {
      const sub = lineSubtotalDh(l);
      const cat = categoryForCartLineId(l.id, categories);
      const catTag = cat ? `[${cat}] ` : "";
      return `• ${l.quantity}× ${catTag}${l.name} — ${formatDhAmount(sub)} DH`;
    })
    .join("\n\n");

  const separator = "━".repeat(16);

  return [
    `Bonjour ${SITE.nameAccent},`,
    "",
    "Nouvelle commande depuis le site :",
    "",
    detail,
    "",
    separator,
    `Total : ${formatDhAmount(totalDh)} DH`,
    separator,
    "",
    "Merci pour votre commande et à très bientôt 🙂",
  ].join("\n");
}
