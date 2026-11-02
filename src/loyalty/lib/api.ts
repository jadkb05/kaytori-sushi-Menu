/**
 * Appels publics et parcours QR de la fidélité (contrat : supabase/migrations/20261026120000_loyalty.sql).
 *
 * Toujours en POST (rpc par défaut) : les jetons voyagent dans le corps de la requête, jamais dans
 * une URL. Délai maximal par appel ; réponses vérifiées avant usage.
 */
import type { RoundingRule } from "../../admin/loyalty/lib/points";
import { getSupabaseClient } from "../../lib/supabase/client";
import { LoyaltyError, classifyRpcError, type RpcFailure } from "./errors";

export type RpcResult = { data: unknown; error: RpcFailure; status?: number };
/** Appel d'une fonction SQL : (nom, arguments, signal d'abandon). */
export type LoyaltyRpc = (fn: string, args: Record<string, unknown>, signal: AbortSignal) => PromiseLike<RpcResult>;

export const RPC_TIMEOUT_MS = 12000;

export type PublicReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  conditions: string | null;
  imageUrl: string | null;
  sortOrder: number;
  available: boolean;
  pointsMissing: number;
};

export type PublicEventKind =
  | "card_created"
  | "points_credited"
  | "points_adjusted"
  | "points_reverted"
  | "reward_redeemed"
  | "reward_redemption_reverted";

export type PublicHistoryEvent = {
  eventId: string;
  seq: number;
  kind: PublicEventKind;
  createdAt: string;
  pointsDelta: number;
  pointsBalanceAfter: number | null;
  ticketAmountCentimes: number | null;
  orderRef: string | null;
  rewardId: string | null;
  rewardName: string | null;
  redemptionCode: string | null;
  reason: string | null;
  revertsEventId: string | null;
  revertedByEventId: string | null;
};

export type LoyaltyProgram = {
  isActive: boolean;
  pointValueCentimes: number;
  earningPoints: number | null;
  earningDirhams: number | null;
  roundingRule: RoundingRule;
  minTicketCentimes: number;
  maxPointsPerOrder: number | null;
  maxPointsPerDay: number | null;
  termsSummary: string | null;
  rewardLabel: string | null;
  rewards: PublicReward[];
};

export type PublicCard = {
  fullName: string;
  phoneMasked: string;
  publicCode: string;
  status: "active" | "suspended";
  pointsBalance: number;
  pointsEarnedTotal: number;
  pointsSpentTotal: number;
  rewardsRedeemed: number;
  pointValueCentimes: number;
  earningPoints: number | null;
  earningDirhams: number | null;
  roundingRule: RoundingRule;
  minTicketCentimes: number;
  maxPointsPerOrder: number | null;
  maxPointsPerDay: number | null;
  termsSummary: string | null;
  programActive: boolean;
  lastPointsAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  rewards: PublicReward[];
  history: PublicHistoryEvent[];
};

export type RegistrationResult = { card: PublicCard; replayed: boolean };

export type ClientRedemption = {
  eventId: string;
  rewardId: string | null;
  rewardName: string | null;
  pointsCost: number;
  redemptionCode: string | null;
  createdAt: string;
};

export type ClientRedeemResult = {
  status: "ok";
  replayed: boolean;
  eventId: string;
  redemption: ClientRedemption;
  card: PublicCard;
};

/* ------------------------------------------------------------------ Parcours rapide QR */

export type QrEarningConfig = {
  pointValueCentimes: number;
  earningPoints: number;
  earningDirhams: number;
  roundingRule: RoundingRule;
  minTicketCentimes: number;
  maxPointsPerOrder: number | null;
  maxPointsPerDay: number | null;
};

export type QrCardStatus =
  | { status: "invalid_code" }
  | { status: "not_found"; publicCode: string }
  | { status: "program_closed"; publicCode: string }
  | { status: "unconfigured_earning"; publicCode: string }
  | { status: "unconfigured_pin"; publicCode: string }
  | { status: "card_suspended"; publicCode: string }
  | { status: "locked"; publicCode: string; retryAfterSeconds: number }
  | ({ status: "ready"; publicCode: string } & QrEarningConfig);

export type QrUnlockedCard = {
  publicCode: string;
  fullName: string;
  status: "active" | "suspended";
  pointsBalance: number;
  pointValueCentimes: number;
};

