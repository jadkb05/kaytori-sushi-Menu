/**
 * Inscription d'un client au comptoir. Même garantie que l'inscription en ligne : un nouvel essai
 * après une réponse perdue renvoie la même demande (même jeton, même identifiant) et la base
 * retrouve la carte au lieu d'en créer une seconde. Valeurs modifiées : demande neuve.
 */
import { normalizeMoroccanPhone } from "../../../cart/checkout";
import { cleanFullName } from "../../../loyalty/lib/signupForm";
import { generateAccessToken, generateRequestId } from "../../../loyalty/lib/token";
import { cardLink } from "./cardOperations";
import { createIdempotentAction } from "./idempotentAction";
import { fetchCard, registerAtCounter, type StaffCard, type StaffRpc } from "./staffApi";

export type CounterSignupResult = { card: StaffCard; link: string; replayed: boolean };

export function createCounterSignup(rpc: StaffRpc, deps: { newId?: () => string; newToken?: () => string } = {}) {
  const action = createIdempotentAction<{ publicCode: string; replayed: boolean }>(deps.newId ?? (() => generateRequestId()));
  const newToken = deps.newToken ?? (() => generateAccessToken());
  let pending: { key: string; token: string } | null = null;

  return {
    async submit(values: { fullName: string; phone: string }, origin: string): Promise<CounterSignupResult> {
      const fullName = cleanFullName(values.fullName);
      const phone = normalizeMoroccanPhone(values.phone) ?? values.phone.trim();
      const key = `${fullName}\u0000${phone}`;
      if (!action.busy() && (pending === null || pending.key !== key || action.pendingRequestId() === null)) {
        action.discard();
        pending = { key, token: newToken() };
      }
      const token = pending!.token;
      const created = await action.run((requestId) => registerAtCounter(rpc, { fullName, phone, token, requestId }));
      pending = null;
      const card = await fetchCard(rpc, { publicCode: created.publicCode });
      return { card, link: cardLink(origin, token), replayed: created.replayed };
    },
    busy: () => action.busy(),
  };
}
