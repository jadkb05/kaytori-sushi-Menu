/**
 * Appels du PERSONNEL à la fidélité (contrat : supabase/migrations/20261026120000_loyalty.sql).
 *
 * La base est seule juge : droits (loyalty.require_staff), soldes de points, récompenses,
 * idempotence (identifiant de requête) et concurrence (carte verrouillée). Ce module ne calcule
 * aucun solde : il transmet, vérifie la forme des réponses et renvoie ce que la base a décidé.
 */
import type { LoyaltyRpc, PublicReward, RpcResult } from "../../../loyalty/lib/api";
import { parsePublicReward } from "../../../loyalty/lib/api";
import { LoyaltyError, classifyRpcError } from "../../../loyalty/lib/errors";
import type { RoundingRule } from "./points";

export type StaffRpc = LoyaltyRpc;
export type { RpcResult, RoundingRule };

export const STAFF_RPC_TIMEOUT_MS = 12000;

export type StaffRole = "manager" | "owner";
export type CardStatus = "active" | "suspended";

export type StaffProgram = {
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
  activeRewardsCount: number;
  rewardsCount: number;
  role: StaffRole | null;
  recentCreditWindowSeconds: number;
  signupLimitPerHour: number;
  qrPinConfigured: boolean;
  qrPinUpdatedAt: string | null;
  qrSessionTtlSeconds: number;
  updatedAt: string | null;
};

export type SearchItem = {
  cardId: string;
  publicCode: string;
  fullName: string;
  phoneMasked: string;
  pointsBalance: number;
  pointsEarnedTotal: number;
  pointsSpentTotal: number;
  rewardsRedeemed: number;
  status: CardStatus;
  lastPointsAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
};

export type SearchPage = { items: SearchItem[]; limit: number; offset: number; hasMore: boolean };

export type StaffCard = {
  cardId: string;
  publicCode: string;
  fullName: string;
  /** « 06 12 34 56 78 » : numéro complet, affiché masqué par défaut dans l'interface. */
  phone: string;
  status: CardStatus;
  pointsBalance: number;
  pointsEarnedTotal: number;
  pointsSpentTotal: number;
  rewardsRedeemed: number;
  stampsTotal: number;
  pointValueCentimes: number;
  lastPointsAt: string | null;
  lastActivityAt: string | null;
  tokenVersion: number;
  tokenIssuedAt: string;
  createdAt: string;
};

