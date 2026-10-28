/**
 * Coordonnées mémorisées pour préremplir les prochaines commandes — uniquement si le client l'a
 * demandé (case « Mémoriser mes informations… », jamais cochée d'office).
 *
 * Stockage : localStorage de ce navigateur, sur cet appareil ; aucun envoi serveur, aucune
 * synchronisation. Seuls le nom, le téléphone, l'adresse et le quartier sont gardés : ni panier,
 * ni historique, ni paiement, ni position GPS. Toute valeur illisible ou inattendue est supprimée
 * et traitée comme absente ; une erreur de stockage ne bloque jamais la commande.
 */
import {
  EMPTY_CHECKOUT,
  formatMoroccanPhoneDisplay,
  isValidNeighborhood,
  normalizeMoroccanPhone,
  type CheckoutInfo,
} from "./checkout";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SAVED_CHECKOUT_KEY = "kaytori.checkout.v1";
const VERSION = 1;
/** Garde-fou contre une valeur anormalement longue (saisie collée, stockage altéré). */
const MAX_LENGTH = 300;

/** Champs mémorisés (tous facultatifs : des données incomplètes préremplissent ce qu'elles peuvent). */
export type SavedCheckout = {
  fullName: string;
  /** Numéro normalisé (0XXXXXXXXX) ou vide. */
  phone: string;
  address: string;
  /** Entrée exacte de NEIGHBORHOODS ou vide. */
  neighborhood: string;
};

/** localStorage, ou null s'il est inaccessible (navigation privée stricte, données bloquées). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function remove(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVED_CHECKOUT_KEY);
  } catch {
    // stockage indisponible : rien à retirer
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const text = (v: unknown) => (typeof v === "string" && v.length <= MAX_LENGTH ? clean(v) : "");

/** Ne garde que les champs autorisés, au format attendu ; null si rien d'utilisable. */
function sanitize(v: Record<string, unknown>): SavedCheckout | null {
  const phone = typeof v.phone === "string" ? (normalizeMoroccanPhone(v.phone) ?? "") : "";
  const neighborhood = typeof v.neighborhood === "string" && isValidNeighborhood(v.neighborhood) ? v.neighborhood : "";
  const saved = { fullName: text(v.fullName), phone, address: text(v.address), neighborhood };
  return saved.fullName || saved.phone || saved.address || saved.neighborhood ? saved : null;
}

export function readSavedCheckout(storage = browserStorage()): SavedCheckout | null {
  if (!storage) return null;
  let value: unknown;
  try {
    const raw = storage.getItem(SAVED_CHECKOUT_KEY);
    if (raw === null) return null;
    value = JSON.parse(raw);
  } catch {
    remove(storage);
    return null;
  }
  // Format inconnu (version future ou ancienne non reconnue) : effacé plutôt que mal interprété.
  const saved =
    typeof value === "object" && value !== null && !Array.isArray(value) && (value as { v?: unknown }).v === VERSION
      ? sanitize(value as Record<string, unknown>)
      : null;
  if (!saved) remove(storage);
  return saved;
}

/**
 * Mémorise les coordonnées de la commande envoyée. En « à emporter », l'adresse et le quartier
 * déjà mémorisés sont conservés (le client n'a pas eu à les confirmer).
 */
export function saveCheckout(info: CheckoutInfo, storage = browserStorage()): boolean {
  if (!storage) return false;
  const previous = info.mode === "pickup" ? readSavedCheckout(storage) : null;
  const saved = sanitize(
    info.mode === "delivery"
      ? { fullName: info.fullName, phone: info.phone, address: info.address, neighborhood: info.neighborhood }
      : { fullName: info.fullName, phone: info.phone, address: previous?.address, neighborhood: previous?.neighborhood },
  );
  if (!saved) {
    remove(storage);
    return false;
  }
  try {
    storage.setItem(SAVED_CHECKOUT_KEY, JSON.stringify({ v: VERSION, ...saved }));
    return true;
  } catch {
    return false;
  }
}

/** Désactivation de la mémorisation ou « Effacer » : rien ne reste sur l'appareil. */
export function forgetSavedCheckout(storage = browserStorage()): void {
  remove(storage);
}

/** Formulaire initial : vide, complété des coordonnées mémorisées. */
export function prefilledCheckout(saved: SavedCheckout | null): CheckoutInfo {
  if (!saved) return EMPTY_CHECKOUT;
  return { ...EMPTY_CHECKOUT, ...saved, phone: saved.phone ? formatMoroccanPhoneDisplay(saved.phone) : "" };
}
