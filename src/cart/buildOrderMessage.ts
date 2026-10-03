import { SITE } from "../config/site";
import { YUMLO_MENU } from "../data/yumloMenu";
import { formatDhAmount } from "./formatDh";

/** id panier = id plat ou `platId:variantId` — on retrouve la catégorie sur l’id de base. */
const CATEGORY_BY_DISH_ID: Map<string, string> = new Map(
  YUMLO_MENU.map((it) => [it.id, it.category]),
);

function baseDishId(cartLineId: string): string {
  const sep = cartLineId.indexOf(":");
  return sep >= 0 ? cartLineId.slice(0, sep) : cartLineId;
}

function categoryForCartLineId(cartLineId: string): string | undefined {
  return CATEGORY_BY_DISH_ID.get(baseDishId(cartLineId));
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

export function buildWhatsappOrderMessage(lines: CartLine[], totalDh: number): string {
  const detail = lines
    .map((l) => {
      const sub = lineSubtotalDh(l);
      const cat = categoryForCartLineId(l.id);
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
