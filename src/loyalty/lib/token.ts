/**
 * Jeton d'accès personnel et identifiant de requête, générés dans le navigateur.
 *
 * Contrat (supabase/migrations/20261026120000_loyalty.sql, loyalty.token_hash) : 43 caractères
 * base64url = 32 octets aléatoires (256 bits). La base n'en garde que l'empreinte SHA-256 ;
 * le jeton n'existe en clair que sur l'appareil du client.
 */

type RandomFill = (bytes: Uint8Array) => Uint8Array;

const defaultFill: RandomFill = (bytes) => globalThis.crypto.getRandomValues(bytes);

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 octets du générateur cryptographique du navigateur → 43 caractères base64url. */
export function generateAccessToken(fill: RandomFill = defaultFill): string {
  return toBase64Url(fill(new Uint8Array(32)));
}

export function isAccessToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** UUID v4 : identifiant d'une demande, réutilisé tel quel lors d'un nouvel essai. */
export function generateRequestId(fill: RandomFill = defaultFill): string {
  const b = fill(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