export type QrUnlockResult =
  | {
      status: "unlocked";
      sessionToken: string;
      expiresAt: string;
      card: QrUnlockedCard;
      program: QrEarningConfig;
    }
  | {
      status: "invalid_pin";
      attemptsRemaining: number;
      retryAfterSeconds: number;
    }
  | {
      status: "locked";
      attemptsRemaining: number;
      retryAfterSeconds: number;
    };

export type QrCreditResult = {
  status: "ok";
  replayed: boolean;
  eventId: string;
  pointsAdded: number;
  newBalance: number;
  pointValueCentimes: number;
  ticketCentimes: number;
  orderRef: string | null;
  card: QrUnlockedCard;
};

/* ------------------------------------------------------------------ client */

let override: LoyaltyRpc | null = null;

/** Tests et outil de développement local : remplace le client Supabase. */
export function setLoyaltyRpc(rpc: LoyaltyRpc | null): void {
  override = rpc;
}

/**
 * Banc d'essai local (npm run dev:fidelite) : la vraie migration dans PGlite, dans le navigateur.
 * Jamais en production : import.meta.env.DEV vaut false au build, le code est retiré du bundle.
 */
export const LOCAL_BACKEND = import.meta.env.DEV && import.meta.env.VITE_LOYALTY_LOCAL_BACKEND === "1";

async function defaultRpc(): Promise<LoyaltyRpc> {
  if (override) return override;
  if (LOCAL_BACKEND) {
    const local = await import("../dev/localBackend");
    await local.ready(); // installation locale hors délai : seul l'appel est chronométré
    return local.localRpc;
  }
  const client = getSupabaseClient();
  if (!client) throw new LoyaltyError("unavailable", null, "Supabase non configuré");
  return (fn, args, signal) => client.rpc(fn, args).abortSignal(signal);
}

