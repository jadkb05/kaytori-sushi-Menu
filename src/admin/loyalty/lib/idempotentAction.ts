/**
 * Une opération du personnel (crédit de points, récompense, correction…) envoyée au plus une fois à la fois,
 * avec l'identifiant de requête attendu par la base :
 *   - double clic / double toucher : le second appel reçoit la MÊME promesse, rien n'est renvoyé ;
 *   - réponse perdue (réseau, délai) : l'identifiant est gardé, « Réessayer » renvoie la même
 *     demande et la base répond avec l'opération déjà enregistrée (replayed) au lieu d'en créer une ;
 *   - réponse reçue (succès ou refus métier) : l'identifiant est oublié, l'action suivante est neuve.
 * Logique pure, sans React : testée telle quelle.
 */
import { LoyaltyError } from "../../../loyalty/lib/errors";
import { generateRequestId } from "../../../loyalty/lib/token";

export type IdempotentAction<T> = {
  /** Envoie (ou rejoint l'envoi en cours). `send` reçoit l'identifiant de requête à utiliser. */
  run(send: (requestId: string) => Promise<T>): Promise<T>;
  busy(): boolean;
  /** Identifiant gardé pour un nouvel essai, ou null. */
  pendingRequestId(): string | null;
  /** Abandon explicite (autre carte, autre opération) : le prochain envoi sera une demande neuve. */
  discard(): void;
};

const keepsRequest = (e: unknown) => e instanceof LoyaltyError && (e.kind === "network" || e.kind === "timeout");

export function createIdempotentAction<T>(newId: () => string = () => generateRequestId()): IdempotentAction<T> {
  let inFlight: Promise<T> | null = null;
  let retryId: string | null = null;
  return {
    run(send) {
      if (inFlight) return inFlight;
      const requestId = retryId ?? newId();
      retryId = requestId;
      const p = (async () => {
        try {
          const result = await send(requestId);
          retryId = null;
          return result;
        } catch (e) {
          if (!keepsRequest(e)) retryId = null;
          throw e;
        } finally {
          inFlight = null;
        }
      })();
      inFlight = p;
      return p;
    },
    busy: () => inFlight !== null,
    pendingRequestId: () => retryId,
    discard() {
      retryId = null;
    },
  };
}
