/**
 * Indicateurs et filtres des cartes de fidélité (programme par points).
 */
import { searchCards, type SearchItem, type StaffRpc } from "./staffApi";

export const PAGE = 50;
export const MAX_CARDS = 1000;
/** « Venu récemment » = une activité de points dans les 30 derniers jours. */
export const RECENT_DAYS = 30;
export const WEEKS = 8;

export const BALANCE_BRACKETS = [
  { label: "0 point", short: "0 pt", min: 0, max: 0 },
  { label: "1 à 99 points", short: "1–99", min: 1, max: 99 },
  { label: "100 à 249 points", short: "100–249", min: 100, max: 249 },
  { label: "250 à 499 points", short: "250–499", min: 250, max: 499 },
  { label: "500 points et plus", short: "500+", min: 500, max: Infinity },
] as const;

export type CardCollection = { items: SearchItem[]; complete: boolean; loadedAt: number };

export async function collectCards(rpc: StaffRpc, { max = MAX_CARDS }: { max?: number } = {}): Promise<CardCollection> {
  const items: SearchItem[] = [];
  let offset = 0;
  for (;;) {
    const page = await searchCards(rpc, "", { limit: PAGE, offset });
    items.push(...page.items);
    offset += page.items.length;
    if (!page.hasMore || page.items.length === 0) return { items, complete: true, loadedAt: Date.now() };
    if (items.length >= max) return { items: items.slice(0, max), complete: false, loadedAt: Date.now() };
  }
}

export type CardSummary = {
  total: number;
  active: number;
  suspended: number;
  pointsInCirculation: number;
  totalPointsBalance: number;
  pointsEarnedTotal: number;
  pointsSpentTotal: number;
  cardsWithPoints: number;
  rewardsRedeemedTotal: number;
  totalRewardsRedeemed: number;
  recentVisitors: number;
  neverVisited: number;
  balanceBrackets: number[];
  lastVisitByWeek: { start: number; count: number }[];
};

const DAY = 24 * 3600 * 1000;

export function isRecentVisitor(item: Pick<SearchItem, "lastPointsAt">, now: number): boolean {
  if (!item.lastPointsAt) return false;
  const t = Date.parse(item.lastPointsAt);
  return Number.isFinite(t) && now - t < RECENT_DAYS * DAY && t <= now + 60_000;
}

export function summarizeCards(items: readonly SearchItem[], now: number = Date.now()): CardSummary {
  const weekStart = now - WEEKS * 7 * DAY;
  const lastVisitByWeek = Array.from({ length: WEEKS }, (_, i) => ({ start: weekStart + i * 7 * DAY, count: 0 }));
  const balanceBrackets = BALANCE_BRACKETS.map(() => 0);
  let active = 0;
  let pointsInCirculation = 0;
  let pointsEarnedTotal = 0;
  let pointsSpentTotal = 0;
  let cardsWithPoints = 0;
  let rewardsRedeemedTotal = 0;
  let recentVisitors = 0;
  let neverVisited = 0;

  for (const it of items) {
    if (it.status === "active") {
      active += 1;
      const bIdx = BALANCE_BRACKETS.findIndex((b) => it.pointsBalance >= b.min && it.pointsBalance <= b.max);
      if (bIdx >= 0) balanceBrackets[bIdx] += 1;
    }
    pointsInCirculation += it.pointsBalance;
    pointsEarnedTotal += it.pointsEarnedTotal;
    pointsSpentTotal += it.pointsSpentTotal;
    if (it.pointsBalance > 0) cardsWithPoints += 1;
    rewardsRedeemedTotal += it.rewardsRedeemed;
    if (isRecentVisitor(it, now)) recentVisitors += 1;
    if (!it.lastPointsAt) neverVisited += 1;
    else {
      const t = Date.parse(it.lastPointsAt);
      const week = Math.floor((t - weekStart) / (7 * DAY));
      if (Number.isFinite(t) && week >= 0 && week < WEEKS) lastVisitByWeek[week].count += 1;
    }
  }
  return {
    total: items.length,
    active,
    suspended: items.length - active,
    pointsInCirculation,
    totalPointsBalance: pointsInCirculation,
    pointsEarnedTotal,
    pointsSpentTotal,
    cardsWithPoints,
    rewardsRedeemedTotal,
    totalRewardsRedeemed: rewardsRedeemedTotal,
    recentVisitors,
    neverVisited,
    balanceBrackets,
    lastVisitByWeek,
  };
}

/* ------------------------------------------------------------------ filtres de la liste */

export const CLIENT_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "with_points", label: "Avec solde > 0" },
  { id: "recent", label: `Actifs (${RECENT_DAYS} j)` },
  { id: "suspended", label: "Suspendues" },
] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number]["id"];

export function filterCards(items: readonly SearchItem[], filter: ClientFilter, now: number = Date.now()): SearchItem[] {
  switch (filter) {
    case "with_points":
      return items.filter((i) => i.pointsBalance > 0);
    case "recent":
      return items.filter((i) => isRecentVisitor(i, now));
    case "suspended":
      return items.filter((i) => i.status === "suspended");
    default:
      return [...items];
  }
}
