/**
 * Coordonnées mémorisées automatiquement à chaque commande envoyée, pour préremplir les suivantes
 * (mention discrète dans le formulaire ; « Effacer » les supprime).
 *
 * Stockage : localStorage de ce navigateur, sur cet appareil, doublé d'une copie IndexedDB (voir
 * restoreSavedCheckout) ; aucun envoi serveur, aucune synchronisation. Seuls le nom, le téléphone,
 * l'adresse et le quartier sont gardés : ni panier, ni historique, ni paiement, ni position GPS. Toute valeur illisible ou inattendue est supprimée
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

/** Marque d'effacement (copie durable uniquement) : aucune coordonnée. */
const CLEARED = { v: VERSION, cleared: true } as const;

/** Coordonnées, marque d'effacement, ou null si le format est inconnu ou inutilisable. */
function parseRecord(value: unknown): SavedCheckout | "cleared" | null {
  // Format inconnu (version future ou ancienne non reconnue) : ignoré plutôt que mal interprété.
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== VERSION) return null;
  return record.cleared === true ? "cleared" : sanitize(record);
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
  const parsed = parseRecord(value);
  const saved = parsed === "cleared" ? null : parsed;
  if (!saved) remove(storage);
  return saved;
}

function writeLocal(storage: StorageLike, saved: SavedCheckout): boolean {
  try {
    storage.setItem(SAVED_CHECKOUT_KEY, JSON.stringify({ v: VERSION, ...saved }));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ copie durable */

/** Copie durable du même enregistrement (IndexedDB en production, factice dans les tests). */
export type DurableStore = {
  read: () => Promise<unknown>;
  write: (record: unknown) => Promise<void>;
};

const DB_NAME = "kaytori-checkout";
const DB_STORE = "kv";
let openedDb: Promise<IDBDatabase> | null = null;

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  openedDb ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        openedDb = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB bloquée"));
  }).catch((error: unknown) => {
    openedDb = null;
    throw error;
  });
  return openedDb;
}

/** IndexedDB, ou null si absente ou inaccessible : la mémorisation reste alors sur localStorage seul. */
export function browserDurableStore(): DurableStore | null {
  let factory: IDBFactory;
  try {
    if (typeof indexedDB === "undefined") return null;
    factory = indexedDB;
  } catch {
    return null;
  }
  // « strict » : la transaction n'est terminée qu'une fois écrite sur le disque.
  const run = <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
    openDb(factory).then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(DB_STORE, mode, { durability: "strict" });
          const request = op(tx.objectStore(DB_STORE));
          tx.oncomplete = () => resolve(request.result);
          tx.onerror = tx.onabort = () => reject(tx.error);
        }),
    );
  return {
    read: () => run("readonly", (store) => store.get(SAVED_CHECKOUT_KEY)),
    write: (record) => run("readwrite", (store) => store.put(record, SAVED_CHECKOUT_KEY)).then(() => undefined),
  };
}

function writeDurable(durable: DurableStore | null, record: unknown): void {
  durable?.write(record).catch(() => {
    // copie durable indisponible : localStorage reste la référence
  });
}

const sameSaved = (a: SavedCheckout, b: SavedCheckout) =>
  a.fullName === b.fullName && a.phone === b.phone && a.address === b.address && a.neighborhood === b.neighborhood;

/**
 * Au chargement. Chrome n'écrit localStorage sur le disque que quelques secondes après coup : si
 * le navigateur est arrêté entre-temps (passage à WhatsApp puis fermeture forcée de Chrome), la
 * dernière écriture est perdue. La copie durable, écrite au même moment mais aussitôt sur le
 * disque, fait foi : elle restaure des coordonnées perdues et empêche le retour de coordonnées
 * effacées. Renvoie les coordonnées à appliquer (null : aucune), ou undefined si rien ne change.
 * `isStale()` vrai (le client a agi entre-temps) : rien n'est écrit ni renvoyé.
 */
export async function restoreSavedCheckout(
  storage = browserStorage(),
  durable = browserDurableStore(),
  isStale: () => boolean = () => false,
): Promise<SavedCheckout | null | undefined> {
  if (!durable) return undefined;
  let raw: unknown;
  try {
    raw = await durable.read();
  } catch {
    return undefined;
  }
  if (isStale()) return undefined;
  const local = readSavedCheckout(storage);
  const record = raw === undefined ? null : parseRecord(raw);
  if (record === null) {
    // Pas encore de copie durable lisible (mémorisation antérieure à cette copie) : elle est créée.
    if (local) writeDurable(durable, { v: VERSION, ...local });
    return undefined;
  }
  if (record === "cleared") {
    if (!local) return undefined;
    remove(storage);
    return null;
  }
  if (local && sameSaved(local, record)) return undefined;
  if (storage) writeLocal(storage, record);
  return record;
}

/**
 * Mémorise les coordonnées de la commande envoyée (localStorage + copie durable). En « à emporter »,
 * l'adresse et le quartier déjà mémorisés sont conservés (le client n'a pas eu à les confirmer).
 */
export function saveCheckout(
  info: CheckoutInfo,
  storage = browserStorage(),
  durable = browserDurableStore(),
): boolean {
  const previous = info.mode === "pickup" ? readSavedCheckout(storage) : null;
  const saved = sanitize(
    info.mode === "delivery"
      ? { fullName: info.fullName, phone: info.phone, address: info.address, neighborhood: info.neighborhood }
      : { fullName: info.fullName, phone: info.phone, address: previous?.address, neighborhood: previous?.neighborhood },
  );
  if (!saved) {
    forgetSavedCheckout(storage, durable);
    return false;
  }
  writeDurable(durable, { v: VERSION, ...saved });
  return storage ? writeLocal(storage, saved) : false;
}

/** Désactivation de la mémorisation ou « Effacer » : rien ne reste sur l'appareil. */
export function forgetSavedCheckout(storage = browserStorage(), durable = browserDurableStore()): void {
  remove(storage);
  writeDurable(durable, CLEARED);
}

/** Formulaire initial : vide, complété des coordonnées mémorisées. */
export function prefilledCheckout(saved: SavedCheckout | null): CheckoutInfo {
  if (!saved) return EMPTY_CHECKOUT;
  return { ...EMPTY_CHECKOUT, ...saved, phone: saved.phone ? formatMoroccanPhoneDisplay(saved.phone) : "" };
}