async function call(fn: string, args: Record<string, unknown>, rpc: LoyaltyRpc | undefined, timeoutMs: number): Promise<unknown> {
  const run = rpc ?? (await defaultRpc());
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let res: RpcResult;
    try {
      res = await run(fn, args, controller.signal);
    } catch (e) {
      if (timedOut) throw new LoyaltyError("timeout");
      throw new LoyaltyError("network", null, e instanceof Error ? e.message : "");
    }
    if (res.error) throw classifyRpcError(res.error, res.status, timedOut);
    if (timedOut) throw new LoyaltyError("timeout");
    return res.data;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ lecture des réponses */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isOptionalCount = (v: unknown): v is number | null => v === null || v === undefined || isCount(v);
const isOptionalText = (v: unknown): v is string | null => v === null || v === undefined || typeof v === "string";
const isRounding = (v: unknown): v is RoundingRule => v === "floor" || v === "nearest" || v === "ceil";

function unexpected(what: string): never {
  throw new LoyaltyError("unexpected", null, `Réponse inattendue : ${what}`);
}

export function parsePublicReward(v: unknown): PublicReward {
  if (
    !isObject(v) ||
    typeof v.id !== "string" ||
    typeof v.name !== "string" ||
    !isOptionalText(v.description) ||
    !isCount(v.pointsCost) ||
    v.pointsCost < 1 ||
    !isOptionalText(v.conditions) ||
    !isOptionalText(v.imageUrl)
  ) {
    unexpected("récompense");
  }
  return {
    id: v.id,
    name: v.name,
    description: v.description || null,
    pointsCost: v.pointsCost,
    conditions: v.conditions || null,
    imageUrl: v.imageUrl || null,
    sortOrder: isInt(v.sortOrder) ? v.sortOrder : 0,
    available: typeof v.available === "boolean" ? v.available : true,
    pointsMissing: isCount(v.pointsMissing) ? v.pointsMissing : 0,
  };
}

const PUBLIC_EVENT_KINDS: readonly PublicEventKind[] = [
  "card_created",
  "points_credited",
  "points_adjusted",
  "points_reverted",
  "reward_redeemed",
  "reward_redemption_reverted",
];

export function parsePublicHistoryEvent(v: unknown): PublicHistoryEvent {
  if (
    !isObject(v) ||
    typeof v.eventId !== "string" ||
    !isCount(v.seq) ||
    !(PUBLIC_EVENT_KINDS as readonly unknown[]).includes(v.kind) ||
    typeof v.createdAt !== "string" ||
    !isInt(v.pointsDelta) ||
    !isOptionalCount(v.pointsBalanceAfter) ||
    !isOptionalCount(v.ticketAmountCentimes) ||
    !isOptionalText(v.orderRef) ||
    !isOptionalText(v.rewardId) ||
    !isOptionalText(v.rewardName) ||
    !isOptionalText(v.redemptionCode) ||
    !isOptionalText(v.reason) ||
    !isOptionalText(v.revertsEventId) ||
    !isOptionalText(v.revertedByEventId)
  ) {
    unexpected("historique client");
  }
  return {
    eventId: v.eventId,
    seq: v.seq,
    kind: v.kind as PublicEventKind,
    createdAt: v.createdAt,
    pointsDelta: v.pointsDelta,
    pointsBalanceAfter: v.pointsBalanceAfter ?? null,
    ticketAmountCentimes: v.ticketAmountCentimes ?? null,
    orderRef: v.orderRef || null,
    rewardId: v.rewardId || null,
    rewardName: v.rewardName || null,
    redemptionCode: v.redemptionCode || null,
    reason: v.reason || null,
    revertsEventId: v.revertsEventId || null,
    revertedByEventId: v.revertedByEventId || null,
  };
}

export function parseProgram(v: unknown): LoyaltyProgram {
  if (
    !isObject(v) ||
    typeof v.isActive !== "boolean" ||
    !isOptionalText(v.rewardLabel)
  ) {
    unexpected("programme");
  }
  const pointValueCentimes = isCount(v.pointValueCentimes) && v.pointValueCentimes >= 1 ? v.pointValueCentimes : 20;
  const earningPoints = isCount(v.earningPoints) && v.earningPoints >= 1 ? v.earningPoints : null;
  const earningDirhams = isCount(v.earningDirhams) && v.earningDirhams >= 1 ? v.earningDirhams : null;
  const roundingRule: RoundingRule = isRounding(v.roundingRule) ? v.roundingRule : "floor";
  const minTicketCentimes = isCount(v.minTicketCentimes) ? v.minTicketCentimes : 0;
  const maxPointsPerOrder = isCount(v.maxPointsPerOrder) && v.maxPointsPerOrder >= 1 ? v.maxPointsPerOrder : null;
  const maxPointsPerDay = isCount(v.maxPointsPerDay) && v.maxPointsPerDay >= 1 ? v.maxPointsPerDay : null;
  const rewards = Array.isArray(v.rewards) ? v.rewards.map(parsePublicReward) : [];

  return {
    isActive: v.isActive,
    pointValueCentimes,
    earningPoints,
    earningDirhams,
    roundingRule,
    minTicketCentimes,
    maxPointsPerOrder,
    maxPointsPerDay,
    termsSummary: isOptionalText(v.termsSummary) ? v.termsSummary || null : null,
    rewardLabel: v.rewardLabel || null,
    rewards,
  };
}

export function parsePublicCard(v: unknown): PublicCard {
  if (
    !isObject(v) ||
    typeof v.fullName !== "string" ||
    typeof v.phoneMasked !== "string" ||
    typeof v.publicCode !== "string" ||
    (v.status !== "active" && v.status !== "suspended") ||
    !isCount(v.pointsBalance) ||
    !isCount(v.pointValueCentimes) ||
    v.pointValueCentimes < 1 ||
    typeof v.programActive !== "boolean" ||
    typeof v.createdAt !== "string"
  ) {
    unexpected("carte");
  }
  const pointValueCentimes = v.pointValueCentimes;
  const earningPoints = isCount(v.earningPoints) && v.earningPoints >= 1 ? v.earningPoints : null;
  const earningDirhams = isCount(v.earningDirhams) && v.earningDirhams >= 1 ? v.earningDirhams : null;
  const roundingRule: RoundingRule = isRounding(v.roundingRule) ? v.roundingRule : "floor";
  const minTicketCentimes = isCount(v.minTicketCentimes) ? v.minTicketCentimes : 0;
  const maxPointsPerOrder = isCount(v.maxPointsPerOrder) && v.maxPointsPerOrder >= 1 ? v.maxPointsPerOrder : null;
  const maxPointsPerDay = isCount(v.maxPointsPerDay) && v.maxPointsPerDay >= 1 ? v.maxPointsPerDay : null;
  const rewards = Array.isArray(v.rewards) ? v.rewards.map(parsePublicReward) : [];
  const history = Array.isArray(v.history) ? v.history.map(parsePublicHistoryEvent) : [];

  return {
    fullName: v.fullName,
    phoneMasked: v.phoneMasked,
    publicCode: v.publicCode,
    status: v.status,
    pointsBalance: v.pointsBalance,
    pointsEarnedTotal: isCount(v.pointsEarnedTotal) ? v.pointsEarnedTotal : v.pointsBalance,
    pointsSpentTotal: isCount(v.pointsSpentTotal) ? v.pointsSpentTotal : 0,
    rewardsRedeemed: isCount(v.rewardsRedeemed) ? v.rewardsRedeemed : 0,
    pointValueCentimes,
    earningPoints,
    earningDirhams,
    roundingRule,
    minTicketCentimes,
    maxPointsPerOrder,
    maxPointsPerDay,
    termsSummary: isOptionalText(v.termsSummary) ? v.termsSummary || null : null,
    programActive: v.programActive,
    lastPointsAt: isOptionalText(v.lastPointsAt) ? v.lastPointsAt ?? null : null,
    lastActivityAt: isOptionalText(v.lastActivityAt) ? v.lastActivityAt ?? null : null,
    createdAt: v.createdAt,
    rewards,
    history,
  };
}

/* ------------------------------------------------------------------ appels */

type CallOptions = { rpc?: LoyaltyRpc; timeoutMs?: number };

export async function fetchProgram({ rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {}): Promise<LoyaltyProgram> {
  return parseProgram(await call("loyalty_program", {}, rpc, timeoutMs));
}

export async function registerCard(
  input: { fullName: string; phone: string; token: string; requestId: string },
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<RegistrationResult> {
  const data = await call(
    "loyalty_register",
    { p_full_name: input.fullName, p_phone: input.phone, p_token: input.token, p_request_id: input.requestId },
    rpc,
    timeoutMs,
  );
  if (!isObject(data) || data.status !== "created" || typeof data.replayed !== "boolean") unexpected("inscription");
  return { card: parsePublicCard(data.card), replayed: data.replayed };
}

export async function viewCard(token: string, { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {}): Promise<PublicCard> {
  return parsePublicCard(await call("loyalty_card_view", { p_token: token }, rpc, timeoutMs));
}

export async function clientRedeemReward(
  input: { token: string; rewardId: string; requestId: string },
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<ClientRedeemResult> {
  const data = await call(
    "loyalty_client_redeem_reward",
    { p_token: input.token, p_reward_id: input.rewardId, p_request_id: input.requestId },
    rpc,
    timeoutMs,
  );
  if (
    !isObject(data) ||
    data.status !== "ok" ||
    typeof data.replayed !== "boolean" ||
    typeof data.eventId !== "string" ||
    !isObject(data.redemption)
  ) {
    unexpected("échange de récompense");
  }
  const r = data.redemption;
  if (typeof r.eventId !== "string" || !isCount(r.pointsCost) || typeof r.createdAt !== "string") {
    unexpected("détail d'échange");
  }
  return {
    status: "ok",
    replayed: data.replayed,
    eventId: data.eventId,
    redemption: {
      eventId: r.eventId,
      rewardId: isOptionalText(r.rewardId) ? r.rewardId ?? null : null,
      rewardName: isOptionalText(r.rewardName) ? r.rewardName ?? null : null,
      pointsCost: r.pointsCost,
      redemptionCode: isOptionalText(r.redemptionCode) ? r.redemptionCode ?? null : null,
      createdAt: r.createdAt,
    },
    card: parsePublicCard(data.card),
  };
}

/* ------------------------------------------------------------------ appels parcours rapide QR */

function parseQrEarningConfig(v: Record<string, unknown>): QrEarningConfig {
  if (
    !isCount(v.pointValueCentimes) ||
    v.pointValueCentimes < 1 ||
    !isCount(v.earningPoints) ||
    v.earningPoints < 1 ||
    !isCount(v.earningDirhams) ||
    v.earningDirhams < 1
  ) {
    unexpected("règle QR");
  }
  return {
    pointValueCentimes: v.pointValueCentimes,
    earningPoints: v.earningPoints,
    earningDirhams: v.earningDirhams,
    roundingRule: isRounding(v.roundingRule) ? v.roundingRule : "floor",
    minTicketCentimes: isCount(v.minTicketCentimes) ? v.minTicketCentimes : 0,
    maxPointsPerOrder: isCount(v.maxPointsPerOrder) && v.maxPointsPerOrder >= 1 ? v.maxPointsPerOrder : null,
    maxPointsPerDay: isCount(v.maxPointsPerDay) && v.maxPointsPerDay >= 1 ? v.maxPointsPerDay : null,
  };
}

function parseQrUnlockedCard(v: unknown): QrUnlockedCard {
  if (
    !isObject(v) ||
    typeof v.publicCode !== "string" ||
    typeof v.fullName !== "string" ||
    (v.status !== "active" && v.status !== "suspended") ||
    !isCount(v.pointsBalance) ||
    !isCount(v.pointValueCentimes)
  ) {
    unexpected("carte QR");
  }
  return {
    publicCode: v.publicCode,
    fullName: v.fullName,
    status: v.status,
    pointsBalance: v.pointsBalance,
    pointValueCentimes: v.pointValueCentimes,
  };
}

export async function fetchQrCardStatus(
  publicCode: string,
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<QrCardStatus> {
  const v = await call("loyalty_qr_card_status", { p_public_code: publicCode }, rpc, timeoutMs);
  if (!isObject(v) || typeof v.status !== "string") unexpected("statut QR");
  switch (v.status) {
    case "invalid_code":
      return { status: "invalid_code" };
    case "not_found":
    case "program_closed":
    case "unconfigured_earning":
    case "unconfigured_pin":
    case "card_suspended":
      if (typeof v.publicCode !== "string") unexpected("statut QR");
      return { status: v.status, publicCode: v.publicCode };
    case "locked":
      if (typeof v.publicCode !== "string" || !isCount(v.retryAfterSeconds)) unexpected("verrouillage QR");
      return { status: "locked", publicCode: v.publicCode, retryAfterSeconds: v.retryAfterSeconds };
    case "ready":
      if (typeof v.publicCode !== "string") unexpected("statut QR");
      return { status: "ready", publicCode: v.publicCode, ...parseQrEarningConfig(v) };
    default:
      return unexpected("statut QR");
  }
}

export async function unlockQrCard(
  input: { publicCode: string; pin: string },
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<QrUnlockResult> {
  const v = await call("loyalty_qr_unlock", { p_public_code: input.publicCode, p_pin: input.pin }, rpc, timeoutMs);
  if (!isObject(v) || typeof v.status !== "string") unexpected("déverrouillage QR");
  if (v.status === "invalid_pin" || v.status === "locked") {
    if (!isCount(v.attemptsRemaining) || !isCount(v.retryAfterSeconds)) unexpected("tentative QR");
    return { status: v.status, attemptsRemaining: v.attemptsRemaining, retryAfterSeconds: v.retryAfterSeconds };
  }
  if (
    v.status === "unlocked" &&
    typeof v.sessionToken === "string" &&
    typeof v.expiresAt === "string" &&
    isObject(v.program)
  ) {
    return {
      status: "unlocked",
      sessionToken: v.sessionToken,
      expiresAt: v.expiresAt,
      card: parseQrUnlockedCard(v.card),
      program: parseQrEarningConfig(v.program),
    };
  }
  return unexpected("déverrouillage QR");
}

export async function creditQrPoints(
  input: { sessionToken: string; publicCode: string; ticketCentimes: number; orderRef?: string | null; requestId: string },
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<QrCreditResult> {
  const v = await call(
    "loyalty_qr_credit_points",
    {
      p_session_token: input.sessionToken,
      p_public_code: input.publicCode,
      p_ticket_centimes: input.ticketCentimes,
      p_order_ref: input.orderRef ?? null,
      p_request_id: input.requestId,
    },
    rpc,
    timeoutMs,
  );
  if (
    !isObject(v) ||
    v.status !== "ok" ||
    typeof v.replayed !== "boolean" ||
    typeof v.eventId !== "string" ||
    !isCount(v.pointsAdded) ||
    !isCount(v.newBalance) ||
    !isCount(v.pointValueCentimes) ||
    !isCount(v.ticketCentimes)
  ) {
    unexpected("crédit QR");
  }
  return {
    status: "ok",
    replayed: v.replayed,
    eventId: v.eventId,
    pointsAdded: v.pointsAdded,
    newBalance: v.newBalance,
    pointValueCentimes: v.pointValueCentimes,
    ticketCentimes: v.ticketCentimes,
    orderRef: isOptionalText(v.orderRef) ? v.orderRef || null : null,
    card: parseQrUnlockedCard(v.card),
  };
}

export async function closeQrSession(
  sessionToken: string,
  { rpc, timeoutMs = RPC_TIMEOUT_MS }: CallOptions = {},
): Promise<void> {
  await call("loyalty_qr_close_session", { p_session_token: sessionToken }, rpc, timeoutMs);
}
