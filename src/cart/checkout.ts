/**
 * Coordonnées du client saisies avant l'envoi WhatsApp (en mémoire uniquement, jamais stockées).
 * Pas de téléphone : le client envoie la commande depuis son propre WhatsApp.
 */

export type FulfillmentMode = "delivery" | "pickup";

/**
 * Préférence de paiement, réglée à la livraison ou au retrait : aucun paiement en ligne, aucune
 * donnée de carte, aucun frais.
 */
export type PaymentMethod = "cash" | "card";

export const PAYMENT_METHODS: readonly { id: PaymentMethod; label: string; text: string; emoji: string }[] = [
  { id: "cash", label: "Espèces", text: "Paiement en espèces à la livraison ou au retrait.", emoji: "💵" },
  {
    id: "card",
    label: "Carte bancaire (TPE)",
    text: "Paiement par carte au terminal lors de la livraison ou du retrait.",
    emoji: "💳",
  },
];

export function paymentMethod(id: PaymentMethod) {
  return PAYMENT_METHODS.find((m) => m.id === id)!;
}

export type CheckoutInfo = {
  mode: FulfillmentMode;
  /** Aucun choix par défaut : le client doit choisir explicitement. */
  payment: PaymentMethod | "";
  /** Livraison uniquement. */
  address: string;
  locationUrl: string;
};

/** Champs texte du formulaire. */
export type CheckoutField = Exclude<keyof CheckoutInfo, "mode" | "payment">;
export type CheckoutErrors = Partial<Record<CheckoutField | "payment", string>>;

export const EMPTY_CHECKOUT: CheckoutInfo = {
  mode: "delivery",
  payment: "",
  address: "",
  locationUrl: "",
};

/** Coordonnées nettoyées pour le récapitulatif et le message : champs vides et hors mode retirés. */
export type CheckoutDetails = {
  mode: FulfillmentMode;
  payment?: PaymentMethod;
  address?: string;
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
  if (!info.payment) errors.payment = "Veuillez choisir un mode de paiement.";
  if (info.mode === "delivery") {
    if (!clean(info.address)) errors.address = "Veuillez indiquer l'adresse de livraison.";
    if (info.locationUrl.trim() && !normalizeLocationUrl(info.locationUrl)) {
      errors.locationUrl = "Ce lien n'est pas valide (ex. https://maps.app.goo.gl/…).";
    }
  }
  return errors;
}

export function checkoutDetails(info: CheckoutInfo): CheckoutDetails {
  const base: CheckoutDetails = {
    mode: info.mode,
    ...(info.payment ? { payment: info.payment } : {}),
  };
  if (info.mode === "pickup") return base;
  return {
    ...base,
    address: optional(info.address),
    locationUrl: normalizeLocationUrl(info.locationUrl) ?? undefined,
  };
}

/**
 * Livraison offerte : seule règle existante (bandeau « Livraison gratuite » du site). Aucun frais
 * n'est ajouté au total.
 */
export const DELIVERY_FEE_LABEL = "offerte";
