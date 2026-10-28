/**
 * Coordonnées du client saisies avant l'envoi WhatsApp (en mémoire ; mémorisation facultative sur
 * l'appareil, à la demande du client : voir savedCheckout.ts).
 */

export type FulfillmentMode = "delivery" | "pickup";

/**
 * Préférence de paiement, réglée à la livraison ou au retrait : aucun paiement en ligne, aucune
 * donnée de carte, aucun frais.
 */
export type PaymentMethod = "cash" | "card";

export const PAYMENT_METHODS: readonly { id: PaymentMethod; label: string; emoji: string }[] = [
  { id: "cash", label: "Espèces", emoji: "💵" },
  { id: "card", label: "Carte bancaire", emoji: "💳" },
];

export function paymentMethod(id: PaymentMethod) {
  return PAYMENT_METHODS.find((m) => m.id === id)!;
}

/** Quartiers Casablanca (libellés exacts client — ne pas renommer ni enrichir). */
export const NEIGHBORHOODS = [
  "Casa Finance City (CFC)",
  "CIL",
  "Bourgogne / Anfa",
  "Gauthier / Moulay youssef",
  "Maârif",
  "Maârif Extension",
  "Ghandi",
  "Oasis / Bachkou / Polo",
  "2 Mars",
  "Quartier des Hopitaux",
  "Mers Sultan",
  "Centre Ville",
  "Abdelmoumen",
  "Derb Ghallef",
  "Palmier",
  "Val Fleuri",
  "Beausejour",
  "Yacoub El Mansour",
  "Belvédère / La Gironde",
  "Sbata",
  "Al Fida / Korea",
  "Aïn Chock / Inara",
  "Californie / Taddart / Bd Kods",
  "Bouskoura Ville Verte",
  "Mandarona",
  "Sidi Maârouf",
  "La Coline / Florida",
  "Laimoune",
  "Oulfa / Hay Hassani",
  "Bernoussi",
  "Sidi Othmane",
  "Bournazil",
  "Hay Mohamadi",
  "Roches Noir",
  "Ain Sbaa",
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

/** Normalisation pour recherche : minuscules, sans accents, espaces compressés. */
export function foldSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidNeighborhood(value: string): value is Neighborhood {
  return (NEIGHBORHOODS as readonly string[]).includes(value);
}

/** Filtre la liste des quartiers (insensible à la casse et aux accents). */
export function filterNeighborhoods(query: string): readonly Neighborhood[] {
  const q = foldSearch(query);
  if (!q) return NEIGHBORHOODS;
  return NEIGHBORHOODS.filter((n) => foldSearch(n).includes(q));
}

export type CheckoutInfo = {
  mode: FulfillmentMode;
  /** Aucun choix par défaut : le client doit choisir explicitement. */
  payment: PaymentMethod | "";
  /** Nom et prénom (un seul champ). */
  fullName: string;
  /** Livraison uniquement. */
  address: string;
  /** Livraison uniquement — doit être une entrée exacte de NEIGHBORHOODS. */
  neighborhood: string;
  locationUrl: string;
  /** Téléphone client (obligatoire) — distinct du WhatsApp restaurant. */
  phone: string;
};

/** Champs texte du formulaire. */
export type CheckoutField = Exclude<keyof CheckoutInfo, "mode" | "payment">;
export type CheckoutErrors = Partial<Record<CheckoutField | "payment", string>>;

export const EMPTY_CHECKOUT: CheckoutInfo = {
  mode: "delivery",
  payment: "",
  fullName: "",
  address: "",
  neighborhood: "",
  locationUrl: "",
  phone: "",
};

/** Coordonnées nettoyées pour le récapitulatif et le message : champs vides et hors mode retirés. */
export type CheckoutDetails = {
  mode: FulfillmentMode;
  payment?: PaymentMethod;
  fullName: string;
  phone: string;
  address?: string;
  neighborhood?: string;
  locationUrl?: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const optional = (s: string) => clean(s) || undefined;

/**
 * Valide et normalise un numéro marocain mobile (06/07).
 * Accepte 06XXXXXXXX, 07XXXXXXXX, +2126…, +2127…, 002126…, espaces / tirets.
 * Retourne le numéro en format local `0XXXXXXXXX`, ou null si invalide.
 */
export function normalizeMoroccanPhone(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (!compact) return null;
  let national = compact;
  if (national.startsWith("+212")) national = `0${national.slice(4)}`;
  else if (national.startsWith("00212")) national = `0${national.slice(5)}`;
  else if (/^212[67]\d{8}$/.test(national)) national = `0${national.slice(3)}`;
  if (!/^0[67]\d{8}$/.test(national)) return null;
  return national;
}

/** Affichage lisible `06 12 34 56 78` à partir d'un numéro déjà normalisé. */
export function formatMoroccanPhoneDisplay(normalized: string): string {
  const d = normalized.replace(/\D/g, "");
  if (d.length !== 10) return normalized;
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

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
  if (!clean(info.fullName)) errors.fullName = "Veuillez indiquer votre nom et prénom.";
  if (!info.payment) errors.payment = "Veuillez choisir un mode de paiement.";
  if (!clean(info.phone)) {
    errors.phone = "Veuillez indiquer votre numéro de téléphone.";
  } else if (!normalizeMoroccanPhone(info.phone)) {
    errors.phone = "Numéro invalide. Ex. 06 12 34 56 78 ou +212 6 12 34 56 78.";
  }
  if (info.mode === "delivery") {
    if (!clean(info.address)) errors.address = "Veuillez indiquer l'adresse de livraison.";
    if (!clean(info.neighborhood)) {
      errors.neighborhood = "Veuillez choisir votre quartier.";
    } else if (!isValidNeighborhood(info.neighborhood)) {
      errors.neighborhood = "Veuillez sélectionner un quartier dans la liste.";
    }
    if (info.locationUrl.trim() && !normalizeLocationUrl(info.locationUrl)) {
      errors.locationUrl = "Ce lien n'est pas valide (ex. https://maps.app.goo.gl/…).";
    }
  }
  return errors;
}

export function checkoutDetails(info: CheckoutInfo): CheckoutDetails {
  const phone = normalizeMoroccanPhone(info.phone) ?? clean(info.phone);
  const base: CheckoutDetails = {
    mode: info.mode,
    ...(info.payment ? { payment: info.payment } : {}),
    fullName: clean(info.fullName),
    phone,
  };
  if (info.mode === "pickup") return base;
  return {
    ...base,
    address: optional(info.address),
    neighborhood: isValidNeighborhood(info.neighborhood) ? info.neighborhood : optional(info.neighborhood),
    locationUrl: normalizeLocationUrl(info.locationUrl) ?? undefined,
  };
}

/**
 * Livraison offerte : seule règle existante (bandeau « Livraison gratuite » du site). Aucun frais
 * n'est ajouté au total.
 */
export const DELIVERY_FEE_LABEL = "offerte";
