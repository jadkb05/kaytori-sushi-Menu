/**
 * Opérations du personnel sur UNE carte, chacune protégée contre le double envoi et rejouable
 * à l'identique après une réponse perdue (voir idempotentAction.ts). Sans React : la fiche
 * (StaffCardPage) les appelle, les tests les rejouent contre la vraie migration (PGlite).
 */
import { generateAccessToken } from "../../../loyalty/lib/token";
import { LOYALTY_ROUTES } from "../../../loyalty/routes";
import { createIdempotentAction } from "./idempotentAction";
import {
  adjustPoints,
  creditTicket,
  redeemReward,
  reissueAccess,
  revertEvent,
  updateCustomer,
  type AdjustPointsResult,
  type CreditTicketResult,
  type OperationResult,
  type RedeemRewardResult,
  type StaffRpc,
} from "./staffApi";

export type ReissueResult = OperationResult & { link: string };

export type CardOperations = {
  /** Attribution de points à partir du montant d'un ticket en centimes. */
  creditTicket(input: { ticketCentimes: number; orderRef?: string | null; confirmRecent?: boolean }): Promise<CreditTicketResult>;
  /** Ajustement administratif manuel (positif ou négatif) avec motif obligatoire. */
  adjustPoints(input: { delta: number; reason: string }): Promise<AdjustPointsResult>;
  /** Échange d'une récompense du catalogue contre des points. */
  redeem(rewardId: string): Promise<RedeemRewardResult>;
  /** Annulation / correction d'un événement de l'historique avec motif obligatoire. */
  revert(eventId: string, reason: string): Promise<OperationResult>;
  /** Nouveau lien : jeton généré ici, gardé en mémoire le temps d'un nouvel essai, jamais stocké. */
  reissue(reason: string | null, origin: string): Promise<ReissueResult>;
  /** Modification du nom ou du téléphone avec motif obligatoire. */
  update(changes: { full_name?: string; phone?: string }, reason: string): Promise<OperationResult>;
  busy(): boolean;
};

export function cardLink(origin: string, token: string): string {
  return `${origin}${LOYALTY_ROUTES.card}#${token}`;
}

export function createCardOperations(
  rpc: StaffRpc,
  cardId: string,
  deps: { newId?: () => string; newToken?: () => string } = {},
): CardOperations {
  const creditAction = createIdempotentAction<CreditTicketResult>(deps.newId);
  const adjustAction = createIdempotentAction<AdjustPointsResult>(deps.newId);
  const redeemAction = createIdempotentAction<RedeemRewardResult>(deps.newId);
  const revertAction = createIdempotentAction<OperationResult>(deps.newId);
  const reissueAction = createIdempotentAction<OperationResult>(deps.newId);
  const updateAction = createIdempotentAction<OperationResult>(deps.newId);
  const newToken = deps.newToken ?? (() => generateAccessToken());

  let creditKey: string | null = null;
  let adjustKey: string | null = null;
  let redeemTarget: string | null = null;
  let revertTarget: string | null = null;
  let reissueToken: string | null = null;

  return {
    creditTicket({ ticketCentimes, orderRef = null, confirmRecent = false }) {
      const key = `${ticketCentimes}:${orderRef ?? ""}:${confirmRecent}`;
      if (!creditAction.busy() && creditKey !== key) creditAction.discard();
      creditKey = key;
      return creditAction.run((requestId) =>
        creditTicket(rpc, { cardId, ticketCentimes, orderRef, requestId, confirmRecent }),
      );
    },
    adjustPoints({ delta, reason }) {
      const key = `${delta}:${reason.trim()}`;
      if (!adjustAction.busy() && adjustKey !== key) adjustAction.discard();
      adjustKey = key;
      return adjustAction.run((requestId) =>
        adjustPoints(rpc, { cardId, delta, reason, requestId }),
      );
    },
    redeem(rewardId) {
      if (!redeemAction.busy() && redeemTarget !== rewardId) redeemAction.discard();
      redeemTarget = rewardId;
      return redeemAction.run((requestId) => redeemReward(rpc, { cardId, rewardId, requestId }));
    },
    revert(eventId, reason) {
      if (!revertAction.busy() && revertTarget !== eventId) revertAction.discard();
      revertTarget = eventId;
      return revertAction.run((requestId) => revertEvent(rpc, { eventId, reason, requestId }));
    },
    async reissue(reason, origin) {
      if (!reissueAction.busy() && reissueAction.pendingRequestId() === null) reissueToken = newToken();
      const token = reissueToken as string;
      try {
        const result = await reissueAction.run((requestId) => reissueAccess(rpc, { cardId, token, requestId, reason }));
        return { ...result, link: cardLink(origin, token) };
      } finally {
        if (reissueAction.pendingRequestId() === null) reissueToken = null;
      }
    },
    update(changes, reason) {
      updateAction.discard();
      return updateAction.run((requestId) => updateCustomer(rpc, { cardId, changes, reason, requestId }));
    },
    busy: () =>
      creditAction.busy() ||
      adjustAction.busy() ||
      redeemAction.busy() ||
      revertAction.busy() ||
      reissueAction.busy() ||
      updateAction.busy(),
  };
}
