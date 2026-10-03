import { YUMLO_MENU, type YumloMenuItem } from "../data/yumloMenu";
import type { CartLine } from "./buildOrderMessage";

/**
 * Persistance du panier dans localStorage (survit au refresh / retour depuis WhatsApp).
 * Robuste : toute erreur (stockage bloqué, JSON invalide…) donne un panier vide, sans planter.
 * À la restauration, nom et prix sont recalculés depuis yumloMenu.ts (source de vérité) :
 * une ligne dont le plat ou la variante n'existe plus est ignorée.
 */
const STORAGE_KEY = "kaytori-cart-v1";
/** Un panier plus ancien est considéré comme abandonné. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const DISH_BY_ID = new Map<string, YumloMenuItem>(YUMLO_MENU.map((it) => [it.id, it]));

function parsePrice(priceMAD: string): number {
  const n = Number.parseFloat(priceMAD.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Même construction id / nom / prix que l'ajout au panier (`platId` ou `platId:variantId`). */
function resolveLine(id: string): Omit<CartLine, "quantity"> | null {
  const sep = id.indexOf(":");
  const dish = DISH_BY_ID.get(sep >= 0 ? id.slice(0, sep) : id);
  if (!dish) return null;
  if (sep < 0) {
    if (dish.variants?.length) return null;
    return { id, name: dish.name, unitPriceDh: parsePrice(dish.priceMAD) };
  }
  const variantId = id.slice(sep + 1);
  const variant = dish.variants?.find((v) => v.id === variantId);
  if (!variant) return null;
  return { id, name: `${dish.name} — ${variant.label}`, unitPriceDh: parsePrice(variant.priceMAD) };
}

export function loadCartLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return [];
    const { savedAt, lines } = data as { savedAt?: unknown; lines?: unknown };
    if (typeof savedAt !== "number" || Date.now() - savedAt > MAX_AGE_MS) return [];
    if (!Array.isArray(lines)) return [];
    const out: CartLine[] = [];
    for (const l of lines) {
      if (!l || typeof l !== "object") continue;
      const { id, quantity } = l as { id?: unknown; quantity?: unknown };
      if (typeof id !== "string" || typeof quantity !== "number") continue;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;
      if (out.some((x) => x.id === id)) continue;
      const resolved = resolveLine(id);
      if (resolved) out.push({ ...resolved, quantity });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCartLines(lines: readonly CartLine[]): void {
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload = {
      savedAt: Date.now(),
      lines: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Stockage indisponible (navigation privée, quota) : le panier reste en mémoire.
  }
}
