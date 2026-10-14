/**
 * Coordonnées du client saisies avant l'envoi WhatsApp (en mémoire uniquement, jamais stockées).
 * Pas de téléphone : le client envoie la commande depuis son propre WhatsApp.
 */

export type FulfillmentMode = "delivery" | "pickup";

export type CheckoutInfo = {
  mode: FulfillmentMode;
  firstName: string;
  lastName: string;
  /** Livraison uniquement. */
  address: string;
  neighborhood: string;
  instructions: string;
  locationUrl: string;
};

export type CheckoutField = Exclude<keyof CheckoutInfo, "mode">;
export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

export const EMPTY_CHECKOUT: CheckoutInfo = {
  mode: "delivery",
  firstName: "",
  lastName: "",
  address: "",
  neighborhood: "",
  instructions: "",
  locationUrl: "",
};

/** Coordonnées nettoyées pour le récapitulatif et le message : champs vides et hors mode retirés. */
export type CheckoutDetails = {
  mode: FulfillmentMode;
  firstName: string;
  lastName: string;
  address?: string;
  neighborhood?: string;
  instructions?: string;
  locationUrl?: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const optional = (s: string) => clean(s) || undefined;

/** « maps.app.goo.gl/x » → « https://maps.app.goo.gl/x » ; null si ce n'est pas un lien web. */
export function normalizeLocationUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") && !/\s/.test(s) ? url.href : null;
  } catch {
    return null;
  }
}

/** Lien Google Maps d'une position GPS (5 décimales ≈ 1 m). */
export function mapsUrlFromCoords(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function validateCheckout(info: CheckoutInfo): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (!clean(info.firstName)) errors.firstName = "Veuillez indiquer votre prénom.";
  if (!clean(info.lastName)) errors.lastName = "Veuillez indiquer votre nom.";
  if (info.mode === "delivery") {
    if (!clean(info.address)) errors.address = "Veuillez indiquer l'adresse de livraison.";
    if (!clean(info.neighborhood)) errors.neighborhood = "Veuillez indiquer votre quartier.";
    if (info.locationUrl.trim() && !normalizeLocationUrl(info.locationUrl)) {
      errors.locationUrl = "Ce lien n'est pas valide (ex. https://maps.app.goo.gl/…).";
    }
  }
  return errors;
}

export function checkoutDetails(info: CheckoutInfo): CheckoutDetails {
  const base = { mode: info.mode, firstName: clean(info.firstName), lastName: clean(info.lastName) };
  if (info.mode === "pickup") return base;
  return {
    ...base,
    address: optional(info.address),
    neighborhood: optional(info.neighborhood),
    instructions: info.instructions.trim() || undefined,
    locationUrl: normalizeLocationUrl(info.locationUrl) ?? undefined,
  };
}

/**
 * Livraison offerte : seule règle existante (bandeau « Livraison gratuite » du site). Aucun frais
 * n'est ajouté au total.
 */
export const DELIVERY_FEE_LABEL = "offerte";
