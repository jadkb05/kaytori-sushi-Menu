/**
 * Inscription idempotente.
 *
 * Avant l'appel, le jeton et l'identifiant de requête sont gardés sur l'appareil avec les valeurs
 * confirmées. Si la réponse se perd (réseau coupé, onglet fermé), le nouvel essai renvoie
 * EXACTEMENT la même demande : la base reconnaît l'identifiant et renvoie la carte déjà créée,
 * sans en créer une seconde ni changer de jeton. Valeurs modifiées entre-temps : nouvelle demande.
 */
import { normalizeMoroccanPhone } from "../../cart/checkout";
import { registerCard, type LoyaltyRpc, type RegistrationResult } from "./api";
import { LoyaltyError, asLoyaltyError, endsPendingRegistration } from "./errors";
import { cleanFullName } from "./signupForm";
import {
  browserStorage,
  clearPending,
  readPending,
  savePending,
  saveToken,
  type PendingRegistration,
  type StorageLike,
} from "./storage";
import { generateAccessToken, generateRequestId } from "./token";

export type RegistrationDeps = {
  storage?: StorageLike | null;
  rpc?: LoyaltyRpc;
  now?: () => number;
  newToken?: () => string;
  newRequestId?: () => string;
};

export type RegistrationSuccess = RegistrationResult & { token: string };

/** Demande à envoyer pour ces valeurs : celle en cours si elle correspond, sinon une nouvelle. */
export function pendingFor(
  values: { fullName: string; phone: string },
  { storage = browserStorage(), now = Date.now, newToken = generateAccessToken, newRequestId = generateRequestId }: RegistrationDeps = {},
): PendingRegistration {
  const fullName = cleanFullName(values.fullName);
  const phone = normalizeMoroccanPhone(values.phone);
  if (!phone) throw new LoyaltyError("business", "KL002");
  const current = readPending(storage, now());
  if (current && current.fullName === fullName && current.phone === phone) return current;
  return { token: newToken(), requestId: newRequestId(), fullName, phone, startedAt: now() };
}

/** Envoie (ou renvoie) une demande. Succès : carte gardée sur l'appareil, demande effacée. */
export async function sendRegistration(pending: PendingRegistration, deps: RegistrationDeps = {}): Promise<RegistrationSuccess> {
  const storage = deps.storage === undefined ? browserStorage() : deps.storage;
  savePending(pending, storage);
  try {
    const result = await registerCard(
      { fullName: pending.fullName, phone: pending.phone, token: pending.token, requestId: pending.requestId },
      { rpc: deps.rpc },
    );
    saveToken(pending.token, storage, deps.now?.() ?? Date.now());
    clearPending(storage);
    return { ...result, token: pending.token };
  } catch (e) {
    const err = asLoyaltyError(e);
    // Erreur définitive : la demande ne sera pas reprise. Réseau, délai, plafond : gardée.
    if (endsPendingRegistration(err)) clearPending(storage);
    throw err;
  }
}

export function submitRegistration(values: { fullName: string; phone: string }, deps: RegistrationDeps = {}): Promise<RegistrationSuccess> {
  return sendRegistration(pendingFor(values, deps), deps);
}
