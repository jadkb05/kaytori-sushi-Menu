import { SITE } from "../config/site";
import { YUMLO_MENU } from "../data/yumloMenu";
import { DELIVERY_FEE_LABEL, type CheckoutDetails } from "./checkout";
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

/** Bloc client + livraison/retrait (lignes vides omises), inséré avant le détail de la commande. */
function checkoutBlock(c: CheckoutDetails): string[] {
  const field = (label: string, value?: string) => (value ? [`${label} : ${value}`] : []);
  const fulfillment =
    c.mode === "pickup"
      ? ["🏪 RETRAIT", "Mode : À emporter (retrait au restaurant)"]
      : [
          "📍 LIVRAISON",
          "Mode : Livraison",
          ...field("Adresse", c.address),
          ...field("Quartier", c.neighborhood),
          ...field("Instructions", c.instructions),
          ...field("Localisation", c.locationUrl),
        ];
  return [
    "👤 CLIENT",
    ...field("Prénom", c.firstName),
    ...field("Nom", c.lastName),
    "",
    ...fulfillment,
    "",
    "🛍️ COMMANDE",
    "",
  ];
}

/**
 * Message WhatsApp de la commande. Seule la SOURCE de la catégorie est paramétrable
 * (`categories` : menu chargé). Sans `checkout`, le message est strictement celui de référence ;
 * avec, les blocs client et livraison/retrait s'ajoutent sans toucher aux lignes ni au total.
 */
export function buildWhatsappOrderMessage(
  lines: CartLine[],
  totalDh: number,
  categories?: CategoryLookup,
  checkout?: CheckoutDetails,
): string {
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
    ...(checkout ? checkoutBlock(checkout) : []),
    detail,
    "",
    separator,
    ...(checkout?.mode === "delivery" ? [`Livraison : ${DELIVERY_FEE_LABEL}`] : []),
    `Total : ${formatDhAmount(totalDh)} DH`,
    separator,
    "",
    "Merci pour votre commande et à très bientôt 🙂",
  ].join("\n");
}
