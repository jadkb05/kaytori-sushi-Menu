/**
 * Ce que l'appareil du client retient (localStorage, propre à ce navigateur) :
 *   - la carte : le jeton d'accès, pour rouvrir la carte sans lien ;
 *   - l'inscription en cours : jeton + identifiant de requête + valeurs saisies, gardés le temps
 *     de l'appel pour qu'un nouvel essai (réponse perdue) ne crée jamais une seconde carte ;
 *     effacée dès la réponse, et au plus tard après 24 h ;
 *   - le dernier solde de points vu, pour signaler discrètement les nouveaux points acquis.
 * Jamais le numéro comme moyen d'accès, jamais de donnée du personnel. Toute valeur illisible
 * ou inattendue est supprimée et traitée comme absente.
 */
import { isAccessToken, isRequestId } from "./token";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CARD_KEY = "kaytori.loyalty.card.v1";
const PENDING_KEY = "kaytori.loyalty.pending.v1";
const SEEN_KEY = "kaytori.loyalty.seen.v2";
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/** localStorage, ou null s'il est inaccessible (navigation privée stricte, données bloquées). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (value === null) remove(storage, key);
    return value;
  } catch {
    remove(storage, key);
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // stockage indisponible : rien à retirer
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/* ------------------------------------------------------------------ carte gardée */

export function readSavedToken(storage = browserStorage()): string | null {
  const v = read(storage, CARD_KEY);
  if (v === null) return null;
  if (isObject(v) && isAccessToken(v.token)) return v.token;
  remove(storage, CARD_KEY);
  return null;
}

export function saveToken(token: string, storage = browserStorage(), now = Date.now()): boolean {
  return write(storage, CARD_KEY, { token, savedAt: now });
}

/** « Retirer la carte de cet appareil » : la carte reste intacte en base. */
export function forgetCard(storage = browserStorage()): void {
  remove(storage, CARD_KEY);
  remove(storage, SEEN_KEY);
}

/* ------------------------------------------------------------------ inscription en cours */

export type PendingRegistration = {
  token: string;
  requestId: string;
  fullName: string;
  /** Numéro normalisé (0XXXXXXXXX). */
  phone: string;
  startedAt: number;
};

export function readPending(storage = browserStorage(), now = Date.now()): PendingRegistration | null {
  const v = read(storage, PENDING_KEY);
  if (v === null) return null;
  if (
    isObject(v) &&
    isAccessToken(v.token) &&
    isRequestId(v.requestId) &&
    typeof v.fullName === "string" &&
    typeof v.phone === "string" &&
    /^0[67]\d{8}$/.test(v.phone) &&
    typeof v.startedAt === "number" &&
    now - v.startedAt >= 0 &&
    now - v.startedAt < PENDING_TTL_MS
  ) {
    return { token: v.token, requestId: v.requestId, fullName: v.fullName, phone: v.phone, startedAt: v.startedAt };
  }
  remove(storage, PENDING_KEY);
  return null;
}

export function savePending(pending: PendingRegistration, storage = browserStorage()): boolean {
  return write(storage, PENDING_KEY, pending);
}

export function clearPending(storage = browserStorage()): void {
  remove(storage, PENDING_KEY);
}

/* ------------------------------------------------------------------ dernier solde vu */

export type SeenProgress = { publicCode: string; pointsBalance: number };

export function readSeen(storage = browserStorage()): SeenProgress | null {
  const v = read(storage, SEEN_KEY);
  if (v === null) return null;
  if (
    isObject(v) &&
    typeof v.publicCode === "string" &&
    Number.isInteger(v.pointsBalance) &&
    (v.pointsBalance as number) >= 0
  ) {
    return { publicCode: v.publicCode, pointsBalance: v.pointsBalance as number };
  }
  remove(storage, SEEN_KEY);
  return null;
}

export function saveSeen(seen: SeenProgress, storage = browserStorage()): void {
  write(storage, SEEN_KEY, seen);
}
