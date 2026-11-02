/**
 * Moteur de calcul et de formatage des points Kaytôri Club.
 *
 * Tous les calculs monétaires utilisent exclusivement des CENTIMES ENTIERS (aucun flottant) :
 * - Valeur de référence par défaut : 1 point = 0,20 DH (20 centimes), configurable par le responsable.
 * - Exemples exacts (à 20 centimes) :
 *   1 pt = 0,20 DH · 5 pts = 1 DH · 50 pts = 10 DH · 100 pts = 20 DH ·
 *   250 pts = 50 DH · 500 pts = 100 DH · 1 000 pts = 200 DH.
 * - Le calcul des points gagnés sur un ticket utilise la même arithmétique entière que
 *   loyalty.compute_ticket_points côté PostgreSQL.
 */

/** Valeur par défaut d'un point en centimes de dirham (0,20 DH). */
export const POINT_VALUE_CENTIMES = 20;

/** Paliers de référence présentés au client et au personnel. */
export const CONVERSION_EXAMPLES = [1, 5, 50, 100, 250, 500, 1000] as const;

export type RoundingRule = "floor" | "nearest" | "ceil";

export type EarningRuleConfig = {
  earningPoints: number | null;
  earningDirhams: number | null;
  roundingRule?: RoundingRule;
  minTicketCentimes?: number;
  maxPointsPerOrder?: number | null;
  maxPointsPerDay?: number | null;
};

export type TicketPointsPreview =
  | { status: "ok"; points: number; cappedByOrder: boolean }
  | { status: "unconfigured" }
  | { status: "below_min"; minTicketCentimes: number }
  | { status: "zero" };

function assertPoints(points: number): void {
  if (!Number.isSafeInteger(points)) throw new RangeError("Nombre de points entier attendu");
}

function assertUnitCentimes(unitCentimes: number): void {
  if (!Number.isSafeInteger(unitCentimes) || unitCentimes < 1) {
    throw new RangeError("Valeur du point en centimes entière positive attendue");
  }
}

/** Points → centimes (entier exact). */
export function pointsToCentimes(points: number, pointValueCentimes: number = POINT_VALUE_CENTIMES): number {
  assertPoints(points);
  assertUnitCentimes(pointValueCentimes);
  return points * pointValueCentimes;
}

/** Centimes → points entiers couverts par ce montant (arrondi vers le bas) et reste en centimes. */
export function centimesToPoints(
  centimes: number,
  pointValueCentimes: number = POINT_VALUE_CENTIMES,
): { points: number; remainderCentimes: number } {
  if (!Number.isSafeInteger(centimes) || centimes < 0) throw new RangeError("Montant en centimes entier positif attendu");
  assertUnitCentimes(pointValueCentimes);
  return {
    points: Math.floor(centimes / pointValueCentimes),
    remainderCentimes: centimes % pointValueCentimes,
  };
}

const groupFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Espace insécable fine des milliers (fr-FR) remplacée par une espace insécable simple, plus sûre partout. */
const nbsp = (s: string) => s.replace(/[\u202f\u00a0\s]/g, "\u00a0");

/** « 1 000 » (espace insécable). */
export function formatPoints(points: number): string {
  assertPoints(points);
  return nbsp(groupFormat.format(points));
}

/** Centimes → « 0,20 DH », « 1 DH », « 1 234,60 DH » (sans flottant). */
export function formatCentimes(centimes: number): string {
  if (!Number.isSafeInteger(centimes)) throw new RangeError("Montant en centimes entier attendu");
  const sign = centimes < 0 ? "-" : "";
  const abs = Math.abs(centimes);
  const dirhams = Math.floor(abs / 100);
  const cents = abs % 100;
  const whole = nbsp(groupFormat.format(dirhams));
  return `${sign}${whole}${cents === 0 ? "" : `,${String(cents).padStart(2, "0")}`}\u00a0DH`;
}

/** « 250 points » → « 50 DH » (selon la valeur du point configurée). */
export function pointsValueLabel(points: number, pointValueCentimes: number = POINT_VALUE_CENTIMES): string {
  return formatCentimes(pointsToCentimes(points, pointValueCentimes));
}