export const EVENT_KINDS = [
  "card_created",
  "points_credited",
  "points_adjusted",
  "points_reverted",
  "reward_redeemed",
  "reward_redemption_reverted",
  "reward_created",
  "reward_updated",
  "access_reissued",
  "customer_updated",
  "card_status_changed",
  "settings_updated",
  "qr_pin_updated",
  "stamp_added",
  "stamp_reverted",
  "reward_unlocked",
  "reward_withdrawn",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type HistoryEvent = {
  eventId: string;
  seq: number;
  kind: EventKind;
  createdAt: string;
  actorRole: "public" | "manager" | "owner" | "qr_manager";
  actorEmail: string | null;
  pointsDelta: number;
  pointsBalanceAfter: number | null;
  ticketAmountCentimes: number | null;
  orderRef: string | null;
  rewardId: string | null;
  rewardName: string | null;
  redemptionCode: string | null;
  reason: string | null;
  revertsEventId: string | null;
  relatedEventId: string | null;
  revertedByEventId: string | null;
  stampsTotalAfter: number | null;
  rewardsRedeemedAfter: number | null;
  details: Record<string, unknown>;
};

export type HistoryPage = { items: HistoryEvent[]; nextBeforeSeq: number | null };

export type StaffReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  conditions: string | null;
  imageUrl: string | null;
  isActive: boolean;
  archivedAt: string | null;
  sortOrder: number;
  redeemedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardRecentOp = {
  eventId: string;
  seq: number;
  kind: EventKind;
  createdAt: string;
  pointsDelta: number;
  pointsBalanceAfter: number | null;
  ticketAmountCentimes: number | null;
  orderRef: string | null;
  rewardName: string | null;
  actorRole: "public" | "manager" | "owner" | "qr_manager";
  cardId: string;
  publicCode: string;
  fullName: string;
  isReverted: boolean;
};

export type StaffStats = {
  totalCards: number;
  activeCards: number;
  suspendedCards: number;
  cardsWithPoints: number;
  recentVisitors30d: number;
  neverVisitedCards: number;
  pointsInCirculation: number;
  pointsEarnedTotal: number;
  pointsSpentTotal: number;
  rewardsRedeemedTotal: number;
  activeRewardsCount: number;
  totalRewardsCount: number;
  pointValueCentimes: number;
  recentOperations: DashboardRecentOp[];
};

/** Réponse d'une opération sur une carte (loyalty.result). */
export type OperationResult = {
  status: "ok" | "unchanged";
  replayed: boolean;
  eventId: string | null;
  card: StaffCard;
};

export type CreditTicketResult =
  | (OperationResult & {
      status: "ok";
      pointsAdded: number;
      ticketCentimes: number;
      orderRef: string | null;
    })
  | {
      status: "confirm_recent";
      card: StaffCard;
      secondsSinceLastCredit: number;
      pointsPreview: number;
    };

export type AdjustPointsResult = OperationResult & {
  status: "ok";
  pointsDelta: number;
};

export type RedeemRewardResult = OperationResult & {
  status: "ok";
  rewardId: string | null;
  rewardName: string | null;
  pointsCost: number;
  redemptionCode: string | null;
};

/* ------------------------------------------------------------------ transport */

async function call(rpc: StaffRpc, fn: string, args: Record<string, unknown>, timeoutMs = STAFF_RPC_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let res: RpcResult;
    try {
      res = await rpc(fn, args, controller.signal);
    } catch (e) {
      if (e instanceof LoyaltyError) throw e;
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
const isText = (v: unknown): v is string => typeof v === "string" && v !== "";
const isOptionalText = (v: unknown): v is string | null => v === null || v === undefined || typeof v === "string";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isStatus = (v: unknown): v is CardStatus => v === "active" || v === "suspended";
const isRounding = (v: unknown): v is RoundingRule => v === "floor" || v === "nearest" || v === "ceil";

function unexpected(what: string): never {
  throw new LoyaltyError("unexpected", null, `Réponse inattendue : ${what}`);
}

export function parseStaffProgram(v: unknown): StaffProgram {
  if (
    !isObject(v) ||
    typeof v.isActive !== "boolean" ||
    !(v.role === null || v.role === "manager" || v.role === "owner")
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
    rewardLabel: isOptionalText(v.rewardLabel) ? v.rewardLabel || null : null,
    rewards,
    activeRewardsCount: isCount(v.activeRewardsCount) ? v.activeRewardsCount : rewards.length,
    rewardsCount: isCount(v.rewardsCount) ? v.rewardsCount : rewards.length,
    role: v.role,
    recentCreditWindowSeconds: isCount(v.recentCreditWindowSeconds) ? v.recentCreditWindowSeconds : 60,
    signupLimitPerHour: isCount(v.signupLimitPerHour) ? v.signupLimitPerHour : 200,
    qrPinConfigured: typeof v.qrPinConfigured === "boolean" ? v.qrPinConfigured : false,
    qrPinUpdatedAt: isOptionalText(v.qrPinUpdatedAt) ? v.qrPinUpdatedAt || null : null,
    qrSessionTtlSeconds: isCount(v.qrSessionTtlSeconds) ? v.qrSessionTtlSeconds : 300,
    updatedAt: isOptionalText(v.updatedAt) ? v.updatedAt || null : null,
  };
}

export function parseSearchItem(v: unknown): SearchItem {
  if (
    !isObject(v) ||
    !isUuid(v.cardId) ||
    !isText(v.publicCode) ||
    !isText(v.fullName) ||
    typeof v.phoneMasked !== "string" ||
    !isCount(v.pointsBalance) ||
    !isStatus(v.status)
  ) {
    unexpected("résultat de recherche");
  }
  return {
    cardId: v.cardId,
    publicCode: v.publicCode,
    fullName: v.fullName,
    phoneMasked: v.phoneMasked,
    pointsBalance: v.pointsBalance,
    pointsEarnedTotal: isCount(v.pointsEarnedTotal) ? v.pointsEarnedTotal : v.pointsBalance,
    pointsSpentTotal: isCount(v.pointsSpentTotal) ? v.pointsSpentTotal : 0,
    rewardsRedeemed: isCount(v.rewardsRedeemed) ? v.rewardsRedeemed : 0,
    status: v.status,
    lastPointsAt: isOptionalText(v.lastPointsAt) ? v.lastPointsAt ?? null : null,
    lastActivityAt: isOptionalText(v.lastActivityAt) ? v.lastActivityAt ?? null : null,
    createdAt: isText(v.createdAt) ? v.createdAt : "",
  };
}

export function parseSearchPage(v: unknown): SearchPage {
  if (!isObject(v) || !Array.isArray(v.items) || !isCount(v.limit) || !isCount(v.offset) || typeof v.hasMore !== "boolean") {
    unexpected("recherche");
  }
  return { items: v.items.map(parseSearchItem), limit: v.limit, offset: v.offset, hasMore: v.hasMore };
}

export function parseStaffCard(v: unknown): StaffCard {
  if (
    !isObject(v) ||
    !isUuid(v.cardId) ||
    !isText(v.publicCode) ||
    !isText(v.fullName) ||
    !isText(v.phone) ||
    !isStatus(v.status) ||
    !isCount(v.pointsBalance) ||
    !isCount(v.rewardsRedeemed) ||
    !isCount(v.tokenVersion) ||
    !isText(v.tokenIssuedAt) ||
    !isText(v.createdAt)
  ) {
    unexpected("fiche");
  }
  return {
    cardId: v.cardId,
    publicCode: v.publicCode,
    fullName: v.fullName,
    phone: v.phone,
    status: v.status,
    pointsBalance: v.pointsBalance,
    pointsEarnedTotal: isCount(v.pointsEarnedTotal) ? v.pointsEarnedTotal : v.pointsBalance,
    pointsSpentTotal: isCount(v.pointsSpentTotal) ? v.pointsSpentTotal : 0,
    rewardsRedeemed: v.rewardsRedeemed,
    stampsTotal: isCount(v.stampsTotal) ? v.stampsTotal : 0,
    pointValueCentimes: isCount(v.pointValueCentimes) && v.pointValueCentimes >= 1 ? v.pointValueCentimes : 20,
    lastPointsAt: isOptionalText(v.lastPointsAt) ? v.lastPointsAt ?? null : null,
    lastActivityAt: isOptionalText(v.lastActivityAt) ? v.lastActivityAt ?? null : null,
    tokenVersion: v.tokenVersion,
    tokenIssuedAt: v.tokenIssuedAt,
    createdAt: v.createdAt,
  };
}

const optionalUuid = (v: unknown): v is string | null => v === null || v === undefined || isUuid(v);
const optionalCount = (v: unknown): v is number | null => v === null || v === undefined || isCount(v);

export function parseHistoryEvent(v: unknown): HistoryEvent {
  if (
    !isObject(v) ||
    !isUuid(v.eventId) ||
    !isCount(v.seq) ||
    !(EVENT_KINDS as readonly unknown[]).includes(v.kind) ||
    !isText(v.createdAt) ||
    !(v.actorRole === "public" || v.actorRole === "manager" || v.actorRole === "owner" || v.actorRole === "qr_manager") ||
    !isOptionalText(v.actorEmail ?? null) ||
    !isOptionalText(v.reason) ||
    !optionalUuid(v.revertsEventId) ||
    !optionalUuid(v.relatedEventId) ||
    !optionalUuid(v.revertedByEventId) ||
    !optionalCount(v.stampsTotalAfter) ||
    !optionalCount(v.rewardsRedeemedAfter)
  ) {
    unexpected("historique");
  }
  return {
    eventId: v.eventId,
    seq: v.seq,
    kind: v.kind as EventKind,
    createdAt: v.createdAt,
    actorRole: v.actorRole,
    actorEmail: (v.actorEmail as string | null | undefined) || null,
    pointsDelta: isInt(v.pointsDelta) ? v.pointsDelta : 0,
    pointsBalanceAfter: optionalCount(v.pointsBalanceAfter) ? (v.pointsBalanceAfter ?? null) : null,
    ticketAmountCentimes: optionalCount(v.ticketAmountCentimes) ? (v.ticketAmountCentimes ?? null) : null,
    orderRef: isOptionalText(v.orderRef) ? v.orderRef || null : null,
    rewardId: optionalUuid(v.rewardId) ? (v.rewardId ?? null) : null,
    rewardName: isOptionalText(v.rewardName) ? v.rewardName || null : null,
    redemptionCode: isOptionalText(v.redemptionCode) ? v.redemptionCode || null : null,
    reason: v.reason ?? null,
    revertsEventId: v.revertsEventId ?? null,
    relatedEventId: v.relatedEventId ?? null,
    revertedByEventId: v.revertedByEventId ?? null,
    stampsTotalAfter: v.stampsTotalAfter ?? null,
    rewardsRedeemedAfter: v.rewardsRedeemedAfter ?? null,
    details: isObject(v.details) ? v.details : {},
  };
}

export function parseHistoryPage(v: unknown): HistoryPage {
  if (!isObject(v) || !Array.isArray(v.items) || !(v.nextBeforeSeq === null || isCount(v.nextBeforeSeq))) unexpected("historique");
  return { items: v.items.map(parseHistoryEvent), nextBeforeSeq: v.nextBeforeSeq };
}

export function parseStaffReward(v: unknown): StaffReward {
  if (
    !isObject(v) ||
    !isUuid(v.id) ||
    !isText(v.name) ||
    !isOptionalText(v.description) ||
    !isCount(v.pointsCost) ||
    v.pointsCost < 1 ||
    !isOptionalText(v.conditions) ||
    !isOptionalText(v.imageUrl) ||
    typeof v.isActive !== "boolean" ||
    !isOptionalText(v.archivedAt) ||
    !isCount(v.redeemedCount) ||
    !isText(v.createdAt) ||
    !isText(v.updatedAt)
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
    isActive: v.isActive,
    archivedAt: v.archivedAt || null,
    sortOrder: isInt(v.sortOrder) ? v.sortOrder : 0,
    redeemedCount: v.redeemedCount,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export function parseStaffStats(v: unknown): StaffStats {
  if (
    !isObject(v) ||
    !isCount(v.totalCards) ||
    !isCount(v.activeCards) ||
    !isCount(v.suspendedCards) ||
    !isCount(v.cardsWithPoints) ||
    !isCount(v.recentVisitors30d) ||
    !isCount(v.neverVisitedCards) ||
    !isCount(v.pointsInCirculation) ||
    !isCount(v.pointsEarnedTotal) ||
    !isCount(v.pointsSpentTotal) ||
    !isCount(v.rewardsRedeemedTotal) ||
    !isCount(v.activeRewardsCount) ||
    !isCount(v.totalRewardsCount)
  ) {
    unexpected("statistiques");
  }
  const ops: DashboardRecentOp[] = Array.isArray(v.recentOperations)
    ? v.recentOperations
        .filter(isObject)
        .map((o) => ({
          eventId: String(o.eventId ?? ""),
          seq: Number(o.seq ?? 0),
          kind: (o.kind as EventKind) ?? "points_credited",
          createdAt: String(o.createdAt ?? ""),
          pointsDelta: Number(o.pointsDelta ?? 0),
          pointsBalanceAfter: isCount(o.pointsBalanceAfter) ? o.pointsBalanceAfter : null,
          ticketAmountCentimes: isCount(o.ticketAmountCentimes) ? o.ticketAmountCentimes : null,
          orderRef: isOptionalText(o.orderRef) ? o.orderRef || null : null,
          rewardName: isOptionalText(o.rewardName) ? o.rewardName || null : null,
          actorRole: (o.actorRole as DashboardRecentOp["actorRole"]) ?? "manager",
          cardId: String(o.cardId ?? ""),
          publicCode: String(o.publicCode ?? ""),
          fullName: String(o.fullName ?? ""),
          isReverted: Boolean(o.isReverted),
        }))
    : [];

  return {
    totalCards: v.totalCards,
    activeCards: v.activeCards,
    suspendedCards: v.suspendedCards,
    cardsWithPoints: v.cardsWithPoints,
    recentVisitors30d: v.recentVisitors30d,
    neverVisitedCards: v.neverVisitedCards,
    pointsInCirculation: v.pointsInCirculation,
    pointsEarnedTotal: v.pointsEarnedTotal,
    pointsSpentTotal: v.pointsSpentTotal,
    rewardsRedeemedTotal: v.rewardsRedeemedTotal,
    activeRewardsCount: v.activeRewardsCount,
    totalRewardsCount: v.totalRewardsCount,
    pointValueCentimes: isCount(v.pointValueCentimes) && v.pointValueCentimes >= 1 ? v.pointValueCentimes : 20,
    recentOperations: ops,
  };
}

function parseOperation(v: unknown): OperationResult {
  if (!isObject(v) || (v.status !== "ok" && v.status !== "unchanged") || typeof v.replayed !== "boolean" || !optionalUuid(v.eventId)) {
    unexpected("opération");
  }
  if (v.status === "ok" && v.eventId === null) unexpected("opération sans événement");
  return { status: v.status, replayed: v.replayed, eventId: v.eventId ?? null, card: parseStaffCard(v.card) };
}

export function parseCreditTicketResult(v: unknown): CreditTicketResult {
  if (isObject(v) && v.status === "confirm_recent") {
    if (!isCount(v.secondsSinceLastCredit) || !isCount(v.pointsPreview)) unexpected("confirmation");
    return {
      status: "confirm_recent",
      card: parseStaffCard(v.card),
      secondsSinceLastCredit: v.secondsSinceLastCredit,
      pointsPreview: v.pointsPreview,
    };
  }
  const op = parseOperation(v);
  if (op.status !== "ok" || !isObject(v) || !isCount(v.pointsAdded) || !isCount(v.ticketCentimes)) unexpected("crédit ticket");
  return {
    ...op,
    status: "ok",
    pointsAdded: v.pointsAdded,
    ticketCentimes: v.ticketCentimes,
    orderRef: isOptionalText(v.orderRef) ? v.orderRef || null : null,
  };
}

export function parseAdjustPointsResult(v: unknown): AdjustPointsResult {
  const op = parseOperation(v);
  if (op.status !== "ok" || !isObject(v) || !isInt(v.pointsDelta)) unexpected("ajustement de points");
  return { ...op, status: "ok", pointsDelta: v.pointsDelta };
}

export function parseRedeemRewardResult(v: unknown): RedeemRewardResult {
  const op = parseOperation(v);
  if (op.status !== "ok" || !isObject(v) || !isCount(v.pointsCost)) unexpected("échange de récompense");
  return {
    ...op,
    status: "ok",
    rewardId: optionalUuid(v.rewardId) ? (v.rewardId ?? null) : null,
    rewardName: isOptionalText(v.rewardName) ? v.rewardName || null : null,
    pointsCost: v.pointsCost,
    redemptionCode: isOptionalText(v.redemptionCode) ? v.redemptionCode || null : null,
  };
}

/* ------------------------------------------------------------------ appels */

export async function fetchStaffRole(rpc: StaffRpc): Promise<StaffRole | null> {
  const v = await call(rpc, "loyalty_my_role", {});
  if (v === null || v === "manager" || v === "owner") return v;
  return unexpected("rôle");
}

export async function fetchStaffProgram(rpc: StaffRpc): Promise<StaffProgram> {
  return parseStaffProgram(await call(rpc, "loyalty_program", {}));
}

export async function fetchStaffStats(rpc: StaffRpc): Promise<StaffStats> {
  return parseStaffStats(await call(rpc, "loyalty_stats", {}));
}

export async function searchCards(rpc: StaffRpc, query: string, { limit = 20, offset = 0 } = {}): Promise<SearchPage> {
  return parseSearchPage(await call(rpc, "loyalty_search", { p_query: query, p_limit: limit, p_offset: offset }));
}

export async function fetchCard(rpc: StaffRpc, ref: { cardId: string } | { publicCode: string }): Promise<StaffCard> {
  const args = "cardId" in ref ? { p_card_id: ref.cardId } : { p_public_code: ref.publicCode };
  return parseStaffCard(await call(rpc, "loyalty_card_detail", args));
}

export async function fetchHistory(rpc: StaffRpc, cardId: string, { beforeSeq = null as number | null, limit = 30 } = {}): Promise<HistoryPage> {
  return parseHistoryPage(await call(rpc, "loyalty_card_history", { p_card_id: cardId, p_before_seq: beforeSeq, p_limit: limit }));
}

export async function creditTicket(
  rpc: StaffRpc,
  input: { cardId: string; ticketCentimes: number; orderRef?: string | null; requestId: string; confirmRecent?: boolean },
): Promise<CreditTicketResult> {
  return parseCreditTicketResult(
    await call(rpc, "loyalty_credit_ticket", {
      p_card_id: input.cardId,
      p_ticket_centimes: input.ticketCentimes,
      p_order_ref: input.orderRef ?? null,
      p_request_id: input.requestId,
      p_confirm_recent: input.confirmRecent ?? false,
    }),
  );
}

export async function adjustPoints(
  rpc: StaffRpc,
  input: { cardId: string; delta: number; reason: string; requestId: string },
): Promise<AdjustPointsResult> {
  return parseAdjustPointsResult(
    await call(rpc, "loyalty_adjust_points", {
      p_card_id: input.cardId,
      p_delta: input.delta,
      p_reason: input.reason,
      p_request_id: input.requestId,
    }),
  );
}

export async function redeemReward(
  rpc: StaffRpc,
  input: { cardId: string; rewardId: string; requestId: string },
): Promise<RedeemRewardResult> {
  return parseRedeemRewardResult(
    await call(rpc, "loyalty_redeem_reward", {
      p_card_id: input.cardId,
      p_reward_id: input.rewardId,
      p_request_id: input.requestId,
    }),
  );
}

export async function revertEvent(rpc: StaffRpc, input: { eventId: string; reason: string; requestId: string }): Promise<OperationResult> {
  return parseOperation(await call(rpc, "loyalty_revert_event", { p_event_id: input.eventId, p_reason: input.reason, p_request_id: input.requestId }));
}

export async function listRewards(rpc: StaffRpc): Promise<StaffReward[]> {
  const v = await call(rpc, "loyalty_list_rewards", {});
  if (!isObject(v) || !Array.isArray(v.items)) unexpected("catalogue des récompenses");
  return v.items.map(parseStaffReward);
}

export type SaveRewardInput = {
  id?: string | null;
  rewardId?: string | null;
  name: string;
  description?: string | null;
  pointsCost: number;
  conditions?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  archived?: boolean;
  sortOrder?: number;
};

export type RewardSavePayload = SaveRewardInput;

export async function saveReward(
  rpc: StaffRpc,
  reward: SaveRewardInput,
  requestId: string = crypto.randomUUID(),
): Promise<StaffReward[]> {
  const v = await call(rpc, "loyalty_save_reward", {
    p_reward: {
      id: reward.id ?? reward.rewardId ?? null,
      name: reward.name,
      description: reward.description ?? null,
      points_cost: reward.pointsCost,
      conditions: reward.conditions ?? null,
      image_url: reward.imageUrl ?? null,
      is_active: reward.isActive ?? true,
      archived: reward.archived ?? false,
      sort_order: reward.sortOrder ?? 0,
    },
    p_request_id: requestId,
  });
  if (!isObject(v) || !Array.isArray(v.items)) unexpected("enregistrement de récompense");
  return v.items.map(parseStaffReward);
}

/** Nouveau lien : le jeton est généré ici (navigateur du personnel), la base n'en garde que l'empreinte. */
export async function reissueAccess(
  rpc: StaffRpc,
  input: { cardId: string; token: string; requestId: string; reason: string | null },
): Promise<OperationResult> {
  return parseOperation(
    await call(rpc, "loyalty_reissue_access", { p_card_id: input.cardId, p_token: input.token, p_request_id: input.requestId, p_reason: input.reason }),
  );
}

export async function updateCustomer(
  rpc: StaffRpc,
  input: { cardId: string; changes: { full_name?: string; phone?: string }; reason: string; requestId: string },
): Promise<OperationResult> {
  return parseOperation(
    await call(rpc, "loyalty_update_customer", { p_card_id: input.cardId, p_changes: input.changes, p_reason: input.reason, p_request_id: input.requestId }),
  );
}

/* ------------------------------------------------------------------ responsable (owner) et comptoir */

/** Suspension / réactivation (responsable uniquement, motif obligatoire : la base le vérifie). */
export async function setCardStatus(
  rpc: StaffRpc,
  input: { cardId: string; status: CardStatus; reason: string; requestId: string },
): Promise<OperationResult> {
  return parseOperation(
    await call(rpc, "loyalty_set_card_status", { p_card_id: input.cardId, p_status: input.status, p_reason: input.reason, p_request_id: input.requestId }),
  );
}

export type SettingsChanges = {
  is_active?: boolean;
  point_value_centimes?: number;
  earning_points?: number | null;
  earning_dirhams?: number | null;
  rounding_rule?: RoundingRule;
  min_ticket_centimes?: number;
  max_points_per_order?: number | null;
  max_points_per_day?: number | null;
  recent_credit_window_seconds?: number;
  signup_limit_per_hour?: number;
  qr_session_ttl_seconds?: number;
  terms_summary?: string | null;
  reward_label?: string | null;
  reason?: string | null;
};

/** Réglages du programme (responsable uniquement). Renvoie le programme relu par la base. */
export async function updateSettings(
  rpc: StaffRpc,
  changes: SettingsChanges,
  reason?: string | null,
): Promise<StaffProgram> {
  const payload = reason !== undefined ? { ...changes, reason } : changes;
  return parseStaffProgram(await call(rpc, "loyalty_update_settings", { p_changes: payload }));
}

/** Définit ou modifie le code secret du parcours QR manager (responsable uniquement). */
export async function setQrPin(
  rpc: StaffRpc,
  inputOrPin: { pin: string; reason?: string | null } | string,
  _reason?: string | null,
): Promise<StaffProgram> {
  const pin = typeof inputOrPin === "string" ? inputOrPin : inputOrPin.pin;
  return parseStaffProgram(await call(rpc, "loyalty_set_qr_pin", { p_pin: pin }));
}

export const parseReward = parseStaffReward;
export const parseCreditResult = parseCreditTicketResult;

/**
 * Inscription au comptoir, avec l'accord du client présent : même fonction publique que
 * /fidelite (loyalty_register), le jeton étant généré par le navigateur du personnel.
 */
export async function registerAtCounter(
  rpc: StaffRpc,
  input: { fullName: string; phone: string; token: string; requestId: string },
): Promise<{ publicCode: string; replayed: boolean }> {
  const data = await call(rpc, "loyalty_register", { p_full_name: input.fullName, p_phone: input.phone, p_token: input.token, p_request_id: input.requestId });
  if (!isObject(data) || data.status !== "created" || typeof data.replayed !== "boolean" || !isObject(data.card) || !isText(data.card.publicCode)) {
    unexpected("inscription");
  }
  return { publicCode: data.card.publicCode, replayed: data.replayed };
}
