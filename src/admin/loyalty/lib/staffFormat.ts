/**
 * Mise en mots de ce que renvoie la base pour le personnel : dates, points, historique,
 * numéro masqué, message WhatsApp. Aucun calcul de vérité ici (soldes : la base).
 */
import { normalizeMoroccanPhone } from "../../../cart/checkout";
import { formatCentimes, formatPoints, pointsLabel, pointsValueLabel } from "./points";
import type { HistoryEvent, StaffCard } from "./staffApi";

const TZ = "Africa/Casablanca";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayKey = new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

/** « aujourd'hui à 14:05 », « hier à 09:12 », « 3 oct. 2026 à 18:40 » (heure de Casablanca). */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date inconnue";
  const key = dayKey.format(d);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const day = key === dayKey.format(now) ? "aujourd'hui" : key === dayKey.format(yesterday) ? "hier" : dayFormat.format(d);
  return `${day} à ${timeFormat.format(d)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "date inconnue" : dayFormat.format(d);
}

/** « il y a 45 s », « il y a 2 min ». */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `il y a ${seconds} s`;
  return `il y a ${Math.floor(seconds / 60)} min`;
}

/** « 06 12 34 56 78 » → « 06 •• •• •• 78 » (affichage par défaut de la fiche). */
export function maskPhone(formatted: string): string {
  const digits = formatted.replace(/\D/g, "");
  if (digits.length !== 10) return "•• •• •• •• ••";
  return `${digits.slice(0, 2)} •• •• •• ${digits.slice(8)}`;
}

/* ------------------------------------------------------------------ points & résumé de carte */

export function staffPointsSummary(
  card: Pick<StaffCard, "pointsBalance" | "pointValueCentimes"> & {
    pointsEarnedTotal?: number;
    pointsSpentTotal?: number;
    rewardsRedeemed?: number;
  },
): {
  balanceText: string;
  valueText: string;
  redeemedText: string;
  hasPoints: boolean;
  hint: string;
} {
  const hasPoints = card.pointsBalance > 0;
  const redeemed = card.rewardsRedeemed ?? 0;
  return {
    balanceText: pointsLabel(card.pointsBalance),
    valueText: pointsValueLabel(card.pointsBalance, card.pointValueCentimes),
    redeemedText:
      redeemed > 1
        ? `${redeemed} récompenses échangées`
        : redeemed === 1
          ? "1 récompense échangée"
          : "Aucun échange pour l'instant",
    hasPoints,
    hint: hasPoints
      ? `1 point = ${formatCentimes(card.pointValueCentimes)}`
      : "Aucun point cumulé pour l'instant.",
  };
}

export const formatCardSummary = staffPointsSummary;

/* ------------------------------------------------------------------ historique */

export const EVENT_LABELS: Record<HistoryEvent["kind"], string> = {
  card_created: "Carte créée",
  points_credited: "Points crédités (ticket)",
  points_adjusted: "Ajustement manuel de points",
  points_reverted: "Opération de points annulée (correction)",
  reward_redeemed: "Récompense échangée",
  reward_redemption_reverted: "Échange de récompense annulé (correction)",
  reward_created: "Récompense créée",
  reward_updated: "Récompense modifiée",
  access_reissued: "Nouveau lien de carte créé",
  customer_updated: "Informations du client modifiées",
  card_status_changed: "Statut de la carte modifié",
  settings_updated: "Paramètres du programme modifiés",
  qr_pin_updated: "Code secret QR modifié",
  stamp_added: "Tampon historique ajouté",
  stamp_reverted: "Tampon historique retiré (correction)",
  reward_unlocked: "Récompense historique débloquée",
  reward_withdrawn: "Récompense historique retirée",
};

/** Seules les opérations que loyalty_revert_event accepte, et pas encore corrigées. */
export function isRevertible(e: HistoryEvent): boolean {
  return (
    (e.kind === "points_credited" ||
      e.kind === "points_adjusted" ||
      e.kind === "reward_redeemed" ||
      e.kind === "stamp_added") &&
    e.revertedByEventId === null
  );
}

export function eventDelta(e: HistoryEvent): string | null {
  if (e.pointsDelta !== 0) {
    const sign = e.pointsDelta > 0 ? "+" : "−";
    return `${sign}${formatPoints(Math.abs(e.pointsDelta))} pt${Math.abs(e.pointsDelta) > 1 ? "s" : ""}`;
  }
  if (e.kind === "stamp_added") return "+1 tampon (historique)";
  if (e.kind === "stamp_reverted") return "−1 tampon (historique)";
  if (e.kind === "reward_redeemed") return "1 récompense";
  if (e.kind === "reward_redemption_reverted") return "1 récompense restituée";
  return null;
}

/** Qui a fait l'opération, d'après ce que la base a enregistré (jamais de nom inventé). */
export function eventActor(e: HistoryEvent): string {
  if (e.actorRole === "public") return e.actorEmail ? `le personnel au comptoir (${e.actorEmail})` : "le client";
  if (e.actorRole === "qr_manager") return "le manager (scan QR)";
  if (e.actorEmail) return e.actorEmail;
  return e.actorRole === "owner" ? "un responsable" : "le personnel";
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Détail lisible d'une opération ; numéros masqués. */
export function eventDetail(e: HistoryEvent): string | null {
  if (e.kind === "points_credited") {
    const parts: string[] = [];
    if (typeof e.ticketAmountCentimes === "number" && e.ticketAmountCentimes > 0) {
      parts.push(`Ticket : ${formatCentimes(e.ticketAmountCentimes)}`);
    }
    if (e.orderRef) {
      parts.push(`Commande : ${e.orderRef}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (e.kind === "reward_redeemed" || e.kind === "reward_redemption_reverted") {
    const parts: string[] = [];
    if (e.rewardName) parts.push(e.rewardName);
    if (e.redemptionCode) parts.push(`Code : ${e.redemptionCode}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  const before = isObject(e.details.before) ? e.details.before : null;
  const after = isObject(e.details.after) ? e.details.after : null;
  if (e.kind === "customer_updated" && before && after) {
    const parts: string[] = [];
    if (typeof before.fullName === "string" && typeof after.fullName === "string") parts.push(`nom : ${before.fullName} → ${after.fullName}`);
    if (typeof before.phone === "string" && typeof after.phone === "string") parts.push(`numéro : ${maskPhone(before.phone)} → ${maskPhone(after.phone)}`);
    return parts.length ? parts.join(" ; ") : null;
  }
  if (e.kind === "card_status_changed") {
    return e.details.after === "suspended" ? "carte suspendue" : e.details.after === "active" ? "carte réactivée" : null;
  }
  if (e.kind === "access_reissued" && typeof e.details.tokenVersion === "number") {
    return `lien n° ${e.details.tokenVersion} ; les liens précédents ne fonctionnent plus`;
  }
  return null;
}

/* ------------------------------------------------------------------ WhatsApp */

export const RECOVERY_MESSAGE =
  "Bonjour, voici le lien permettant de retrouver votre carte de fidélité Kaytôri Club. Conservez-le et évitez de le partager.";

/**
 * Lien WhatsApp vers le CLIENT, message prérempli. Ouvrir ce lien n'envoie rien : le personnel
 * doit encore appuyer sur « Envoyer » dans WhatsApp. null si le numéro n'est pas un mobile marocain.
 */
export function customerWhatsappHref(phone: string, cardLink: string): string | null {
  const national = normalizeMoroccanPhone(phone);
  if (!national) return null;
  const text = `${RECOVERY_MESSAGE}\n\n${cardLink}`;
  return `https://api.whatsapp.com/send?phone=212${national.slice(1)}&text=${encodeURIComponent(text)}`;
}