export function pointsLabel(points: number): string {
  return `${formatPoints(points)}\u00a0point${Math.abs(points) > 1 ? "s" : ""}`;
}

/** Saisie d'un montant en dirhams (ex. « 125 », « 12,40 », « 12.4 DH ») → centimes entiers, ou null si invalide. */
export function parseDirhams(raw: string): number | null {
  const clean = raw
    .replace(/dh|mad/gi, "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const dirhams = Number(whole);
  const cents = Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(dirhams) || dirhams > 1_000_000) return null;
  return dirhams * 100 + cents;
}

export function parseTicketInput(raw: string): { centimes: number } | { error: string } {
  if (raw.trim() === "") return { error: "Indiquez le montant total du ticket en dirhams." };
  const centimes = parseDirhams(raw);
  if (centimes === null) return { error: "Montant invalide. Exemple : 145 ou 145,50." };
  if (centimes <= 0) return { error: "Le montant du ticket doit être supérieur à 0 DH." };
  if (centimes > 100_000_000) return { error: "Montant hors limites." };
  return { centimes };
}

/**
 * Miroir exact de loyalty.compute_ticket_points (PostgreSQL) en arithmétique entière BigInt.
 */
export function computeTicketPoints(ticketCentimes: number, rule: EarningRuleConfig): TicketPointsPreview {
  if (
    rule.earningPoints === null ||
    rule.earningDirhams === null ||
    !Number.isSafeInteger(rule.earningPoints) ||
    !Number.isSafeInteger(rule.earningDirhams) ||
    rule.earningPoints < 1 ||
    rule.earningDirhams < 1
  ) {
    return { status: "unconfigured" };
  }
  if (!Number.isSafeInteger(ticketCentimes) || ticketCentimes <= 0) {
    return { status: "zero" };
  }
  const minTicket = rule.minTicketCentimes ?? 0;
  if (ticketCentimes < minTicket) {
    return { status: "below_min", minTicketCentimes: minTicket };
  }
  const num = BigInt(ticketCentimes) * BigInt(rule.earningPoints);
  const denom = BigInt(rule.earningDirhams) * 100n;
  const rounding = rule.roundingRule ?? "floor";
  let rawPoints: number;
  if (rounding === "ceil") {
    rawPoints = Number((num + denom - 1n) / denom);
  } else if (rounding === "nearest") {
    rawPoints = Number((num + denom / 2n) / denom);
  } else {
    rawPoints = Number(num / denom);
  }
  let points = rawPoints;
  let cappedByOrder = false;
  if (typeof rule.maxPointsPerOrder === "number" && rule.maxPointsPerOrder > 0 && points > rule.maxPointsPerOrder) {
    points = rule.maxPointsPerOrder;
    cappedByOrder = true;
  }
  if (points <= 0) return { status: "zero" };
  return { status: "ok", points, cappedByOrder };
}

export function formatEarningRule(rule: EarningRuleConfig): string {
  if (!rule.earningPoints || !rule.earningDirhams) {
    return "Taux d'attribution non configuré";
  }
  const pts = pointsLabel(rule.earningPoints);
  const dh = rule.earningDirhams === 1 ? "1\u00a0DH dépensé" : `tranche de ${formatPoints(rule.earningDirhams)}\u00a0DH`;
  return `${pts} par ${dh}`;
}

export function formatRoundingRule(rule: RoundingRule): string {
  switch (rule) {
    case "ceil":
      return "Arrondi au supérieur";
    case "nearest":
      return "Arrondi au plus proche";
    default:
      return "Arrondi à l'entier inférieur";
  }
}

/** Saisie d'un nombre de points par le personnel : entier strictement positif, plafonné. */
export const MAX_POINTS_PER_OPERATION = 100_000;

export function parsePointsInput(raw: string): { points: number } | { error: string } {
  const clean = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (clean === "") return { error: "Indiquez un nombre de points." };
  if (!/^\d+$/.test(clean)) return { error: "Nombre entier de points, sans virgule." };
  const points = Number(clean);
  if (points < 1) return { error: "Au moins 1 point." };
  if (points > MAX_POINTS_PER_OPERATION) return { error: `Au plus ${formatPoints(MAX_POINTS_PER_OPERATION)} points par opération.` };
  return { points };
}
