/**
 * Disponibilité des formules rattachées à la section « Formule Midi » (id stable formule-midi).
 * Fuseau : Africa/Casablanca — lun–ven, 11:30 inclus à 15:00 exclus.
 */
import { FORMULE_SECTION_MIDI, formulePublicCategory } from "./formulesPromos";

/** Identifiant stable en base (seed / migration formule_sections). */
export const FORMULE_MIDI_SECTION_ID = "formule-midi";

export const FORMULE_MIDI_TIME_ZONE = "Africa/Casablanca";

/** Début du créneau (inclus), heure murale Casablanca. */
const MIDI_START = { hour: 11, minute: 30 };
/** Fin du créneau (exclue), heure murale Casablanca. */
const MIDI_END = { hour: 15, minute: 0 };
const MIDI_START_MINUTES = MIDI_START.hour * 60 + MIDI_START.minute;
const MIDI_END_MINUTES = MIDI_END.hour * 60 + MIDI_END.minute;

/** Libellé du bouton désactivé hors créneau (carte formule). */
export const FORMULE_MIDI_UNAVAILABLE_LABEL = "Disponible de 11h30 à 15h";

/** Indication sous le titre de la section Formule Midi. */
export const FORMULE_MIDI_SCHEDULE_HINT = "Du lundi au vendredi, de 11h30 à 15h uniquement.";

export const FORMULE_MIDI_CART_BLOCK_MESSAGE =
  "Les formules de midi ne sont commandables que du lundi au vendredi, de 11 h 30 à 15 h (heure de Casablanca). Retirez-les du panier ou réessayez pendant ces horaires.";

type MidiOfferLike = {
  id: string;
  name: string;
  category: string;
  /** Présent en mode dynamique (Supabase formule_sections). */
  formuleSectionId?: string | null;
};

export type CasablancaWallClock = {
  weekday: string; // Mon … Sun (en-US)
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

/** Offre concernée par la règle midi (id de section prioritaire, sinon heuristique / libellé). */
export function isFormuleMidiOffer(item: MidiOfferLike): boolean {
  if (item.formuleSectionId === FORMULE_MIDI_SECTION_ID) return true;
  if (item.formuleSectionId != null && item.formuleSectionId !== "") return false;
  if (item.category === FORMULE_SECTION_MIDI) return true;
  return formulePublicCategory(item) === FORMULE_SECTION_MIDI;
}

export function getCasablancaWallClock(at: Date): CasablancaWallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FORMULE_MIDI_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    hour: Number.parseInt(get("hour"), 10),
    minute: Number.parseInt(get("minute"), 10),
    second: Number.parseInt(get("second"), 10),
  };
}

function isWeekday(weekday: string): boolean {
  const i = WEEKDAY_INDEX[weekday];
  return i >= 1 && i <= 5;
}

/**
 * Disponible si lun–ven et 11:30 ≤ heure < 15:00 (Casablanca).
 * 11:29 → non ; 11:30 → oui ; 14:59 → oui ; 15:00 → non.
 */
export function isFormuleMidiAvailableAt(at: Date = new Date()): boolean {
  const w = getCasablancaWallClock(at);
  if (!isWeekday(w.weekday)) return false;
  const minutes = w.hour * 60 + w.minute;
  return minutes >= MIDI_START_MINUTES && minutes < MIDI_END_MINUTES;
}

/** Instant UTC approximatif d'une date/heure murale Casablanca (ajustement par itération). */
export function casablancaLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const wall = getCasablancaWallClock(new Date(guess));
    const asUtcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += targetMs - asUtcMs;
  }
  return new Date(guess);
}

function addCalendarDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/**
 * Prochain instant où le statut disponible/indisponible change (pour rafraîchir l'UI).
 */
export function nextFormuleMidiAvailabilityChangeAt(at: Date = new Date()): Date {
  const w = getCasablancaWallClock(at);
  const available = isFormuleMidiAvailableAt(at);

  if (available) {
    return casablancaLocalToUtc(w.year, w.month, w.day, MIDI_END.hour, MIDI_END.minute, 0);
  }

  // Avant l'ouverture un jour ouvré → aujourd'hui 11:30.
  if (isWeekday(w.weekday) && w.hour * 60 + w.minute < MIDI_START_MINUTES) {
    return casablancaLocalToUtc(w.year, w.month, w.day, MIDI_START.hour, MIDI_START.minute, 0);
  }

  // Après 15:00 ou week-end → prochain lundi–vendredi à 11:30.
  let cursor = { year: w.year, month: w.month, day: w.day };
  for (let step = 1; step <= 8; step++) {
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
    const probe = casablancaLocalToUtc(cursor.year, cursor.month, cursor.day, MIDI_START.hour, MIDI_START.minute, 0);
    const pw = getCasablancaWallClock(probe);
    if (isWeekday(pw.weekday) && pw.hour === MIDI_START.hour && pw.minute === MIDI_START.minute) {
      return probe;
    }
  }
  // Filet de sécurité (ne devrait pas arriver).
  return new Date(at.getTime() + 60 * 60 * 1000);
}

/** Lignes panier concernées et actuellement hors créneau. */
export function unavailableMidiCartLineIds(
  lines: readonly { id: string }[],
  dishesByProductId: ReadonlyMap<string, MidiOfferLike>,
  at: Date = new Date(),
): string[] {
  if (isFormuleMidiAvailableAt(at)) return [];
  const out: string[] = [];
  for (const line of lines) {
    const sep = line.id.indexOf(":");
    const productId = sep >= 0 ? line.id.slice(0, sep) : line.id;
    const dish = dishesByProductId.get(productId);
    if (dish && isFormuleMidiOffer(dish)) out.push(line.id);
  }
  return out;
}
