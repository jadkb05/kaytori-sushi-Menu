/**
 * Mise en mots de la progression en points RENVOYÉE PAR LA BASE (loyalty_card_view).
 * Aucun calcul flottant : utilise les centimes entiers de src/admin/loyalty/lib/points.ts.
 */
import {
  formatCentimes,
  formatEarningRule,
  formatPoints,
  pointsLabel,
  pointsValueLabel,
} from "../../admin/loyalty/lib/points";
import type { PublicCard, PublicReward } from "./api";

export type NextRewardTarget = {
  reward: PublicReward;
  missingPoints: number;
  progressPercent: number;
};

export type PointsProgressView = {
  pointsBalance: number;
  formattedBalance: string;
  countLabel: string;
  valueLabel: string;
  unitRuleLabel: string;
  earningRuleLabel: string;
  eligibleRewards: PublicReward[];
  nextReward: NextRewardTarget | null;
  hint: string;
};

export function describePointsProgress(
  card: Pick<
    PublicCard,
    | "pointsBalance"
    | "pointValueCentimes"
    | "earningPoints"
    | "earningDirhams"
    | "roundingRule"
    | "rewards"
  >,
): PointsProgressView {
  const balance = card.pointsBalance;
  const sortedRewards = [...card.rewards].sort((a, b) => a.pointsCost - b.pointsCost || a.sortOrder - b.sortOrder);
  const eligibleRewards = sortedRewards.filter((r) => balance >= r.pointsCost);
  const nextCandidate = sortedRewards.find((r) => balance < r.pointsCost) ?? null;

  const nextReward: NextRewardTarget | null = nextCandidate
    ? {
        reward: nextCandidate,
        missingPoints: nextCandidate.pointsCost - balance,
        progressPercent: Math.min(100, Math.max(0, Math.floor((balance * 100) / nextCandidate.pointsCost))),
      }
    : null;

  let hint: string;
  if (balance === 0) {
    hint = "Présentez votre QR code au comptoir lors de votre commande pour cumuler vos premiers points.";
  } else if (eligibleRewards.length > 0 && nextReward) {
    hint = `${eligibleRewards.length} récompense${eligibleRewards.length > 1 ? "s" : ""} disponible${eligibleRewards.length > 1 ? "s" : ""} · encore ${pointsLabel(nextReward.missingPoints)} pour « ${nextReward.reward.name} ».`;
  } else if (eligibleRewards.length > 0) {
    hint = `Toutes les récompenses du catalogue (${eligibleRewards.length}) sont accessibles avec votre solde.`;
  } else if (nextReward) {
    hint = `Plus que ${pointsLabel(nextReward.missingPoints)} avant « ${nextReward.reward.name} ».`;
  } else {
    hint = `Vos points sont prêts à être utilisés au restaurant.`;
  }

  return {
    pointsBalance: balance,
    formattedBalance: formatPoints(balance),
    countLabel: pointsLabel(balance),
    valueLabel: pointsValueLabel(balance, card.pointValueCentimes),
    unitRuleLabel: `1 point = ${formatCentimes(card.pointValueCentimes)}`,
    earningRuleLabel: formatEarningRule({
      earningPoints: card.earningPoints,
      earningDirhams: card.earningDirhams,
      roundingRule: card.roundingRule,
    }),
    eligibleRewards,
    nextReward,
    hint,
  };
}

/** Gain de points depuis la dernière ouverture de la carte sur cet appareil. */
export function newlyGainedPoints(
  card: Pick<PublicCard, "publicCode" | "pointsBalance">,
  seen: { publicCode: string; pointsBalance: number } | null,
): number {
  if (!seen || seen.publicCode !== card.publicCode || card.pointsBalance <= seen.pointsBalance) return 0;
  return card.pointsBalance - seen.pointsBalance;
}
